(function (C) {
  'use strict';

  var D = C.data;

  // Самый дальний этап основного пути, до которого дошёл лид.
  function maxIndex(lead) {
    var max = -1;
    Object.keys(lead.reached || {}).forEach(function (id) {
      var i = D.mainStageIds.indexOf(id);
      if (i > max) max = i;
    });
    var cur = D.mainStageIds.indexOf(lead.stage);
    if (cur > max) max = cur;
    return max;
  }

  function reachedMeet(l) {
    return maxIndex(l) >= D.mainStageIds.indexOf('meet');
  }

  // Встреча состоялась: отметка в карточке или клиент уже дошёл до оплаты
  function held(l) {
    return reachedMeet(l) && ((l.data && l.data.m_held === 'Состоялась') || maxIndex(l) >= D.mainStageIds.indexOf('pay'));
  }

  function priced(l) {
    return held(l) && (Number(l.data && l.data.price_amount) > 0 || maxIndex(l) >= D.mainStageIds.indexOf('pay'));
  }

  // Шаги воронки: заявка, звонок, встреча назначена, встреча проведена, цена названа, оплата
  var STEPS = [
    { id: 'all', title: 'Все лиды', test: null },
    { id: 'qual', title: 'Дозвонились', test: function (l) { return maxIndex(l) >= D.mainStageIds.indexOf('qual'); } },
    { id: 'booked', title: 'Назначили встречу', test: reachedMeet },
    { id: 'held', title: 'Провели встречу', test: held },
    { id: 'priced', title: 'Дошли до цены', test: priced },
    { id: 'won', title: 'Оплатили', test: function (l) { return maxIndex(l) >= D.mainStageIds.indexOf('won'); } }
  ];

  // days: за сколько последних дней по дате создания лида; 0 = за всё время
  function filterLeads(leads, days) {
    if (!days) return leads;
    var from = Date.now() - days * 86400000;
    return leads.filter(function (l) { return new Date(l.createdAt).getTime() >= from; });
  }

  function funnel(leads) {
    var counts = STEPS.map(function (step) {
      return step.test ? leads.filter(step.test).length : leads.length;
    });
    return STEPS.map(function (step, i) {
      return {
        id: step.id,
        title: step.title,
        count: counts[i],
        fromPrev: i > 0 && counts[i - 1] > 0 ? Math.round((counts[i] / counts[i - 1]) * 100) : null,
        fromAll: i > 0 && counts[0] > 0 ? Math.round((counts[i] / counts[0]) * 100) : null
      };
    });
  }

  function bySource(leads) {
    var map = {};
    leads.forEach(function (l) {
      var key = l.source || 'Не указан';
      map[key] = map[key] || { source: key, leads: 0, meetings: 0, paid: 0 };
      map[key].leads += 1;
      if (held(l)) map[key].meetings += 1;
      if (l.stage === 'won') map[key].paid += 1;
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.leads - a.leads; });
  }

  function money(leads) {
    var won = leads.filter(function (l) { return l.stage === 'won'; });
    var revenue = won.reduce(function (sum, l) {
      return sum + Number(l.data.won_amount || l.data.price_amount || 0);
    }, 0);
    return { revenue: revenue, average: won.length ? Math.round(revenue / won.length) : 0, count: won.length };
  }

  // Встречи за последние 7 дней: назначены (дошли до «Встречи») и проведены (дата отметки «Состоялась»).
  // Норма спринта: в среднем 3 продающие встречи в неделю.
  function weekly(leads, now) {
    var from = (now || Date.now()) - 7 * 86400000;
    function within(at) { return at && new Date(at).getTime() >= from; }
    return {
      booked: leads.filter(function (l) { return within(l.reached && l.reached.meet); }).length,
      held: leads.filter(function (l) { return within(l.data && l.data.m_held_at); }).length,
      target: 3
    };
  }

  C.metrics = { weekly: weekly, funnel: funnel, bySource: bySource, money: money, filterLeads: filterLeads, maxIndex: maxIndex, held: held, priced: priced };
})((window.CRM = window.CRM || {}));
