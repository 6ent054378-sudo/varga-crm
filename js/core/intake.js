(function (C) {
  'use strict';

  var U = C.utils;
  var store = C.store;

  var KEY = 'marketing_crm_intake_v1';
  var SOURCE = 'Директ (пулька)';
  var NICHE = 'Дома из газобетона';
  var LANDING_SITE = 'varga-digital';
  var LANDING_SOURCE = 'Лендинг Varga Digital';
  var timer = null;

  var SALES_MAP = {
    'Отдел продаж 2+ менеджера': 'Есть менеджер / отдел продаж',
    'Один менеджер': 'Есть менеджер / отдел продаж',
    'Отдел продаж': 'Есть менеджер / отдел продаж',
    'Я сам': 'Сам собственник, готов заниматься только заявками',
    'Никто специально': 'Никого нет'
  };

  var memory = null;

  function blank() {
    return { url: '', key: '', seen: [], since: '', lastAt: '', lastError: '' };
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      url: String(raw.url || ''),
      key: String(raw.key || ''),
      seen: Array.isArray(raw.seen) ? raw.seen : [],
      since: String(raw.since || ''),
      lastAt: String(raw.lastAt || ''),
      lastError: String(raw.lastError || '')
    };
  }

  // Адрес и ключ хранятся отдельно от клиентов, в резервную копию не попадают.
  // Если браузер не даёт localStorage, держим их в памяти до закрытия вкладки.
  function readSettings() {
    var saved = null;
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) saved = normalize(JSON.parse(raw));
    } catch (e) { /* хранилища нет, берём из памяти */ }
    var srv = window.INTAKE_CONFIG;
    if (srv && srv.url && srv.key && (!saved || !saved.url || !saved.key)) return normalize(srv);
    if (saved) return saved;
    return memory ? normalize(memory) : blank();
  }

  function writeSettings(s) {
    memory = s;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(s));
      return true;
    } catch (e) {
      return false;
    }
  }

  function configured() {
    var s = readSettings();
    return !!(s.url && s.key);
  }

  function cleanUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '').replace(/\/leads$/, '');
  }

  function save(url, key) {
    var s = readSettings();
    s.url = cleanUrl(url);
    s.key = String(key || '').trim();
    s.lastError = '';
    writeSettings(s);
    return true;
  }

  // Город берём из «Компания и город»: последняя часть после запятой
  function cityOf(company) {
    var parts = String(company || '').split(/[,;]|\s[—–-]\s/).map(function (p) { return p.trim(); }).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }

  function utmText(rec) {
    var utm = rec.utm || {};
    return Object.keys(utm).filter(function (k) { return utm[k]; }).map(function (k) { return k + '=' + utm[k]; }).join(', ');
  }

  // Заявка с лендинга агентства (site = varga-digital): ниша берётся из ответа «сфера», сайт-источник виден в метке from
  function toLandingLead(rec, nowDate) {
    var a = rec.answers || {};
    var lines = ['Заявка с лендинга Varga Digital (' + (rec.at ? U.fmtDateTime(rec.at) : '') + ')'];
    if (a.niche) lines.push('Ниша из калькулятора: ' + a.niche + (a.cplRef ? ' (ориентир заявки ' + a.cplRef + ')' : ''));
    if (a.sphere) lines.push('Сфера: ' + a.sphere);
    if (a.check) lines.push('Средний чек: ' + a.check);
    if (a.now) lines.push('Сейчас: ' + a.now);
    if (a.sales) lines.push('Заявки обрабатывает: ' + a.sales);
    if (a.need) lines.push('Что нужно: ' + a.need);
    if (a.budget) lines.push('Рекламный бюджет: ' + a.budget);
    if (rec.tariff) lines.push('Тариф по расчёту лендинга: ' + rec.tariff);
    var utm = utmText(rec);
    if (utm) lines.push('Метки: ' + utm);
    var data = { ext_id: rec.id };
    if (a.check) data.a_cheque = a.check + ' (ответ в квизе)';
    if (SALES_MAP[a.sales]) data.q_sales = SALES_MAP[a.sales];
    return {
      name: rec.name || '',
      phone: rec.phone || '',
      contact: rec.channel || '',
      niche: a.niche || a.sphere || '',
      city: '',
      source: LANDING_SOURCE,
      notes: lines.join('\n'),
      nextAt: U.toLocalInput(nowDate || new Date()),
      nextNote: 'Написать или позвонить сразу, заявка с лендинга',
      data: data
    };
  }

  // В новой пульке имени нет: подписываем заявку последними цифрами телефона, имя вносится после звонка
  function fallbackName(phone) {
    var d = String(phone || '').replace(/\D/g, '');
    return 'Заявка с пульки' + (d.length >= 4 ? ' ' + d.slice(-4) : '');
  }

  // Заявка воркера -> поля нового лида
  function toLead(rec, nowDate) {
    if (rec.site === LANDING_SITE) return toLandingLead(rec, nowDate);
    var a = rec.answers || {};
    var lines = ['Заявка с пульки (' + (rec.at ? U.fmtDateTime(rec.at) : '') + ')'];
    if (rec.channel) lines.push('Удобный способ связи: ' + rec.channel);
    if (rec.company) lines.push('Компания и город: ' + rec.company);
    // Новая пулька (4 вопроса, ветка про рекламу)
    if (a.capacity) lines.push('Готовы строить домов в год: ' + a.capacity);
    if (a.current) lines.push('Строят сейчас домов в год: ' + a.current);
    if (a.ads) lines.push('Реклама раньше: ' + a.ads);
    if (a.adsWhere) lines.push('Где запускали: ' + a.adsWhere);
    if (a.adsBudget) lines.push('Бюджет на рекламу в месяц: ' + a.adsBudget);
    // Прежняя пулька
    if (a.volume) lines.push('Домов в год: ' + a.volume);
    if (a.check) lines.push('Чек дома: ' + a.check);
    if (a.sales) lines.push('Заявки обрабатывает: ' + a.sales);
    if (a.cities) lines.push('Городов: ' + a.cities);
    if (a.budget) lines.push('Рекламный бюджет: ' + a.budget);
    if (rec.tariff) lines.push('Тариф по расчёту пульки: ' + rec.tariff);
    if (rec.estimate && rec.estimate.contracts) lines.push('Расчёт пульки: ' + rec.estimate.contracts + ' договоров в месяц');
    var utm = utmText(rec);
    if (utm) lines.push('Метки: ' + utm);

    var data = { ext_id: rec.id };
    if (a.current) data.a_load = a.current + ' домов в год (ответ в квизе)';
    else if (a.volume) data.a_load = a.volume + ' домов в год (ответ в квизе)';
    if (a.check) data.a_cheque = a.check + ' (ответ в квизе)';
    if (SALES_MAP[a.sales]) data.q_sales = SALES_MAP[a.sales];

    return {
      name: rec.name || fallbackName(rec.phone),
      phone: rec.phone || '',
      contact: rec.channel || '',
      niche: NICHE,
      city: cityOf(rec.company),
      source: SOURCE,
      notes: lines.join('\n'),
      nextAt: U.toLocalInput(nowDate || new Date()),
      nextNote: 'Позвонить сразу, заявка с пульки',
      data: data
    };
  }

  function knownIds() {
    var ids = {};
    store.leads().forEach(function (l) { if (l.data && l.data.ext_id) ids[l.data.ext_id] = true; });
    readSettings().seen.forEach(function (id) { ids[id] = true; });
    return ids;
  }

  // Добавляет новые заявки, уже добавленные пропускает. Возвращает число добавленных.
  function apply(list) {
    var ids = knownIds();
    var s = readSettings();
    var added = 0;
    (list || []).slice().sort(function (a, b) { return String(a.at) < String(b.at) ? -1 : 1; }).forEach(function (rec) {
      if (!rec || !rec.id || ids[rec.id]) return;
      store.add(toLead(rec));
      ids[rec.id] = true;
      s.seen.push(rec.id);
      if (String(rec.at) > s.since) s.since = String(rec.at);
      added += 1;
    });
    s.seen = s.seen.slice(-500);
    writeSettings(s);
    return added;
  }

  // Забор заявок с воркера. Промис: {ok, added, error}
  function sync() {
    var s = readSettings();
    if (!s.url || !s.key) return Promise.resolve({ ok: false, added: 0, error: 'Не заданы адрес и ключ' });
    var sinceMs = s.since ? Date.parse(s.since) : 0;
    var url = s.url + '/leads' + (sinceMs ? '?since=' + encodeURIComponent(new Date(sinceMs - 15 * 60 * 1000).toISOString()) : '');
    return window.fetch(url, { headers: { Authorization: 'Bearer ' + s.key } })
      .then(function (r) {
        if (r.status === 403) throw new Error('Ключ не подошёл');
        if (!r.ok) throw new Error('Воркер ответил ' + r.status);
        return r.json();
      })
      .then(function (body) {
        var added = apply(body && body.leads);
        var cur = readSettings();
        cur.lastAt = U.nowIso();
        cur.lastError = '';
        writeSettings(cur);
        return { ok: true, added: added, error: '' };
      })
      .catch(function (e) {
        var cur = readSettings();
        cur.lastError = e && e.message ? e.message : 'Нет связи';
        writeSettings(cur);
        return { ok: false, added: 0, error: cur.lastError };
      });
  }

  // Автозабор: сразу и затем раз в минуту. onAdded вызывается, когда пришли новые заявки.
  function start(onAdded, everyMs) {
    stop();
    if (!configured()) return;
    function tick() {
      sync().then(function (res) { if (res.added && onAdded) onAdded(res); });
    }
    tick();
    timer = window.setInterval(tick, everyMs || 60000);
  }

  function stop() {
    if (timer) window.clearInterval(timer);
    timer = null;
  }

  C.intake = {
    SOURCE: SOURCE, LANDING_SOURCE: LANDING_SOURCE, NICHE: NICHE, settings: readSettings, save: save, configured: configured,
    toLead: toLead, cityOf: cityOf, apply: apply, sync: sync, start: start, stop: stop
  };
})((window.CRM = window.CRM || {}));
