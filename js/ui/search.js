(function (C) {
  'use strict';

  var h = C.dom.h;
  var D = C.data;

  // Быстрый поиск: лиды по имени, телефону, нише, городу, заметке и переходы по экранам
  function open() {
    var input = h('input', { type: 'search', class: 'input', placeholder: 'Имя, телефон, ниша, город или название экрана', autocomplete: 'off' });
    var list = h('div', { class: 'search-list' });
    var items = [];
    var active = 0;

    function go(item) {
      C.modal.close();
      window.location.hash = item.hash;
    }

    function mark() {
      items.forEach(function (it, i) { it.el.classList.toggle('is-active', i === active); });
      if (items[active] && items[active].el.scrollIntoView) items[active].el.scrollIntoView({ block: 'nearest' });
    }

    function draw() {
      var q = input.value;
      C.dom.clear(list);
      items = [];
      active = 0;
      if (!q.trim()) {
        list.appendChild(h('p', { class: 'muted', text: 'Начни вводить. Enter открывает первый результат, стрелки выбирают другой.' }));
        return;
      }
      var leads = C.find.leads(q, C.store.leads());
      var screens = C.find.screens(q);
      leads.forEach(function (l) {
        var stage = D.stageById(l.stage);
        var el = h('a', { class: 'row', href: '#lead/' + l.id },
          h('div', { class: 'avatar', text: (l.name || '?').trim().charAt(0).toUpperCase() }),
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title', text: l.name || 'Без имени' }),
            h('div', { class: 'row-sub', text: [l.phone, l.niche, l.city].filter(Boolean).join(' · ') || 'Контакты не указаны' })
          ),
          h('span', { class: 'chip chip-' + (stage ? stage.kind : 'main'), text: stage ? stage.title : '' })
        );
        el.addEventListener('click', function (e) { e.preventDefault(); go({ hash: '#lead/' + l.id }); });
        items.push({ el: el, hash: '#lead/' + l.id });
        list.appendChild(el);
      });
      screens.forEach(function (s) {
        var el = h('a', { class: 'row', href: s.hash },
          h('div', { class: 'avatar', text: '>' }),
          h('div', { class: 'row-main' }, h('div', { class: 'row-title', text: s.title }), h('div', { class: 'row-sub', text: 'Открыть экран' }))
        );
        el.addEventListener('click', function (e) { e.preventDefault(); go({ hash: s.hash }); });
        items.push({ el: el, hash: s.hash });
        list.appendChild(el);
      });
      if (!items.length) list.appendChild(h('p', { class: 'muted', text: 'Ничего не нашлось. Попробуй часть имени или последние цифры телефона.' }));
      mark();
    }

    input.addEventListener('input', draw);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) { active = (active + 1) % items.length; mark(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { active = (active - 1 + items.length) % items.length; mark(); } }
      else if (e.key === 'Enter' && items[active]) { e.preventDefault(); go(items[active]); }
    });

    C.modal.open({ title: 'Поиск', body: h('div', { class: 'search-box' }, input, list), actions: [] });
    draw();
  }

  C.search = { open: open };
})((window.CRM = window.CRM || {}));
