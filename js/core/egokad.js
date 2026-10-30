(function (C) {
  'use strict';

  var U = C.utils;
  var K = C.cases;
  var D = C.data;

  var KIND_NAMES = { direct: 'Директ', landing: 'Посадочная', crm: 'CRM', chat: 'Заявки в чате', ad: 'Объявления' };
  var CAPITALS = ['москва', 'санкт-петербург'];

  var cache = null;

  function list() {
    return D.egokad || [];
  }

  // Город к одному виду: «СПб», «питер», «Санкт-Петербург» дают одно и то же
  function geoKey(s) {
    var g = String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/^г\.?\s+/, '').trim();
    if (!g) return '';
    if (/^(спб|питер|санкт|петербург|с-пб)/.test(g)) return 'санкт-петербург';
    if (/^(мск|москв)/.test(g)) return 'москва';
    if (/^(крд|краснодар)/.test(g)) return 'краснодар';
    if (/^(нн|нижн)/.test(g)) return 'нижний новгород';
    return g.replace(/\s*\(.*$/, '').trim();
  }

  function isCapital(key) {
    return CAPITALS.indexOf(key) >= 0;
  }

  function sameCity(a, b) {
    return !!a && !!b && (a === b || a.indexOf(b + ' ') === 0 || b.indexOf(a + ' ') === 0);
  }

  function range(p) {
    var f = U.fmtMoney(p.from).replace(' ₽', '');
    if (p.to && p.to !== p.from) return f + '-' + U.fmtMoney(p.to);
    return f + ' ₽';
  }

  function label(p) {
    return p.geo + ': ' + range(p);
  }

  function round10(n) { return Math.round(n / 10) * 10; }

  function mid(p) { return (p.from + p.to) / 2; }

  // Цена одной ниши для города. Возвращает { how, items } или null, если цен нет.
  // how: city (цена этого города), regions (цена «по регионам»), rf (по РФ), avg (средняя),
  // one/all (город не указан), approx (по другим городам, для этого данных нет)
  function pick(rec, city) {
    var prices = rec.prices || [];
    if (!prices.length) return null;
    var key = geoKey(city);
    var plain = prices.filter(function (p) { return !p.exception; });
    function kind(k) { return prices.filter(function (p) { return p.kind === k; }); }

    if (key) {
      var exact = prices.filter(function (p) { return p.kind === 'city' && sameCity(geoKey(p.geo), key); });
      if (exact.length) return { how: 'city', items: exact };
      if (!isCapital(key)) {
        var reg = kind('regions');
        if (reg.length) return { how: 'regions', items: reg };
      }
      var wide = kind('rf').concat(kind('avg'));
      if (wide.length) return { how: wide[0].kind, items: wide };
      return { how: 'approx', items: plain.length ? plain : prices };
    }
    var base = plain.length ? plain : prices;
    return { how: base.length === 1 ? 'one' : 'all', items: base };
  }

  function summarize(items) {
    var lows = items.map(function (p) { return p.from; });
    var highs = items.map(function (p) { return p.to; });
    var mids = items.map(mid);
    var avg = mids.reduce(function (a, b) { return a + b; }, 0) / mids.length;
    return { low: Math.min.apply(null, lows), high: Math.max.apply(null, highs), value: round10(avg) };
  }

  // Оценка стоимости заявки по нише клиента и городу: только данные EGOKAD или шаблона КП.
  function estimate(niche, city) {
    var out = {
      known: false, approx: false, ambiguous: false, noStats: false, matched: [], names: [],
      value: 0, low: C.cpl.KP_RANGE.low, high: C.cpl.KP_RANGE.high, how: '', items: [], city: String(city || '').trim()
    };
    var found = K.rank(niche, list());
    out.matched = found;
    out.names = found.map(function (r) { return r.niche; });
    if (!found.length) return out;
    if (found.length > 4) { out.ambiguous = true; return out; }
    var priced = found.filter(function (r) { return r.prices && r.prices.length; });
    if (!priced.length) { out.noStats = true; return out; }
    var picks = priced.map(function (r) { return pick(r, city); });
    var rank = { city: 0, regions: 1, rf: 2, avg: 2, one: 3, all: 3, approx: 4 };
    var items = [];
    picks.forEach(function (p) { items = items.concat(p.items); });
    var sum = summarize(items);
    out.known = true;
    out.how = picks.map(function (p) { return p.how; }).sort(function (a, b) { return rank[b] - rank[a]; })[0];
    out.approx = out.how === 'approx';
    out.items = items;
    out.value = sum.value;
    out.low = sum.low;
    out.high = sum.high;
    out.names = priced.map(function (r) { return r.niche; });
    return out;
  }

  // Пояснение для экрана: откуда цифра и насколько она точна
  function describe(est, niche, city) {
    var name = est.names.length ? '«' + est.names.join('», «') + '»' : '«' + (niche || 'без ниши') + '»';
    var kp = 'По шаблону КП спринта цена целевой заявки ' + C.cpl.KP_RANGE.low + '-' + C.cpl.KP_RANGE.high + ' ₽ и зависит от города.';
    if (!String(niche || '').trim()) return 'Укажи нишу клиента, и здесь появится цена заявки из данных EGOKAD. ' + kp;
    if (est.ambiguous) return 'Ниша «' + niche + '» подходит сразу к нескольким нишам EGOKAD (' + est.names.slice(0, 4).join(', ') + ' и другие). Уточни нишу, например выбери из подсказок.';
    if (!est.matched.length) return 'Ниши «' + niche + '» нет в данных EGOKAD. ' + kp + ' Подставь свою цифру из запуска.';
    if (est.noStats) return 'По нише ' + name + ' у EGOKAD цена заявки пока не набрана. ' + kp + ' Подставь свою цифру из запуска.';
    var prices = est.items.map(label).join('; ');
    var tail = ' Данные EGOKAD, цена за заявку с НДС.';
    if (est.how === 'city') return 'Ниша ' + name + ', город «' + city + '»: ' + prices + '.' + tail;
    if (est.how === 'regions') return 'Ниша ' + name + ', по городу «' + city + '» отдельной цены нет, берём «' + est.items[0].geo.toLowerCase() + '»: ' + prices + '.' + tail;
    if (est.how === 'rf' || est.how === 'avg') return 'Ниша ' + name + ': ' + prices + ' (одна цена для всех городов).' + tail;
    if (est.how === 'approx') return 'Ниша ' + name + ': по городу «' + city + '» данных нет. Ориентир по другим гео: ' + prices + '. Это не цена твоего города, уточни по запуску.' + tail;
    return 'Ниша ' + name + ': ' + prices + '.' + (est.how === 'all' ? ' Город не указан, укажи его, и цена уточнится.' : '') + tail;
  }

  // ---------- Кейсы ----------
  function firstShot(rec, kind) {
    var s = (rec.shots || []).filter(function (x) { return !kind || x.kind === kind; })[0];
    return s ? s.file : '';
  }

  function resultText(rec) {
    if (rec.prices && rec.prices.length) return 'Цена заявки по связке (с НДС): ' + rec.prices.map(label).join('; ') + '.';
    return 'Цена заявки по этой связке у EGOKAD пока не набрана.';
  }

  function toCase(rec) {
    var geos = [];
    (rec.prices || []).forEach(function (p) { if (p.kind === 'city' && geos.indexOf(p.geo) < 0) geos.push(p.geo); });
    return {
      id: rec.id, egokad: true, no: rec.no, group: rec.group || '', niche: rec.niche, keys: rec.keys || [], type: 'Кейс EGOKAD',
      title: rec.niche,
      city: geos.join(', '), period: rec.date ? 'связка с ' + rec.date : '', spend: 0, leads: 0,
      result: resultText(rec),
      source: 'EGOKAD, навигация по нишам', link: (rec.landings || []).join(' '),
      screen: firstShot(rec, 'direct') || firstShot(rec, ''), shots: rec.shots || [], prices: rec.prices || [], noStats: !!rec.noStats, mine: false
    };
  }

  // 0: ниша фокуса (газобетон), 1: соседние ниши (дома), 2: остальные
  function focusRank(c) {
    var f = D.focus;
    if (!f) return 2;
    if (f.primary.indexOf(c.niche) >= 0) return 0;
    if (f.related.indexOf(c.niche) >= 0) return 1;
    return 2;
  }

  // Все кейсы EGOKAD: сначала фокус (газобетон и дома), затем ниши со скрином Директа, потом с ценой, потом остальные
  function cases() {
    if (cache && cache.src === D.egokad) return cache.list;
    var all = list().map(toCase);
    all.forEach(function (c) { c.focus = focusRank(c); });
    var weight = function (c) { return focusRank(c) * 100 + (c.screen ? 0 : c.shots.length ? 1 : 2) * 10 + (c.prices.length ? 0 : 5); };
    all = all.map(function (c, i) { return { c: c, i: i }; })
      .sort(function (a, b) { return weight(a.c) - weight(b.c) || a.i - b.i; })
      .map(function (x) { return x.c; });
    cache = { src: D.egokad, list: all };
    return all;
  }

  // Подписи видов скринов для карточки
  function kindName(kind) {
    return KIND_NAMES[kind] || 'Скрин';
  }

  // Города из данных EGOKAD по числу ниш, для подсказок в поле «Город»
  function cities() {
    var count = {};
    list().forEach(function (r) {
      (r.prices || []).forEach(function (p) {
        if (p.kind === 'city') count[p.geo] = (count[p.geo] || 0) + 1;
      });
    });
    return Object.keys(count).map(function (name) { return { name: name, count: count[name] }; })
      .sort(function (a, b) { return b.count - a.count || (a.name < b.name ? -1 : 1); });
  }

  // Ниши по группам для выпадающего списка
  function groups() {
    var out = [];
    var index = {};
    list().forEach(function (r) {
      var g = r.group || 'Другое';
      if (!index[g]) { index[g] = { name: g, niches: [] }; out.push(index[g]); }
      index[g].niches.push(r.niche);
    });
    return out;
  }

  // Название ниши из списка для произвольного текста клиента: одно совпадение или пусто
  function match(text) {
    var found = K.rank(text, list());
    return found.length === 1 ? found[0].niche : '';
  }

  C.egokad = { focusRank: focusRank, cities: cities, groups: groups, match: match, geoKey: geoKey, pick: pick, estimate: estimate, describe: describe, cases: cases, kindName: kindName, label: label, range: range };
})((window.CRM = window.CRM || {}));
