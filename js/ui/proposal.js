(function (C) {
  'use strict';

  var h = C.dom.h;
  var D = C.data;
  var store = C.store;
  var P = C.proposal;

  var QUICK_CITIES = ['Москва', 'Санкт-Петербург', 'Краснодар', 'Уфа', 'Тюмень', 'Самара'];

  function field(label, el, hint) {
    return h('label', { class: 'field' },
      h('span', { class: 'label', text: label }), el,
      hint ? h('span', { class: 'hint', text: hint }) : null);
  }

  function section(title, hint, body, open) {
    return h('details', { class: 'card kp-sec', open: open ? 'open' : null },
      h('summary', { text: title }),
      hint ? h('p', { class: 'muted', text: hint }) : null,
      body);
  }

  function nicheSelect(current) {
    var select = h('select', { class: 'input' },
      h('option', { value: '' }, 'Выбери нишу'),
      C.egokad.groups().map(function (g) {
        return h('optgroup', { label: g.name }, g.niches.map(function (n) { return h('option', { value: n }, n); }));
      })
    );
    select.value = current || '';
    return select;
  }

  function savedParams(lead) {
    if (!lead || !lead.data || !lead.data.kp_params) return null;
    try { return JSON.parse(lead.data.kp_params); } catch (e) { return null; }
  }

  function render(leadId) {
    var lead = leadId ? store.get(leadId) : null;
    var params = Object.assign(P.defaults(lead), savedParams(lead) || {});
    var author = P.author();
    var phraseTouched = !!(savedParams(lead) && savedParams(lead).phrase);
    var cplTouched = !!(lead && lead.data && lead.data.calc_cpl) || !!(savedParams(lead) && savedParams(lead).cpl);

    var els = {
      client: h('input', { type: 'text', class: 'input', value: params.clientName, placeholder: 'Имя клиента или компания' }),
      niche: nicheSelect(params.niche),
      phrase: h('input', { type: 'text', class: 'input', value: params.phrase }),
      city: h('input', { type: 'text', class: 'input', list: 'kp-cities', value: params.city, placeholder: 'Например: Тюмень' }),
      aLeads: h('input', { type: 'number', class: 'input', min: '0', value: params.aLeads }),
      aDeals: h('input', { type: 'number', class: 'input', min: '0', value: params.aDeals }),
      cheque: h('input', { type: 'number', class: 'input', min: '0', value: params.cheque, placeholder: '6000000' }),
      bDeals: h('input', { type: 'number', class: 'input', min: '0', value: params.bDeals }),
      blockers: h('textarea', { class: 'input', rows: '3' }, params.blockers),
      aNote: h('input', { type: 'text', class: 'input', value: params.aNote, placeholder: 'Необязательно' }),
      bNote: h('input', { type: 'text', class: 'input', value: params.bNote, placeholder: 'Необязательно' }),
      cpl: h('input', { type: 'number', class: 'input', min: '0', value: params.cpl }),
      meet: h('input', { type: 'number', class: 'input', min: '1', max: '100', value: params.meet }),
      pay: h('input', { type: 'number', class: 'input', min: '1', max: '100', value: params.pay }),
      tier: h('select', { class: 'input' }, P.allTiers().map(function (t) { return h('option', { value: t.id }, t.name + ', ' + C.utils.fmtMoney(t.price)); })),
      showAll: h('input', { type: 'checkbox', checked: params.showAll }),
      shots: h('input', { type: 'checkbox', checked: params.shots !== false }),
      bonus: h('input', { type: 'checkbox', checked: params.bonus }),
      bonusUntil: h('input', { type: 'date', class: 'input', value: params.bonusUntil }),
      aName: h('input', { type: 'text', class: 'input', value: author.name, placeholder: 'Как к вам обращаться' }),
      aPhone: h('input', { type: 'tel', class: 'input', value: author.phone, placeholder: '+7' }),
      aTg: h('input', { type: 'text', class: 'input', value: author.telegram, placeholder: '@ник' })
    };
    els.tier.value = params.tier;
    var moduleBoxes = {};
    D.proposalModules.forEach(function (m) {
      moduleBoxes[m.id] = h('input', { type: 'checkbox', checked: params.modules[m.id] !== false });
    });

    var cplHint = h('span', { class: 'hint' });
    var status = h('p', { class: 'muted kp-status' });
    var frame = h('iframe', { class: 'kp-frame', title: 'Предпросмотр КП' });
    var currentHtml = '';
    var lastY = 0;

    function onMessage(e) {
      if (!document.body.contains(root)) { window.removeEventListener('message', onMessage); return; }
      if (e.source === frame.contentWindow && e.data && typeof e.data.kpY === 'number') lastY = e.data.kpY;
    }
    window.addEventListener('message', onMessage);
    frame.addEventListener('load', function () {
      if (frame.contentWindow && lastY) frame.contentWindow.postMessage({ kpRestore: lastY }, '*');
    });

    function read() {
      var modules = {};
      Object.keys(moduleBoxes).forEach(function (k) { modules[k] = moduleBoxes[k].checked; });
      return {
        clientName: els.client.value.trim(), niche: els.niche.value, phrase: els.phrase.value.trim(), city: els.city.value.trim(),
        aLeads: els.aLeads.value, aDeals: els.aDeals.value, cheque: els.cheque.value, bDeals: els.bDeals.value,
        blockers: els.blockers.value.trim(), aNote: els.aNote.value.trim(), bNote: els.bNote.value.trim(),
        cpl: els.cpl.value, meet: els.meet.value, pay: els.pay.value,
        tier: els.tier.value, showAll: els.showAll.checked, shots: els.shots.checked, bonus: els.bonus.checked, bonusUntil: els.bonusUntil.value,
        modules: modules, sample: params.sample
      };
    }

    function fill(p) {
      els.client.value = p.clientName || '';
      els.niche.value = p.niche || '';
      els.phrase.value = p.phrase || '';
      els.city.value = p.city || '';
      ['aLeads', 'aDeals', 'cheque', 'bDeals', 'cpl', 'meet', 'pay'].forEach(function (k) { els[k].value = p[k] === undefined ? '' : p[k]; });
      els.blockers.value = p.blockers || '';
    }

    function drawCpl() {
      var est = C.cpl.estimate(els.niche.value, els.city.value);
      cplHint.textContent = est.known
        ? 'Данные EGOKAD: ' + (est.low === est.high ? C.utils.fmtMoney(est.value) : C.utils.fmtMoney(est.low).replace(' ₽', '') + '-' + C.utils.fmtMoney(est.high)) + ' за заявку с НДС' + (est.approx ? ' (ориентир, для этого города данных нет)' : '')
        : 'Для этой ниши цены нет в данных EGOKAD. Впиши свою.';
      if (est.known && !cplTouched) els.cpl.value = est.value;
    }

    function onNicheOrCity() {
      var texts = P.nicheTexts(els.niche.value);
      if (!phraseTouched) els.phrase.value = texts.phrase;
      drawCpl();
      markDirty();
    }

    // КП справа пересобирается само через четверть секунды после правки
    var timer = null;
    function markDirty() {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(generate, 250);
    }

    // Скрины ниши тяжёлые (около 0,5 МБ), поэтому грузятся только при первом открытии генератора КП
    function ensureShots() {
      if (D.proposalShots || ensureShots.busy) return;
      ensureShots.busy = true;
      var s = document.createElement('script');
      s.src = 'js/data/proposal_shots.js';
      s.onload = function () { ensureShots.busy = false; markDirty(); };
      s.onerror = function () { ensureShots.busy = false; };
      document.head.appendChild(s);
    }

    function generate() {
      ensureShots();
      var p = read();
      var m = P.model(p);
      P.saveAuthor({ name: els.aName.value, phone: els.aPhone.value, telegram: els.aTg.value });
      currentHtml = P.html(p);
      frame.srcdoc = currentHtml;
      timer = null;
      var notes = [];
      if (m.miss.length) notes.push('Не заполнено: ' + m.miss.join(', ') + '. Блок «Экономика» показан не полностью.');
      if (!m.aShown && !m.bShown) notes.push('Блок «Точка А и Б» скрыт, пока нет цифр.');
      if (p.sample) notes.push('Это пример с условными цифрами.');
      status.textContent = notes.length ? notes.join(' ') : 'КП обновляется по мере ввода. Скачай файл и отправь клиенту.';
      if (lead) store.setData(lead.id, 'kp_params', JSON.stringify(p));
    }

    function download() {
      if (!currentHtml) generate();
      var blob = new Blob([currentHtml], { type: 'text/html;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = h('a', { href: url, download: P.fileName(read()) });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }

    function openTab() {
      if (!currentHtml) generate();
      var blob = new Blob([currentHtml], { type: 'text/html;charset=utf-8' });
      window.open(URL.createObjectURL(blob), '_blank');
    }

    function printIt() {
      if (!currentHtml) generate();
      if (frame.contentWindow) frame.contentWindow.print();
    }

    els.niche.addEventListener('change', onNicheOrCity);
    els.city.addEventListener('input', onNicheOrCity);
    els.phrase.addEventListener('input', function () { phraseTouched = true; markDirty(); });
    els.cpl.addEventListener('input', function () { cplTouched = true; markDirty(); });
    Object.keys(els).forEach(function (k) {
      if (['niche', 'city', 'phrase', 'cpl'].indexOf(k) >= 0) return;
      els[k].addEventListener('input', markDirty);
      els[k].addEventListener('change', markDirty);
    });
    Object.keys(moduleBoxes).forEach(function (k) { moduleBoxes[k].addEventListener('change', markDirty); });
    ['aLeads', 'aDeals', 'cheque', 'bDeals'].forEach(function (k) { els[k].addEventListener('input', function () { params.sample = false; }); });

    var leadSelect = h('select', { class: 'input' },
      h('option', { value: '' }, 'Без клиента'),
      store.leads().map(function (l) { return h('option', { value: l.id }, (l.name || 'Без имени') + (l.city ? ', ' + l.city : '')); }));
    leadSelect.value = leadId || '';
    leadSelect.addEventListener('change', function () {
      window.location.hash = leadSelect.value ? '#kp/' + leadSelect.value : '#kp';
    });

    var chips = h('div', { class: 'chips' }, QUICK_CITIES.map(function (name) {
      return h('button', { type: 'button', class: 'chip-btn', onClick: function () { els.city.value = name; onNicheOrCity(); } }, name);
    }));

    var form = h('div', { class: 'kp-form' },
      section('1. Клиент и ниша', 'Выбери нишу и город, и заголовок КП поменяется сам.', h('div', null,
        field('Клиент из доски', leadSelect, 'Подтянет нишу, город и цифры из карточки'),
        field('Имя клиента или компания', els.client),
        h('div', { class: 'grid2' }, field('Ниша', els.niche), field('Город', els.city)),
        chips,
        field('Для кого, слова после «для» в заголовке', els.phrase, 'Например: строительства домов из газобетона'),
        h('datalist', { id: 'kp-cities' }, C.egokad.cities().map(function (c) { return h('option', { value: c.name }); }))
      ), true),
      section('2. Точка А и точка Б', 'Только то, что известно от клиента. Пустые поля не попадут в КП.', h('div', null,
        h('div', { class: 'grid2' }, field('Заявки сейчас, в месяц', els.aLeads), field('Договоры сейчас, в месяц', els.aDeals)),
        h('div', { class: 'grid2' }, field('Средний чек, ₽', els.cheque), field('Цель: договоров в месяц', els.bDeals)),
        field('Что мешает', els.blockers),
        h('div', { class: 'grid2' }, field('Пометка к точке А', els.aNote), field('Пометка к точке Б', els.bNote))
      ), true),
      section('3. Расчёт', 'Цена заявки подставляется из данных EGOKAD по нише и городу.', h('div', null,
        field('Цена заявки, ₽', els.cpl), cplHint,
        h('div', { class: 'grid2' }, field('Заявка во встречу, %', els.meet, 'Для дорогого чека обычно ниже, чем для услуг'), field('Встреча в договор, %', els.pay))
      ), false),
      section('4. Тариф и бонус', null, h('div', null,
        field('Тариф в КП', els.tier),
        h('label', { class: 'check' }, els.showAll, h('span', { text: 'Показать все три тарифа, выбранный отметить как рекомендуемый' })),
        h('label', { class: 'check' }, els.shots, h('span', { text: 'Показать скрины примеров из ниши (газобетон)' })),
        h('label', { class: 'check' }, els.bonus, h('span', { text: 'Показать бонус за оплату в течение 3 дней' })),
        field('Бонус действует до', els.bonusUntil)
      ), false),
      section('5. Этапы работы', 'Сними галочку, чтобы убрать этап из КП.', h('div', null, D.proposalModules.map(function (m) {
        return h('label', { class: 'check' }, moduleBoxes[m.id], h('span', { text: m.title }));
      })), false),
      section('6. Ваши контакты', 'Появятся на последнем экране КП. Хранятся только на этом компьютере.', h('div', null,
        field('Имя', els.aName),
        h('div', { class: 'grid2' }, field('Телефон', els.aPhone), field('Telegram', els.aTg))
      ), false)
    );

    var toolbar = h('div', { class: 'kp-toolbar' },
      h('button', { type: 'button', class: 'btn btn-primary', onClick: download }, 'Скачать файл'),
      h('button', { type: 'button', class: 'btn', onClick: openTab }, 'Открыть в новой вкладке'),
      h('button', { type: 'button', class: 'btn', onClick: printIt }, 'Печать / PDF'),
      h('a', { class: 'btn', href: '#present/' + (lead ? lead.id : 'demo'), title: 'Показ КП по шагам на встрече' }, 'Показать клиенту'),
      h('button', {
        type: 'button', class: 'btn btn-ghost',
        onClick: function () { fill(P.sample(read())); params.sample = true; cplTouched = false; drawCpl(); generate(); }
      }, 'Подставить пример')
    );

    var root = h('div', { class: 'view' },
      lead ? h('a', { class: 'back', href: '#lead/' + lead.id, text: 'К карточке' }) : null,
      h('h1', { text: 'Генератор КП' }),
      h('p', { class: 'muted', text: 'КП справа собирается само. Готовый файл отправляй клиенту.' }),
      h('div', { class: 'kp-layout' },
        h('div', { class: 'kp-left' }, toolbar, status, form),
        h('div', { class: 'kp-right' }, frame)
      )
    );
    drawCpl();
    generate();
    return root;
  }

  C.views = C.views || {};
  C.views.proposal = { render: render };
})((window.CRM = window.CRM || {}));
