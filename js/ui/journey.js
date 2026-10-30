(function (C) {
  'use strict';

  var h = C.dom.h;
  var D = C.data;
  var store = C.store;

  var TRACKS = [
    { id: 'new', title: 'Новичок' },
    { id: 'exp', title: 'Опытный' }
  ];

  function render() {
    var track = store.journey().track;
    var body = h('div');
    var bar = h('div', { class: 'bar-fill' });
    var counter = h('span', { class: 'count' });

    function refresh() {
      var items = D.journeyItems(track);
      var done = store.journey().done;
      var n = items.filter(function (it) { return done[it.id]; }).length;
      counter.textContent = n + ' из ' + items.length;
      bar.style.width = items.length ? Math.round((n / items.length) * 100) + '%' : '0%';
    }

    function draw() {
      C.dom.clear(body);
      var done = store.journey().done;
      D.journey.forEach(function (ph) {
        var items = ph.items.filter(function (it) { return it.track !== 'exp' || track === 'exp'; });
        if (!items.length) return;
        body.appendChild(h('section', { class: 'card' },
          h('h3', { text: ph.title }),
          items.map(function (it) {
            var box = h('input', { type: 'checkbox', checked: !!done[it.id] });
            box.addEventListener('change', function () {
              store.toggleJourney(it.id, box.checked);
              refresh();
            });
            return h('label', { class: 'check' }, box, h('span', { text: it.text }));
          })
        ));
      });
      body.appendChild(h('section', { class: 'card' },
        h('h3', { text: 'Что делать регулярно' }),
        h('ul', { class: 'bullets' }, D.practices.map(function (t) { return h('li', { text: t }); }))
      ));
      refresh();
    }

    var tabs = h('div', { class: 'tabs' }, TRACKS.map(function (t) {
      return h('button', {
        type: 'button', class: 'tab' + (t.id === track ? ' is-active' : ''),
        onClick: function () { store.setJourneyTrack(t.id); C.app.render(); }
      }, t.title);
    }));

    draw();
    return h('div', { class: 'view' },
      h('h1', { text: 'Путь маркетолога' }),
      h('p', { class: 'muted', text: 'Чек-лист спринта от самоупаковки до первых клиентов и масштабирования. Отмечай пункты по мере прохождения.' }),
      tabs,
      h('div', { class: 'progress' }, h('div', { class: 'bar' }, bar), counter),
      body
    );
  }

  C.views = C.views || {};
  C.views.journey = { render: render };
})((window.CRM = window.CRM || {}));
