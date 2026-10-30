(function (C) {
  'use strict';

  var h = C.dom.h;
  var D = C.data;

  // Вкладка библиотеки: где брать лидов и как настроить канал
  function render() {
    return h('div', null,
      h('p', { class: 'muted', text: 'Каналы из практикума №2. Начни с двух бесплатных, платный подключай, когда отработаешь скрипт.' }),
      h('section', { class: 'card' },
        h('h3', { text: 'Правила для любого канала' }),
        h('ul', { class: 'bullets' }, D.trafficRules.map(function (t) { return h('li', { text: t }); }))
      ),
      h('div', { class: 'acc' }, D.channels.map(function (c) {
        return h('details', { class: 'sec' },
          h('summary', { text: c.title }),
          h('div', { class: 'sec-body' },
            h('p', { class: 'muted', text: 'Стоимость: ' + c.cost }),
            h('p', { text: c.summary }),
            h('ol', { class: 'steps' }, c.steps.map(function (t) { return h('li', { text: t }); }))
          )
        );
      }))
    );
  }

  C.views = C.views || {};
  C.views.traffic = { render: render };
})((window.CRM = window.CRM || {}));
