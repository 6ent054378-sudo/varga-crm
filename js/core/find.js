(function (C) {
  'use strict';

  var D = C.data;

  var SCREENS = [
    { title: 'Сегодня', hash: '#today', words: 'сегодня задачи главная' },
    { title: 'Доска', hash: '#board', words: 'доска воронка лиды канбан' },
    { title: 'Разговоры', hash: '#calls', words: 'разговоры запись звонок встреча расшифровка' },
    { title: 'Шаблоны сообщений', hash: '#templates', words: 'шаблоны сообщения написать дожим перенос' },
    { title: 'Калькулятор', hash: '#calc', words: 'калькулятор цена бюджет окупаемость' },
    { title: 'Генератор КП', hash: '#kp', words: 'кп коммерческое предложение генератор' },
    { title: 'Презентатор', hash: '#present', words: 'презентатор показ экран кп' },
    { title: 'Деньги', hash: '#money', words: 'деньги оплаты доход расходы' },
    { title: 'Итоги и недельный отчёт', hash: '#metrics', words: 'итоги отчёт неделя метрики воронка конверсия' },
    { title: 'Тренажёр', hash: '#trainer', words: 'тренажёр тренировка роль' },
    { title: 'Эфир №3', hash: '#sales', words: 'эфир продажи шпаргалка' },
    { title: 'Путь клиента', hash: '#roadmap', words: 'путь клиента роудмап этапы' },
    { title: 'Чек-лист', hash: '#journey', words: 'чек-лист путь' },
    { title: 'Библиотека', hash: '#library', words: 'библиотека возражения материалы' }
  ];

  function digits(s) {
    return String(s || '').replace(/\D/g, '');
  }

  function norm(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е');
  }

  // Лиды, у которых каждое слово запроса встречается в имени, телефоне, контакте, нише, городе или заметке
  function leads(query, list, limit) {
    var q = norm(query).trim();
    if (!q) return [];
    var words = q.split(/\s+/);
    var out = [];
    (list || []).forEach(function (l) {
      var hay = norm([l.name, l.contact, l.niche, l.city, l.source, l.notes].join(' ')) + ' ' + digits(l.phone);
      var ok = words.every(function (w) {
        if (hay.indexOf(w) >= 0) return true;
        var d = digits(w);
        return d.length >= 3 && digits(l.phone).indexOf(d) >= 0;
      });
      if (!ok) return;
      var starts = norm(l.name).indexOf(words[0]) === 0 ? 0 : 1;
      var live = l.stage === 'won' || l.stage === 'lost' ? 1 : 0;
      out.push({ lead: l, rank: live * 10 + starts });
    });
    out.sort(function (a, b) { return a.rank - b.rank || (a.lead.createdAt < b.lead.createdAt ? 1 : -1); });
    return out.slice(0, limit || 8).map(function (x) { return x.lead; });
  }

  function screens(query) {
    var q = norm(query).trim();
    if (!q) return [];
    return SCREENS.filter(function (s) { return norm(s.title + ' ' + s.words).indexOf(q) >= 0; }).slice(0, 4);
  }

  C.find = { leads: leads, screens: screens, SCREENS: SCREENS };
})((window.CRM = window.CRM || {}));
