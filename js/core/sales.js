(function (C) {
  'use strict';

  var D = C.data;
  var U = C.utils;
  var store = C.store;
  var M = C.metrics;

  var NEED_NEXT = ['meet', 'hold', 'pay'];

  function reached(lead, stageId) {
    return M.maxIndex(lead) >= D.mainStageIds.indexOf(stageId);
  }

  // Цифры на пути к первой оплате: сколько разборов, дошло до цены, оплат, у кого нет даты контакта
  function numbers(leads, now) {
    var held = leads.filter(M.held).length;
    var priced = leads.filter(M.priced).length;
    var paid = leads.filter(function (l) { return l.stage === 'won'; }).length;
    var noNext = leads.filter(function (l) { return NEED_NEXT.indexOf(l.stage) >= 0 && !l.nextAt; });
    return {
      held: held,
      priced: priced,
      paid: paid,
      conv: held ? Math.round(paid / held * 100) : 0,
      noNext: noNext,
      week: M.weekly(leads, now)
    };
  }

  function reviews(lead) {
    var list = lead && lead.data && lead.data._reviews;
    return Array.isArray(list) ? list : [];
  }

  function score(checks) {
    var total = D.reviewCriteria.length;
    var done = D.reviewCriteria.filter(function (c) { return checks && checks[c.id]; }).length;
    return { done: done, total: total };
  }

  // Сохраняет разбор встречи в карточку клиента и пишет строку в историю
  function addReview(leadId, checks, note) {
    var lead = store.get(leadId);
    if (!lead) return null;
    var list = reviews(lead).slice();
    var s = score(checks);
    var entry = { at: U.nowIso(), checks: JSON.parse(JSON.stringify(checks || {})), note: String(note || ''), done: s.done, total: s.total };
    list.unshift(entry);
    store.setData(leadId, '_reviews', list);
    var missed = D.reviewCriteria.filter(function (c) { return !entry.checks[c.id]; }).slice(0, 3)
      .map(function (c) { return c.text; });
    var text = 'Разбор встречи: ' + s.done + ' из ' + s.total + '.' + (missed.length ? ' Не сделано: ' + missed.join('; ') + '.' : '');
    if (entry.note) text += ' Заметка: ' + entry.note;
    store.addNote(leadId, text);
    return entry;
  }

  // Какие пункты чаще всего пропускаются по всем сохранённым разборам
  function weakest(leads, limit) {
    var miss = {};
    var total = 0;
    leads.forEach(function (l) {
      reviews(l).forEach(function (r) {
        total += 1;
        D.reviewCriteria.forEach(function (c) { if (!r.checks[c.id]) miss[c.id] = (miss[c.id] || 0) + 1; });
      });
    });
    var list = D.reviewCriteria.map(function (c) { return { id: c.id, text: c.text, miss: miss[c.id] || 0, total: total }; })
      .filter(function (x) { return x.miss > 0; })
      .sort(function (a, b) { return b.miss - a.miss; });
    return list.slice(0, limit || 3);
  }

  // Запрос, который можно вставить в чат с Claude вместе с записью или расшифровкой встречи
  function prompt() {
    var lines = D.reviewCriteria.map(function (c, i) { return (i + 1) + '. ' + c.text; });
    return [
      'Ниже расшифровка моей продающей встречи с клиентом (сайт и маркетинг под ключ, цена разовая от 89 000 до 179 000 рублей, ведение 30 000 рублей в месяц по желанию, реклама отдельно).',
      'Оцени её по критериям практикума и по каждому пункту ответь: сделано, сделано частично или не сделано, с короткой цитатой из текста.',
      '',
      'Критерии:'
    ].concat(lines).concat([
      '',
      'В конце назови три главные ошибки и для каждой напиши, какой фразой её заменить в следующий раз.',
      'Не хвали без причины. Если пункта нет в тексте, так и скажи.',
      '',
      'Расшифровка встречи:'
    ]).join('\n');
  }

  C.sales = { numbers: numbers, reviews: reviews, score: score, addReview: addReview, weakest: weakest, prompt: prompt };
})((window.CRM = window.CRM || {}));
