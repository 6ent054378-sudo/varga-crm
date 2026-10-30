(function (C) {
  'use strict';

  var h = C.dom.h;
  var U = C.utils;
  var store = C.store;

  // Значки внутри карточек: постоянные строки, пользовательского текста тут нет
  var ICONS = {
    inbox: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13l2.5-7h11L20 13"/><path d="M4 13v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5h-5l-1.5 2h-3L9 13z"/></svg>',
    user: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-3.5 3.4-5.5 7-5.5s6.4 2 7 5.5"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
    work: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="11" rx="2.5"/><path d="M9 8V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2M4 13h16"/></svg>'
  };

  function icon(name) {
    var el = h('span', { class: 'kpi-icon' });
    el.innerHTML = ICONS[name];
    return el;
  }

  function counts() {
    var leads = store.leads();
    var active = leads.filter(function (l) { return l.stage !== 'won' && l.stage !== 'lost'; });
    var due = active.filter(function (l) { return l.stage !== 'new' && l.nextAt && (U.isOverdue(l.nextAt) || U.isSoon(l.nextAt)); });
    return {
      total: leads.length,
      fresh: active.filter(function (l) { return l.stage === 'new'; }).length,
      due: due.length,
      overdue: due.filter(function (l) { return U.isOverdue(l.nextAt); }).length,
      active: active.length,
      closed: leads.length - active.length
    };
  }

  function card(tone, iconName, label, value, sub, link) {
    return h('div', { class: 'kpi kpi-' + tone },
      h('div', { class: 'kpi-top' },
        h('div', { class: 'kpi-label', text: label }),
        icon(iconName)),
      h('div', { class: 'kpi-value', text: String(value) }),
      h('div', { class: 'kpi-sub' },
        h('span', { text: sub }),
        link ? h('a', { class: 'kpi-link', href: link[0], text: link[1] }) : null));
  }

  function render() {
    var c = counts();
    return h('div', { class: 'kpi-grid' },
      card('blue', 'inbox', 'Всего лидов', c.total, 'в рабочей базе'),
      card('green', 'user', 'Новые', c.fresh, c.fresh ? 'ждут первого звонка' : 'новых нет', c.fresh ? ['#today', 'Позвонить'] : null),
      card('amber', 'calendar', 'Задачи', c.due, c.overdue ? c.overdue + ' просрочено' : 'просроченных нет', c.due ? ['#today', 'Разобрать'] : null),
      card('gray', 'work', 'В работе', c.active, c.closed + ' уже закрыто', ['#board', 'Доска'])
    );
  }

  C.views = C.views || {};
  C.views.kpi = { render: render, counts: counts };
})((window.CRM = window.CRM || {}));
