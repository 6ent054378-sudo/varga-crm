(function (C) {
  'use strict';

  var h = C.dom.h;
  var D = C.data;

  function list(items) {
    return h('ul', { class: 'bullets' }, items.map(function (t) { return h('li', { text: t }); }));
  }

  // Вкладка библиотеки: три сегмента, красные флаги, формулировки для лендинга
  function render() {
    return h('div', null,
      h('p', { class: 'muted', text: 'Кто приходит в поток и кому что продавать. Определи сегмент на квалификации или диагностике и отметь его в карточке клиента.' }),
      h('div', { class: 'acc' }, D.segments.map(function (s) {
        return h('details', { class: 'sec' },
          h('summary', { text: s.title + ' (' + s.share + ')' }),
          h('div', { class: 'sec-body' },
            h('p', { class: 'strong', text: s.status }),
            h('p', { text: s.profile }),
            h('h4', { text: 'Как его узнать' }), list(s.markers),
            h('h4', { text: 'Как продавать' }), list(s.how),
            h('p', null, h('strong', { text: 'Тариф: ' }), s.tariff)
          )
        );
      })),
      h('section', { class: 'card card-warn' },
        h('h3', { text: 'Красные флаги: не берём' }),
        list(D.redFlags.map(function (f) { return f.title + '. ' + f.text; })),
        h('p', { class: 'muted', text: 'Гарантии не даём ни одному сегменту.' })
      ),
      h('section', { class: 'card' },
        h('h3', { text: 'Три фактора квалификации (практикум №2)' }),
        list(D.qualFactors)
      ),
      h('section', { class: 'card' },
        h('h3', { text: 'Готовые формулировки для лендинга, квиза и кнопок' }),
        D.landingPhrases.map(function (p) {
          return h('div', { class: 'phrase-row' },
            h('div', { class: 'label', text: p.title }),
            h('p', { text: p.text })
          );
        })
      )
    );
  }

  // Подсказка в карточке клиента: по выбранному сегменту и красным флагам
  function hint(lead, stage) {
    if (['qual', 'meet'].indexOf(stage.id) < 0) return null;
    var d = lead.data || {};
    var seg = D.segmentById(D.segmentByOption[d.q_segment]);
    var flag = d.q_flag && d.q_flag !== 'Нет красных флагов' ? d.q_flag : '';
    if (!seg && !flag) {
      return h('section', { class: 'card card-soft' },
        h('h3', { text: 'Сегмент клиента не отмечен' }),
        h('p', { class: 'muted', text: 'Отметь сегмент и красные флаги в записях этапа. Подсказки по тарифу и разговору появятся здесь.' })
      );
    }
    return h('section', { class: 'card' + (flag ? ' card-warn' : '') },
      h('h3', { text: seg ? 'Сегмент: ' + seg.short : 'Красный флаг' }),
      flag ? h('p', { class: 'strong', text: 'Красный флаг: ' + flag + '. Не берём такого клиента без веской причины.' }) : null,
      seg ? h('p', null, h('strong', { text: 'Тариф: ' }), seg.tariff) : null,
      seg ? list(seg.how.slice(0, 2)) : null,
      h('a', { href: '#library/segments', class: 'btn btn-small', text: 'Все сегменты' })
    );
  }

  C.views = C.views || {};
  C.views.segments = { render: render, hint: hint };
})((window.CRM = window.CRM || {}));
