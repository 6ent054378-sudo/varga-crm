/* Вход в CRM: пароль в браузере, автоматически по подписи в Telegram Mini App.
   Токен хранится в localStorage и уходит на Worker в заголовке Authorization. */
(function (C) {
  'use strict';

  var TOKEN_KEY = 'marketing_crm_token_v1';
  var DEFAULT_API = 'https://varga-crm.pulka-leads.workers.dev';

  function apiBase() {
    if (window.CRM_API) return String(window.CRM_API).replace(/\/+$/, '');
    try {
      var saved = window.localStorage.getItem('marketing_crm_api_v1');
      if (saved) return String(saved).replace(/\/+$/, '');
    } catch (e) { /* приватный режим */ }
    // Одно облако для всех: и на github.io, и на локальном сервере.
    // Иначе локальная копия живёт в своей localStorage и расходится с телефоном.
    if (window.location.protocol === 'file:') return '';
    return DEFAULT_API;
  }

  function token() {
    try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function saveToken(value) {
    try { window.localStorage.setItem(TOKEN_KEY, value); } catch (e) { /* приватный режим */ }
  }

  function clearToken() {
    try { window.localStorage.removeItem(TOKEN_KEY); } catch (e) { /* приватный режим */ }
  }

  function fetchApi(path, opts) {
    var base = apiBase();
    if (!base) return Promise.reject(new Error('API не настроен'));
    opts = opts || {};
    var headers = Object.assign({}, opts.headers || {});
    var t = token();
    if (t && !opts.noAuth) headers.Authorization = 'Bearer ' + t;
    if (opts.body) headers['Content-Type'] = 'application/json';
    return window.fetch(base + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store'
    });
  }

  function tg() {
    return window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData ? window.Telegram.WebApp : null;
  }

  function telegramLogin() {
    var app = tg();
    if (!app || !app.initData) return Promise.resolve(false);
    return fetchApi('/api/login/telegram', { method: 'POST', noAuth: true, body: { initData: app.initData } })
      .then(function (r) {
        if (!r.ok) throw new Error('Telegram не подтвердил вход');
        return r.json();
      })
      .then(function (data) {
        saveToken(data.token);
        return true;
      })
      .catch(function () { return false; });
  }

  var gate = null;

  function showGate(message) {
    if (!gate) {
      gate = document.createElement('div');
      gate.className = 'gate';
      gate.innerHTML =
        '<form class="gate-card" autocomplete="on">' +
          '<div class="gate-brand">Путь продаж</div>' +
          '<p class="gate-sub">Вход в CRM. Данные клиентов хранятся в облаке и доступны только тебе.</p>' +
          '<label class="gate-label" for="gate-pass">Пароль</label>' +
          '<input id="gate-pass" class="input gate-input" type="password" autocomplete="current-password" placeholder="Пароль" required>' +
          '<div class="gate-error" role="alert"></div>' +
          '<button class="btn btn-primary gate-btn" type="submit">Войти</button>' +
          '<div class="gate-hint">В Telegram Mini App вход происходит сам.</div>' +
        '</form>';
      document.body.appendChild(gate);
      gate.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        submit(gate.querySelector('#gate-pass').value);
      });
    }
    if (message) gate.querySelector('.gate-error').textContent = message;
    gate.hidden = false;
    var input = gate.querySelector('#gate-pass');
    if (input) setTimeout(function () { input.focus(); }, 50);
  }

  function hideGate() {
    if (gate) gate.hidden = true;
  }

  var waiting = null;

  function submit(password) {
    var err = gate.querySelector('.gate-error');
    var btn = gate.querySelector('.gate-btn');
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Проверяю...';
    fetchApi('/api/login', { method: 'POST', noAuth: true, body: { password: password } })
      .then(function (r) {
        if (r.status === 429) throw new Error('Слишком много попыток. Подожди 10 минут.');
        if (!r.ok) throw new Error('Неверный пароль');
        return r.json();
      })
      .then(function (data) {
        saveToken(data.token);
        if (window.Notification && Notification.permission === 'default') Notification.requestPermission();
        hideGate();
        if (waiting) { waiting(true); waiting = null; }
      })
      .catch(function (e) {
        err.textContent = e && e.message ? e.message : 'Не удалось войти';
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = 'Войти';
      });
  }

  function ready() {
    var base = apiBase();
    if (!base) return Promise.resolve(true); // локальный запуск без облака

    return telegramLogin().then(function (inTelegram) {
      if (inTelegram) { hideGate(); return true; }
      var t = token();
      if (!t) {
        showGate('');
        return new Promise(function (resolve) { waiting = resolve; });
      }
      return fetchApi('/api/config').then(function (r) {
        if (r.ok) return true;
        clearToken();
        showGate('Сессия истекла, войди заново');
        return new Promise(function (resolve) { waiting = resolve; });
      }).catch(function () {
        return true; // нет сети: работаем на локальном кэше
      });
    });
  }

  function logout() {
    return fetchApi('/api/logout', { method: 'POST' }).catch(function () {}).then(function () {
      clearToken();
      if (window.location) window.location.reload();
    });
  }

  function requestNotifications() {
    if (window.Notification && Notification.permission === 'default') return Notification.requestPermission();
    return Promise.resolve(Notification ? Notification.permission : 'denied');
  }

  C.auth = {
    apiBase: apiBase, token: token, ready: ready, logout: logout,
    fetch: fetchApi, inTelegram: function () { return !!tg(); },
    requestNotifications: requestNotifications
  };
})((window.CRM = window.CRM || {}));
