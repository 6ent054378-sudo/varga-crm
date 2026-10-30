(function (C) {
  'use strict';

  var h = C.dom.h;
  var U = C.utils;
  var store = C.store;
  var calc = C.calc;

  var QUICK_CITIES = ['Москва', 'Санкт-Петербург', 'Краснодар', 'Уфа', 'Тюмень', 'Самара'];

  function field(label, el, hint) {
    return h('label', { class: 'field' },
      h('span', { class: 'label', text: label }), el,
      hint ? h('span', { class: 'hint', text: hint }) : null);
  }

  function line(label, value) {
    return h('div', { class: 'calc-line' },
      h('span', { class: 'calc-label', text: label }),
      h('span', { class: 'calc-value', text: String(value) })
    );
  }

  // Выпадающий список ниш EGOKAD по группам
  function nicheSelect(current) {
    var select = h('select', { class: 'input', id: 'calc-niche' },
      h('option', { value: '' }, 'Выбери нишу'),
      C.egokad.groups().map(function (g) {
        return h('optgroup', { label: g.name }, g.niches.map(function (n) { return h('option', { value: n }, n); }));
      })
    );
    select.value = current || '';
    return select;
  }

  // leadId необязателен: с ним значения подтягиваются из карточки и сохраняются обратно
  function render(leadId) {
    var lead = leadId ? store.get(leadId) : null;
    var d = lead ? lead.data : {};

    // Нишу клиента ищем в списке EGOKAD. Если не нашли, оставляем выбор пустым.
    var startNiche = lead ? C.egokad.match(lead.niche) : (C.data.focus ? C.data.focus.niche : '');
    var niche = nicheSelect(startNiche);
    var city = h('input', { type: 'text', class: 'input', id: 'calc-city', list: 'egokad-cities', value: lead ? lead.city : '', placeholder: 'Город клиента' });
    var cityList = h('datalist', { id: 'egokad-cities' }, C.egokad.cities().map(function (c) { return h('option', { value: c.name }); }));

    var inputs = {
      cheque: h('input', { type: 'number', class: 'input', min: '0', value: d.calc_cheque || '', placeholder: '150000' }),
      deals: h('input', { type: 'number', class: 'input', min: '0', value: d.calc_deals || '', placeholder: '10' }),
      conv: h('input', { type: 'number', class: 'input', min: '1', max: '100', step: '0.5', value: d.calc_conv || 10 }),
      cpl: h('input', { type: 'number', class: 'input', min: '0', value: d.calc_cpl || '' }),
      budgetA: h('input', { type: 'number', class: 'input', min: '0', value: d.calc_a_budget || '', placeholder: '200000' }),
      leadsA: h('input', { type: 'number', class: 'input', min: '0', value: d.calc_a_leads || '', placeholder: '30' }),
      salesA: h('input', { type: 'number', class: 'input', min: '0', value: d.calc_a_sales || '', placeholder: '4' }),
      budgetB: h('input', { type: 'number', class: 'input', min: '0', value: d.calc_b_budget || '', placeholder: 'как сейчас' }),
      marginA: h('input', { type: 'number', class: 'input', min: '0', max: '100', value: d.calc_a_margin || '', placeholder: '10' }),
      marginB: h('input', { type: 'number', class: 'input', min: '0', max: '100', value: d.calc_b_margin || '', placeholder: '20' })
    };
    // Если цену заявки не правили руками, она следует за нишей и городом
    var cplTouched = !!d.calc_cpl;

    var priceBox = h('div', { class: 'cpl-box' });
    var out = h('div', { class: 'calc-out' });
    var phraseBox = h('div', { class: 'phrase' });
    var abBox = h('div', { class: 'calc-out' });

    function estimate() {
      return C.cpl.estimate(niche.value, city.value);
    }

    function drawPrice() {
      var est = estimate();
      C.dom.clear(priceBox);
      var big = est.known
        ? (est.low === est.high ? U.fmtMoney(est.value) : U.fmtMoney(est.low).replace(' ₽', '') + '-' + U.fmtMoney(est.high))
        : 'нет данных';
      priceBox.appendChild(h('div', { class: 'price-big' + (est.approx ? ' is-approx' : '') },
        h('span', { class: 'price-num', text: big }),
        h('span', { class: 'price-cap', text: est.known ? 'за заявку с НДС' + (est.approx ? ', ориентир' : '') : '' })
      ));
      priceBox.appendChild(h('p', { class: 'muted', text: C.cpl.describe(est, niche.value, city.value) }));
      if (est.known && !cplTouched && !est.approx && est.how !== 'all') inputs.cpl.value = est.value;
    }

    function currentInput() {
      return { cheque: inputs.cheque.value, deals: inputs.deals.value, conv: inputs.conv.value, cpl: inputs.cpl.value };
    }

    function refresh() {
      var input = currentInput();
      var res = calc.compute(input);
      C.dom.clear(out);
      C.dom.clear(phraseBox);
      if (!res.valid) {
        out.appendChild(h('p', { class: 'muted', text: 'Введи чек, число клиентов и конверсию.' }));
      } else {
        out.appendChild(line('Выручка в месяц', U.fmtMoney(res.revenue)));
        out.appendChild(line('Нужно заявок при ' + calc.num(input.conv) + '%', res.leads));
        out.appendChild(line('При конверсии 12% / 5%', res.leadsBest + ' / ' + res.leadsWorst));
        if (res.adBudget) out.appendChild(line('Рекламный бюджет', U.fmtMoney(res.adBudget)));
        phraseBox.appendChild(h('div', { class: 'eyebrow', text: 'Что сказать клиенту' }));
        phraseBox.appendChild(h('p', { text: calc.phrase(input, res) }));
      }
      drawAB();
    }

    function drawAB() {
      var est = estimate();
      C.dom.clear(abBox);
      var cplB = Number(inputs.cpl.value) || (est.known ? est.value : 0);
      var cmp = calc.compare({
        budgetA: inputs.budgetA.value, leadsA: inputs.leadsA.value, salesA: inputs.salesA.value,
        cheque: inputs.cheque.value, budgetB: inputs.budgetB.value, cplB: cplB,
        marginA: inputs.marginA.value, marginB: inputs.marginB.value
      });
      if (!cmp.valid) {
        abBox.appendChild(h('p', { class: 'muted', text: 'Заполни чек, бюджет, заявки и продажи «сейчас». Цена заявки «с нами» берётся сверху.' }));
        return;
      }
      abBox.appendChild(h('div', { class: 'ab-grid' },
        h('div', { class: 'ab-head' }, ''), h('div', { class: 'ab-head', text: 'Сейчас' }), h('div', { class: 'ab-head', text: 'С нами' }),
        abRow('Бюджет', U.fmtMoney(Math.round(cmp.a.budget)), U.fmtMoney(Math.round(cmp.b.budget))),
        abRow('Цена заявки', U.fmtMoney(Math.round(cmp.a.cpl)), U.fmtMoney(Math.round(cmp.b.cpl))),
        abRow('Заявок', Math.round(cmp.a.leads), Math.round(cmp.b.leads)),
        abRow('Продаж (конверсия ' + cmp.cv2 + '%)', cmp.a.sales.toFixed(1), cmp.b.sales.toFixed(1)),
        abRow('Выручка', U.fmtMoney(Math.round(cmp.a.revenue)), U.fmtMoney(Math.round(cmp.b.revenue))),
        cmp.a.profit || cmp.b.profit ? abRow('Прибыль', U.fmtMoney(Math.round(cmp.a.profit)), U.fmtMoney(Math.round(cmp.b.profit))) : null
      ));
      abBox.appendChild(h('div', { class: 'ab-total' },
        'Дополнительная выручка за 12 месяцев: ', h('strong', { text: U.fmtMoney(cmp.extraRevenue12) }),
        cmp.extraProfit12 ? h('span', null, '. Прибыль: ', h('strong', { text: U.fmtMoney(cmp.extraProfit12) })) : null
      ));
    }

    function abRow(label, a, b) {
      return h('div', { class: 'ab-row' }, h('div', { class: 'ab-label', text: label }), h('div', { text: String(a) }), h('div', { text: String(b) }));
    }

    niche.addEventListener('change', function () { drawPrice(); refresh(); });
    city.addEventListener('input', function () { drawPrice(); refresh(); });
    inputs.cpl.addEventListener('input', function () { cplTouched = true; refresh(); });
    Object.keys(inputs).forEach(function (k) {
      if (k !== 'cpl') inputs[k].addEventListener('input', refresh);
    });

    var chips = h('div', { class: 'chips' }, QUICK_CITIES.map(function (name) {
      return h('button', {
        type: 'button', class: 'chip-btn',
        onClick: function () { city.value = name; drawPrice(); refresh(); }
      }, name);
    }));

    var actions = h('div', { class: 'tools' });
    if (lead) {
      actions.appendChild(h('button', {
        type: 'button', class: 'btn btn-primary',
        onClick: function () {
          store.setData(lead.id, 'calc_cheque', inputs.cheque.value);
          store.setData(lead.id, 'calc_deals', inputs.deals.value);
          store.setData(lead.id, 'calc_conv', inputs.conv.value);
          store.setData(lead.id, 'calc_cpl', inputs.cpl.value);
          store.setData(lead.id, 'calc_a_budget', inputs.budgetA.value);
          store.setData(lead.id, 'calc_a_leads', inputs.leadsA.value);
          store.setData(lead.id, 'calc_a_sales', inputs.salesA.value);
          store.setData(lead.id, 'calc_b_budget', inputs.budgetB.value);
          store.setData(lead.id, 'calc_a_margin', inputs.marginA.value);
          store.setData(lead.id, 'calc_b_margin', inputs.marginB.value);
          store.patch(lead.id, { niche: niche.value || lead.niche, city: city.value.trim() });
          window.location.hash = '#lead/' + lead.id;
        }
      }, 'Сохранить и вернуться'));
      actions.appendChild(h('a', { class: 'btn', href: '#lead/' + lead.id, text: 'Назад' }));
    }

    var root = h('div', { class: 'view' },
      h('h1', { text: lead ? 'Калькулятор: ' + (lead.name || 'клиент') : 'Калькулятор' }),
      h('section', { class: 'card calc-card' },
        h('h3', { text: '1. Цена заявки' }),
        h('div', { class: 'grid2' }, field('Ниша', niche), field('Город', city)),
        chips,
        priceBox,
        cityList
      ),
      h('section', { class: 'card calc-card' },
        h('h3', { text: '2. План клиента' }),
        h('div', { class: 'grid2 calc-form' },
          field('Средний чек, ₽', inputs.cheque),
          field('Клиентов в месяц нужно', inputs.deals, 'Цель из блока «точка Б»'),
          field('Конверсия заявка → оплата, %', inputs.conv, '7-12% по рынку'),
          field('Цена заявки, ₽', inputs.cpl, 'Подставляется сама, можно поправить')
        ),
        out,
        phraseBox
      ),
      h('section', { class: 'card calc-card' },
        h('h3', { text: '3. Было и станет' }),
        h('div', { class: 'grid2 calc-form' },
          field('Бюджет сейчас, ₽/мес', inputs.budgetA),
          field('Заявок сейчас', inputs.leadsA),
          field('Продаж сейчас', inputs.salesA),
          field('Бюджет с нами, ₽/мес', inputs.budgetB, 'Пусто: тот же'),
          field('Маржа сейчас, %', inputs.marginA, 'Необязательно'),
          field('Маржа потом, %', inputs.marginB, 'Необязательно')
        ),
        abBox
      ),
      actions
    );
    drawPrice();
    refresh();
    return root;
  }

  C.views = C.views || {};
  C.views.calculator = { render: render };
})((window.CRM = window.CRM || {}));
