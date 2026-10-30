(function (C) {
  'use strict';

  var h = C.dom.h;
  var U = C.utils;
  var D = C.data;
  var store = C.store;

  var TABS = [
    { id: 'objections', title: 'Возражения' },
    { id: 'cases', title: 'Кейсы по нишам' },
    { id: 'tariffs', title: 'Тарифы' },
    { id: 'intro', title: 'Самопрезентация' },
    { id: 'principles', title: 'Принципы' },
    { id: 'segments', title: 'Клиенты и сегменты' },
    { id: 'channels', title: 'Каналы трафика' },
    { id: 'sources', title: 'Где искать клиентов' },
    { id: 'files', title: 'Файлы' }
  ];

  // ---------- Возражения ----------
  function lineText(p) {
    return typeof p === 'string' ? p : p.t;
  }

  function objections() {
    var search = h('input', { type: 'search', class: 'input', placeholder: 'Поиск по возражениям' });
    var list = h('div', { class: 'acc' });

    function draw() {
      C.dom.clear(list);
      var q = search.value.trim().toLowerCase();
      D.objections.filter(function (o) {
        return !q || o.q.toLowerCase().indexOf(q) >= 0 || o.a.map(lineText).join(' ').toLowerCase().indexOf(q) >= 0;
      }).forEach(function (o) {
        list.appendChild(h('details', { class: 'sec' },
          h('summary', { text: o.q }),
          h('div', { class: 'sec-body' }, o.a.map(function (p) {
            var kind = typeof p === 'string' ? 'say' : p.k;
            return h('div', { class: 'line line-' + kind },
              h('span', { class: 'line-tag', text: kind === 'say' ? 'Говори' : kind === 'dont' ? 'Не делай' : 'Важно' }),
              h('p', { text: lineText(p) })
            );
          }))
        ));
      });
      if (!list.firstChild) list.appendChild(h('p', { class: 'muted', text: 'Ничего не найдено.' }));
    }
    search.addEventListener('input', draw);
    draw();
    return h('div', null, search, list);
  }

  // ---------- Тарифы (редактируемые) ----------
  function tariffs() {
    var root = h('div');

    function draw() {
      C.dom.clear(root);
      var list = store.tariffs().map(function (t) { return JSON.parse(JSON.stringify(t)); });

      root.appendChild(h('p', { class: 'muted', text: 'Укажи свои тарифы. Они подставляются в карточку клиента на этапе закрытия.' }));

      list.forEach(function (t, i) {
        function inp(key, label, type) {
          var el = h('input', { type: type || 'text', class: 'input', value: t[key] === undefined ? '' : t[key] });
          el.addEventListener('change', function () {
            t[key] = type === 'number' ? Number(el.value) || 0 : el.value;
            store.setTariffs(list);
          });
          return h('label', { class: 'field' }, h('span', { class: 'label', text: label }), el);
        }
        root.appendChild(h('section', { class: 'card' },
          inp('name', 'Название'),
          h('div', { class: 'grid2' },
            inp('price', 'Цена, ₽', 'number'),
            inp('adBudget', 'Рекламный бюджет'),
            inp('split', 'Схема оплаты')
          ),
          inp('note', 'Заметка'),
          h('button', {
            type: 'button', class: 'btn btn-danger',
            onClick: function () { list.splice(i, 1); store.setTariffs(list); draw(); }
          }, 'Удалить тариф')
        ));
      });

      root.appendChild(h('button', {
        type: 'button', class: 'btn',
        onClick: function () {
          list.push({ id: 't' + Date.now().toString(36), name: 'Новый тариф', price: 0, adBudget: '', split: '', note: '' });
          store.setTariffs(list);
          draw();
        }
      }, 'Добавить тариф'));
    }
    draw();
    return root;
  }

  // ---------- Самопрезентация ----------
  function intro() {
    var f = {
      niche: h('input', { type: 'text', class: 'input', placeholder: 'отделка балконов' }),
      projects: h('input', { type: 'number', class: 'input', placeholder: '40' }),
      cpl: h('input', { type: 'number', class: 'input', placeholder: '400' }),
      detail: h('input', { type: 'text', class: 'input', placeholder: 'Вот наши кейсы по вашей нише' })
    };
    var out = h('div', { class: 'phrase' });

    function draw() {
      C.dom.clear(out);
      var niche = f.niche.value || '[ниша клиента]';
      var projects = f.projects.value || '[N]';
      var guess = C.cpl.estimate(f.niche.value, f.city ? f.city.value : '');
      var cpl = f.cpl.value || (guess.known && !guess.approx && guess.how !== 'all' ? String(guess.value) : '[X]');
      var detail = f.detail.value || 'Вот наши кейсы.';
      out.appendChild(h('div', { class: 'eyebrow', text: 'Твоя самопрезентация (1 1,5 минуты)' }));
      out.appendChild(h('p', {
        text: 'Мы работаем как внешний отдел маркетинга по нише «' + niche + '». Лично я запустил более ' + projects +
          ' проектов в этой нише. Сейчас стоимость заявки у нас держится в районе ' + cpl + ' рублей' + (f.cpl.value || !guess.known || guess.approx ? '' : ' (по данным EGOKAD, подставь свою цифру из запуска)') + '. ' + detail
      }));
      out.appendChild(h('p', { class: 'muted', text: 'Не заканчивай словами «какие у вас вопросы?». Сразу переходи к блоку 2 (фрейм).' }));
    }
    Object.keys(f).forEach(function (k) { f[k].addEventListener('input', draw); });
    draw();

    function field(label, el) {
      return h('label', { class: 'field' }, h('span', { class: 'label', text: label }), el);
    }
    return h('div', null,
      h('p', { class: 'muted', text: 'Короткая, с цифрами и в нише клиента. Подставляй только цифры, которые можешь подтвердить.' }),
      h('div', { class: 'grid2' },
        field('Ниша', f.niche),
        field('Сколько проектов в нише', f.projects),
        field('Стоимость заявки, ₽', f.cpl),
        field('Что показываешь дальше', f.detail)
      ),
      out
    );
  }

  // ---------- Принципы и источники ----------
  function textBlocks(items) {
    return h('div', { class: 'acc' }, items.map(function (p) {
      return h('details', { class: 'sec' },
        h('summary', { text: p.title }),
        h('div', { class: 'sec-body' }, h('p', { text: p.body }))
      );
    }));
  }

  function filesTab() {
    return h('div', null,
      h('p', { class: 'muted', text: 'Все материалы спринта. Файлы лежат в папке files рядом с index.html, новые добавляются в js/data/files.js.' }),
      h('ul', { class: 'files' }, D.files.map(function (f) {
        return h('li', { class: 'file' },
          h('a', { href: D.fileHref(f.file), target: '_blank', rel: 'noopener', text: f.title }),
          h('div', { class: 'muted', text: f.use })
        );
      })),
      h('section', { class: 'card' },
        h('h3', { text: 'Кейсы по нишам' }),
        h('p', null, 'Кейсы вынесены в отдельную вкладку. ', h('a', { href: '#library/cases', text: 'Открыть кейсы' }), '. Файлы кейсов (скриншоты, видео) клади в папку files/cases и указывай имя файла в кейсе.')
      )
    );
  }

  function render(tabId) {
    var active = TABS.filter(function (t) { return t.id === tabId; })[0] || TABS[0];
    var body;
    if (active.id === 'objections') body = objections();
    else if (active.id === 'cases') body = C.views.cases.render();
    else if (active.id === 'tariffs') body = tariffs();
    else if (active.id === 'intro') body = intro();
    else if (active.id === 'principles') body = textBlocks(D.principles);
    else if (active.id === 'segments') body = C.views.segments.render();
    else if (active.id === 'channels') body = C.views.traffic.render();
    else if (active.id === 'sources') body = textBlocks(D.sourcesGuide);
    else body = filesTab();

    return h('div', { class: 'view' },
      h('h1', { text: 'Библиотека' }),
      h('div', { class: 'tabs' }, TABS.map(function (t) {
        return h('a', {
          class: 'tab' + (t.id === active.id ? ' is-active' : ''),
          href: '#library/' + t.id
        }, t.title);
      })),
      body
    );
  }

  C.views = C.views || {};
  C.views.library = { render: render };
})((window.CRM = window.CRM || {}));
