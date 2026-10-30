(function (C) {
  'use strict';

  var h = C.dom.h;
  var U = C.utils;
  var D = C.data;
  var store = C.store;
  var T = C.trainer;

  var STATUS_LABEL = { done: 'Сделано', partial: 'Частично', no: 'Не сделано' };
  var OUTCOME_LABEL = { achieved: 'Цель достигнута', partial: 'Цель достигнута частично', failed: 'Цель не достигнута' };
  var ENDED_LABEL = {
    client_hangup: 'Клиент бросил трубку', user: 'Ты завершил звонок', silence: 'Клиент ушёл: ты молчал',
    limit: 'Разговор дошёл до лимита реплик', client: 'Клиент закончил разговор'
  };
  var GROUPS = [
    { id: 'full', title: 'Полные разговоры', note: 'От начала до конца, как в жизни.' },
    { id: 'step', title: 'Отдельные этапы пути', note: 'Один этап за раз: быстрее и проще отработать слабое место.' }
  ];
  var NO_SPEECH_MS = 8000;    // клиент ждёт ответ не дольше 8 секунд
  var END_SILENCE_MS = 1800;  // пауза после речи завершает ответ

  // Состояние живёт между перерисовками, чтобы раунд не терялся при переходе по меню
  var choice = { scn: 'qual', diff: 'easy', focus: true };
  var server = { loaded: false, error: '', data: null };
  var session = null;
  var rec = null;
  var timerId = null;

  function api() { return C.trainerapi; }

  function loadServer(done) {
    api().status().then(function (data) {
      server = { loaded: true, error: '', data: data };
      done();
    }, function (err) {
      server = { loaded: true, error: err.message, data: null };
      done();
    });
  }

  function chip(text, tone) {
    return h('span', { class: 'tr-chip' + (tone ? ' tr-chip-' + tone : ''), text: text });
  }

  function usageNode() {
    var u = session && session.usage ? session.usage : (server.data && server.data.usage);
    return u ? h('p', { class: 'muted tr-usage', text: T.usageLine(u) }) : null;
  }

  function groupOf(s) {
    return s.group || 'full';
  }

  // ---------- Главный экран ----------
  function homeView(root, redraw) {
    var t = store.trainer();
    var lvl = T.levelFor(t.xp);
    var today = t.days[T.dayKey()] || 0;
    var streak = T.streakOf(t.days);
    var goal = D.trainerDailyGoal;
    var ready = server.data && server.data.deepseek.configured && server.data.stt.ready && C.voice.supported();

    root.appendChild(h('h1', { text: 'Тренажёр продаж' }));
    root.appendChild(h('p', { class: 'muted', text: 'Робот играет клиента, ты отвечаешь голосом. Микрофон включается сам, как только клиент договорил: думать долго нельзя. Звонок можно завершить в любой момент. Оценка строгая: следование правилам, шанс закрыть и подача.' }));

    root.appendChild(statusCard());

    root.appendChild(h('section', { class: 'card tr-level' },
      h('div', { class: 'tr-level-head' },
        h('div', null,
          h('div', { class: 'eyebrow', text: 'Уровень ' + lvl.n }),
          h('div', { class: 'tr-level-name', text: lvl.name })
        ),
        h('div', { class: 'tr-level-meta' },
          chip('Серия: ' + streak + ' дн.', streak >= 3 ? 'ok' : ''),
          chip('Сегодня: ' + Math.min(today, goal) + ' из ' + goal, today >= goal ? 'ok' : '')
        )
      ),
      h('div', { class: 'tr-bar' }, h('div', { class: 'tr-bar-fill', style: 'width:' + lvl.pct + '%' })),
      h('p', { class: 'muted', text: lvl.next ? 'Опыт: ' + t.xp + '. До уровня «' + lvl.next.name + '» осталось ' + (lvl.next.xp - t.xp) + '.' : 'Опыт: ' + t.xp + '. Максимальный уровень.' })
    ));

    root.appendChild(dailyCard(ready, redraw));

    // Сложность клиента
    root.appendChild(h('h2', { text: 'Какого клиента берём' }));
    root.appendChild(h('div', { class: 'tr-focus' },
      h('button', { type: 'button', class: 'tr-focus-btn' + (choice.focus ? ' is-active' : ''), onClick: function () { choice.focus = true; redraw(); } },
        h('strong', { text: 'Строители из газобетона' }), h('span', { class: 'muted', text: 'Твоя рабочая ниша. Рекомендуется.' })),
      h('button', { type: 'button', class: 'tr-focus-btn' + (!choice.focus ? ' is-active' : ''), onClick: function () { choice.focus = false; redraw(); } },
        h('strong', { text: 'Любые строительные ниши' }), h('span', { class: 'muted', text: 'Каркасные дома, бани и другие.' }))
    ));
    root.appendChild(h('div', { class: 'tr-diffs' }, D.trainerDifficulty.map(function (d) {
      return h('button', {
        type: 'button', class: 'tr-diff' + (choice.diff === d.id ? ' is-active' : ''),
        onClick: function () { choice.diff = d.id; redraw(); }
      },
        h('strong', { text: d.title }),
        h('span', { class: 'muted', text: d.note }),
        h('span', { class: 'tr-mult', text: 'Опыт x' + d.mult })
      );
    })));

    root.appendChild(h('h2', { text: 'Что тренируем' }));
    GROUPS.forEach(function (g) {
      var list = D.trainerScenarios.filter(function (s) { return groupOf(s) === g.id; });
      if (!list.length) return;
      root.appendChild(h('h3', { class: 'tr-group', text: g.title }));
      root.appendChild(h('p', { class: 'muted', text: g.note }));
      root.appendChild(h('div', { class: 'tr-scns' }, list.map(function (s) {
        return h('section', { class: 'card tr-scn' },
          s.step ? h('div', { class: 'eyebrow', text: s.step }) : null,
          h('h3', { text: s.title }),
          h('p', { text: s.short }),
          h('p', { class: 'muted', text: 'Критериев: ' + s.criteria.length + '. Реплик до ' + s.maxTurns + '.' }),
          h('button', {
            type: 'button', class: 'btn btn-primary', disabled: ready ? null : 'disabled',
            onClick: function () { choice.scn = s.id; startRound(s.id, redraw); }
          }, 'Начать')
        );
      })));
    });

    // Значки
    root.appendChild(h('h2', { text: 'Значки' }));
    root.appendChild(h('div', { class: 'tr-badges' }, D.trainerBadges.map(function (b) {
      var got = t.badges[b.id];
      return h('div', { class: 'tr-badge' + (got ? ' is-got' : '') },
        h('div', { class: 'tr-badge-title', text: b.title }),
        h('div', { class: 'muted', text: got ? 'Получен ' + U.fmtDateTime(got) : b.desc })
      );
    })));

    // История
    if (t.rounds.length) {
      root.appendChild(h('h2', { text: 'Последние раунды' }));
      root.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, ['Когда', 'Сценарий', 'Клиент', 'Баллы', 'Опыт'].map(function (c) { return h('th', { text: c }); }))),
        h('tbody', null, t.rounds.slice(0, 8).map(function (r) {
          var scn = T.scenarioById(r.scenario);
          return h('tr', null,
            h('td', { text: U.fmtDateTime(r.at) }),
            h('td', { text: (scn ? scn.title : r.scenario) + ', ' + T.difficultyById(r.level).title }),
            h('td', { text: r.client || '' }),
            h('td', { text: String(r.score) }),
            h('td', { text: '+' + r.xp })
          );
        }))
      )));
    }
  }

  // Задача дня: сценарий, сложность и условие меняются каждый день
  function dailyCard(ready, redraw) {
    var d = T.dailyOf();
    var scn = T.scenarioById(d.scn);
    var diff = T.difficultyById(d.diff);
    var state = d.done ? (d.done.passed ? 'Выполнено: условие соблюдено' : 'Пройдено, условие не выполнено') : 'Ещё не пройдена';
    return h('section', { class: 'card tr-daily' + (d.done && d.done.passed ? ' is-done' : '') },
      h('div', { class: 'eyebrow', text: 'Задача дня' }),
      h('h3', { text: scn.title + ', ' + diff.title }),
      h('p', { text: 'Условие: ' + d.twist.text + '. Нужно набрать 60 и больше. Бонус +' + d.bonus + ' опыта, один раз в день.' }),
      h('div', { class: 'tr-chips' }, chip(state, d.done && d.done.passed ? 'ok' : '')),
      h('button', {
        type: 'button', class: 'btn btn-primary', disabled: ready ? null : 'disabled',
        onClick: function () { startRound(scn.id, redraw, d); }
      }, d.done ? 'Пройти ещё раз' : 'Взять задачу')
    );
  }

  function statusCard() {
    if (!server.loaded) return h('section', { class: 'card' }, h('p', { class: 'muted', text: 'Проверяю локальный сервер...' }));
    if (server.error) {
      return h('section', { class: 'card tr-warn' },
        h('h3', { text: 'Сервер тренажёра не запущен' }),
        h('p', { text: 'Тренажёру нужен небольшой локальный сервер: он хранит ключ DeepSeek, считает лимиты и распознаёт голос моделью Whisper. Запусти файл start.command из папки приложения (двойной клик или из Терминала):' }),
        h('pre', { class: 'tr-code', text: 'cd путь/к/папке/crm\n./start.command' }),
        h('p', { class: 'muted', text: 'Подробности в README, раздел «Тренажёр». После запуска обнови страницу.' }),
        h('button', { type: 'button', class: 'btn btn-small', onClick: function () { server.loaded = false; C.app.render(); } }, 'Проверить ещё раз')
      );
    }
    var d = server.data;
    var mic = C.voice.supported();
    return h('section', { class: 'card' },
      h('div', { class: 'tr-chips' },
        chip('DeepSeek: ' + (d.deepseek.configured ? 'ключ есть' : 'нет ключа'), d.deepseek.configured ? 'ok' : 'bad'),
        chip('Голос: ' + (d.stt.ready ? 'готов (' + d.stt.backend + ')' : 'не подключён'), d.stt.ready ? 'ok' : 'bad'),
        chip('Микрофон: ' + (mic ? 'доступен' : 'не поддерживается'), mic ? 'ok' : 'bad')
      ),
      !d.stt.ready ? h('p', { class: 'muted', text: d.stt.detail + ' Как подключить модель: README, раздел «Распознавание речи».' }) : null,
      usageNode()
    );
  }

  // ---------- Раунд ----------
  // daily: задача дня (сценарий, сложность и условие заданы заранее)
  function startRound(scnId, redraw, daily) {
    cleanup();
    session = T.newSession(scnId, daily ? daily.diff : choice.diff, null, { onlyFocus: choice.focus, daily: daily || null });
    session.phase = 'speaking';
    session.error = '';
    session.pending = '';
    session.meta = null;
    session.arming = false;
    session.result = null;
    session.usage = server.data ? server.data.usage : null;
    redraw();
    afterClient(session);
  }

  function cleanup() {
    if (rec) { clearInterval(timerId); rec.handle.cancel(); rec = null; }
    C.voice.stopSpeaking();
    if (session && session.keyHandler) document.removeEventListener('keydown', session.keyHandler);
  }

  // Клиент договорил: озвучиваем реплику и сразу включаем микрофон, как в живом разговоре
  function afterClient(s) {
    var t = store.trainer();
    var last = s.messages[s.messages.length - 1];
    var go = function () {
      if (session !== s || s.phase !== 'speaking') return;
      if (s.ended) { s.ui.evaluate(); return; }
      s.phase = 'idle';
      s.ui.drawControls();
      s.ui.arm();
    };
    if (t.voiceOut && C.voice.canSpeak() && last.role === 'assistant') C.voice.speak(last.content, t.voiceName).then(go);
    else setTimeout(go, 600);
  }

  function roundView(root, redraw) {
    var s = session;
    var chat = h('div', { class: 'tr-chat' });
    var controls = h('div', { class: 'tr-controls' });

    function drawChat() {
      C.dom.clear(chat);
      s.messages.forEach(function (m) {
        chat.appendChild(h('div', { class: 'tr-msg ' + (m.role === 'user' ? 'tr-me' : 'tr-bot') },
          h('div', { class: 'tr-who', text: m.role === 'user' ? 'Ты' : s.profile.name }),
          h('div', { text: m.content })
        ));
      });
      chat.scrollTop = chat.scrollHeight;
    }

    function setPhase(p) {
      s.phase = p;
      s.ui.drawControls();
    }

    function fail(err) {
      s.error = err && err.message ? err.message : 'Что-то пошло не так.';
    }

    // ----- запись: включается сама, клиент ждёт ответа -----
    function startRec() {
      if (s.phase !== 'idle' || s.arming || rec) return;
      s.arming = true;
      C.voice.stopSpeaking();
      s.error = '';
      C.voice.start({
        onLevel: function (v) {
          var bar = root.querySelector('.tr-level-bar');
          if (bar) bar.style.width = Math.round(v * 100) + '%';
        },
        onSpeech: function () { if (rec) rec.spoke = true; },
        endSilenceMs: END_SILENCE_MS,
        noSpeechMs: NO_SPEECH_MS,
        maxSeconds: 60,
        onEndSilence: stopRec,
        onNoSpeech: handleSilence,
        onLimit: stopRec
      }).then(function (r) {
        s.arming = false;
        if (session !== s || s.phase !== 'idle') { r.cancel(); return; }
        rec = { handle: r, begun: Date.now(), spoke: false };
        setPhase('recording');
        timerId = setInterval(function () {
          var el = root.querySelector('.tr-timer');
          if (!el || !rec) return;
          var sec = Math.floor((Date.now() - rec.begun) / 1000);
          el.textContent = sec + ' с';
          el.classList.toggle('is-late', !rec.spoke && sec >= 4);
        }, 300);
      }, function (err) {
        s.arming = false;
        fail(err);
        s.ui.drawControls();
      });
    }

    function stopRec() {
      if (!rec) return;
      clearInterval(timerId);
      var out = rec.handle.stop();
      rec = null;
      if (out.seconds < 0.7 || out.onsetMs === null) {
        handleSilence();
        return;
      }
      s.meta = { onsetMs: out.onsetMs, speechMs: out.speechMs };
      setPhase('transcribing');
      api().transcribe(out.wav).then(function (data) {
        var text = String(data.text || '').trim();
        if (!text) {
          s.error = 'Клиент не разобрал, что ты сказал. Говори чётче и ближе к микрофону.';
          s.metrics.silences += 1;
          handleSilenceLine();
          return;
        }
        s.pending = text;
        send();  // одна попытка: как в настоящем разговоре, переписать ответ нельзя
      }, function (err) {
        fail(err);
        setPhase('idle');
      });
    }

    function cancelRec() {
      if (rec) { clearInterval(timerId); rec.handle.cancel(); rec = null; }
    }

    // Продавец промолчал: клиент переспрашивает, а на второй раз уходит
    function handleSilence() {
      cancelRec();
      s.metrics.silences += 1;
      handleSilenceLine();
    }

    function handleSilenceLine() {
      var line = T.SILENCE_LINES[Math.min(s.metrics.silences - 1, T.SILENCE_LINES.length - 1)];
      s.messages.push({ role: 'assistant', content: line });
      if (s.metrics.silences >= 2) { s.ended = true; s.endedBy = 'silence'; }
      s.ui.drawChat();
      setPhase('speaking');
      afterClient(s);
    }

    // ----- реплика клиента -----
    function send() {
      var text = s.pending;
      var meta = s.meta || { onsetMs: null, speechMs: 0 };
      s.pending = '';
      s.error = '';
      s.messages.push({ role: 'user', content: text });
      s.metrics.turns.push({ text: text, onsetMs: meta.onsetMs, speechMs: meta.speechMs });
      s.userTurns += 1;
      s.ui.drawChat();
      setPhase('thinking');
      api().chat(T.turnMessages(s), 'turn').then(function (data) {
        var r = T.splitEnd(data.text);
        s.usage = data.usage || s.usage;
        s.messages.push({ role: 'assistant', content: r.text || '...' });
        if (r.hangup) { s.ended = true; s.endedBy = 'client_hangup'; }
        else if (r.ended) { s.ended = true; s.endedBy = 'client'; }
        else if (s.userTurns >= s.scn.maxTurns) { s.ended = true; s.endedBy = 'limit'; }
        s.ui.drawChat();
        setPhase('speaking');
        afterClient(s);
      }, function (err) {
        s.messages.pop();
        s.metrics.turns.pop();
        s.userTurns -= 1;
        s.pending = text;
        fail(err);
        s.ui.drawChat();
        setPhase('review');
      });
    }

    function skipSpeech() {
      C.voice.stopSpeaking();
    }

    // ----- завершение звонка и разбор -----
    function hangUp() {
      cancelRec();
      C.voice.stopSpeaking();
      s.ended = true;
      s.endedBy = 'user';
      evaluate();
    }

    function evaluate() {
      C.voice.stopSpeaking();
      if (s.userTurns < 1) {
        s.error = '';
        s.phase = 'aborted';
        s.ui.drawControls();
        return;
      }
      s.error = '';
      s.evalNote = 'Тренер разбирает разговор...';
      setPhase('evaluating');
      api().chat(T.evalMessages(s), 'eval').then(function (data) {
        s.usage = data.usage || s.usage;
        var ev = T.parseEval(data.text);
        if (!ev || !ev.criteria.length) {
          // Один раз повторяем запрос сами: обычно это случайный сбой формата
          if (!s.evalRetried) { s.evalRetried = true; evaluate(); return; }
          throw new Error('Тренер ответил не по формату. Нажми «Повторить разбор».');
        }
        return recheck(ev);
      }).then(function (ev) {
        if (!ev) return;
        s.result = T.finishRound(s, ev);
        s.phase = 'result';
        s.ui.redraw();
      }).catch(function (err) {
        fail(err);
        setPhase('retry');
      });
    }

    // Спорные пункты нейросеть проверяет второй раз по смыслу: перефразированные фразы не теряются
    function recheck(ev) {
      var todo = T.needsVerify(s, ev);
      if (!todo.items.length && !todo.violations.length) return ev;
      s.evalNote = 'Перепроверяю спорные пункты...';
      s.ui.drawControls();
      return api().chat(T.verifyMessages(s, ev), 'eval').then(function (data) {
        s.usage = data.usage || s.usage;
        return T.mergeVerify(s, ev, T.parseVerify(data.text));
      }, function () {
        // Перепроверка не получилась: берём первый разбор, но отбрасываем нарушения без настоящей цитаты
        return T.mergeVerify(s, ev, null);
      });
    }

    function leave() {
      cleanup();
      session = null;
      redraw();
    }

    // ----- управление -----
    function drawControls() {
      C.dom.clear(controls);
      if (s.error) controls.appendChild(h('p', { class: 'tr-error', text: s.error }));
      var p = s.phase;
      if (p === 'idle') {
        controls.appendChild(h('button', { type: 'button', class: 'tr-mic', onClick: startRec }, 'Говорить'));
        controls.appendChild(h('p', { class: 'muted', text: 'Микрофон включается сам, как только клиент договорит. Если не включился, нажми кнопку.' }));
      } else if (p === 'recording') {
        controls.appendChild(h('button', { type: 'button', class: 'tr-mic is-rec', onClick: stopRec }, 'Готово'));
        controls.appendChild(h('div', { class: 'tr-meter' }, h('div', { class: 'tr-level-bar' })));
        controls.appendChild(h('p', { class: 'muted' }, 'Клиент ждёт. Говори сейчас: ', h('span', { class: 'tr-timer', text: '0 с' }),
          '. Пауза около 2 секунд завершает ответ, переписать его нельзя.'));
      } else if (p === 'transcribing') {
        controls.appendChild(h('p', { class: 'tr-wait', text: 'Распознаю речь...' }));
      } else if (p === 'review') {
        controls.appendChild(h('div', { class: 'tr-review' },
          h('div', { class: 'eyebrow', text: 'Не удалось отправить. Твой ответ сохранён:' }),
          h('p', { class: 'tr-said', text: s.pending }),
          h('div', { class: 'tr-row' },
            h('button', { type: 'button', class: 'btn btn-primary', onClick: send }, 'Отправить ещё раз')
          )
        ));
      } else if (p === 'thinking') {
        controls.appendChild(h('p', { class: 'tr-wait', text: s.profile.name + ' думает...' }));
      } else if (p === 'speaking') {
        controls.appendChild(h('p', { class: 'tr-wait', text: s.profile.name + ' говорит...' }));
        controls.appendChild(h('button', { type: 'button', class: 'btn btn-small', onClick: skipSpeech }, 'Пропустить'));
      } else if (p === 'evaluating') {
        controls.appendChild(h('p', { class: 'tr-wait', text: s.evalNote || 'Тренер разбирает разговор...' }));
      } else if (p === 'retry') {
        controls.appendChild(h('button', { type: 'button', class: 'btn btn-primary', onClick: evaluate }, 'Повторить разбор'));
      } else if (p === 'aborted') {
        controls.appendChild(h('p', { class: 'tr-error', text: 'Разговор не состоялся: ты ничего не успел сказать. Разбирать нечего.' }));
        controls.appendChild(h('button', { type: 'button', class: 'btn btn-primary', onClick: leave }, 'К тренажёру'));
      }
      var turns = root.querySelector('.tr-turns');
      if (turns) {
        var active = ['idle', 'recording', 'transcribing', 'review'].indexOf(p) >= 0 ? 1 : 0;
        turns.textContent = 'Реплика ' + Math.min(s.userTurns + active, s.scn.maxTurns) + ' из ' + s.scn.maxTurns;
      }
      var hang = root.querySelector('.tr-hangup');
      if (hang) {
        var can = ['idle', 'recording', 'speaking'].indexOf(p) >= 0;
        if (can) hang.removeAttribute('disabled'); else hang.setAttribute('disabled', 'disabled');
      }
    }

    root.appendChild(h('div', { class: 'tr-top' },
      h('div', null,
        h('h1', { text: s.scn.title }),
        h('div', { class: 'tr-chips' },
          chip(s.diff.title), chip('Клиент: ' + s.profile.name + ', ' + s.profile.niche + ', ' + s.profile.city),
          s.daily ? chip('Задача дня: ' + s.daily.twist.text, 'ok') : null,
          h('span', { class: 'tr-chip tr-turns', text: '' })
        )
      ),
      h('div', { class: 'tr-row' },
        h('button', { type: 'button', class: 'btn btn-danger tr-hangup', onClick: hangUp }, 'Завершить звонок'),
        h('button', { type: 'button', class: 'btn', onClick: leave }, 'Выйти без разбора')
      )
    ));
    root.appendChild(h('section', { class: 'card card-soft' },
      h('p', { class: 'strong', text: T.fill(s.scn.situation) }),
      h('details', null,
        h('summary', { text: 'Что нужно сделать в этом разговоре' }),
        h('ul', { class: 'road-list' }, s.scn.criteria.map(function (c) { return h('li', { text: c.text }); }))
      )
    ));
    if (T.hasLeadCard(s)) root.appendChild(leadCard(s));
    root.appendChild(chat);
    root.appendChild(controls);
    root.appendChild(h('label', { class: 'tr-voiceout' },
      (function () {
        var box = h('input', { type: 'checkbox', checked: store.trainer().voiceOut });
        box.addEventListener('change', function () {
          store.trainer().voiceOut = box.checked;
          store.saveTrainer();
          if (!box.checked) C.voice.stopSpeaking();
        });
        return box;
      })(),
      h('span', { text: 'Озвучивать реплики клиента' })
    ));
    var voices = C.voice.ruVoices();
    if (voices.length) {
      var pickBox = h('select', { class: 'input tr-voice-pick' },
        h('option', { value: '' }, 'Голос клиента: мужской, автоматически'),
        voices.map(function (v) { return h('option', { value: v.name }, v.name); }));
      pickBox.value = store.trainer().voiceName || '';
      pickBox.addEventListener('change', function () {
        store.trainer().voiceName = pickBox.value;
        store.saveTrainer();
      });
      root.appendChild(pickBox);
    }
    var usage = usageNode();
    if (usage) root.appendChild(usage);

    // Пробел включает и останавливает запись вручную
    if (session.keyHandler) document.removeEventListener('keydown', session.keyHandler);
    session.keyHandler = function (e) {
      if (!document.body.contains(root)) {
        document.removeEventListener('keydown', session && session.keyHandler);
        return;
      }
      var tag = e.target && e.target.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].indexOf(tag) >= 0 || e.key !== ' ') return;
      e.preventDefault();
      if (s.phase === 'idle') startRec();
      else if (s.phase === 'recording') stopRec();
    };
    document.addEventListener('keydown', session.keyHandler);

    s.ui = { drawChat: drawChat, drawControls: drawControls, redraw: redraw, arm: startRec, evaluate: evaluate };
    drawChat();
    drawControls();
  }

  // Карточка заявки: как в CRM перед звонком. Ответы анкеты помогают начать разговор.
  function leadCard(s) {
    var l = s.lead;
    return h('section', { class: 'card tr-lead' },
      h('div', { class: 'eyebrow', text: 'Заявка перед звонком' }),
      h('div', { class: 'tr-lead-head' },
        h('strong', { text: s.profile.name + ', ' + l.company }),
        h('div', { class: 'tr-chips' },
          chip('Пришла: ' + l.when, 'ok'),
          l.calls ? chip(l.calls, 'bad') : null,
          chip(s.profile.niche)
        )
      ),
      h('p', { class: 'muted', text: 'Источник: ' + l.source + '.' }),
      h('div', { class: 'tr-lead-quiz' }, l.quiz.map(function (r) {
        return h('div', { class: 'tr-lead-row' }, h('span', { class: 'muted', text: r[0] }), h('strong', { text: r[1] }));
      })),
      h('p', { class: 'muted', text: 'Назови один из ответов анкеты в начале разговора: клиент сразу вспомнит заявку.' })
    );
  }

  // Что было у клиента на самом деле: чтобы увидеть, о чём ты не спросил
  function realityCard(s) {
    var p = s.profile;
    return h('details', { class: 'card card-soft tr-reality' },
      h('summary', { text: 'Что было у клиента на самом деле' }),
      h('p', { class: 'muted', text: 'Застал клиента: ' + s.lead.mood.title + '.' }),
      h('div', { class: 'tr-lead-quiz' }, T.factsOf(p).map(function (r) {
        return h('div', { class: 'tr-lead-row' }, h('span', { class: 'muted', text: r[0] }), h('strong', { text: r[1] }));
      })),
      h('div', { class: 'tr-tip' }, h('strong', { text: 'Что мешало решить: ' }), p.doubt),
      h('div', { class: 'tr-tip' }, h('strong', { text: 'Скрытая правда: ' }), p.secret),
      h('p', { class: 'muted', text: 'Хороший открытый вопрос на эти темы вытаскивает правду. Спросил ли ты об этом?' })
    );
  }

  // ---------- Результат ----------
  function toneOf(n) { return n >= 80 ? 'ok' : n >= 50 ? 'mid' : 'bad'; }

  function meter(title, value, note) {
    return h('div', { class: 'tr-meter-card' },
      h('div', { class: 'eyebrow', text: title }),
      h('div', { class: 'tr-meter-num tr-score-' + toneOf(value), text: String(value) }),
      h('div', { class: 'tr-bar' }, h('div', { class: 'tr-bar-fill', style: 'width:' + value + '%' })),
      h('div', { class: 'muted', text: note })
    );
  }

  function resultView(root, redraw) {
    var s = session;
    var r = s.result;

    root.appendChild(h('h1', { text: 'Разбор: ' + s.scn.title }));
    root.appendChild(h('section', { class: 'card tr-result' },
      h('div', { class: 'tr-score tr-score-' + toneOf(r.score) },
        h('div', { class: 'tr-score-num', text: String(r.score) }),
        h('div', { class: 'muted', text: 'итог из 100' })
      ),
      h('div', { class: 'tr-result-main' },
        h('div', { class: 'tr-xp', text: '+' + r.xp + ' опыта' + (r.bonus ? ' (серия +' + r.bonus + ')' : '') }),
        h('div', { class: 'tr-chips' },
          chip(OUTCOME_LABEL[r.outcome], r.outcome === 'achieved' ? 'ok' : r.outcome === 'failed' ? 'bad' : ''),
          chip(ENDED_LABEL[s.endedBy] || 'Разговор завершён'),
          chip('Уровень ' + r.level.n + ': ' + r.level.name),
          chip('Серия: ' + r.streak + ' дн.')
        ),
        h('p', { text: r.summary })
      )
    ));

    root.appendChild(h('div', { class: 'tr-meters' },
      meter('Следование правилам', r.rules, 'Насколько ты следовал скрипту: фразы и порядок шагов. Вес 60%.'),
      meter('Шанс закрыть', r.chance, 'Оценка того, оплатил бы такой клиент после такого разговора. Вес 25%.'),
      meter('Подача', r.delivery, 'Скорость ответа, паузы, паразиты, темп, длина реплик. Вес 15%.')
    ));

    if (r.caps.length) {
      root.appendChild(h('section', { class: 'card tr-warn' },
        h('h3', { text: 'Почему итог ограничен' }),
        h('ul', { class: 'road-list' }, r.caps.map(function (c) { return h('li', { text: c.reason + ' Максимум ' + c.max + '.' }); }))
      ));
    }
    if (r.violations && r.violations.length) {
      root.appendChild(h('h2', { text: 'Отклонения от скрипта (минус ' + r.penalty + ' к итогу)' }));
      root.appendChild(h('div', { class: 'tr-crit' }, r.violations.map(function (v) {
        return h('div', { class: 'tr-crit-row tr-crit-no' },
          h('div', { class: 'tr-crit-head' }, h('span', { class: 'tr-status', text: 'Нарушено' }), h('span', { class: 'tr-crit-text', text: v.text })),
          v.quote ? h('div', { class: 'muted', text: 'Ты сказал: ' + v.quote }) : null,
          h('div', { class: 'tr-tip' }, h('strong', { text: 'По скрипту: ' }), v.say)
        );
      })));
    }
    if (r.deviations && r.deviations.length) {
      root.appendChild(h('h2', { text: 'Где ты ушёл от скрипта' }));
      root.appendChild(h('ol', { class: 'road-steps' }, r.deviations.map(function (d) {
        return h('li', null, h('div', { text: 'Ты: ' + d.said }), h('div', { class: 'tr-tip' }, h('strong', { text: 'По скрипту: ' }), d.script));
      })));
    }
    if (r.deliveryNotes && r.deliveryNotes.length) {
      root.appendChild(h('h2', { text: 'Замечания по подаче' }));
      root.appendChild(h('ul', { class: 'road-list' }, r.deliveryNotes.map(function (x) { return h('li', { text: x }); })));
    }

    if (r.daily) {
      root.appendChild(h('div', { class: 'tr-banner' }, r.daily.passed
        ? 'Задача дня выполнена: ' + r.daily.twist + '.' + (r.daily.bonus ? ' Бонус +' + r.daily.bonus + ' опыта.' : ' Бонус за сегодня уже получен.')
        : 'Задача дня не выполнена: ' + r.daily.twist + ' и итог от 60. Попробуй ещё раз.'));
    }
    if (r.leveledUp) root.appendChild(h('div', { class: 'tr-banner' }, 'Новый уровень: ' + r.level.name + '.'));
    r.newBadges.forEach(function (b) {
      root.appendChild(h('div', { class: 'tr-banner' }, 'Новый значок: ' + b.title + '. ' + b.desc + '.'));
    });

    root.appendChild(h('h2', { text: 'По критериям' }));
    root.appendChild(h('div', { class: 'tr-crit' }, r.items.map(function (it) {
      return h('div', { class: 'tr-crit-row tr-crit-' + it.status },
        h('div', { class: 'tr-crit-head' },
          h('span', { class: 'tr-status', text: STATUS_LABEL[it.status] }),
          h('span', { class: 'tr-crit-text', text: it.text })
        ),
        it.evidence ? h('div', { class: 'muted', text: it.evidence }) : null,
        it.status !== 'done' && it.tip ? h('div', { class: 'tr-tip' }, h('strong', { text: 'Лучше: ' }), it.tip) : null
      );
    })));

    if (r.mistakes.length) {
      root.appendChild(h('h2', { text: 'Главные ошибки' }));
      root.appendChild(h('ol', { class: 'road-steps' }, r.mistakes.map(function (m) {
        return h('li', null, h('div', { text: m.what }), m.say ? h('div', { class: 'tr-tip' }, h('strong', { text: 'Скажи так: ' }), m.say) : null);
      })));
    }
    if (r.strengths.length) {
      root.appendChild(h('h2', { text: 'Что получилось' }));
      root.appendChild(h('ul', { class: 'road-list' }, r.strengths.map(function (x) { return h('li', { text: x }); })));
    }

    root.appendChild(realityCard(s));
    root.appendChild(h('details', { class: 'card card-soft' },
      h('summary', { text: 'Как тренер услышал твои ответы (распознанный текст)' }),
      h('ol', { class: 'road-list' }, s.messages.filter(function (m) { return m.role === 'user'; }).map(function (m) { return h('li', { text: m.content }); }))
    ));
    var usage = usageNode();
    if (usage) root.appendChild(usage);
    root.appendChild(h('div', { class: 'tr-row' },
      h('button', { type: 'button', class: 'btn btn-primary', onClick: function () { var a = s.scn.id; var dly = s.daily; cleanup(); session = null; startRound(a, redraw, dly); } }, 'Ещё раз'),
      h('button', { type: 'button', class: 'btn', onClick: function () { cleanup(); session = null; redraw(); } }, 'К тренажёру')
    ));
  }

  // ---------- Вход ----------
  function render() {
    var root = h('div', { class: 'view trainer-view' });
    function redraw() {
      C.dom.clear(root);
      if (session && session.phase === 'result') resultView(root, redraw);
      else if (session) roundView(root, redraw);
      else homeView(root, redraw);
    }
    redraw();
    if (!server.loaded) loadServer(redraw);
    return root;
  }

  C.views = C.views || {};
  C.views.trainer = { render: render };
})((window.CRM = window.CRM || {}));
