(function (C) {
  'use strict';

  var h = C.dom.h;
  var U = C.utils;
  var D = C.data;
  var store = C.store;

  function card(lead) {
    var overdue = U.isOverdue(lead.nextAt);
    var el = h('a', {
      class: 'kcard' + (overdue ? ' kcard-overdue' : ''),
      href: '#lead/' + lead.id,
      draggable: 'true'
    },
      h('div', { class: 'kcard-title', text: lead.name || 'Без имени' }),
      h('div', { class: 'kcard-sub', text: [lead.niche, lead.city].filter(Boolean).join(', ') || lead.source || '' }),
      lead.nextAt
        ? h('div', { class: 'kcard-next' + (overdue ? ' is-overdue' : ''), text: U.fmtDateTime(lead.nextAt) })
        : null,
      lead.data && lead.data.price_amount
        ? h('div', { class: 'kcard-money', text: U.fmtMoney(lead.data.price_amount) })
        : null
    );
    el.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', lead.id);
      e.dataTransfer.effectAllowed = 'move';
    });
    return el;
  }

  function column(stage, leads, onMoved) {
    var items = leads.filter(function (l) { return l.stage === stage.id; });
    var col = h('div', { class: 'kcol kcol-' + stage.kind, 'data-stage': stage.id },
      h('div', { class: 'kcol-head' },
        h('span', { class: 'kcol-title', text: stage.title }),
        h('span', { class: 'kcol-count', text: String(items.length) })
      ),
      h('div', { class: 'kcol-body' }, items.map(card))
    );
    col.addEventListener('dragover', function (e) {
      e.preventDefault();
      col.classList.add('is-over');
    });
    col.addEventListener('dragleave', function () { col.classList.remove('is-over'); });
    col.addEventListener('drop', function (e) {
      e.preventDefault();
      col.classList.remove('is-over');
      var id = e.dataTransfer.getData('text/plain');
      if (id) C.actions.move(id, stage.id, onMoved);
    });
    return col;
  }

  function render(onMoved) {
    var leads = store.leads();
    return h('div', { class: 'view' },
      C.views.kpi.render(),
      h('p', { class: 'muted', text: 'Перетаскивай карточки между колонками или открывай карточку и жми «Дальше».' }),
      h('div', { class: 'board' }, D.stages.map(function (s) { return column(s, leads, onMoved); }))
    );
  }

  C.views = C.views || {};
  C.views.board = { render: render };
})((window.CRM = window.CRM || {}));
