(function (C) {
  'use strict';

  var U = C.utils;
  var D = C.data;

  var state = { version: 1, leads: [], tariffs: null, journey: { track: 'new', done: {} }, cases: null, money: { entries: [], goal: 0 }, trainer: null, cplFactors: null, calls: [], templates: [] };
  var listeners = [];

  function persist() {
    C.storage.save(state);
    if (C.sync && C.sync.onPersist) C.sync.onPersist(state);
  }

  function emit() {
    listeners.forEach(function (fn) { fn(); });
  }

  function findIndex(id) {
    for (var i = 0; i < state.leads.length; i++) {
      if (state.leads[i].id === id) return i;
    }
    return -1;
  }

  function log(lead, type, text) {
    lead.history.unshift({ at: U.nowIso(), type: type, text: text });
    if (lead.history.length > 200) lead.history.length = 200;
  }

  // Старые этапы слиты в «Встречу»: переносим отметки чек-листа и даты достижения
  var LEGACY_PREFIX = { booked: 'b_', diag: 'd_', kp: 'k_', close: 'x_' };

  function migrateStages(lead) {
    var legacy = Object.keys(LEGACY_PREFIX);
    var checks = lead.checks || {};
    legacy.forEach(function (id) {
      if (!checks[id]) return;
      checks.meet = checks.meet || {};
      Object.keys(checks[id]).forEach(function (k) {
        var m = /^c(\d+)$/.exec(k);
        if (m && checks[id][k]) checks.meet[LEGACY_PREFIX[id] + m[1]] = true;
      });
      delete checks[id];
    });
    var reached = lead.reached || {};
    var times = [];
    legacy.forEach(function (id) {
      if (reached[id]) { times.push(reached[id]); delete reached[id]; }
    });
    if (times.length && !reached.meet) reached.meet = times.sort()[0];
    lead.checks = checks;
    lead.reached = reached;
    return times.length > 0;
  }

  function normalizeLead(raw) {
    var lead = raw || {};
    var rawStage = lead.stage;
    var had = lead.reached ? Object.keys(lead.reached) : [];
    var wasHeld = had.indexOf('diag') >= 0 || had.indexOf('kp') >= 0 || had.indexOf('close') >= 0;
    var wasBooked = had.indexOf('booked') >= 0;
    lead.data = lead.data || {};
    if (migrateStages(lead)) {
      if (!lead.data.m_held) lead.data.m_held = wasHeld ? 'Состоялась' : wasBooked ? 'Назначена' : '';
    }
    lead.stage = D.resolveStage(lead.stage);
    if (D.legacyStage[rawStage] && !lead.data.m_held) lead.data.m_held = rawStage === 'booked' ? 'Назначена' : 'Состоялась';
    lead.id = lead.id || U.uid();
    lead.name = lead.name || '';
    lead.phone = lead.phone || '';
    lead.contact = lead.contact || '';
    lead.niche = lead.niche || '';
    lead.city = lead.city || '';
    lead.source = lead.source || '';
    lead.stage = D.stageById(lead.stage) ? lead.stage : 'new';
    lead.createdAt = lead.createdAt || U.nowIso();
    lead.stageAt = lead.stageAt || lead.createdAt;
    lead.nextAt = lead.nextAt || '';
    lead.nextNote = lead.nextNote || '';
    lead.checks = lead.checks || {};
    lead.notes = lead.notes || '';
    lead.history = Array.isArray(lead.history) ? lead.history : [];
    lead.reached = lead.reached || {};
    if (!lead.reached[lead.stage]) lead.reached[lead.stage] = lead.stageAt;
    return lead;
  }

  function normalizeJourney(j) {
    j = j || {};
    return { track: j.track === 'exp' ? 'exp' : 'new', done: j.done && typeof j.done === 'object' ? j.done : {} };
  }

  function normalizeMoney(m) {
    m = m || {};
    return { entries: Array.isArray(m.entries) ? m.entries : [], goal: Number(m.goal) || 0 };
  }

  // Коэффициенты стоимости заявки по уровню города: по умолчанию без поправки
  function normalizeCplFactors(f) {
    f = f || {};
    var out = {};
    ['capital', 'million', 'other'].forEach(function (k) {
      var v = Number(f[k]);
      out[k] = v > 0 && v < 20 ? v : 1;
    });
    return out;
  }

  // Разговоры: расшифровка и разбор. Звук не хранится, только текст.
  function normalizeCalls(list) {
    return (Array.isArray(list) ? list : []).filter(function (c) { return c && c.id; }).slice(0, 300);
  }

  // Свои шаблоны сообщений: название и текст
  function normalizeTemplates(list) {
    return (Array.isArray(list) ? list : []).filter(function (t) { return t && t.id && t.text; }).map(function (t) {
      return { id: String(t.id), title: String(t.title || 'Без названия').slice(0, 80), text: String(t.text).slice(0, 2000) };
    }).slice(0, 100);
  }

  function normalizeTrainer(t) {
    t = t || {};
    return {
      xp: Number(t.xp) || 0,
      rounds: Array.isArray(t.rounds) ? t.rounds.slice(0, 100) : [],
      badges: t.badges && typeof t.badges === 'object' ? t.badges : {},
      days: t.days && typeof t.days === 'object' ? t.days : {},
      counts: t.counts && typeof t.counts === 'object' ? t.counts : {},
      daily: t.daily && typeof t.daily === 'object' ? t.daily : {},
      voiceOut: t.voiceOut !== false,
      voiceName: typeof t.voiceName === 'string' ? t.voiceName : ''
    };
  }

  var store = {
    init: function () {
      var saved = C.storage.load();
      if (saved && Array.isArray(saved.leads)) {
        state = saved;
        state.leads = state.leads.map(normalizeLead);
        state.journey = normalizeJourney(state.journey);
        state.money = normalizeMoney(state.money);
        state.trainer = normalizeTrainer(state.trainer);
        state.cplFactors = normalizeCplFactors(state.cplFactors);
        state.calls = normalizeCalls(state.calls);
        state.templates = normalizeTemplates(state.templates);
      }
    },

    subscribe: function (fn) {
      listeners.push(fn);
    },

    snapshot: function () {
      return state;
    },

    replaceAll: function (next) {
      state = {
        version: 1,
        leads: (next.leads || []).map(normalizeLead),
        tariffs: next.tariffs || null,
        journey: normalizeJourney(next.journey),
        cases: Array.isArray(next.cases) ? next.cases : null,
        money: normalizeMoney(next.money),
        trainer: normalizeTrainer(next.trainer),
        cplFactors: normalizeCplFactors(next.cplFactors),
        calls: normalizeCalls(next.calls),
        templates: normalizeTemplates(next.templates)
      };
      persist();
      emit();
    },

    // Данные пришли с сервера: ставим без отправки обратно и перерисовываем.
    hydrate: function (next) {
      state = {
        version: 1,
        leads: (next.leads || []).map(normalizeLead),
        tariffs: next.tariffs || null,
        journey: normalizeJourney(next.journey),
        cases: Array.isArray(next.cases) ? next.cases : null,
        money: normalizeMoney(next.money),
        trainer: normalizeTrainer(next.trainer),
        cplFactors: normalizeCplFactors(next.cplFactors),
        calls: normalizeCalls(next.calls),
        templates: normalizeTemplates(next.templates)
      };
      C.storage.save(state);
      emit();
    },

    leads: function () {
      return state.leads;
    },

    // Свои шаблоны сообщений
    templates: function () {
      return state.templates || [];
    },

    saveTemplate: function (t) {
      var list = (state.templates || []).slice();
      var item = { id: t.id || U.uid(), title: String(t.title || '').trim() || 'Без названия', text: String(t.text || '').trim() };
      if (!item.text) return null;
      var i = list.map(function (x) { return x.id; }).indexOf(item.id);
      if (i >= 0) list[i] = item; else list.unshift(item);
      state.templates = normalizeTemplates(list);
      persist();
      emit();
      return item;
    },

    removeTemplate: function (id) {
      state.templates = (state.templates || []).filter(function (t) { return t.id !== id; });
      persist();
      emit();
    },

    // Разговоры (запись, расшифровка, разбор)
    calls: function () {
      return state.calls || [];
    },

    getCall: function (id) {
      return store.calls().filter(function (c) { return c.id === id; })[0] || null;
    },

    saveCall: function (call) {
      var list = store.calls();
      var i = list.map(function (c) { return c.id; }).indexOf(call.id);
      if (i < 0) list.unshift(call); else list[i] = call;
      state.calls = list;
      persist();
      return call;
    },

    removeCall: function (id) {
      state.calls = store.calls().filter(function (c) { return c.id !== id; });
      persist();
      emit();
    },

    get: function (id) {
      var i = findIndex(id);
      return i < 0 ? null : state.leads[i];
    },

    add: function (fields) {
      var lead = normalizeLead(fields);
      log(lead, 'create', 'Лид добавлен');
      state.leads.unshift(lead);
      persist();
      emit();
      return lead;
    },

    // Правка основных полей карточки без перерисовки
    patch: function (id, patch) {
      var lead = store.get(id);
      if (!lead) return null;
      Object.keys(patch).forEach(function (k) { lead[k] = patch[k]; });
      persist();
      return lead;
    },

    setData: function (id, key, value) {
      var lead = store.get(id);
      if (!lead) return null;
      lead.data[key] = value;
      if (key === 'm_held' && value === 'Состоялась') lead.data.m_held_at = U.nowIso();
      persist();
      return lead;
    },

    toggleCheck: function (id, stageId, itemId, value) {
      var lead = store.get(id);
      if (!lead) return null;
      lead.checks[stageId] = lead.checks[stageId] || {};
      lead.checks[stageId][itemId] = !!value;
      persist();
      return lead;
    },

    setNext: function (id, at, note) {
      var lead = store.get(id);
      if (!lead) return null;
      lead.nextAt = at || '';
      lead.nextNote = note || '';
      persist();
      return lead;
    },

    addNote: function (id, text) {
      var lead = store.get(id);
      if (!lead || !text) return null;
      log(lead, 'note', text);
      persist();
      return lead;
    },

    // opts: {nextAt, nextNote, reason}
    moveStage: function (id, stageId, opts) {
      var lead = store.get(id);
      var stage = D.stageById(stageId);
      if (!lead || !stage) return null;
      stageId = stage.id;
      opts = opts || {};
      var from = D.stageById(lead.stage);
      lead.stage = stageId;
      lead.stageAt = U.nowIso();
      lead.reached[stageId] = lead.stageAt;
      if (opts.nextAt !== undefined) {
        lead.nextAt = opts.nextAt || '';
        lead.nextNote = opts.nextNote || '';
      }
      if (stageId === 'meet' && !lead.data.m_held) lead.data.m_held = 'Назначена';
      if ((stageId === 'pay' || stageId === 'won') && (!lead.data.m_held || lead.data.m_held === 'Назначена')) {
        lead.data.m_held = 'Состоялась';
        if (!lead.data.m_held_at) lead.data.m_held_at = U.nowIso();
      }
      if (stageId === 'won') {
        lead.nextAt = '';
        if (!lead.data.won_amount && lead.data.price_amount) {
          lead.data.won_amount = lead.data.price_amount;
        }
      }
      if (stageId === 'lost') {
        lead.nextAt = '';
        if (opts.reason) lead.data.lost_reason = opts.reason;
      }
      if (stageId === 'hold' && opts.reason) {
        lead.data.hold_reason = opts.reason;
      }
      var text = (from ? from.title : '?') + ' → ' + stage.title;
      if (opts.reason) text += ' (' + opts.reason + ')';
      log(lead, 'stage', text);
      persist();
      emit();
      return lead;
    },

    remove: function (id) {
      var i = findIndex(id);
      if (i < 0) return;
      state.leads.splice(i, 1);
      persist();
      emit();
    },

    tariffs: function () {
      var list = state.tariffs || [];
      // Прежние тарифы по умолчанию (t1, t2) заменены новыми
      var old = list.length && list.every(function (t) { return t.id === 't1' || t.id === 't2'; });
      return list.length && !old ? list : D.defaultTariffs;
    },

    setTariffs: function (list) {
      state.tariffs = list;
      persist();
      emit();
    },

    // Кейсы: свои кейсы пользователя, затем кейсы EGOKAD (данные из папки ниш, не редактируются).
    // Старые кейсы практикумов и список ссылок ВК вынесены в legacyCases() и по умолчанию скрыты.
    cases: function () {
      return store.ownCases().concat(C.egokad ? C.egokad.cases() : []);
    },

    ownCases: function () {
      var legacy = {};
      store.legacyCases().forEach(function (c) { legacy[c.id] = true; });
      return Array.isArray(state.cases) ? state.cases.filter(function (c) { return !c.egokad && !legacy[c.id]; }) : [];
    },

    legacyCases: function () {
      return D.defaultCases || [];
    },

    setCases: function (list) {
      state.cases = list.filter(function (c) { return !c.egokad; });
      persist();
      emit();
    },

    // Деньги: ручные записи (продления, расходы). Первые оплаты берутся из карточек клиентов.
    money: function () {
      state.money = normalizeMoney(state.money);
      return state.money;
    },

    addMoney: function (entry) {
      var m = store.money();
      entry.id = entry.id || U.uid();
      m.entries.unshift(entry);
      persist();
      return entry;
    },

    removeMoney: function (id) {
      var m = store.money();
      m.entries = m.entries.filter(function (e) { return e.id !== id; });
      persist();
    },

    setMoneyGoal: function (goal) {
      store.money().goal = Number(goal) || 0;
      persist();
    },

    cplFactors: function () {
      state.cplFactors = normalizeCplFactors(state.cplFactors);
      return state.cplFactors;
    },

    setCplFactor: function (tier, value) {
      var f = store.cplFactors();
      f[tier] = value;
      state.cplFactors = normalizeCplFactors(f);
      persist();
    },

    // Тренажёр продаж: опыт, раунды, значки, дни тренировок
    trainer: function () {
      state.trainer = normalizeTrainer(state.trainer);
      return state.trainer;
    },

    saveTrainer: function () {
      persist();
    },

    journey: function () {
      state.journey = normalizeJourney(state.journey);
      return state.journey;
    },

    setJourneyTrack: function (track) {
      store.journey().track = track === 'exp' ? 'exp' : 'new';
      persist();
    },

    toggleJourney: function (itemId, value) {
      var j = store.journey();
      if (value) j.done[itemId] = true;
      else delete j.done[itemId];
      persist();
    },

    // Сводка для шапки. forecast: выручка по вероятностям этапов (0,1 / 0,5 / 0,9)
    stats: function () {
      var active = 0;
      var won = 0;
      var revenue = 0;
      var forecast = 0;
      state.leads.forEach(function (l) {
        if (l.stage === 'won') {
          won += 1;
          revenue += Number(l.data.won_amount || l.data.price_amount || 0);
        } else if (l.stage !== 'lost') {
          active += 1;
          var prob = D.leadProbability(l);
          forecast += Number(l.data.price_amount || 0) * prob;
        }
      });
      return {
        active: active, won: won, revenue: revenue,
        forecast: Math.round(forecast), total: state.leads.length
      };
    }
  };

  C.store = store;
})((window.CRM = window.CRM || {}));
