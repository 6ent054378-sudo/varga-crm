(function (C) {
  'use strict';

  var D = C.data;

  var RED_LINE_CPL = 4200;

  function leadIncome(l) {
    return Number(l.data.won_amount || l.data.price_amount || 0);
  }

  // Период: month = текущий календарный месяц, prev = прошлый, all = всё время
  function range(period, now) {
    var d = new Date(now || Date.now());
    var from = 0;
    var to = Infinity;
    if (period === 'month') {
      from = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      to = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    } else if (period === 'prev') {
      from = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
      to = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    }
    return { from: from, to: to };
  }

  function inRange(iso, r) {
    var t = new Date(iso).getTime();
    return !isNaN(t) && t >= r.from && t < r.to;
  }

  // Строки учёта: первые оплаты и расходы из карточек клиентов плюс ручные записи
  function rows(leads, entries, r) {
    var out = [];
    leads.forEach(function (l) {
      if (l.stage !== 'won') return;
      var at = l.reached && l.reached.won ? l.reached.won : l.stageAt;
      if (!inRange(at, r)) return;
      var income = leadIncome(l);
      if (income) out.push({ at: at, type: 'income', amount: income, category: 'Первая оплата', note: l.name || 'Клиент', leadId: l.id, auto: true });
      var cost = Number(l.data.won_cost || 0);
      if (cost) out.push({ at: at, type: 'expense', amount: cost, category: 'Исполнение', note: l.name || 'Клиент', leadId: l.id, auto: true });
    });
    entries.forEach(function (e) {
      var at = e.date ? e.date + 'T12:00:00' : '';
      if (!inRange(at, r)) return;
      out.push({ at: at, type: e.type, amount: Number(e.amount) || 0, category: e.category || '', note: e.note || '', id: e.id, auto: false });
    });
    return out.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }

  function summary(list) {
    var income = 0;
    var expense = 0;
    var byCategory = {};
    list.forEach(function (r) {
      if (r.type === 'income') income += r.amount;
      else {
        expense += r.amount;
        byCategory[r.category || 'Без статьи'] = (byCategory[r.category || 'Без статьи'] || 0) + r.amount;
      }
    });
    return {
      income: income, expense: expense, profit: income - expense,
      margin: income > 0 ? Math.round(((income - expense) / income) * 100) : 0,
      byCategory: byCategory
    };
  }

  // Ожидаемые деньги: клиенты на этапе оплаты и на встрече с ценой, взвешенные по вероятности
  function pending(leads) {
    var sure = 0;
    var forecast = 0;
    leads.forEach(function (l) {
      if (l.stage === 'pay') sure += Number(l.data.price_amount || 0);
      if (l.stage !== 'won' && l.stage !== 'lost') {
        forecast += Number(l.data.price_amount || 0) * (D.leadProbability(l));
      }
    });
    return { waiting: sure, forecast: Math.round(forecast) };
  }

  // Схема перепродажи: цена клиенту минус расход на исполнение
  function scheme(price, cost, count) {
    var n = Math.max(1, Number(count) || 1);
    var income = (Number(price) || 0) * n;
    var expense = (Number(cost) || 0) * n;
    return { income: income, expense: expense, profit: income - expense, margin: income > 0 ? Math.round(((income - expense) / income) * 100) : 0 };
  }

  // Экономика клиента: окупается ли реклама при его чеке
  function clientEconomics(o) {
    var cheque = Number(o.cheque) || 0;
    var conv = Number(o.conv) || 0;
    var price = Number(o.cpl) || 0;
    var margin = o.margin === undefined || o.margin === '' ? 100 : Number(o.margin);
    if (cheque <= 0 || conv <= 0 || conv > 100 || price <= 0 || margin <= 0 || margin > 100) return { valid: false };
    var costPerDeal = Math.round(price / (conv / 100));
    var profitPerDeal = Math.round(cheque * (margin / 100));
    var maxCpl = Math.round(profitPerDeal * (conv / 100));
    return {
      valid: true,
      costPerDeal: costPerDeal,
      profitPerDeal: profitPerDeal,
      maxCpl: maxCpl,
      roi: Math.round((profitPerDeal / costPerDeal) * 100) / 100,
      pays: costPerDeal < profitPerDeal,
      redLine: price > RED_LINE_CPL
    };
  }

  C.money = {
    RED_LINE_CPL: RED_LINE_CPL, range: range, rows: rows, summary: summary,
    pending: pending, scheme: scheme, clientEconomics: clientEconomics
  };
})((window.CRM = window.CRM || {}));
