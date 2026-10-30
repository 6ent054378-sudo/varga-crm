(function (C) {
  'use strict';

  var U = C.utils;

  function num(v) {
    var n = Number(String(v === undefined || v === null ? '' : v).replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  }

  // Расчёт воронки: сколько заявок нужно, чтобы получить нужное число сделок.
  // input: {cheque, deals, conv (в процентах), cpl (необязательно)}
  function compute(input) {
    var cheque = num(input.cheque);
    var deals = num(input.deals);
    var conv = num(input.conv);
    var cpl = num(input.cpl);
    var out = { valid: false };

    if (cheque <= 0 || deals <= 0 || conv <= 0 || conv > 100) return out;

    out.valid = true;
    out.revenue = cheque * deals;
    out.leads = Math.ceil(deals / (conv / 100));
    out.leadsBest = Math.ceil(deals / 0.12); // конверсия 12%
    out.leadsWorst = Math.ceil(deals / 0.05); // конверсия 5%
    out.adBudget = cpl > 0 ? Math.round(out.leads * cpl) : 0;
    return out;
  }

  // Фраза для разговора, как в скрипте блока 7
  function phrase(input, res) {
    if (!res.valid) return '';
    return (
      'Чтобы получить ' + num(input.deals) + ' клиентов при чеке ' + U.fmtMoney(num(input.cheque)) +
      ', нужно ' + U.fmtMoney(res.revenue) + ' выручки в месяц. При конверсии из заявки в оплату ' +
      num(input.conv) + '% нам нужно привести около ' + res.leads +
      ' заявок. Есть ли у вас сомнения, что если мы приведём столько квалифицированных заявок, вы закроете ' +
      num(input.deals) + ' сделок?'
    );
  }

  // «Было и станет»: точка А (сейчас) и точка Б (с нами). Конверсия в продажу и чек те же,
  // меняется только цена заявки и, если нужно, бюджет. Маржа необязательна.
  function compare(x) {
    var budgetA = num(x.budgetA);
    var leadsA = num(x.leadsA);
    var salesA = num(x.salesA);
    var cheque = num(x.cheque);
    var cplB = num(x.cplB);
    var budgetB = num(x.budgetB) || budgetA;
    if (budgetA <= 0 || leadsA <= 0 || cheque <= 0 || cplB <= 0 || salesA < 0 || salesA > leadsA) return { valid: false };
    var cv2 = salesA / leadsA;
    var mA = num(x.marginA) / 100;
    var mB = (num(x.marginB) || num(x.marginA)) / 100;
    function point(budget, leads, sales, margin) {
      var revenue = sales * cheque;
      return {
        budget: budget, leads: leads, cpl: budget / leads, sales: sales, revenue: revenue,
        profit: margin > 0 ? revenue * margin : 0,
        romi: Math.round((revenue - budget) / budget * 100)
      };
    }
    var a = point(budgetA, leadsA, salesA, mA);
    var leadsB = budgetB / cplB;
    var b = point(budgetB, leadsB, leadsB * cv2, mB);
    return {
      valid: true, cv2: Math.round(cv2 * 1000) / 10, a: a, b: b,
      extraRevenue12: Math.round((b.revenue - a.revenue) * 12),
      extraProfit12: mA > 0 ? Math.round((b.profit - a.profit) * 12) : 0
    };
  }

  C.calc = { compute: compute, phrase: phrase, num: num, compare: compare };
})((window.CRM = window.CRM || {}));
