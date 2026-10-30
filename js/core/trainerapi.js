(function (C) {
  'use strict';

  var PORT = 8787;

  // Если приложение открыто как файл, ходим на локальный сервер по адресу; если через сервер, адрес не нужен
  function base() {
    return window.location.protocol === 'file:' ? 'http://127.0.0.1:' + PORT : '';
  }

  function fail(message, extra) {
    var err = new Error(message);
    if (extra) Object.keys(extra).forEach(function (k) { err[k] = extra[k]; });
    return err;
  }

  function parse(res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (!res.ok) throw fail(data.error || 'Сервер вернул ошибку ' + res.status, { limit: !!data.limit, usage: data.usage });
      return data;
    });
  }

  function request(path, options) {
    return fetch(base() + path, options).then(parse, function () {
      throw fail('Нет связи с локальным сервером тренажёра. Запусти его командой из README и обнови страницу.', { offline: true });
    });
  }

  function status() {
    return request('/api/status');
  }

  // wav: ArrayBuffer с записью голоса
  function transcribe(wav) {
    return request('/api/stt', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
  }

  // kind: 'turn' (реплика клиента) или 'eval' (разбор раунда)
  function chat(messages, kind) {
    return request('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages, kind: kind })
    });
  }

  C.trainerapi = { status: status, transcribe: transcribe, chat: chat, base: base };
})((window.CRM = window.CRM || {}));
