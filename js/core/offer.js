(function (C) {
  'use strict';

  var D = C.data;
  var store = C.store;

  var STATE_LABEL = { todo: 'Не начато', doing: 'В работе', done: 'Готово' };

  // Три тарифа комплекса (состав из D.offerTiers) с актуальной ценой из вкладки «Тарифы»
  function tiers() {
    var prices = {};
    store.tariffs().forEach(function (t) { prices[t.id] = Number(t.price) || 0; });
    return D.offerTiers.map(function (t) {
      return Object.assign({}, t, { price: prices[t.id] > 0 ? prices[t.id] : t.price });
    });
  }

  // Ведение проекта: цена в месяц, правится во вкладке «Тарифы» библиотеки
  function maintain() {
    var price = D.offerMaintain.price;
    store.tariffs().forEach(function (t) { if (t.id === D.offerMaintain.id && Number(t.price) > 0) price = Number(t.price); });
    return { id: D.offerMaintain.id, title: D.offerMaintain.title, price: price, per: D.offerMaintain.per, note: D.offerMaintain.note };
  }

  function maintainText() {
    var m = maintain();
    return m.title + ' ' + C.utils.fmtMoney(m.price) + ' ' + m.per + ', ' + m.note;
  }

  function byId(id) {
    var all = tiers().concat([D.offerStart]);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  function bonusText() {
    var b = D.offerBonus;
    return b.title + ' (обычная стоимость ' + (b.normalPrice).toLocaleString('ru-RU') + ' ₽), ' + b.condition + '.';
  }

  // Клиент выбрал тариф: цена и дедлайн попадают в карточку
  function choose(leadId, tierId) {
    var t = byId(tierId);
    var lead = store.get(leadId);
    if (!t || !lead) return null;
    store.setData(leadId, 'price_tariff', t.id);
    store.setData(leadId, 'price_amount', t.price);
    if (!lead.data.price_deadline) store.setData(leadId, 'price_deadline', 'Оплата в течение 3 дней: ' + D.offerBonus.title + ' за наш счёт');
    return t;
  }

  // Пункты ведения проекта: блоки выбранного тарифа (как в листе «Таблица ведения проекта»)
  function tasks(tierId) {
    var t = byId(tierId);
    if (!t) return [];
    var titles = t.blocks && t.blocks.length ? t.blocks.map(function (b) { return b.title; }) : t.summary;
    return titles.map(function (title, i) { return { key: 'p' + (i + 1), title: title }; });
  }

  function projectState(lead) {
    var p = lead && lead.data && lead.data._project;
    return p && typeof p === 'object' ? p : {};
  }

  function setTask(leadId, key, patch) {
    var lead = store.get(leadId);
    if (!lead) return null;
    var p = JSON.parse(JSON.stringify(projectState(lead)));
    p[key] = Object.assign({ state: 'todo', note: '' }, p[key] || {}, patch);
    store.setData(leadId, '_project', p);
    return p[key];
  }

  function progress(lead) {
    var list = tasks(lead.data && lead.data.price_tariff);
    var p = projectState(lead);
    var done = list.filter(function (t) { return p[t.key] && p[t.key].state === 'done'; }).length;
    return { done: done, total: list.length };
  }

  C.offer = { tiers: tiers, maintain: maintain, maintainText: maintainText, byId: byId, bonusText: bonusText, choose: choose, tasks: tasks, projectState: projectState, setTask: setTask, progress: progress, STATE_LABEL: STATE_LABEL };
})((window.CRM = window.CRM || {}));
