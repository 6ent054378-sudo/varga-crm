(function (C) {
  'use strict';

  var D = C.data;
  var store = C.store;

  var END_MARK = '[КОНЕЦ]';
  var HANGUP_MARK = '[ТРУБКА]';
  // Строгая шкала: частично выполненный пункт даёт меньше половины
  var STATUS_VALUE = { done: 1, partial: 0.3, no: 0 };
  var FILLER_RE = /(?:^|[\s,.!?;:])(?:э+|эм+|ну|как бы|типа|короче|так сказать|в общем-то)(?=$|[\s,.!?;:])/gi;

  // Реплики клиента, когда продавец молчит: без запроса к модели
  var SILENCE_LINES = ['Алло? Вы меня слышите?', 'Так, я не понимаю, вы молчите. Если вам нечего сказать, я пошёл, до свидания.'];

  // Неожиданные повороты разговора: каждому раунду достаются два
  var CURVEBALLS = [
    'В середине разговора спроси: «А чем вы вообще лучше остальных, мне таких звонят каждую неделю?»',
    'Раньше времени спроси цену: «Сколько это стоит, давайте сразу».',
    'Пожалуйся на прошлого подрядчика: взял деньги и пропал, и спроси, чем продавец отличается.',
    'Скажи, что у тебя через пять минут другая встреча, и спроси, можно ли покороче.',
    'Уйди в сторону: расскажи пару предложений про сезонность или стройку, и посмотри, вернёт ли продавец к теме.',
    'Один раз ответь невпопад или односложно («угу», «ну так»), проверь, уточнит ли продавец.',
    'Скажи, что тебя отвлекли (зашёл сотрудник, звонит телефон), и попроси повторить последнюю мысль.',
    'Усомнись в цифрах продавца: «А откуда вы это взяли? Это реально?»',
    'Скажи, что нужно посоветоваться с партнёром, хотя ты решаешь сам, и посмотри, как продавец отреагирует.'
  ];

  function dayKey(date) {
    var d = date || new Date();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day);
  }

  // ---------- Тексты с актуальными ценами ----------
  function priceLine() {
    var U = C.utils;
    var tiers = C.offer.tiers().slice().sort(function (a, b) { return a.price - b.price; });
    var m = C.offer.maintain();
    return 'тарифы ' + tiers.map(function (t) { return U.fmtMoney(t.price); }).join(', ') +
      ' разово за запуск, рекламный бюджет отдельно от 2 000 рублей в день, ведение проекта ' + U.fmtMoney(m.price) + ' в месяц только если клиент захочет продолжить работать';
  }

  function fill(text) {
    return String(text || '').replace(/\{tariffs\}/g, priceLine());
  }

  function scenarioById(id) {
    return D.trainerScenarios.filter(function (s) { return s.id === id; })[0] || null;
  }

  function difficultyById(id) {
    return D.trainerDifficulty.filter(function (d) { return d.id === id; })[0] || D.trainerDifficulty[0];
  }

  // ---------- Уровни, серия ----------
  function levelFor(xp) {
    var levels = D.trainerLevels;
    var cur = levels[0];
    levels.forEach(function (l) { if (xp >= l.xp) cur = l; });
    var next = levels[cur.n] || null;
    var into = xp - cur.xp;
    var need = next ? next.xp - cur.xp : 0;
    return { n: cur.n, name: cur.name, next: next, into: into, need: need, pct: next ? Math.min(100, Math.round(into / need * 100)) : 100 };
  }

  function streakOf(days, now) {
    var d = new Date(now || Date.now());
    var count = 0;
    while (days[dayKey(d)] > 0) {
      count += 1;
      d.setDate(d.getDate() - 1);
    }
    return count;
  }

  // ---------- Подача: темп, паузы, паразиты ----------
  function wordsOf(text) {
    return String(text || '').split(/\s+/).filter(function (w) { return /[а-яёa-z0-9]/i.test(w); }).length;
  }

  function fillersOf(text) {
    var m = (' ' + String(text || '').toLowerCase() + ' ').match(FILLER_RE);
    return m ? m.length : 0;
  }

  function metricsOf(session) {
    var turns = (session.metrics && session.metrics.turns) || [];
    var words = 0;
    var fillers = 0;
    var speechMs = 0;
    var onset = [];
    var longest = 0;
    turns.forEach(function (t) {
      var w = wordsOf(t.text);
      words += w;
      fillers += fillersOf(t.text);
      speechMs += t.speechMs || 0;
      if (t.onsetMs !== null && t.onsetMs !== undefined) onset.push(t.onsetMs);
      longest = Math.max(longest, t.speechMs || 0);
    });
    var avgOnset = onset.length ? onset.reduce(function (a, b) { return a + b; }, 0) / onset.length / 1000 : 0;
    return {
      answers: turns.length,
      words: words,
      avgWords: turns.length ? words / turns.length : 0,
      avgOnset: avgOnset,
      avgSpeech: turns.length ? speechMs / turns.length / 1000 : 0,
      longest: longest / 1000,
      wpm: speechMs > 3000 ? Math.round(words / (speechMs / 60000)) : 0,
      fillerPer100: words ? fillers / words * 100 : 0,
      silences: (session.metrics && session.metrics.silences) || 0
    };
  }

  // Оценка подачи 0-100 и список замечаний. Начинаем со 100 и вычитаем за плохие привычки.
  function deliveryOf(m) {
    var score = 100;
    var notes = [];
    if (!m.answers) return { score: 0, notes: ['Нет ни одного ответа.'] };
    if (m.silences) {
      score -= Math.min(40, m.silences * 20);
      notes.push('Молчал после реплики клиента: ' + m.silences + ' раз.');
    }
    if (m.avgOnset > 5) { score -= 25; notes.push('Долго думал перед ответом: в среднем ' + m.avgOnset.toFixed(1) + ' с.'); }
    else if (m.avgOnset > 3) { score -= 12; notes.push('Пауза перед ответом длинноватая: в среднем ' + m.avgOnset.toFixed(1) + ' с.'); }
    if (m.fillerPer100 > 8) { score -= 25; notes.push('Много слов-паразитов: ' + m.fillerPer100.toFixed(0) + ' на 100 слов.'); }
    else if (m.fillerPer100 > 4) { score -= 12; notes.push('Слова-паразиты: ' + m.fillerPer100.toFixed(0) + ' на 100 слов.'); }
    if (m.wpm && (m.wpm < 80 || m.wpm > 190)) { score -= 10; notes.push(m.wpm < 80 ? 'Слишком медленный темп: ' + m.wpm + ' слов в минуту.' : 'Слишком быстрый темп: ' + m.wpm + ' слов в минуту.'); }
    if (m.longest > 40) { score -= 20; notes.push('Монолог дольше 40 секунд: клиент теряет нить.'); }
    else if (m.longest > 25) { score -= 10; notes.push('Один ответ длился больше 25 секунд.'); }
    if (m.avgWords < 8) { score -= 15; notes.push('Ответы слишком короткие: в среднем ' + m.avgWords.toFixed(0) + ' слов.'); }
    return { score: Math.max(0, score), notes: notes };
  }

  // ---------- Оценка раунда ----------
  // Пункт «сделано» без доказательства из текста считается частичным: строгая проверка
  function scoreOf(scn, evaluation) {
    var byId = {};
    ((evaluation && evaluation.criteria) || []).forEach(function (c) { byId[c.id] = c; });
    var total = 0;
    var got = 0;
    var items = scn.criteria.map(function (c) {
      var found = byId[c.id] || {};
      var status = STATUS_VALUE[found.status] === undefined ? 'no' : found.status;
      if (status === 'done' && !String(found.evidence || '').trim()) status = 'partial';
      total += c.weight;
      got += c.weight * STATUS_VALUE[status];
      return { id: c.id, text: c.text, weight: c.weight, status: status, evidence: found.evidence || '', tip: found.tip || '' };
    });
    return { score: total ? Math.round(got / total * 100) : 0, items: items };
  }

  function chanceOf(evaluation, rules, outcome) {
    var raw = evaluation && typeof evaluation.chance === 'number' ? evaluation.chance : rules;
    var chance = Math.max(0, Math.min(100, Math.round(raw)));
    chance = Math.min(chance, rules + 15);
    if (outcome === 'failed') chance = Math.min(chance, 25);
    else if (outcome === 'partial') chance = Math.min(chance, 60);
    return chance;
  }

  // Отклонения от скрипта, найденные тренером: только известные id, без повторов
  function violationsOf(evaluation) {
    var seen = {};
    var out = [];
    ((evaluation && evaluation.violations) || []).forEach(function (v) {
      var rule = (D.scriptRules || []).filter(function (r) { return r.id === v.id; })[0];
      if (!rule || seen[rule.id]) return;
      seen[rule.id] = true;
      out.push({ id: rule.id, text: rule.text, say: rule.say, quote: v.quote || '' });
    });
    return out;
  }

  // Итог = 60% следование правилам + 25% шанс закрыть + 15% подача.
  // Затем вычитается 6 баллов за каждое отклонение от скрипта (не больше 30) и применяются потолки.
  // Итог не может быть выше следования правилам больше чем на 12: хорошая подача не заменяет скрипт.
  function overallOf(session, evaluation) {
    var scn = session.scn;
    var scored = scoreOf(scn, evaluation);
    var outcome = evaluation && /^(achieved|partial|failed)$/.test(evaluation.outcome) ? evaluation.outcome : 'failed';
    var metrics = metricsOf(session);
    var delivery = deliveryOf(metrics);
    var chance = chanceOf(evaluation, scored.score, outcome);
    var violations = violationsOf(evaluation);
    var penalty = Math.min(30, violations.length * 6);
    var raw = Math.round(scored.score * 0.6 + chance * 0.25 + delivery.score * 0.15) - penalty;

    var caps = [];
    if (session.endedBy === 'client_hangup') caps.push({ max: 30, reason: 'Клиент бросил трубку.' });
    if (session.endedBy === 'silence') caps.push({ max: 25, reason: 'Клиент ушёл, потому что ты молчал.' });
    if (session.endedBy === 'user' && session.userTurns < scn.minTurns) caps.push({ max: 40, reason: 'Ты завершил звонок слишком рано.' });
    if (session.userTurns < scn.minTurns) caps.push({ max: 45, reason: 'Слишком мало реплик для оценки: нужно хотя бы ' + scn.minTurns + '.' });
    if (outcome === 'failed') caps.push({ max: 40, reason: 'Цель разговора не достигнута.' });
    else if (outcome === 'partial') caps.push({ max: 60, reason: 'Цель разговора достигнута не полностью.' });
    caps.push({ max: Math.min(100, scored.score + 12), reason: 'Итог не может сильно превышать следование скрипту: ' + scored.score + '.', soft: true });
    var score = Math.max(0, raw);
    caps.forEach(function (c) { score = Math.min(score, c.max); });
    caps = caps.filter(function (c) { return !c.soft || c.max < raw; });
    return {
      score: score, rules: scored.score, chance: chance, delivery: delivery.score, deliveryNotes: delivery.notes,
      items: scored.items, outcome: outcome, caps: caps, metrics: metrics, violations: violations, penalty: penalty
    };
  }

  function xpFor(score, diff) {
    return Math.round(score * diff.mult);
  }

  // Записывает раунд в состояние и возвращает итог для экрана результата
  function finishRound(session, evaluation) {
    var t = store.trainer();
    var diff = session.diff;
    var res = overallOf(session, evaluation);
    var before = levelFor(t.xp);

    var today = dayKey();
    t.days[today] = (t.days[today] || 0) + 1;
    var streak = streakOf(t.days);
    var bonus = res.score >= 60 ? Math.min(streak - 1, 5) * 5 : 0;
    var xp = xpFor(res.score, diff) + bonus;

    // Задача дня: условие проверяется по цифрам разговора, бонус даётся один раз в день
    var daily = null;
    if (session.daily) {
      var already = !!(t.daily[today] && t.daily[today].done);
      var passed = res.score >= 60 && !!session.daily.twist.test(session, res);
      daily = { twist: session.daily.twist.text, passed: passed, repeat: already, bonus: passed && !already ? D.trainerDailyBonus : 0 };
      if (!already) {
        t.daily[today] = { done: true, passed: passed, score: res.score };
        if (passed) t.counts.daily = (t.counts.daily || 0) + 1;
      }
      xp += daily.bonus;
    }
    t.xp += xp;

    var round = {
      at: new Date().toISOString(), scenario: session.scn.id, level: diff.id, score: res.score, xp: xp,
      client: session.profile.name + ', ' + session.profile.niche
    };
    t.rounds.unshift(round);
    if (t.rounds.length > 100) t.rounds.length = 100;

    res.items.forEach(function (it) {
      if (it.id === 'silence' && it.status === 'done') t.counts.silence = (t.counts.silence || 0) + 1;
    });

    var fresh = [];
    D.trainerBadges.forEach(function (b) {
      if (!t.badges[b.id] && b.test(t, round, streak)) {
        t.badges[b.id] = round.at;
        fresh.push(b);
      }
    });
    store.saveTrainer();

    var after = levelFor(t.xp);
    res.xp = xp;
    res.daily = daily;
    res.bonus = bonus;
    res.streak = streak;
    res.level = after;
    res.leveledUp = after.n > before.n;
    res.newBadges = fresh;
    res.deviations = (evaluation && evaluation.deviations) || [];
    res.mistakes = (evaluation && evaluation.mistakes) || [];
    res.strengths = (evaluation && evaluation.strengths) || [];
    res.summary = (evaluation && evaluation.summary) || '';
    return res;
  }

  // ---------- Задача дня ----------
  function hashOf(text) {
    var n = 0;
    for (var i = 0; i < text.length; i++) n = (n * 31 + text.charCodeAt(i)) % 100003;
    return n;
  }

  function dailyOf(key) {
    var k = key || dayKey();
    var n = hashOf(k);
    var item = D.trainerDaily[n % D.trainerDaily.length];
    var twist = D.trainerTwists[Math.floor(n / D.trainerDaily.length) % D.trainerTwists.length];
    return { key: k, scn: item.scn, diff: item.diff, twist: twist, bonus: D.trainerDailyBonus, done: store.trainer().daily[k] || null };
  }

  // ---------- Подбор клиента ----------
  function pickFrom(list, rnd) {
    return list[Math.floor((rnd ? rnd() : Math.random()) * list.length)];
  }

  // onlyFocus: только клиенты из рабочей ниши (газобетон), по умолчанию да
  function pickProfile(rnd, onlyFocus) {
    var list = D.trainerProfiles;
    if (onlyFocus !== false) {
      var focus = list.filter(function (p) { return p.focus; });
      if (focus.length) list = focus;
    }
    return pickFrom(list, rnd);
  }

  var QUIZ_LABELS = [
    ['capacity', 'Готовы строить в год'], ['current', 'Строите сейчас в год'], ['ads', 'Реклама раньше'],
    ['adsWhere', 'Где запускали'], ['adsBudget', 'Бюджет на рекламу в месяц']
  ];

  // Заявка, которую продавец видит перед звонком, как карточку лида: время, источник, ответы анкеты.
  // Обстановка клиента (mood) продавцу заранее неизвестна.
  function buildLead(scn, profile, rnd) {
    var ctx = scn.ctx || 'meeting';
    var minutes = pickFrom([2, 3, 4, 6, 9, 14], rnd);
    var mood = pickFrom(D.trainerMoods, rnd);
    var quiz = QUIZ_LABELS.map(function (q) { return [q[1], profile.quiz && profile.quiz[q[0]]]; }).filter(function (r) { return r[1]; });
    return {
      ctx: ctx, minutes: minutes, mood: mood, quiz: quiz,
      company: profile.company + ', ' + profile.city,
      when: ctx === 'recall' ? 'вчера' : minutes + ' мин. назад',
      calls: ctx === 'recall' ? 'два звонка без ответа' : '',
      source: 'Яндекс Директ, бесплатная консультация по привлечению клиентов'
    };
  }

  function hasLeadCard(session) {
    return !!(session.lead && (session.lead.ctx === 'call' || session.lead.ctx === 'recall'));
  }

  // Что было у клиента на самом деле: показывается после разбора
  function factsOf(p) {
    return [
      ['Загрузка', p.deals], ['Средний чек', p.cheque], ['Конверсия', p.conv], ['Откуда клиенты', p.sources],
      ['Кто обрабатывает заявки', p.sales], ['Цель', p.goal], ['Что беспокоит', p.pain], ['Что пробовал', p.tried]
    ];
  }

  function pickDrill(rnd) {
    var list = D.objections.filter(function (o) { return o.q && o.a && o.a.length; });
    var o = list[Math.floor((rnd ? rnd() : Math.random()) * list.length)];
    return {
      line: o.q,
      ideal: o.a.filter(function (x) { return typeof x === 'string'; }).slice(0, 4)
    };
  }

  function pickCurveballs(rnd) {
    var pool = CURVEBALLS.slice();
    var out = [];
    for (var i = 0; i < 2; i++) {
      var k = Math.floor((rnd ? rnd() : Math.random()) * pool.length);
      out.push(pool.splice(k, 1)[0]);
    }
    return out;
  }

  // opts: onlyFocus (по умолчанию да), daily (задача дня из dailyOf)
  function newSession(scnId, diffId, rnd, opts) {
    var o = opts || {};
    var scn = scenarioById(scnId);
    var diff = difficultyById(diffId);
    var profile = pickProfile(rnd, o.onlyFocus);
    var lead = buildLead(scn, profile, rnd);
    var drill = scn.id === 'drill' ? pickDrill(rnd) : null;
    var opener = drill ? drill.line : (scn.moodOpener ? lead.mood.opener : scn.opener);
    return {
      scn: scn, diff: diff, profile: profile, lead: lead, drill: drill, daily: o.daily || null, curveballs: pickCurveballs(rnd),
      messages: [{ role: 'assistant', content: opener }],
      userTurns: 0, ended: false, endedBy: '', metrics: { turns: [], silences: 0 }
    };
  }

  // ---------- Запросы к модели ----------
  function profileFacts(p) {
    return [
      'Тебя зовут ' + p.name + '. Бизнес: ' + p.niche + ', город ' + p.city + ', в нише ' + p.years + ' лет.',
      'Загрузка: ' + p.deals + '. Средний чек: ' + p.cheque + '. Конверсия: ' + p.conv + '.',
      'Откуда берёшь клиентов: ' + p.sources + '.',
      'Кто обрабатывает заявки: ' + p.sales + '.',
      'Цель на ближайший месяц: ' + p.goal + '.',
      'Что беспокоит: ' + p.pain + '.',
      'Что пробовал: ' + p.tried + '.',
      'Решения по подрядчикам и рекламе принимаешь сам.'
    ].join('\n');
  }

  var REALISM = 'Живое поведение. Ты настоящий занятый владелец строительного бизнеса и не следуешь сценарию продавца. Ты можешь: перебить встречным вопросом («а вы из какой компании?», «чем вы лучше других?»), задать неудобный вопрос, пожаловаться на прошлых подрядчиков, уйти в сторону и рассказать пару предложений про свой бизнес, ответить односложно, сказать «не понял» и попросить повторить, отвлечься (звонит телефон, зашёл сотрудник). Иногда отвечай не на тот вопрос, который задал продавец. Не помогай продавцу и не подсказывай, что спросить. ' +
    'Твоё терпение ограничено: если продавец говорит общими словами и заученными фразами, не слышит тебя, игнорирует твой вопрос, тянет длинный монолог больше пары предложений, давит или врёт, терпение падает. Когда оно кончилось, коротко и прямо скажи, что тебе пора и звонить больше не надо, и добавь метку ' + HANGUP_MARK + '. ' +
    'Не облегчай задачу: не соглашайся, пока продавец этого не заслужил. Хорошего продавца, который слышит тебя и ведёт по делу, ты постепенно уважаешь.';

  function quizText(lead) {
    return lead.quiz.map(function (r) { return r[0] + ': ' + r[1]; }).join('; ');
  }

  // Как клиент попал к продавцу. Заявка настоящая и клиент её помнит: отрицать её нельзя.
  function contextOf(session) {
    var lead = session.lead;
    var p = session.profile;
    var noDeny = 'Никогда не говори, что ничего не оставлял, не спрашивай «какая заявка» и «откуда у вас мой номер».';
    if (lead.ctx === 'call') {
      return 'Как ты попал к продавцу: ' + lead.minutes + ' мин. назад ты увидел в Яндексе рекламу про привлечение клиентов для строителей, зашёл на сайт, ответил на несколько вопросов анкеты и оставил номер телефона на бесплатную консультацию. Твои ответы в анкете: ' + quizText(lead) + '. Это правда, ты всё помнишь. Если продавец говорит про заявку, анкету или сайт, подтверждай естественно («да, оставлял», «минут пять назад»). Если спросят, что за сайт, расскажи по памяти: реклама про привлечение клиентов, на сайте были вопросы про объём строительства и рекламу. Название компании, которая позвонит, ты можешь не помнить, это нормально. ' + noDeny + ' Сопротивляйся в другом: занятость, скепсис, цена, сравнение с другими подрядчиками.';
    }
    if (lead.ctx === 'recall') {
      return 'Как ты попал к продавцу: вчера ты оставил заявку на сайте на бесплатную консультацию по привлечению клиентов. Твои ответы в анкете: ' + quizText(lead) + '. Вчера и сегодня ты видел пропущенные с незнакомого номера и не успел перезвонить. Сам факт заявки помнишь, детали анкеты смутно, пока продавец не напомнит. ' + noDeny;
    }
    if (lead.ctx === 'follow') {
      return 'Как вы познакомились: ты оставил заявку на сайте, провёл с продавцом онлайн-разбор и получил коммерческое предложение. Прошло два дня, ты молчишь. Настоящая причина молчания: ' + p.doubt + '. Называй её, только если продавец спокойно спросил, что мешает решить, и не давил; сначала говори общее. ' + noDeny;
    }
    return 'Как вы познакомились: несколько дней назад ты оставил заявку на сайте, продавец позвонил, и вы договорились о разборе. Сейчас вы на связи. ' + noDeny;
  }

  function clientSystem(session) {
    var scn = session.scn;
    var parts = [
      'Ты играешь клиента строительной компании в тренировке продаж. Продавец продаёт услугу «сайт или лендинг и маркетинг под ключ» (связка: реклама, чат-бот с прогревом заявок, сайт): ' + priceLine() + '. Ты не помощник и не коуч, ты живой человек.',
      'Факты о тебе (называй их, только когда продавец об этом спросит, сам не вываливай):\n' + profileFacts(session.profile),
      contextOf(session),
      'Скрытая правда, о которой ты сам не заговоришь: ' + session.profile.secret + '. Расскажи об этом, только если продавец задал точный открытый вопрос на эту тему и ты ему доверяешь.',
      'Обстановка: ' + session.lead.mood.prompt,
      'Характер: ' + session.diff.prompt,
      'Ситуация: ' + fill(scn.situation),
      scn.behavior,
      REALISM
    ];
    if (session.curveballs && session.curveballs.length) parts.push('Неожиданные повороты, которые стоит устроить в этом разговоре, каждый один раз и в подходящий момент:\n- ' + session.curveballs.join('\n- '));
    if (session.drill) parts.push('Твоё возражение: «' + session.drill.line + '».');
    parts.push('Формат: отвечай по-русски, как в живой телефонной речи, одним-тремя короткими предложениями, без списков и пояснений в скобках. Никогда не выходи из роли и не оценивай продавца. Если разговор закончился (договорились), скажи последнюю реплику и добавь метку ' + END_MARK + '.');
    return parts.join('\n\n');
  }

  function turnMessages(session) {
    return [{ role: 'system', content: clientSystem(session) }].concat(session.messages);
  }

  function transcript(session) {
    return session.messages.map(function (m) {
      var who = m.role === 'user' ? 'Продавец' : 'Клиент';
      return who + ': ' + String(m.content).slice(0, 500);
    }).join('\n');
  }

  // Текст эталонного скрипта для тех частей, которые тренирует сценарий (scn.refs)
  function scriptText(scn) {
    var refs = scn.refs || [];
    var out = [];
    (D.fullScript || []).forEach(function (st) {
      st.parts.forEach(function (part) {
        if (refs.indexOf(part.id) < 0) return;
        out.push(part.title + ':\n' + part.items.map(function (it) { return '- ' + String(it.t).slice(0, 420); }).join('\n'));
      });
    });
    return out.join('\n\n').slice(0, 9000);
  }

  var EVAL_SYSTEM = 'Ты тренер по продажам и проверяешь разговор по ЭТАЛОННОМУ СКРИПТУ, который дан ниже. Продавец продаёт «сайт и маркетинг под ключ». Реплики продавца распознаны голосом: ошибки распознавания не штрафуй, слова-паразиты и воду учитывай.\n' +
    'ГЛАВНОЕ ПРАВИЛО: оценивай по СМЫСЛУ, а не по дословности. Скрипт это образец, а не текст для заучивания. Если продавец своими словами сделал то, что требует пункт (например, сказал «у меня есть список вопросов, давайте пройдёмся по ним» вместо фразы из скрипта), это done. Не требуй точных слов, порядок слов и формулировка не важны. Не снижай оценку за то, что фраза звучит иначе.\n' +
    'Строгость относится к СУТИ: partial, если смысл пункта выполнен не до конца (например, рамка задана, но согласия клиента не дождался). no, если смысла пункта в разговоре нет вообще. Перед тем как поставить no или partial, перечитай ВСЕ реплики продавца и убедись, что пункт не выполнен где-то в другом месте разговора и другими словами. Не хвали без причины: за невыполненную суть оценка низкая, 80 и больше только за почти безупречный разговор.\n' +
    'Для каждого критерия: статус done, partial или no, доказательство (до 10 слов, цитата продавца, обязательна для done и partial) и, если не done, подсказка (до 15 слов, фраза из скрипта). Пиши КРАТКО, иначе ответ обрежется.\n' +
    'Отклонения от скрипта: из списка нарушений выбери только те, что ЯВНО произошли, укажи id и точную цитату продавца (до 8 слов). Не выдумывай нарушений. Нарушение «без рамки» или «без даты» ставь только если во всём разговоре нет ничего подобного по смыслу. Отдельно deviations: до 4 мест, где продавец реально ушёл от смысла скрипта, с полями said (до 12 слов) и script (до 20 слов).\n' +
    'Отдельно оцени: outcome (achieved: цель разговора достигнута полностью, partial: частично, failed: не достигнута) и chance (от 0 до 100: насколько вероятно, что при таком поведении клиент купит или согласится на следующий шаг; будь реалистичен, слабому продавцу ставь не больше 25).\n' +
    'Ответ строго JSON без пояснений: {"criteria":[{"id":"","status":"","evidence":"","tip":""}],"violations":[{"id":"","quote":""}],"deviations":[{"said":"","script":""}],"outcome":"","chance":0,"mistakes":[{"what":"","say":""}],"strengths":[""],"summary":""}. mistakes: до 3 главных ошибок с готовой фразой вместо них. strengths: до 2, только если есть что хвалить, иначе пустой список. summary: одно предложение.';

  // ---------- Перепроверка спорных пунктов вторым запросом к нейросети ----------
  var VERIFY_SYSTEM = 'Ты арбитр. Тренер уже оценил разговор продавца с клиентом и поставил часть пунктов как невыполненные или нарушения. Твоя задача проверить спорные пункты ещё раз, внимательно, по СМЫСЛУ, а не по дословности. Пункт выполнен, если продавец своими словами, в любой форме и в любом месте разговора, сделал то, что в нём требуется. Реплики продавца распознаны голосом, возможны искажения слов.\n' +
    'Для каждого критерия найди в репликах продавца фразу, которая по смыслу выполняет пункт. Верни статус done, partial или no и ТОЧНУЮ цитату продавца (до 12 слов, скопируй из реплик). Если такой фразы нет, статус no и пустая цитата. Не выдумывай цитат.\n' +
    'Для каждого нарушения проверь: оно действительно произошло? Для нарушений-действий (жаргон, вопрос про маржу, цена раньше времени и т.п.) valid true только если есть точная цитата продавца. Для нарушений-пропусков («не задал рамку», «нет даты следующего контакта», «нет подтверждения времени») valid true только если по смыслу НИГДЕ в разговоре продавец этого не сделал; если сделал хоть как-то, valid false.\n' +
    'Ответ строго JSON без пояснений: {"criteria":[{"id":"","status":"","quote":""}],"violations":[{"id":"","valid":true,"quote":""}]}';

  function norm(text) {
    return String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Цитата есть в репликах продавца: сравниваем слова по началу, чтобы не мешали окончания и мелкие искажения
  function quoteFound(quote, text) {
    var words = norm(quote).split(' ').filter(function (w) { return w.length >= 3; });
    if (words.length < 2) return false;
    var hay = ' ' + norm(text) + ' ';
    var hit = 0;
    words.forEach(function (w) {
      if (hay.indexOf(' ' + w.slice(0, Math.max(4, w.length - 2))) >= 0) hit += 1;
    });
    return hit / words.length >= 0.6;
  }

  function sellerText(session) {
    return session.messages.filter(function (m) { return m.role === 'user'; }).map(function (m) { return m.content; }).join(' ');
  }

  function ruleById(id) {
    return (D.scriptRules || []).filter(function (r) { return r.id === id; })[0] || null;
  }

  // Что нужно перепроверить: невыполненные пункты и найденные нарушения
  function needsVerify(session, evaluation) {
    var scored = scoreOf(session.scn, evaluation);
    return {
      items: scored.items.filter(function (i) { return i.status !== 'done'; }),
      violations: ((evaluation && evaluation.violations) || []).filter(function (v) { return ruleById(v.id); })
    };
  }

  function verifyMessages(session, evaluation) {
    var todo = needsVerify(session, evaluation);
    var replies = session.messages.filter(function (m) { return m.role === 'user'; }).map(function (m, i) { return (i + 1) + '. ' + String(m.content).slice(0, 700); });
    var text = 'Реплики продавца по порядку:\n' + replies.join('\n');
    var script = scriptText(session.scn);
    if (script) text += '\n\nЭТАЛОННЫЙ СКРИПТ (образец, дословность не нужна):\n' + script.slice(0, 4000);
    text += '\n\nКритерии для перепроверки (id: что требуется):\n' + todo.items.map(function (i) { return i.id + ': ' + i.text; }).join('\n');
    if (todo.violations.length) {
      text += '\n\nНарушения для перепроверки (id: суть; цитата тренера):\n' + todo.violations.map(function (v) {
        return v.id + ': ' + ruleById(v.id).text + '; цитата: ' + (v.quote || 'нет');
      }).join('\n');
    }
    text += '\n\nДля контекста, что говорил клиент:\n' + session.messages.filter(function (m) { return m.role === 'assistant'; }).map(function (m) { return '- ' + String(m.content).slice(0, 200); }).join('\n');
    return [{ role: 'system', content: VERIFY_SYSTEM }, { role: 'user', content: text }];
  }

  function parseVerify(text) {
    var raw = String(text || '');
    var data = null;
    try { data = JSON.parse(raw); } catch (e) {
      var m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { data = JSON.parse(m[0]); } catch (err) { data = null; } }
    }
    if (!data) return null;
    return {
      criteria: (Array.isArray(data.criteria) ? data.criteria : []).map(function (c) {
        return { id: String(c.id || ''), status: String(c.status || '').toLowerCase(), quote: String(c.quote || '') };
      }),
      violations: (Array.isArray(data.violations) ? data.violations : []).map(function (v) {
        return { id: String((v && v.id) || ''), valid: !(v && (v.valid === false || v.valid === 'false')), quote: String((v && v.quote) || '') };
      })
    };
  }

  var RANK = { no: 0, partial: 1, done: 2 };

  // Соединяет первый разбор и перепроверку: пункты только повышаются и только при цитате, которая реально есть в речи продавца.
  // Нарушения-действия без настоящей цитаты отбрасываются, нарушения-пропуски отбрасываются, если арбитр нашёл выполнение.
  function mergeVerify(session, evaluation, verify) {
    var text = sellerText(session);
    var out = {};
    Object.keys(evaluation).forEach(function (k) { out[k] = evaluation[k]; });
    out.criteria = evaluation.criteria.map(function (c) { return { id: c.id, status: c.status, evidence: c.evidence, tip: c.tip }; });
    out.upgraded = [];
    if (verify) {
      verify.criteria.forEach(function (v) {
        var cur = out.criteria.filter(function (c) { return c.id === v.id; })[0];
        if (!cur) { cur = { id: v.id, status: 'no', evidence: '', tip: '' }; out.criteria.push(cur); }
        if (RANK[v.status] !== undefined && RANK[v.status] > (RANK[cur.status] || 0) && quoteFound(v.quote, text)) {
          cur.status = v.status;
          cur.evidence = v.quote;
          cur.tip = '';
          out.upgraded.push(v.id);
        }
      });
    }
    out.violations = (evaluation.violations || []).filter(function (v) {
      var rule = ruleById(v.id);
      if (!rule) return false;
      var check = verify ? verify.violations.filter(function (x) { return x.id === v.id; })[0] : null;
      if (check && !check.valid) return false;
      if (rule.omission) return !verify || !!check;
      return quoteFound(v.quote, text) || (check && check.valid && quoteFound(check.quote, text));
    });
    return out;
  }

  function metricsText(session) {
    var m = metricsOf(session);
    var end = { client_hangup: 'клиент положил трубку', user: 'продавец сам завершил звонок', silence: 'клиент ушёл из-за молчания продавца', limit: 'достигнут лимит реплик', client: 'клиент завершил разговор' }[session.endedBy] || 'разговор завершён';
    return 'Метрики речи продавца: ответов ' + m.answers + ', в среднем ' + m.avgWords.toFixed(0) + ' слов в ответе, ' + m.wpm + ' слов в минуту, задержка перед ответом в среднем ' + m.avgOnset.toFixed(1) + ' с, самый длинный ответ ' + m.longest.toFixed(0) + ' с, слов-паразитов ' + m.fillerPer100.toFixed(0) + ' на 100 слов, молчаний ' + m.silences + '. Как закончился разговор: ' + end + '.';
  }

  function evalMessages(session) {
    var scn = session.scn;
    var lines = scn.criteria.map(function (c) { return c.id + ' (вес ' + c.weight + '): ' + c.text; });
    var text = 'Сценарий: ' + scn.title + '. ' + fill(scn.coach) + '\n\nКритерии:\n' + lines.join('\n');
    if (hasLeadCard(session)) text += '\n\nЗаявка перед звонком (продавец её видел): ' + session.lead.when + ', ' + session.lead.company + '. Ответы анкеты: ' + quizText(session.lead) + '.';
    if (session.drill && session.drill.ideal.length) text += '\n\nЭталонные ответы на это возражение:\n- ' + session.drill.ideal.join('\n- ');
    var script = scriptText(scn);
    if (script) text += '\n\nЭТАЛОННЫЙ СКРИПТ для этого разговора:\n' + script;
    text += '\n\nСписок нарушений (id: суть):\n' + (D.scriptRules || []).map(function (r) { return r.id + ': ' + r.text; }).join('\n');
    text += '\n\n' + metricsText(session) + '\n\nРазговор:\n' + transcript(session);
    return [{ role: 'system', content: EVAL_SYSTEM }, { role: 'user', content: text }];
  }

  // Ответ обрезался или сломан: вытаскиваем все целые объекты критериев и нарушений
  function salvageEval(raw) {
    var criteria = [];
    (raw.match(/\{[^{}]*"status"[^{}]*\}/g) || []).forEach(function (chunk) {
      try {
        var c = JSON.parse(chunk);
        if (c && c.id) criteria.push(c);
      } catch (e) { /* обрезанный кусок пропускаем */ }
    });
    if (!criteria.length) return null;
    var num = raw.match(/"chance"\s*:\s*(\d+)/);
    var out = raw.match(/"outcome"\s*:\s*"(achieved|partial|failed)"/);
    var summary = raw.match(/"summary"\s*:\s*"([^"]*)"/);
    var violations = [];
    (raw.match(/\{[^{}]*"quote"[^{}]*\}/g) || []).forEach(function (chunk) {
      try { violations.push(JSON.parse(chunk)); } catch (e) { /* пропускаем */ }
    });
    return { criteria: criteria, violations: violations, chance: num ? Number(num[1]) : null, outcome: out ? out[1] : '', summary: summary ? summary[1] : '' };
  }

  function parseEval(text) {
    var raw = String(text || '');
    var data = null;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      var m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try { data = JSON.parse(m[0]); } catch (err) { data = null; }
      }
    }
    if (!data || !Array.isArray(data.criteria)) data = salvageEval(raw);
    if (!data || !Array.isArray(data.criteria)) return null;
    var chance = Number(data.chance);
    return {
      criteria: data.criteria.map(function (c) {
        return { id: String(c.id || ''), status: String(c.status || '').toLowerCase(), evidence: String(c.evidence || ''), tip: String(c.tip || '') };
      }),
      violations: (Array.isArray(data.violations) ? data.violations : []).slice(0, 12).map(function (v) { return { id: String((v && v.id) || ''), quote: String((v && v.quote) || '') }; }),
      deviations: (Array.isArray(data.deviations) ? data.deviations : []).slice(0, 4).map(function (v) { return { said: String((v && v.said) || ''), script: String((v && v.script) || '') }; }),
      outcome: String(data.outcome || '').toLowerCase(),
      chance: isNaN(chance) ? null : chance,
      mistakes: (Array.isArray(data.mistakes) ? data.mistakes : []).slice(0, 3).map(function (x) {
        return { what: String((x && x.what) || ''), say: String((x && x.say) || '') };
      }),
      strengths: (Array.isArray(data.strengths) ? data.strengths : []).slice(0, 2).map(String),
      summary: String(data.summary || '')
    };
  }

  // Убирает метки из ответа клиента: конец разговора и «положил трубку»
  function splitEnd(text) {
    var s = String(text || '');
    var hangup = /\[ТРУБКА\]/i.test(s);
    var ended = hangup || /\[КОНЕЦ\]/i.test(s);
    return { text: s.replace(/\[(?:КОНЕЦ|ТРУБКА)\]/gi, '').trim(), ended: ended, hangup: hangup };
  }

  function usageLine(u) {
    if (!u || !u.limits) return '';
    return 'Сегодня: запросов ' + u.calls + ' из ' + u.limits.max_calls_per_day + ', расход около $' + Number(u.cost_usd || 0).toFixed(3) + ' из $' + u.limits.max_usd_per_day;
  }

  C.trainer = {
    fill: fill, priceLine: priceLine, dailyOf: dailyOf, hasLeadCard: hasLeadCard, factsOf: factsOf, quizText: quizText,
    scenarioById: scenarioById, difficultyById: difficultyById, levelFor: levelFor, streakOf: streakOf, dayKey: dayKey,
    scoreOf: scoreOf, scriptText: scriptText, needsVerify: needsVerify, verifyMessages: verifyMessages, parseVerify: parseVerify, mergeVerify: mergeVerify, quoteFound: quoteFound, violationsOf: violationsOf, overallOf: overallOf, metricsOf: metricsOf, deliveryOf: deliveryOf, wordsOf: wordsOf, fillersOf: fillersOf,
    xpFor: xpFor, finishRound: finishRound, newSession: newSession,
    turnMessages: turnMessages, evalMessages: evalMessages, parseEval: parseEval, splitEnd: splitEnd,
    clientSystem: clientSystem, usageLine: usageLine, END_MARK: END_MARK, HANGUP_MARK: HANGUP_MARK, SILENCE_LINES: SILENCE_LINES
  };
})((window.CRM = window.CRM || {}));
