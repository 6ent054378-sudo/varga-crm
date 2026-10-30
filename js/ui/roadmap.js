(function (C) {
  'use strict';

  var h = C.dom.h;
  var D = C.data;
  var store = C.store;

  var WITH_CASES = ['meet', 'hold'];
  var WITH_SALES = ['meet', 'pay'];

  function groupByStage(leads) {
    var map = {};
    leads.forEach(function (l) {
      (map[l.stage] = map[l.stage] || []).push(l);
    });
    return map;
  }

  // Этап, с которого начать: самый дальний основной этап, где есть клиенты
  function startStage(byStage) {
    var ids = D.mainStageIds.slice(0, -1).reverse();
    for (var i = 0; i < ids.length; i++) {
      if (byStage[ids[i]] && byStage[ids[i]].length) return ids[i];
    }
    return 'new';
  }

  function list(items, cls) {
    if (!items || !items.length) return null;
    return h('ul', { class: cls || 'road-list' }, items.map(function (t) { return h('li', { text: t }); }));
  }

  function block(title, body) {
    if (!body) return null;
    return h('div', { class: 'road-block' }, h('h4', { text: title }), body);
  }

  function clientLinks(clients) {
    if (!clients.length) return h('p', { class: 'muted', text: 'На этом этапе клиентов нет.' });
    return h('div', { class: 'road-clients' }, clients.map(function (l) {
      return h('a', { class: 'chip-link', href: '#lead/' + l.id, text: l.name || 'Без имени' });
    }));
  }

  function filesBlock(stageId) {
    var files = D.filesFor(stageId);
    if (!files.length) return null;
    return h('ul', { class: 'road-list' }, files.map(function (f) {
      return h('li', null, h('a', { href: D.fileHref(f.file), target: '_blank', rel: 'noopener', text: f.title }), ' ' + f.use);
    }));
  }

  function stageBody(rm, stage, clients) {
    var sendItems = (rm.send || []).slice();
    var sendNode = null;
    if (sendItems.length || D.filesFor(rm.id).length || WITH_CASES.indexOf(rm.id) >= 0) {
      sendNode = h('div', null,
        list(sendItems),
        WITH_CASES.indexOf(rm.id) >= 0
          ? h('p', null, 'Кейсы под нишу клиента: открой его карточку и перетащи в чат текст или картинку из блока «Кейсы по нише клиента». ',
            h('a', { href: '#library/cases', text: 'Все кейсы' }))
          : null,
        filesBlock(rm.id)
      );
    }
    return h('div', { class: 'road-body' },
      h('p', { class: 'road-goal', text: rm.goal }),
      block('Что сделать', h('ol', { class: 'road-steps' }, rm.steps.map(function (t) { return h('li', { text: t }); }))),
      block('Что отправить', sendNode),
      block('Сколько ждать', h('p', { text: rm.wait })),
      block('Идём дальше, когда', h('p', { class: 'road-pass', text: rm.pass })),
      block('Типичные ошибки', list(rm.mistakes, 'road-list road-mistakes')),
      block('Клиенты на этапе: ' + clients.length, clientLinks(clients)),
      h('div', { class: 'road-links' },
        WITH_SALES.indexOf(rm.id) >= 0 ? h('a', { class: 'btn btn-small btn-primary', href: '#sales', text: 'Шпаргалка эфира №3' }) : null,
        h('a', { class: 'btn btn-small', href: '#board', text: 'Доска' })
      )
    );
  }

  function stageSection(rm, byStage, openId, number) {
    var stage = D.stageById(rm.id);
    var clients = byStage[rm.id] || [];
    var attrs = { class: 'road-stage' + (rm.side ? ' road-side' : '') + (rm.id === openId ? ' is-open' : ''), id: 'road-' + rm.id };
    if (rm.id === openId) attrs.open = 'open';
    return h('details', attrs,
      h('summary', null,
        h('span', { class: 'road-num', text: number ? String(number) : '' }),
        h('span', { class: 'road-title', text: stage.title }),
        h('span', { class: 'road-count', text: String(clients.length) })
      ),
      stageBody(rm, stage, clients)
    );
  }

  // Подсказка «что делать прямо сейчас» по самому продвинутому клиенту
  function nowCard(leads, byStage) {
    if (!leads.length) {
      return h('section', { class: 'card card-soft' },
        h('h3', { text: 'С чего начать' }),
        h('p', { text: 'Пока нет ни одного клиента. Нажми «Новый лид» наверху, добавь первый контакт и позвони ему. Ниже весь путь, который проходит клиент.' })
      );
    }
    var id = startStage(byStage);
    var stage = D.stageById(id);
    var lead = byStage[id] && byStage[id][0];
    if (!lead) {
      return h('section', { class: 'card card-soft' },
        h('h3', { text: 'Что делать сейчас' }),
        h('p', { text: 'Все клиенты уже закрыты или в стороне. Добавь новые лиды и начни с первого звонка.' })
      );
    }
    return h('section', { class: 'card card-soft' },
      h('h3', { text: 'Что делать сейчас' }),
      h('p', null, 'Дальше всех продвинулся ', h('a', { href: '#lead/' + lead.id, text: lead.name || 'клиент' }), ': этап «' + stage.title + '».'),
      h('p', { class: 'strong', text: stage.action }),
      h('a', { class: 'btn btn-primary btn-small', href: '#lead/' + lead.id, text: 'Открыть карточку' })
    );
  }

  function render(arg) {
    var leads = store.leads();
    var byStage = groupByStage(leads);
    // Все этапы свёрнуты, пока не выбран этап в адресе или на полосе воронки
    var openId = D.roadmapById(arg) ? arg : '';
    var main = D.roadmap.filter(function (r) { return !r.side; });
    var side = D.roadmap.filter(function (r) { return r.side; });

    var strip = h('div', { class: 'road-strip' }, main.map(function (rm, i) {
      var n = (byStage[rm.id] || []).length;
      return h('a', {
        class: 'road-chip' + (rm.id === openId ? ' is-current' : '') + (n ? ' has-clients' : ''),
        href: '#roadmap/' + rm.id
      },
        h('span', { class: 'road-chip-num', text: String(i + 1) }),
        h('span', { class: 'road-chip-title', text: D.stageById(rm.id).title }),
        h('span', { class: 'road-chip-count', text: String(n) })
      );
    }));

    return h('div', { class: 'view roadmap-view' },
      h('h1', { text: 'Путь клиента' }),
      h('p', { class: 'muted', text: 'Дорога от заявки до оплаты. На каждом этапе: цель, что сделать, что отправить, сколько ждать и когда идти дальше. Число на этапе: сколько клиентов там сейчас. Ориентир спринта: из заявки в оплату доходят 7-12 клиентов из 100.' }),
      nowCard(leads, byStage),
      strip,
      h('div', { class: 'road' }, main.map(function (rm, i) { return stageSection(rm, byStage, openId, i + 1); })),
      h('h2', { class: 'road-side-title', text: 'Боковые дороги' }),
      h('div', { class: 'road' }, side.map(function (rm) { return stageSection(rm, byStage, openId, 0); }))
    );
  }

  C.views = C.views || {};
  C.views.roadmap = { render: render };
})((window.CRM = window.CRM || {}));
