(function (C) {
  'use strict';

  var h = C.dom.h;
  var U = C.utils;
  var store = C.store;
  var M = C.metrics;

  var PERIODS = [
    { id: '7', title: '7 дней', days: 7 },
    { id: '30', title: '30 дней', days: 30 },
    { id: 'all', title: 'Всё время', days: 0 }
  ];

  function pct(v) {
    return v === null ? '' : v + '%';
  }

  // Недельный отчёт: календарная неделя, сравнение с прошлой, где просело
  function weekView(offset) {
    var R = C.report;
    var rep = R.week(store.leads(), store.calls(), offset);
    var c = rep.cur;
    var p = rep.prev;

    function delta(key) {
      var d = c[key] - p[key];
      if (!d) return null;
      return h('span', { class: 'delta ' + (d > 0 ? 'up' : 'down'), text: (d > 0 ? '+' : '') + d, title: 'К прошлой неделе' });
    }
    function card(label, key, text) {
      return h('div', { class: 'week-card' },
        h('div', { class: 'num' }, text !== undefined ? text : String(c[key]), key ? delta(key) : null),
        h('div', { class: 'lbl', text: label }));
    }

    var nav = h('div', { class: 'week-nav' },
      h('a', { class: 'btn btn-small', href: '#metrics/week' + (offset - 1 === 0 ? '' : String(offset - 1)) }, 'Раньше'),
      h('strong', { text: R.label(rep.from, rep.to) + (offset === 0 ? ' (эта неделя)' : '') }),
      offset < 0 ? h('a', { class: 'btn btn-small', href: '#metrics/week' + (offset + 1 === 0 ? '' : String(offset + 1)) }, 'Позже') : null
    );

    var funnel = h('table', { class: 'table' },
      h('thead', null, h('tr', null, h('th', { text: 'Шаг' }), h('th', { text: 'Неделя' }), h('th', { text: 'Прошлая' }), h('th', { text: 'От предыдущего' }))),
      h('tbody', null, rep.steps.map(function (st, i) {
        var share = i > 0 && c[rep.steps[i - 1].key] > 0 ? Math.round(c[st.key] / c[rep.steps[i - 1].key] * 100) + '%' : '';
        return h('tr', null, h('td', { text: st.title }), h('td', { text: String(c[st.key]) }), h('td', { text: String(p[st.key]) }), h('td', { text: share }));
      }))
    );

    var extra = [];
    if (rep.sources.length) {
      extra.push(h('section', { class: 'card' }, h('h3', { text: 'Откуда пришли новые лиды' }),
        h('ul', { class: 'plain' }, rep.sources.map(function (s) { return h('li', { text: s.name + ': ' + s.count }); }))));
    }
    if (rep.reasons.length) {
      extra.push(h('section', { class: 'card' }, h('h3', { text: 'Почему сливаются' }),
        h('ul', { class: 'plain' }, rep.reasons.map(function (s) { return h('li', { text: s.name + ': ' + s.count }); }))));
    }

    return h('div', { class: 'view' },
      h('h1', { text: 'Итоги недели' }),
      periodTabs('week'),
      nav,
      h('div', { class: 'week-grid' },
        card('Новые лиды', 'fresh'),
        card('Дозвонились', 'qual'),
        card('Встречи назначены', 'meet'),
        card('Оплатили', 'won'),
        card('Выручка', null, U.fmtMoney(c.revenue) || '0 ₽'),
        card('Разговоров записано', 'calls'),
        card('Слив', 'lost')
      ),
      h('div', { class: 'week-note', text: rep.note }),
      rep.overdue !== null && (rep.overdue || rep.idle) ? h('p', { class: 'muted', text: 'Сейчас: просрочен контакт у ' + rep.overdue + ', без даты контакта у ' + rep.idle + '. Разбери это на экране «Сегодня».' }) : null,
      h('section', { class: 'card' }, h('h3', { text: 'Воронка недели' }), funnel),
      extra
    );
  }

  function periodTabs(activeId) {
    return h('div', { class: 'tabs' }, [{ id: 'week', title: 'Неделя' }].concat(PERIODS).map(function (p) {
      return h('a', { class: 'tab' + (p.id === activeId ? ' is-active' : ''), href: '#metrics/' + (p.id === 'week' ? 'week' : p.id) }, p.title);
    }));
  }

  function render(periodId) {
    var wk = /^week(-\d+)?$/.exec(periodId || 'week');
    if (wk) return weekView(wk[1] ? Number(wk[1]) : 0);
    var period = PERIODS.filter(function (p) { return p.id === periodId; })[0] || PERIODS[1];
    var leads = M.filterLeads(store.leads(), period.days);
    var funnel = M.funnel(leads);
    var money = M.money(leads);
    var stats = store.stats();

    var table = h('table', { class: 'table' },
      h('thead', null, h('tr', null,
        h('th', { text: 'Шаг' }), h('th', { text: 'Лидов' }),
        h('th', { text: 'От предыдущего' }), h('th', { text: 'От всех' }))),
      h('tbody', null, funnel.map(function (r) {
        return h('tr', null,
          h('td', { text: r.title }),
          h('td', { text: String(r.count) }),
          h('td', { text: pct(r.fromPrev) }),
          h('td', { text: pct(r.fromAll) }));
      }))
    );

    var sources = M.bySource(leads);
    var sourceTable = sources.length ? h('table', { class: 'table' },
      h('thead', null, h('tr', null,
        h('th', { text: 'Источник' }), h('th', { text: 'Лидов' }),
        h('th', { text: 'Диагностик' }), h('th', { text: 'Оплат' }))),
      h('tbody', null, sources.map(function (s) {
        return h('tr', null,
          h('td', { text: s.source }), h('td', { text: String(s.leads) }),
          h('td', { text: String(s.meetings) }), h('td', { text: String(s.paid) }));
      }))
    ) : h('p', { class: 'muted', text: 'Пока нет данных.' });

    function stat(label, value) {
      return h('div', { class: 'stat' },
        h('div', { class: 'stat-value', text: String(value) }),
        h('div', { class: 'stat-label', text: label }));
    }

    var week = M.weekly(store.leads());
    var weekNote = week.held >= week.target
      ? 'Норма выполнена.'
      : 'До нормы не хватает встреч: ' + (week.target - week.held) + '. Звони и пиши сегодня.';

    return h('div', { class: 'view' },
      h('h1', { text: 'Метрики воронки' }),
      h('p', { class: 'muted', text: 'Считается из карточек. Смотри, где теряются клиенты.' }),
      periodTabs(period.id),
      h('div', { class: 'stats' },
        stat('Выручка', U.fmtMoney(money.revenue) || '0'),
        stat('Средний чек', money.average ? U.fmtMoney(money.average) : '0'),
        stat('Оплат', money.count),
        stat('Прогноз по этапам', U.fmtMoney(stats.forecast) || '0')
      ),
      h('section', { class: 'card' },
        h('h3', { text: 'Встречи за 7 дней' }),
        h('p', { text: 'Назначено: ' + week.booked + '. Проведено встреч: ' + week.held + ' из ' + week.target + ' (норма спринта: 3 в неделю).' }),
        h('p', { class: 'muted', text: weekNote })
      ),
      h('section', { class: 'card' }, h('h3', { text: 'Воронка' }), table),
      h('section', { class: 'card' }, h('h3', { text: 'Источники' }), sourceTable)
    );
  }

  C.views = C.views || {};
  C.views.metrics = { render: render };
})((window.CRM = window.CRM || {}));
