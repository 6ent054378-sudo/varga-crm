(function (C) {
  'use strict';

  var D = C.data;
  var DAY = 86400000;

  // Начало календарной недели (понедельник, 00:00) со сдвигом в неделях: 0 текущая, -1 прошлая
  function weekStart(offset, now) {
    var d = new Date(now === undefined ? Date.now() : now);
    d.setHours(0, 0, 0, 0);
    var dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow + (offset || 0) * 7);
    return d.getTime();
  }

  function ms(iso) {
    var t = iso ? new Date(iso).getTime() : NaN;
    return isNaN(t) ? null : t;
  }

  function inside(iso, from, to) {
    var t = ms(iso);
    return t !== null && t >= from && t < to;
  }

  function dealAmount(l) {
    return Number((l.data && (l.data.won_amount || l.data.price_amount)) || 0);
  }

  // Что произошло за неделю [from, to): сколько лидов пришло и до каких этапов дошли
  function count(leads, calls, from, to) {
    var r = { fresh: 0, qual: 0, meet: 0, pay: 0, won: 0, lost: 0, hold: 0, revenue: 0, calls: 0, sources: {}, reasons: {} };
    leads.forEach(function (l) {
      var reached = l.reached || {};
      if (inside(l.createdAt, from, to)) {
        r.fresh += 1;
        var s = l.source || 'Не указан';
        r.sources[s] = (r.sources[s] || 0) + 1;
      }
      if (inside(reached.qual, from, to)) r.qual += 1;
      if (inside(reached.meet, from, to)) r.meet += 1;
      if (inside(reached.pay, from, to)) r.pay += 1;
      if (inside(reached.hold, from, to)) r.hold += 1;
      if (l.stage === 'won' && inside(reached.won, from, to)) { r.won += 1; r.revenue += dealAmount(l); }
      if (l.stage === 'lost' && inside(reached.lost, from, to)) {
        r.lost += 1;
        var why = (l.data && l.data.lost_reason) || 'Причина не указана';
        r.reasons[why] = (r.reasons[why] || 0) + 1;
      }
    });
    (calls || []).forEach(function (c) { if (inside(c.at, from, to)) r.calls += 1; });
    return r;
  }

  var STEPS = [
    { key: 'fresh', title: 'Новые лиды' },
    { key: 'qual', title: 'Дозвонились' },
    { key: 'meet', title: 'Встречи назначены' },
    { key: 'pay', title: 'Ждут оплату' },
    { key: 'won', title: 'Оплатили' }
  ];

  // Где воронка просела сильнее всего: самая низкая доля между соседними шагами (если на входе хотя бы 3)
  function bottleneck(cur) {
    var worst = null;
    for (var i = 1; i < STEPS.length; i++) {
      var prev = cur[STEPS[i - 1].key];
      if (prev < 3) continue;
      var share = cur[STEPS[i].key] / prev;
      if (!worst || share < worst.share) worst = { from: STEPS[i - 1].title, to: STEPS[i].title, share: share, prev: prev, now: cur[STEPS[i].key] };
    }
    return worst;
  }

  function top(map) {
    return Object.keys(map).map(function (k) { return { name: k, count: map[k] }; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  function pct(v) { return Math.round(v * 100); }

  // Отчёт за неделю со сдвигом offset и сравнение с предыдущей
  function week(leads, calls, offset, now) {
    var from = weekStart(offset, now);
    var to = from + 7 * DAY;
    var cur = count(leads, calls, from, to);
    var prev = count(leads, calls, from - 7 * DAY, from);
    var nowMs = now === undefined ? Date.now() : now;
    var live = offset === 0;
    var active = leads.filter(function (l) { return l.stage !== 'won' && l.stage !== 'lost'; });
    var overdue = live ? active.filter(function (l) { return l.stage !== 'new' && l.nextAt && ms(l.nextAt) !== null && ms(l.nextAt) < nowMs; }).length : null;
    var idle = live ? active.filter(function (l) { return l.stage !== 'new' && !l.nextAt; }).length : null;
    var bn = bottleneck(cur);
    var note = '';
    if (!cur.fresh && !cur.qual && !cur.meet && !cur.won) note = 'За эту неделю движений нет.';
    else if (bn) note = 'Сильнее всего воронка просела на шаге «' + bn.from + '» → «' + bn.to + '»: ' + bn.now + ' из ' + bn.prev + ' (' + pct(bn.share) + '%).';
    else note = 'Для вывода о слабом месте пока мало данных: нужно хотя бы 3 лида на входе шага.';
    return {
      from: from, to: to, offset: offset || 0, cur: cur, prev: prev, steps: STEPS,
      bottleneck: bn, note: note, overdue: overdue, idle: idle,
      sources: top(cur.sources), reasons: top(cur.reasons)
    };
  }

  function label(from, to) {
    function f(t) { var d = new Date(t); return (d.getDate() < 10 ? '0' : '') + d.getDate() + '.' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1); }
    return f(from) + ' - ' + f(to - DAY);
  }

  C.report = { week: week, weekStart: weekStart, count: count, label: label, STEPS: STEPS };
})((window.CRM = window.CRM || {}));
