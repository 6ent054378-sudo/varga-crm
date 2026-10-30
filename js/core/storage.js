(function (C) {
  'use strict';

  var KEY = 'marketing_crm_v1';

  var BACKUP_KEY = 'marketing_crm_backup_v1';
  var backupMemory = { at: '', snooze: '' };

  function readBackup() {
    try {
      var raw = window.localStorage.getItem(BACKUP_KEY);
      if (raw) return Object.assign({ at: '', snooze: '' }, JSON.parse(raw));
    } catch (e) { /* только память */ }
    return backupMemory;
  }

  function writeBackup(b) {
    backupMemory = b;
    try { window.localStorage.setItem(BACKUP_KEY, JSON.stringify(b)); } catch (e) { /* только память */ }
  }

  var storage = {
    available: true,
    full: false,

    // Напоминание о резервной копии: сколько дней прошло и не отложено ли напоминание
    backupInfo: function (now) {
      var b = readBackup();
      var t = now === undefined ? Date.now() : now;
      var last = b.at ? new Date(b.at).getTime() : 0;
      var snooze = b.snooze ? new Date(b.snooze).getTime() : 0;
      return { at: b.at, days: last ? Math.floor((t - last) / 86400000) : null, snoozed: snooze > t };
    },

    snoozeBackup: function (days, now) {
      var b = readBackup();
      b.snooze = new Date((now === undefined ? Date.now() : now) + (days || 1) * 86400000).toISOString();
      writeBackup(b);
    },

    load: function () {
      try {
        var raw = window.localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        storage.available = false;
        return null;
      }
    },

    save: function (state) {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(state));
        storage.available = true;
        storage.full = false;
        return true;
      } catch (e) {
        storage.available = false;
        storage.full = !!e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
        return false;
      }
    },

    // Сколько места занимают данные (байты, считаем по тексту) и доля от обычных 5 МБ браузера
    usage: function (state) {
      var bytes = 0;
      try { bytes = JSON.stringify(state).length * 2; } catch (e) { bytes = 0; }
      return { bytes: bytes, share: bytes / (5 * 1024 * 1024) };
    },

    // Разбор файла резервной копии. Возвращает {ok, state, error}
    parse: function (text) {
      var data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        return { ok: false, error: 'Файл не похож на резервную копию (не читается JSON).' };
      }
      if (!data || !Array.isArray(data.leads)) {
        return { ok: false, error: 'В файле нет списка клиентов.' };
      }
      return { ok: true, state: data };
    },

    download: function (state) {
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var d = new Date();
      a.href = url;
      writeBackup({ at: new Date().toISOString(), snooze: '' });
      a.download = 'crm-backup-' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
  };

  C.storage = storage;
})((window.CRM = window.CRM || {}));
