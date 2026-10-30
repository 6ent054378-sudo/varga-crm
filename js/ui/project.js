(function (C) {
  'use strict';

  var h = C.dom.h;
  var U = C.utils;
  var store = C.store;
  var O = C.offer;

  // Ведение проекта после оплаты: пункты выбранного тарифа с отметками (лист «Таблица ведения проекта»)
  function render(leadId) {
    var lead = store.get(leadId);
    if (!lead) {
      return h('div', { class: 'view' }, h('div', { class: 'empty' }, h('h2', { text: 'Клиент не найден' }), h('a', { href: '#board', class: 'btn', text: 'К доске' })));
    }
    var root = h('div', { class: 'view' });

    function draw() {
      C.dom.clear(root);
      var fresh = store.get(leadId);
      var tierId = fresh.data.price_tariff;
      var list = O.tasks(tierId);
      var state = O.projectState(fresh);
      var pr = O.progress(fresh);

      root.appendChild(h('a', { class: 'back', href: '#lead/' + leadId, text: 'К карточке' }));
      root.appendChild(h('h1', { text: 'Ведение проекта: ' + (fresh.name || 'клиент') }));

      var tariff = h('select', { class: 'input' },
        h('option', { value: '' }, 'Выбери тариф'),
        O.tiers().concat([C.data.offerStart]).map(function (t) { return h('option', { value: t.id }, t.name + ', ' + U.fmtMoney(t.price)); }));
      tariff.value = tierId || '';
      tariff.addEventListener('change', function () { O.choose(leadId, tariff.value); draw(); });
      root.appendChild(h('label', { class: 'field' }, h('span', { class: 'label', text: 'Тариф клиента' }), tariff));

      if (!list.length) {
        root.appendChild(h('p', { class: 'muted', text: 'Выбери тариф, и здесь появятся его пункты.' }));
        return;
      }
      var pct = pr.total ? Math.round(pr.done / pr.total * 100) : 0;
      root.appendChild(h('div', { class: 'progress' },
        h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: 'width:' + pct + '%' })),
        h('span', { class: 'count', text: pr.done + ' из ' + pr.total + ' готово' })));

      root.appendChild(h('table', { class: 'table project-table' },
        h('thead', null, h('tr', null, h('th', { text: '№' }), h('th', { text: 'Задача' }), h('th', { text: 'Статус' }), h('th', { text: 'Комментарий' }))),
        h('tbody', null, list.map(function (t, i) {
          var cur = state[t.key] || { state: 'todo', note: '' };
          var sel = h('select', { class: 'input' }, Object.keys(O.STATE_LABEL).map(function (k) { return h('option', { value: k }, O.STATE_LABEL[k]); }));
          sel.value = cur.state;
          sel.addEventListener('change', function () { O.setTask(leadId, t.key, { state: sel.value }); draw(); });
          var note = h('input', { type: 'text', class: 'input', value: cur.note || '', placeholder: 'Комментарий' });
          note.addEventListener('change', function () { O.setTask(leadId, t.key, { note: note.value }); });
          return h('tr', { class: 'task-' + cur.state }, h('td', { text: String(i + 1) }), h('td', { text: t.title }), h('td', null, sel), h('td', null, note));
        }))
      ));
    }

    draw();
    return root;
  }

  C.views = C.views || {};
  C.views.project = { render: render };
})((window.CRM = window.CRM || {}));
