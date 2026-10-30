(function (C) {
  'use strict';

  var h = C.dom.h;
  var store = C.store;
  var T = C.templates;

  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacy(text); });
      }
    } catch (e) { /* пробуем запасной путь */ }
    return Promise.resolve(legacy(text));
  }

  function legacy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = typeof document.execCommand === 'function' && document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  // Карточка одного шаблона. getLead отдаёт выбранного клиента (или null), onChange перерисует список после правки.
  function card(t, getLead, onChange) {
    var preview = h('p', { class: 'tpl-text' });
    var warn = h('span', { class: 'tpl-holes' });
    function draw() {
      var text = T.fill(t.text, getLead());
      preview.textContent = text;
      var n = T.holes(text);
      warn.textContent = n ? 'Допиши: ' + n : '';
    }
    draw();
    var btn = h('button', { type: 'button', class: 'btn btn-small btn-primary' }, 'Скопировать');
    btn.addEventListener('click', function () {
      copyText(preview.textContent).then(function (ok) {
        btn.textContent = ok ? 'Скопировано' : 'Выдели и скопируй вручную';
        window.setTimeout(function () { btn.textContent = 'Скопировать'; }, 1600);
        var lead = getLead();
        if (ok && lead) store.addNote(lead.id, 'Скопировал сообщение: ' + t.title);
      });
    });
    var actions = [btn];
    if (t.own) {
      actions.push(h('button', { type: 'button', class: 'btn btn-small', onClick: function () { editor(t, onChange); } }, 'Править'));
      actions.push(h('button', { type: 'button', class: 'btn btn-small btn-danger', onClick: function () {
        if (window.confirm('Удалить шаблон?')) { store.removeTemplate(t.id); onChange(); }
      } }, 'Удалить'));
    }
    var el = h('div', { class: 'tpl' },
      h('div', { class: 'tpl-head' }, h('strong', { text: t.title }), warn),
      t.use ? h('div', { class: 'muted tpl-use', text: t.use }) : null,
      preview,
      h('div', { class: 'tpl-actions' }, actions)
    );
    el.redraw = draw;
    return el;
  }

  function editor(t, onChange) {
    var title = h('input', { type: 'text', class: 'input', value: t ? t.title : '', placeholder: 'Например: Напоминание о счёте' });
    var text = h('textarea', { class: 'input', rows: 6, value: t ? t.text : '', placeholder: 'Текст сообщения. Подстановки: {name}, {niche}, {city}, {when}' });
    C.modal.open({
      title: t ? 'Свой шаблон' : 'Новый шаблон',
      body: h('div', null,
        h('label', { class: 'field' }, h('span', { class: 'label', text: 'Название' }), title),
        h('label', { class: 'field' }, h('span', { class: 'label', text: 'Текст' }), text),
        h('p', { class: 'muted', text: '{name} имя, {niche} ниша, {city} город, {when} дата следующего контакта. Если в карточке пусто, подставится [подсказка].' })
      ),
      actions: [
        { label: 'Отмена', onClick: function (close) { close(); } },
        { label: 'Сохранить', primary: true, onClick: function (close) {
          if (!text.value.trim()) { text.focus(); return; }
          store.saveTemplate({ id: t ? t.id : null, title: title.value, text: text.value });
          close();
          onChange();
        } }
      ]
    });
  }

  // Экран: выбери клиента (необязательно) и копируй готовое сообщение
  function render(leadId) {
    var selected = leadId ? store.get(leadId) : null;
    var root = h('div', { class: 'view' });
    var body = h('div');

    var picker = h('select', { class: 'input' },
      h('option', { value: '' }, 'Без клиента (подставятся [подсказки])'),
      store.leads().filter(function (l) { return l.stage !== 'lost'; }).map(function (l) {
        return h('option', { value: l.id }, (l.name || 'Без имени') + (l.niche ? ', ' + l.niche : ''));
      }));
    if (selected) picker.value = selected.id;

    function getLead() { return selected; }

    function draw() {
      C.dom.clear(body);
      var cards = [];
      T.groups().forEach(function (g) {
        var list = T.all().filter(function (t) { return t.group === g.id; });
        if (!list.length && g.id !== 'own') return;
        var block = h('section', { class: 'block' }, h('h2', { text: g.title }));
        if (g.id === 'own' && !list.length) block.appendChild(h('p', { class: 'muted', text: 'Пока пусто. Добавь шаблон, который отправляешь чаще всего.' }));
        list.forEach(function (t) {
          var c = card(t, getLead, draw);
          cards.push(c);
          block.appendChild(c);
        });
        body.appendChild(block);
      });
      draw.cards = cards;
    }

    picker.addEventListener('change', function () {
      selected = picker.value ? store.get(picker.value) : null;
      (draw.cards || []).forEach(function (c) { c.redraw(); });
    });

    draw();
    root.appendChild(h('div', { class: 'page-head' },
      h('h1', { text: 'Шаблоны сообщений' }),
      h('p', { class: 'muted', text: 'Выбери клиента, и имя, ниша и город подставятся сами. Нажми «Скопировать» и вставь в мессенджер.' })
    ));
    root.appendChild(h('div', { class: 'tpl-bar' },
      h('label', { class: 'field' }, h('span', { class: 'label', text: 'Для кого' }), picker),
      h('button', { type: 'button', class: 'btn', onClick: function () { editor(null, draw); } }, 'Свой шаблон')
    ));
    root.appendChild(body);
    return root;
  }

  // Окно из карточки лида: сначала шаблоны под текущий этап
  function openFor(lead) {
    var set = T.forStage(lead.stage);
    var wrap = h('div', { class: 'tpl-modal' });
    function draw() {
      C.dom.clear(wrap);
      var fresh = store.get(lead.id) || lead;
      var set2 = T.forStage(fresh.stage);
      function add(list, title) {
        if (!list.length) return;
        wrap.appendChild(h('h4', { class: 'tpl-sub', text: title }));
        list.forEach(function (t) { wrap.appendChild(card(t, function () { return store.get(lead.id) || lead; }, draw)); });
      }
      add(set2.match, 'Для этого этапа');
      add(set2.rest, 'Остальные');
    }
    draw();
    C.modal.open({
      title: 'Сообщение для ' + (lead.name || 'клиента'),
      body: wrap,
      actions: [{ label: 'Закрыть', onClick: function (close) { close(); } }]
    });
    return set;
  }

  C.views = C.views || {};
  C.views.templates = { render: render, openFor: openFor, copy: copyText };
})((window.CRM = window.CRM || {}));
