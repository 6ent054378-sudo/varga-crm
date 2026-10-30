(function (C) {
  'use strict';

  var D = C.data;
  var U = C.utils;

  var AUTHOR_KEY = 'marketing_crm_author_v1';
  var authorMemory = null;

  // Чистые функции: их текст вставляется в готовый файл КП, поэтому без обращений к внешним переменным.
  function money(n) {
    var v = Math.round(Number(n) || 0);
    if (v >= 1000000) return (Math.round(v / 100000) / 10).toString().replace('.', ',') + ' млн ₽';
    if (v >= 100000) return Math.round(v / 1000) + ' тыс. ₽';
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';
  }

  function scenario(inp) {
    var leads = Math.round(Number(inp.leads) || 0);
    var meetings = Math.round(leads * (Number(inp.meet) || 0) / 100);
    var sales = Math.round(meetings * (Number(inp.pay) || 0) / 100);
    var budget = Math.round(leads * (Number(inp.cpl) || 0));
    var revenue = sales * (Number(inp.cheque) || 0);
    var cost = budget + (Number(inp.price) || 0);
    return {
      leads: leads, meetings: meetings, sales: sales, budget: budget, revenue: revenue,
      romi: budget ? Math.round((revenue - budget) / budget * 100) : 0,
      payback: cost ? Math.round(revenue / cost * 10) / 10 : 0
    };
  }

  function num(v) {
    var n = Number(String(v === undefined || v === null ? '' : v).replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) && n > 0 ? n : 0;
  }

  function isoDate(d) {
    var p = function (n) { return n < 10 ? '0' + n : String(n); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function ruDate(iso) {
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }

  function nicheTexts(niche) {
    var own = (D.proposalNiches || {})[niche] || {};
    var base = D.proposalGeneric;
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = own[k] || base[k]; });
    out.phrase = own.phrase || (niche ? 'ниши «' + niche + '»' : 'вашего бизнеса');
    return out;
  }

  // Автор КП (имя и контакты на последнем экране): хранится отдельно от клиентов
  function author() {
    try {
      var raw = window.localStorage.getItem(AUTHOR_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* нет хранилища: берём из памяти */ }
    return authorMemory || { name: '', phone: '', telegram: '' };
  }

  function saveAuthor(a) {
    authorMemory = { name: String(a.name || '').trim(), phone: String(a.phone || '').trim(), telegram: String(a.telegram || '').trim() };
    try { window.localStorage.setItem(AUTHOR_KEY, JSON.stringify(authorMemory)); } catch (e) { /* только память */ }
  }

  function allTiers() {
    return C.offer.tiers().concat([D.offerStart]);
  }

  // Параметры по умолчанию. lead необязателен: тогда подтягиваются его нишу, город и цифры калькулятора.
  function defaults(lead) {
    var d = (lead && lead.data) || {};
    var niche = (lead && C.egokad.match(lead.niche)) || (D.focus && D.focus.niche) || '';
    var city = (lead && lead.city) || '';
    var texts = nicheTexts(niche);
    var est = C.cpl.estimate(niche, city);
    var cheque = num(d.calc_cheque);
    var leads = num(d.calc_a_leads);
    var deals = num(d.calc_a_sales);
    var goal = num(d.calc_deals);
    var tierDefault = (lead && d.price_tariff) || 't_mid';
    return {
      clientName: (lead && lead.name) || '',
      niche: niche,
      phrase: texts.phrase,
      city: city,
      aLeads: leads || '', aDeals: deals || '', cheque: cheque || '',
      bDeals: goal || '',
      cpl: num(d.calc_cpl) || (est.known ? est.value : ''),
      meet: 20, pay: 25,
      blockers: texts.blockers,
      aNote: '', bNote: '',
      tier: tierDefault, showAll: false, shots: true,
      bonus: true, bonusUntil: isoDate(new Date(Date.now() + 3 * 86400000)),
      modules: { site: true, ads: true, funnel: true, analytics: true },
      sample: false
    };
  }

  // Параметры КП клиента: сохранённые в карточке поверх значений по умолчанию (одни и те же для КП и презентатора)
  function paramsFor(lead) {
    var saved = null;
    if (lead && lead.data && lead.data.kp_params) {
      try { saved = JSON.parse(lead.data.kp_params); } catch (e) { saved = null; }
    }
    return Object.assign(defaults(lead), saved || {});
  }

  // Пример для первого знакомства: все цифры условные, пометка попадает в КП
  function sample(p) {
    return Object.assign({}, p, { aLeads: 20, aDeals: 1, cheque: 6000000, bDeals: 3, sample: true });
  }

  function tierById(id) {
    var all = allTiers();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return C.offer.tiers()[1];
  }

  // Модель КП: что показывать и какие цифры. Пустые блоки скрываются, а не заполняются выдумкой.
  function model(raw) {
    var p = Object.assign({}, defaults(null), raw || {});
    var cheque = num(p.cheque);
    var meet = num(p.meet) || 20;
    var pay = num(p.pay) || 25;
    var cpl = num(p.cpl);
    var bDeals = num(p.bDeals);
    var tier = tierById(p.tier);
    var texts = nicheTexts(p.niche);

    var aShown = !!(num(p.aLeads) || num(p.aDeals) || cheque);
    var a = { leads: num(p.aLeads), deals: num(p.aDeals), cheque: cheque, revenue: num(p.aDeals) * cheque };

    var planLeads = bDeals ? Math.ceil(bDeals / (meet / 100 * pay / 100)) : 0;
    var planMeetings = Math.round(planLeads * meet / 100);
    var b = { leads: planLeads, meetings: planMeetings, deals: bDeals, cheque: cheque, revenue: bDeals * cheque };
    var bShown = !!(bDeals && cheque);

    var econ = [];
    if (bShown && cpl) {
      econ = (D.proposalScenarios || []).map(function (s) {
        var inp = { leads: planLeads * s.leads, cpl: cpl * s.cpl, meet: Math.min(100, meet * s.meet), pay: Math.min(100, pay * s.pay), cheque: cheque, price: tier.price };
        return { id: s.id, title: s.title, inp: inp, res: scenario(inp) };
      });
    }
    var miss = [];
    if (!cheque) miss.push('средний чек');
    if (!bDeals) miss.push('цель по договорам');
    if (!cpl) miss.push('цена заявки');

    return { p: p, texts: texts, tier: tier, tiers: C.offer.tiers(), start: D.offerStart, maintain: C.offer.maintain(), a: a, aShown: aShown, b: b, bShown: bShown,
      econ: econ, econShown: econ.length > 0, miss: miss, meet: meet, pay: pay, cpl: cpl,
      modules: (D.proposalModules || []).filter(function (m) { return p.modules && p.modules[m.id] !== false; }) };
  }

  function fileName(p) {
    var parts = ['КП', p.clientName || p.niche, p.city].filter(Boolean);
    return parts.join('-').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-') + '.html';
  }

  C.proposal = {
    money: money, scenario: scenario, num: num, ruDate: ruDate, isoDate: isoDate, nicheTexts: nicheTexts,
    author: author, saveAuthor: saveAuthor, allTiers: allTiers, defaults: defaults, paramsFor: paramsFor, sample: sample,
    tierById: tierById, model: model, fileName: fileName
  };
})((window.CRM = window.CRM || {}));
