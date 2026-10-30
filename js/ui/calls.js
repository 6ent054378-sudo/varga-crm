(function (C) {
  'use strict';

  var h = C.dom.h;
  var U = C.utils;
  var D = C.data;
  var store = C.store;
  var CA = C.calls;

  // Запись живёт между перерисовками экрана
  var live = null;

  function mmss(sec) {
    sec = Math.round(sec);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  function copy(textValue, done) {
    function fallback() {
      var ta = h('textarea', { style: 'position:fixed;opacity:0' }, textValue);
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* буфер недоступен */ }
      document.body.removeChild(ta);
      if (done) done();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(textValue).then(done, fallback);
    else fallback();
  }

  function leadSelect(value, onChange) {
    var sel = h('select', { class: 'input' },
      h('option', { value: '' }, 'Клиент не выбран'),
      store.leads().map(function (l) { return h('option', { value: l.id }, (l.name || 'Без имени') + (l.city ? ', ' + l.city : '')); }));
    sel.value = value || '';
    sel.addEventListener('change', function () { onChange(sel.value); });
    return sel;
  }

  function clientName(call) {
    var lead = call.leadId ? store.get(call.leadId) : null;
    return lead ? (lead.name || 'Без имени') : (call.analysis && call.analysis.client.name) || 'Клиент не выбран';
  }

  // ---------- Результат разговора ----------
  function resultView(call, rerender) {
    var box = h('div', { class: 'calls-result' });
    var a = call.analysis;
    var lead = call.leadId ? store.get(call.leadId) : null;

    var head = h('div', { class: 'card calls-head' },
      h('div', null,
        h('div', { class: 'eyebrow', text: new Date(call.at).toLocaleString('ru-RU') + (call.seconds ? ', ' + mmss(call.seconds) : '') + (call.fileName ? ', ' + call.fileName : '') }),
        h('h2', { text: clientName(call) })),
      h('div', { class: 'tools' },
        h('label', { class: 'field calls-lead' }, h('span', { class: 'label', text: 'Карточка клиента' }),
          leadSelect(call.leadId, function (id) { call.leadId = id; store.saveCall(call); rerender(); })),
        h('button', {
          type: 'button', class: 'btn btn-danger',
          onClick: function () { if (window.confirm('Удалить разговор и расшифровку?')) { store.removeCall(call.id); window.location.hash = '#calls'; } }
        }, 'Удалить')));
    box.appendChild(head);

    // Расшифровка и повторный разбор
    var ta = h('textarea', { class: 'input calls-text', rows: '12' }, call.transcript);
    ta.addEventListener('change', function () { call.transcript = ta.value; store.saveCall(call); });
    var again = h('button', { type: 'button', class: 'btn' }, 'Разобрать заново');
    var againMsg = h('span', { class: 'muted' });
    again.addEventListener('click', function () {
      call.transcript = ta.value;
      store.saveCall(call);
      again.disabled = true;
      againMsg.textContent = 'Разбираю...';
      CA.analyze(call.transcript, lead).then(function (res) {
        call.analysis = res;
        store.saveCall(call);
        rerender();
      }, function (err) {
        again.disabled = false;
        againMsg.textContent = err.message;
      });
    });
    var transcript = h('details', { class: 'card' },
      h('summary', { text: 'Расшифровка (' + call.transcript.length + ' знаков)' }),
      h('p', { class: 'muted', text: 'Можно поправить ошибки распознавания и разобрать заново.' }),
      ta, h('div', { class: 'tools' }, again, againMsg));

    if (!a) {
      box.appendChild(h('div', { class: 'card card-warn' },
        h('p', { text: 'Разбор не получился. Проверь, что сервер запущен, и нажми «Разобрать заново».' })));
      box.appendChild(transcript);
      return box;
    }

    // Итоги
    box.appendChild(h('section', { class: 'card' },
      h('h3', { text: 'Итоги' }),
      h('p', { text: a.summary || 'Итогов нет.' }),
      a.agreements.length ? h('div', null, h('div', { class: 'eyebrow', text: 'Договорились' }), h('ul', { class: 'bullets' }, a.agreements.map(function (t) { return h('li', { text: t }); }))) : null,
      a.next.action || a.next.when ? h('p', null, h('strong', { text: 'Следующий шаг: ' }), [a.next.when ? U.fmtDateTime(a.next.when) : '', a.next.action].filter(Boolean).join(', ')) : null,
      a.client.pains.length ? h('div', null, h('div', { class: 'eyebrow', text: 'Боли клиента' }), h('ul', { class: 'bullets' }, a.client.pains.map(function (t) { return h('li', { text: t }); }))) : null
    ));

    // Данные в карточку и КП
    var rows = CA.plan(lead, a);
    var checks = rows.map(function (r) { return h('input', { type: 'checkbox', checked: r.checked }); });
    var applyMsg = h('span', { class: 'muted' });
    function applySelected(toKp) {
      var chosen = rows.filter(function (r, i) { return checks[i].checked; });
      var target = CA.apply(call, lead, chosen);
      if (toKp) { window.location.hash = '#kp/' + target.id; return; }
      applyMsg.textContent = chosen.length ? 'Записано в карточку: ' + chosen.length : 'Ничего не выбрано.';
      rerender();
    }
    box.appendChild(h('section', { class: 'card' },
      h('h3', { text: 'Данные для карточки и КП' }),
      rows.length ? h('div', { class: 'calls-rows' }, rows.map(function (r, i) {
        return h('label', { class: 'calls-row' }, checks[i],
          h('span', { class: 'calls-row-label', text: r.label }),
          h('span', { class: 'calls-row-val' },
            r.current ? h('span', { class: 'muted calls-old', text: r.current }) : null,
            h('span', { text: r.next })));
      })) : h('p', { class: 'muted', text: 'Нового для карточки в разговоре нет.' }),
      h('p', { class: 'muted', text: 'Галочки стоят там, где в карточке было пусто. Заполненное не перезаписывается, пока не отметишь сам.' }),
      h('div', { class: 'tools' },
        h('button', { type: 'button', class: 'btn btn-primary', onClick: function () { applySelected(false); } }, 'Записать в карточку'),
        h('button', { type: 'button', class: 'btn', onClick: function () { applySelected(true); } }, 'Записать и открыть КП'),
        applyMsg,
        call.appliedAt ? h('span', { class: 'muted', text: 'Последний раз записано ' + new Date(call.appliedAt).toLocaleString('ru-RU') }) : null)
    ));

    // Разбор для продавца
    var rv = a.review;
    box.appendChild(h('section', { class: 'card' },
      h('h3', { text: 'Разбор для тебя' }),
      h('div', { class: 'calls-score' }, h('span', { class: 'calls-score-n', text: String(rv.score) }), h('span', { class: 'muted', text: 'из 10' })),
      h('ul', { class: 'calls-check' }, D.callChecklist.map(function (row) {
        var v = rv.checklist[row[0]];
        return h('li', { class: v === true ? 'is-yes' : v === false ? 'is-no' : 'is-unknown' },
          h('span', { class: 'calls-mark', text: v === true ? 'Да' : v === false ? 'Нет' : '?' }), row[1]);
      })),
      rv.good.length ? h('div', null, h('div', { class: 'eyebrow', text: 'Получилось' }), h('ul', { class: 'bullets' }, rv.good.map(function (t) { return h('li', { text: t }); }))) : null,
      rv.missed.length ? h('div', null, h('div', { class: 'eyebrow', text: 'Упустил' }), h('ul', { class: 'bullets' }, rv.missed.map(function (t) { return h('li', { text: t }); }))) : null,
      rv.advice.length ? h('div', null, h('div', { class: 'eyebrow', text: 'Что сделать в следующий раз' }), h('ul', { class: 'bullets' }, rv.advice.map(function (t) { return h('li', { text: t }); }))) : null,
      a.objections.length ? h('div', null, h('div', { class: 'eyebrow', text: 'Возражения клиента и ответы' }),
        a.objections.map(function (o) {
          return h('div', { class: 'phrase-row' }, h('div', { class: 'strong', text: o.text }), o.answer ? h('p', { text: o.answer }) : null);
        })) : null
    ));

    // Сообщение клиенту
    var msg = h('textarea', { class: 'input', rows: '7' }, a.message);
    var copied = h('span', { class: 'muted' });
    box.appendChild(h('section', { class: 'card' },
      h('h3', { text: 'Сообщение клиенту' }),
      msg,
      h('div', { class: 'tools' },
        h('button', { type: 'button', class: 'btn btn-primary', onClick: function () { copy(msg.value, function () { copied.textContent = 'Скопировано'; }); } }, 'Копировать'),
        copied)));

    box.appendChild(transcript);
    return box;
  }

  // ---------- Новый разговор ----------
  function newPanel(root, state, rerender) {
    var panel = h('section', { class: 'card calls-new' });

    function draw() {
      C.dom.clear(panel);
      if (state.phase === 'idle') drawIdle();
      else if (state.phase === 'recording') drawRecording();
      else drawProcessing();
    }

    function fail(err) {
      state.phase = 'idle';
      state.error = err && err.message ? err.message : 'Что-то пошло не так.';
      live = null;
      draw();
    }

    // Общий конвейер: куски звука, расшифровка, разбор, сохранение, переход к результату
    function process(call, chunksPromise) {
      state.phase = 'processing';
      state.steps = { stt: 'run', ai: 'wait', done: 0, total: 0 };
      draw();
      var lead = call.leadId ? store.get(call.leadId) : null;
      chunksPromise.then(function (text) {
        call.transcript = text;
        if (!text.trim()) throw new Error('Речь не распознана. Проверь, что звук записался, и попробуй ещё раз.');
        store.saveCall(call);
        state.steps.stt = 'ok';
        state.steps.ai = 'run';
        draw();
        return CA.analyze(text, lead).then(function (res) {
          call.analysis = res;
          store.saveCall(call);
        }, function (err) {
          state.error = 'Расшифровка сохранена, но разбор не получился: ' + err.message;
        });
      }).then(function () {
        live = null;
        state.phase = 'idle';
        window.location.hash = '#calls/' + call.id;
      }, function (err) {
        if (call.transcript) store.saveCall(call);
        fail(err);
      });
    }

    function progress(done, total) {
      state.steps.done = done;
      state.steps.total = total;
      draw();
    }

    function startFile(file) {
      var call = CA.newCall({ leadId: state.leadId, source: 'file', fileName: file.name });
      state.phase = 'processing';
      state.steps = { stt: 'run', ai: 'wait', done: 0, total: 0, prep: true };
      draw();
      var chunks = C.recorder.decodeFile(file).then(function (res) {
        call.seconds = res.seconds;
        state.steps.prep = false;
        return CA.transcribeAll(res.chunks, progress);
      });
      process(call, chunks);
    }

    function startRecord() {
      state.error = '';
      var parts = [];
      var queue = Promise.resolve();
      var sttError = null;
      var level = 0;
      C.recorder.start({
        tab: state.tab,
        onLevel: function (v) { level = v; },
        onChunk: function (wav, sec, idx) {
          queue = queue.then(function () {
            return C.trainerapi.transcribe(wav).then(function (res) {
              parts[idx - 1] = String(res.text || '').trim();
              live.done = parts.filter(function (p) { return p !== undefined; }).length;
            }, function (err) { sttError = err; });
          });
        }
      }).then(function (rec) {
        live = { rec: rec, done: 0, level: function () { return level; }, finish: null };
        live.finish = function () {
          var info = rec.stop();
          var call = CA.newCall({ leadId: state.leadId, source: 'record', seconds: info.seconds });
          var all = queue.then(function () {
            if (sttError && !parts.some(Boolean)) throw sttError;
            return parts.filter(Boolean).join('\n');
          });
          state.steps = { stt: 'run', ai: 'wait', done: 0, total: 0, live: true };
          process(call, all);
        };
        state.phase = 'recording';
        draw();
      }, fail);
    }

    function drawIdle() {
      var fileInput = h('input', { type: 'file', accept: 'audio/*,.m4a,.mp3,.wav,.webm,.mp4,.aac,.ogg', class: 'calls-file' });
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        if (f) startFile(f);
      });
      var tab = h('input', { type: 'checkbox', checked: state.tab });
      tab.addEventListener('change', function () { state.tab = tab.checked; });
      var supported = C.recorder.supported();
      panel.appendChild(h('h3', { text: 'Новый разговор' }));
      panel.appendChild(h('label', { class: 'field' }, h('span', { class: 'label', text: 'Клиент' }),
        leadSelect(state.leadId, function (id) { state.leadId = id; })));
      panel.appendChild(h('div', { class: 'calls-actions' },
        h('button', { type: 'button', class: 'btn btn-primary btn-lg calls-rec', disabled: supported ? null : 'disabled', onClick: startRecord }, 'Записать'),
        h('button', { type: 'button', class: 'btn btn-lg', onClick: function () { fileInput.click(); } }, 'Загрузить файл'),
        fileInput));
      panel.appendChild(h('label', { class: 'check' }, tab,
        h('span', { text: 'Добавить звук вкладки или экрана (Meet и Zoom в браузере). Для Zoom на компьютере лучше загрузить его запись.' })));
      panel.appendChild(h('p', { class: 'muted', text: 'Предупреди клиента, что идёт запись. Нажми «Записать», веди разговор, затем «Остановить»: расшифровка и разбор запустятся сами. Звук нигде не хранится, остаётся только текст.' }));
      if (state.error) panel.appendChild(h('p', { class: 'calls-error', text: state.error }));
    }

    function drawRecording() {
      var timer = h('div', { class: 'calls-timer', text: '0:00' });
      var meter = h('div', { class: 'calls-meter' }, h('div', { class: 'calls-meter-fill' }));
      var info = h('div', { class: 'muted' });
      panel.appendChild(h('div', { class: 'calls-live' }, h('span', { class: 'calls-dot' }), h('strong', { text: 'Идёт запись' })));
      panel.appendChild(timer);
      panel.appendChild(meter);
      panel.appendChild(info);
      panel.appendChild(h('div', { class: 'tools' },
        h('button', { type: 'button', class: 'btn btn-primary btn-lg', onClick: function () { live.finish(); } }, 'Остановить и обработать'),
        h('button', { type: 'button', class: 'btn', onClick: function () { live.rec.cancel(); live = null; state.phase = 'idle'; draw(); } }, 'Отменить')));
      var tick = window.setInterval(function () {
        if (!document.body.contains(panel) || state.phase !== 'recording' || !live) { window.clearInterval(tick); return; }
        timer.textContent = mmss(live.rec.seconds());
        meter.firstChild.style.width = Math.round(live.level() * 100) + '%';
        info.textContent = live.done ? 'Уже расшифровано кусков: ' + live.done : 'Расшифровка начнётся после первых полутора минут.';
      }, 300);
    }

    function stepRow(label, status, extra) {
      return h('li', { class: 'calls-step is-' + status },
        h('span', { class: 'calls-step-mark', text: status === 'ok' ? 'Готово' : status === 'run' ? '...' : 'Ждёт' }),
        h('span', { text: label + (extra ? ' ' + extra : '') }));
    }

    function drawProcessing() {
      var st = state.steps;
      panel.appendChild(h('h3', { text: 'Обрабатываю разговор' }));
      panel.appendChild(h('ul', { class: 'calls-steps' },
        stepRow(st.prep ? 'Читаю файл' : 'Расшифровка речи', st.stt, st.total ? '(' + st.done + ' из ' + st.total + ')' : ''),
        stepRow('Разбор: итоги, данные клиента, советы', st.ai)));
      panel.appendChild(h('p', { class: 'muted', text: 'Не закрывай вкладку. Длинный разговор расшифровывается несколько минут.' }));
    }

    draw();
    return panel;
  }

  function history() {
    var calls = store.calls();
    if (!calls.length) return h('p', { class: 'muted', text: 'Разговоров пока нет.' });
    return h('div', { class: 'list' }, calls.map(function (c) {
      var preview = (c.analysis && c.analysis.summary) || c.transcript || '';
      return h('a', { class: 'row', href: '#calls/' + c.id },
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title', text: clientName(c) }),
          h('div', { class: 'row-sub', text: preview.slice(0, 120) + (preview.length > 120 ? '...' : '') })),
        h('div', { class: 'row-hint' },
          h('span', { class: 'chip', text: c.analysis ? 'Разобран' : 'Только текст' }),
          h('span', { class: 'row-reason', text: new Date(c.at).toLocaleDateString('ru-RU') + (c.seconds ? ', ' + mmss(c.seconds) : '') })));
    }));
  }

  function render(callId) {
    var root = h('div', { class: 'view' });
    var state = { phase: live ? 'recording' : 'idle', leadId: '', tab: false, error: '', steps: null };
    var call = callId ? store.getCall(callId) : null;

    if (callId && !call) {
      root.appendChild(h('div', { class: 'empty' }, h('h2', { text: 'Разговор не найден' }), h('a', { class: 'btn', href: '#calls', text: 'К разговорам' })));
      return root;
    }

    root.appendChild(h('h1', { text: 'Разговоры' }));
    if (call) {
      root.appendChild(h('a', { class: 'back', href: '#calls', text: 'Все разговоры' }));
      var holder = h('div');
      var rerender = function () { C.dom.clear(holder); holder.appendChild(resultView(store.getCall(callId), rerender)); };
      rerender();
      root.appendChild(holder);
      return root;
    }

    root.appendChild(h('p', { class: 'muted', text: 'Запиши разговор или загрузи файл: расшифровка, данные клиента, разбор и сообщение клиенту.' }));
    var status = h('p', { class: 'muted calls-status', text: 'Проверяю сервер...' });
    C.trainerapi.status().then(function (st) {
      var ok = st.deepseek && st.deepseek.configured;
      status.textContent = 'Сервер на связи. Расшифровка: ' + (st.stt && st.stt.backend ? st.stt.backend : 'есть') + '. DeepSeek: ' + (ok ? 'ключ есть' : 'ключа нет в server/config.json') + '.';
    }, function (err) {
      status.textContent = err.message;
      status.className = 'calls-error calls-status';
    });
    root.appendChild(status);
    root.appendChild(newPanel(root, state, null));
    root.appendChild(h('h2', { text: 'Прошлые разговоры' }));
    root.appendChild(history());
    return root;
  }

  C.views = C.views || {};
  C.views.calls = { render: render };
})((window.CRM = window.CRM || {}));
