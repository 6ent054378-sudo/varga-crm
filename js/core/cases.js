(function (C) {
  'use strict';

  var U = C.utils;

  // Слова, которые есть почти в каждой нише и не годятся для подбора кейсов
  var GENERIC = ['отдел', 'строи', 'ремон', 'прода', 'устан', 'произ', 'услуг', 'монта', 'заказ', 'ключ', 'под', 'опто', 'изгот', 'обору'];

  // Группы ниш для фильтра. Первое совпавшее слово определяет группу.
  var CATEGORIES = [
    { id: 'Балконы', words: ['балкон', 'лоджи'] },
    { id: 'Бани и бочки', words: ['бани', 'бань', 'баню', 'бочк', 'саун', 'бытов'] },
    { id: 'Туризм, досуг, обучение', words: ['школ', 'туристич', 'турагент', 'туры ', 'экскурс', 'теплоход', 'яхт', 'санатор', 'праздник', 'батут', 'лагер', 'вокал', 'sup-', 'скорочт', 'обучен', 'вебинар', 'бронирован', 'дубае'] },
    { id: 'Медицина и красота', words: ['стомат', 'зубн', 'клиник', 'косметолог', 'импланты', 'барбер', 'ортопед', 'психолог', 'таролог'] },
    { id: 'Юристы, финансы, недвижимость', words: ['бфл', 'банкрот', 'юридич', 'ликвидац', 'наследств', 'тендер', 'торговых знак', 'бухгалтер', 'кредит', 'брокет', 'кредитный', 'новостро', 'арендный'] },
    { id: 'Ремонт и услуги', words: ['ремонт квартир', 'потолк', 'паркет', 'штукатур', 'реставрац', 'двери', 'дизайн интерьер', 'клининг', 'мойка', 'дезинс', 'освещени', 'перегород'] },
    { id: 'Кухни и мебель', words: ['кухн', 'мебел', 'шкаф', 'диван', 'матрас', 'кресл', 'кресе', 'слэб'] },
    { id: 'Авто', words: ['автосерв', 'автоподб', 'автопрок', 'автокред', 'автоакс', 'детейлинг', 'вмятин', 'катализатор', 'квадроцикл', 'сани', 'двигател', 'осаго'] },
    { id: 'Дома и строительство', words: ['дом', 'строител', 'каркас', 'кирпич', 'фундамент', 'коттедж', 'кровл', 'сайдинг', 'пруд', 'бассейн', 'навес', 'быстровозв', 'септик', 'водоснаб', 'водоотв', 'скважин', 'отоплен', 'инженер', 'пеллет', 'вентиляц', 'кондиционер', 'электрик', 'заборы', 'ворота', 'рольстав', 'пиломатер', 'стройматер', 'лестниц', 'срубы', 'ландшафт', 'труб', 'арматур', 'сварочн', 'резинов', 'катков', 'очистк', 'видеонаблюд'] },
    { id: 'Маркетинг', words: ['маркетинг', 'таргет', 'привлечение клиентов'] }
  ];
  var OTHER = 'Товары и производство';

  // Группы кейсов EGOKAD задаются при импорте (поле group)
  var EGOKAD_GROUPS = ['Авто', 'Дома и бани', 'Участок и улица', 'Окна и балконы', 'Кровля, фасады, инженерные системы', 'Ремонт и отделка', 'Кухни и мебель', 'Медицина', 'Услуги и документы'];

  function category(c) {
    if (c.group) return c.group;
    var n = String(c.niche || '').toLowerCase();
    for (var i = 0; i < CATEGORIES.length; i++) {
      for (var j = 0; j < CATEGORIES[i].words.length; j++) {
        if (n.indexOf(CATEGORIES[i].words[j]) >= 0) return CATEGORIES[i].id;
      }
    }
    return OTHER;
  }

  function categories() {
    return EGOKAD_GROUPS.concat(CATEGORIES.map(function (c) { return c.id; })).concat([OTHER]);
  }

  // Стоимость заявки: из расхода и числа заявок
  function cpl(c) {
    var spend = Number(c.spend) || 0;
    var leads = Number(c.leads) || 0;
    return spend > 0 && leads > 0 ? Math.round(spend / leads) : 0;
  }

  // Корни слов из названия ниши без общих слов вроде «ремонт» и «строительство»
  function keysFromNiche(niche) {
    var words = String(niche || '').toLowerCase().split(/[^a-zа-яё0-9]+/).filter(function (w) { return w.length >= 4; })
      .map(function (w) { return w.slice(0, 5); });
    var specific = words.filter(function (w) { return GENERIC.indexOf(w) < 0; });
    return specific.length ? specific : words;
  }

  function keysOf(c) {
    return c.keys && c.keys.length ? c.keys : keysFromNiche(c.niche);
  }

  // ---------- Подбор по словам: для ниш EGOKAD ----------
  var STOP = ['ремон', 'строи', 'монта', 'устан', 'услуг', 'тольк', 'для', 'под', 'при', 'над', 'без', 'ключ'];

  function norm(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е');
  }

  function words(s) {
    var seen = {};
    return norm(s).split(/[^a-zа-я0-9]+/).filter(function (w) {
      if (w.length < 3 || seen[w]) return false;
      for (var i = 0; i < STOP.length; i++) if (w.indexOf(STOP[i]) === 0) return false;
      seen[w] = true;
      return true;
    });
  }

  // Слова совпадают, если у них общее начало: «балконы» и «балконов», «дом» и «дома»
  function same(a, b) {
    var n = Math.max(3, Math.min(5, Math.min(a.length, b.length) - 1));
    return a.slice(0, n) === b.slice(0, n);
  }

  // Ниши списка, подходящие под текст клиента. Полное совпадение названия побеждает; иначе берутся
  // ниши с наибольшим числом общих слов и достаточным покрытием своего названия.
  function rank(text, list) {
    var q = words(text);
    if (!q.length) return [];
    var full = norm(text).replace(/[^a-zа-я0-9]+/g, ' ').trim();
    var exact = list.filter(function (c) { return norm(c.niche).replace(/[^a-zа-я0-9]+/g, ' ').trim() === full; });
    if (exact.length) return exact;
    var scored = [];
    list.forEach(function (c) {
      var w = words(c.niche);
      if (!w.length) return;
      var m = q.filter(function (a) { return w.some(function (b) { return same(a, b); }); }).length;
      if (!m) return;
      var inQ = w.filter(function (b) { return q.some(function (a) { return same(a, b); }); }).length;
      scored.push({ c: c, m: m, cov: inQ / w.length });
    });
    if (!scored.length) return [];
    var top = Math.max.apply(null, scored.map(function (s) { return s.m; }));
    var best = scored.filter(function (s) { return s.m === top; });
    var topCov = Math.max.apply(null, best.map(function (s) { return s.cov; }));
    return best.filter(function (s) { return s.cov >= topCov * 0.5; })
      .sort(function (a, b) { return b.cov - a.cov; })
      .map(function (s) { return s.c; });
  }

  // Кейсы, подходящие под нишу клиента. Кейсы EGOKAD подбираются по словам, остальные по ключам.
  function matchFor(niche, list) {
    var n = String(niche || '').toLowerCase();
    if (!n.trim()) return [];
    var eg = list.filter(function (c) { return c.egokad; });
    var found = eg.length ? rank(niche, eg) : [];
    var rest = list.filter(function (c) {
      return !c.egokad && keysOf(c).some(function (k) { return k && n.indexOf(k) >= 0; });
    });
    return found.concat(rest);
  }

  // Поиск по названию, результату, автору и ссылкам
  function search(list, query) {
    var q = String(query || '').toLowerCase().trim();
    if (!q) return list;
    return list.filter(function (c) {
      return [c.niche, c.title, c.result, c.author, c.city].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }

  function niches(list) {
    var seen = {};
    var out = [];
    list.forEach(function (c) {
      if (!seen[c.niche]) { seen[c.niche] = true; out.push(c.niche); }
    });
    return out;
  }

  // Ссылки кейса: в одном поле их может быть несколько
  function links(c) {
    var found = String(c.link || '').match(/https?:\/\/[^\s]+/g) || [];
    return found;
  }

  // Число заявок из заголовка статьи в ссылке: «...-62-zayavki», «...-100-200-lidov». Это не проверенные данные.
  function hints(c) {
    var list = links(c);
    for (var i = 0; i < list.length; i++) {
      var m = list[i].toLowerCase().match(/(?:^|[\/@_-])(\d{2,4})(?:-(\d{2,4}))?-(?:zayavok|zayavki|zayavka|zayavk|zayavo|lidov|lidy|lid|leads)/);
      if (!m) continue;
      var from = Number(m[1]);
      var to = m[2] ? Number(m[2]) : 0;
      if (!to && from >= 1900 && from <= 2100) continue;
      if (to && to <= from) continue;
      return { from: from, to: to, label: to ? from + '-' + to : String(from) };
    }
    return null;
  }

  // Текст, который можно скопировать и отправить клиенту
  function text(c) {
    var parts = [c.title + '.'];
    if (c.result) parts.push(c.result);
    var price = cpl(c);
    if (price && String(c.result || '').indexOf('₽') < 0) parts.push('Стоимость заявки около ' + U.fmtMoney(price) + '.');
    var hint = hints(c);
    if (hint && !price && !Number(c.leads)) parts.push('По заголовку материала: ' + hint.label + ' заявок.');
    var l = links(c);
    if (l.length) parts.push('Подробнее: ' + l.join(' '));
    else if (c.link) parts.push('Материал: ' + c.link);
    return parts.join(' ');
  }

  C.cases = {
    cpl: cpl, matchFor: matchFor, niches: niches, text: text, keysFromNiche: keysFromNiche,
    category: category, categories: categories, search: search, links: links, hints: hints, rank: rank
  };
})((window.CRM = window.CRM || {}));
