/* Синхронизация CRM с Cloudflare D1.
   Локальный кэш в localStorage остаётся для мгновенного запуска и офлайна,
   изменения уходят в Worker и приходят на другие устройства. */
(function (C) {
  'use strict';

  var store = C.store;
  var CURSOR_KEY = 'marketing_crm_cursor_v1';
  var CURSOR_VER = 'marketing_crm_cursor_ver';
  var CURSOR_VERSION = '2';
  var OUT_KEY = 'marketing_crm_outbox_v1';
  var SETTINGS = ['tariffs', 'journey', 'cases', 'money', 'trainer', 'cplFactors', 'calls', 'templates'];

  var out = { leads: {}, deleted: {}, settings: null };
  var known = {};
  var knownSettings = '';
  var settingsUp = 0;
  var offset = 0;
  var cursor = 0;
  var running = false;
  var flushing = false;
  var timer = null;
  var flushTimer = null;
  var firstPullDone = false;
  var intakeStarted = false;
  var lastError = '';
  var lastSync = '';
  var onError = null;
  var retryTimer = null;
  var importing = false;

  // Ошибку связи показываем в интерфейсе, а не молчим пустым списком.
  function humanError(message) {
    var text = String(message || '');
    if (/401|403/.test(text)) return 'сессия истекла, войди заново';
    if (/Failed to fetch|NetworkError|Load failed/i.test(text)) return 'нет связи с сервером';
    return text;
  }

  function setError(message) {
    var next = humanError(message);
    if (next === lastError) return;
    lastError = next;
    if (onError) onError(next);
  }

  function retrySoon() {
    if (retryTimer || !running) return;
    retryTimer = setTimeout(function () {
      retryTimer = null;
      if (!running) return;
      pull(cursor).then(function () { flush(); });
    }, 5000);
  }

  function now() { return Date.now() + offset; }

  function stable(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    return '{' + Object.keys(value).sort().map(function (k) {
      return JSON.stringify(k) + ':' + stable(value[k]);
    }).join(',') + '}';
  }

  function strip(lead) {
    var out = {};
    Object.keys(lead).forEach(function (k) {
      if (k.charAt(0) !== '_') out[k] = lead[k];
    });
    return out;
  }

  function settingsOf(state) {
    var data = {};
    SETTINGS.forEach(function (k) {
      if (state[k] !== undefined) data[k] = state[k];
    });
    return JSON.parse(JSON.stringify(data));
  }

  function load() {
    try {
      cursor = Number(window.localStorage.getItem(CURSOR_KEY)) || 0;
      if (window.localStorage.getItem(CURSOR_VER) !== CURSOR_VERSION) {
        cursor = 0;
        window.localStorage.setItem(CURSOR_VER, CURSOR_VERSION);
      }
    } catch (e) { cursor = 0; }
    try {
      var raw = window.localStorage.getItem(OUT_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        out = {
          leads: saved && saved.leads && typeof saved.leads === 'object' ? saved.leads : {},
          deleted: saved && saved.deleted && typeof saved.deleted === 'object' ? saved.deleted : {},
          settings: saved && saved.settings ? saved.settings : null
        };
      }
    } catch (e) { out = { leads: {}, deleted: {}, settings: null }; }
  }

  function save() {
    try {
      window.localStorage.setItem(CURSOR_KEY, String(cursor));
      window.localStorage.setItem(OUT_KEY, JSON.stringify(out));
    } catch (e) { /* переполнение не должно ломать приложение */ }
  }

  function buildKnown() {
    known = {};
    store.leads().forEach(function (lead) {
      known[lead.id] = stable(strip(lead));
    });
    knownSettings = stable(settingsOf(store.snapshot()));
  }

  function enqueueLead(lead) {
    out.leads[lead.id] = { data: strip(lead), updatedAt: lead._up || now() };
    delete out.deleted[lead.id];
  }

  function enqueueDelete(id) {
    out.deleted[id] = { updatedAt: now() };
    delete out.leads[id];
  }

  function enqueueSettings() {
    settingsUp = now();
    out.settings = { data: settingsOf(store.snapshot()), updatedAt: settingsUp };
  }

  function onPersist(state) {
    if (!running) return;
    var current = {};
    (state.leads || []).forEach(function (lead) {
      var json = stable(strip(lead));
      current[lead.id] = true;
      if (known[lead.id] === json) return;
      lead._up = now();
      enqueueLead(lead);
      known[lead.id] = json;
    });
    // Пустой список лидов — это сбой кэша или импорт, а не желание удалить всех клиентов.
    // Удаления в таком состоянии не отправляем, иначе одно устройство сносит базу.
    var empty = !Object.keys(current).length && Object.keys(known).length > 0;
    if (!importing && !empty) {
      Object.keys(known).forEach(function (id) {
        if (!current[id]) {
          enqueueDelete(id);
          delete known[id];
        }
      });
    }
    importing = false;
    var payload = settingsOf(state);
    var sjson = stable(payload);
    if (sjson !== knownSettings) {
      settingsUp = now();
      out.settings = { data: payload, updatedAt: settingsUp };
      knownSettings = sjson;
    }
    scheduleFlush();
  }

  function scheduleFlush() {
    save();
    if (flushTimer) return;
    flushTimer = setTimeout(function () {
      flushTimer = null;
      flush();
    }, 700);
  }

  function applyConflicts(conflicts) {
    if (!conflicts || !conflicts.length) return;
    var snapshot = store.snapshot();
    conflicts.forEach(function (item) {
      if (item.deleted) {
        snapshot.leads = snapshot.leads.filter(function (l) { return l.id !== item.id; });
        return;
      }
      var local = snapshot.leads.filter(function (l) { return l.id === item.id; })[0];
      var data = Object.assign({}, item.data, { _up: item.updatedAt });
      if (local) {
        Object.keys(local).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(data, k)) delete local[k]; });
        Object.assign(local, data);
      } else {
        snapshot.leads.unshift(data);
      }
    });
    store.hydrate(snapshot);
    buildKnown();
  }

  function flush() {
    if (!running || flushing) return Promise.resolve();
    var leads = Object.keys(out.leads).map(function (id) {
      return { id: id, data: out.leads[id].data, updatedAt: out.leads[id].updatedAt };
    });
    var dels = Object.keys(out.deleted).map(function (id) {
      return { id: id, updatedAt: out.deleted[id].updatedAt };
    });
    var settings = out.settings;
    if (!leads.length && !dels.length && !settings) { save(); return Promise.resolve(); }

    flushing = true;
    var sent = {};
    leads.forEach(function (l) { sent[l.id] = l.updatedAt; });
    var sentDels = {};
    dels.forEach(function (d) { sentDels[d.id] = d.updatedAt; });
    var sentSettingsAt = settings ? settings.updatedAt : 0;

    var chain = Promise.resolve();
    if (leads.length || dels.length) {
      chain = C.auth.fetch('/api/leads', { method: 'POST', body: { leads: leads, deleted: dels } })
        .then(function (r) {
          if (r.status === 409) {
            // Сервер защитил базу от массового удаления: отменяем локальные удаления.
            out.deleted = {};
            save();
            setError('удаление остановлено: сервер вернул заявки');
            return pull(0).then(function () { return { conflicts: [] }; });
          }
          if (!r.ok) throw new Error('sync ' + r.status);
          return r.json();
        })
        .then(function (body) {
          leads.forEach(function (l) {
            if (out.leads[l.id] && out.leads[l.id].updatedAt === sent[l.id]) delete out.leads[l.id];
          });
          dels.forEach(function (d) {
            if (out.deleted[d.id] && out.deleted[d.id].updatedAt === sentDels[d.id]) delete out.deleted[d.id];
          });
          lastSync = new Date().toISOString();
          setError('');
          applyConflicts(body.conflicts);
        });
    }

    if (settings) {
      chain = chain.then(function () {
        return C.auth.fetch('/api/settings', { method: 'PUT', body: settings })
          .then(function (r) {
          if (r.status === 409) {
            // Сервер защитил базу от массового удаления: отменяем локальные удаления.
            out.deleted = {};
            save();
            setError('удаление остановлено: сервер вернул заявки');
            return pull(0).then(function () { return { conflicts: [] }; });
          }
          if (!r.ok) throw new Error('sync ' + r.status);
          return r.json();
        })
          .then(function (body) {
            if (out.settings && out.settings.updatedAt === sentSettingsAt) {
              if (body.updatedAt > sentSettingsAt) settingsUp = body.updatedAt;
              out.settings = null;
            }
          });
      });
    }

    return chain.catch(function (e) {
      setError(e && e.message ? e.message : 'Нет связи');
      retrySoon();
    }).then(function () {
      flushing = false;
      save();
      if (!lastError) setTimeout(function () { flush(); }, 200);
    });
  }

  function pull(since) {
    return C.auth.fetch('/api/state?since=' + (since || 0))
      .then(function (r) { if (!r.ok) throw new Error('pull ' + r.status); return r.json(); })
      .then(function (body) {
        offset = body.serverTime - Date.now();
        var snapshot = store.snapshot();
        var before = {};
        snapshot.leads.forEach(function (l) { before[l.id] = true; });

        var byId = {};
        snapshot.leads.forEach(function (l) { byId[l.id] = l; });

        (body.leads || []).forEach(function (item) {
          var local = byId[item.id];
          var pending = out.leads[item.id];
          if (pending && local && (local._up || 0) > item.updatedAt) return;
          var data = Object.assign({}, item.data, { _up: item.updatedAt });
          if (local) {
            Object.keys(local).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(data, k)) delete local[k]; });
            Object.assign(local, data);
          } else {
            snapshot.leads.unshift(data);
          }
        });

        (body.deleted || []).forEach(function (item) {
          var local = byId[item.id];
          if (!local) return;
          var pending = out.leads[item.id];
          if (pending && (local._up || 0) > item.updatedAt) return;
          snapshot.leads = snapshot.leads.filter(function (l) { return l.id !== item.id; });
        });

        if (body.settings && body.settingsUpdatedAt > settingsUp && !(out.settings && out.settings.updatedAt > body.settingsUpdatedAt)) {
          SETTINGS.forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(body.settings, k)) snapshot[k] = body.settings[k];
          });
          settingsUp = body.settingsUpdatedAt;
        }

        // Курсор двигаем по времени записи на сервере, а не по часам ответа:
        // иначе изменение, пришедшее между выборкой и ответом, потеряется.
        var next = cursor;
        (body.leads || []).forEach(function (item) { if (item.serverAt > next) next = item.serverAt; });
        (body.deleted || []).forEach(function (item) { if (item.serverAt > next) next = item.serverAt; });
        if (body.settingsServerAt > next) next = body.settingsServerAt;
        cursor = next;
        store.hydrate(snapshot);
        buildKnown();
        lastSync = new Date().toISOString();
        setError('');

        var fresh = (body.leads || []).filter(function (item) { return !before[item.id]; });
        if (firstPullDone && fresh.length) C.notify.newLeads(fresh);
        return body;
      })
      .catch(function (e) {
        setError(e && e.message ? e.message : 'Нет связи');
        retrySoon();
        return null;
      });
  }

  function loadConfig() {
    return C.auth.fetch('/api/config').then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (cfg) {
      if (cfg && cfg.intake && cfg.intake.url && cfg.intake.key) window.INTAKE_CONFIG = cfg.intake;
    }).catch(function () { /* без конфига заявки не забираются */ });
  }

  function startIntake() {
    if (intakeStarted) return;
    intakeStarted = true;
    loadConfig().then(function () {
      if (C.intake && C.app) C.intake.start(C.app.onIntake);
    });
  }

  function tick() {
    if (!running || document.visibilityState === 'hidden') return;
    pull(cursor).then(function () { flush(); });
  }

  function start() {
    if (running) return;
    running = true;
    load();
    buildKnown();
    if (!C.auth.apiBase()) { startIntake(); return; }

    pull(0).then(function (body) {
      if (body) {
        var onServer = {};
        (body.leads || []).forEach(function (l) { onServer[l.id] = true; });
        (body.deleted || []).forEach(function (l) { onServer[l.id] = true; });

        var snapshot = store.snapshot();
        var pushed = false;
        snapshot.leads.forEach(function (lead) {
          if (onServer[lead.id]) return;
          lead._up = now();
          enqueueLead(lead);
          known[lead.id] = stable(strip(lead));
          pushed = true;
        });
        if (!body.settings) { enqueueSettings(); pushed = true; }
        if (pushed) save();
      }
      firstPullDone = true;
      flush();
      startIntake();
      timer = setInterval(tick, 45000);
    });
  }

  function stop() {
    running = false;
    if (timer) clearInterval(timer);
    timer = null;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') tick();
  });
  window.addEventListener('online', function () { flush(); });

  C.sync = {
    start: start, stop: stop, flush: flush, pull: pull,
    onError: function (fn) { onError = fn; },
    beginImport: function () { importing = true; },
    status: function () { return { running: running, error: lastError, at: lastSync, cursor: cursor, pending: Object.keys(out.leads).length + Object.keys(out.deleted).length + (out.settings ? 1 : 0) }; },
    onPersist: onPersist
  };
})((window.CRM = window.CRM || {}));
