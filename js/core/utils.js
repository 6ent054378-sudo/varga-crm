(function (C) {
  'use strict';

  var U = {};

  U.uid = function () {
    return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  };

  U.nowIso = function () {
    return new Date().toISOString();
  };

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  // Значение для input[type=datetime-local]
  U.toLocalInput = function (d) {
    return (
      d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    );
  };

  U.tomorrowAt = function (hour) {
    var d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hour, 0, 0, 0);
    return U.toLocalInput(d);
  };

  U.fmtDateTime = function (value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };

  U.fmtMoney = function (n) {
    var v = Number(n);
    if (!isFinite(v)) return '';
    return v.toLocaleString('ru-RU') + ' ₽';
  };

  U.isOverdue = function (value) {
    if (!value) return false;
    var d = new Date(value);
    return !isNaN(d.getTime()) && d.getTime() < Date.now();
  };

  // Сегодня или завтра (по календарным дням)
  U.isSoon = function (value) {
    if (!value) return false;
    var d = new Date(value);
    if (isNaN(d.getTime())) return false;
    var end = new Date();
    end.setDate(end.getDate() + 1);
    end.setHours(23, 59, 59, 999);
    return d.getTime() <= end.getTime();
  };

  U.daysSince = function (iso) {
    if (!iso) return 0;
    var d = new Date(iso);
    if (isNaN(d.getTime())) return 0;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  };

  // Подстановка {name} -> значение или [Имя] как подсказка
  U.fill = function (text, vars) {
    return String(text).replace(/\{(\w+)\}/g, function (m, key) {
      var v = vars && vars[key];
      if (v === undefined || v === null || v === '') {
        return '[' + (U.placeholders[key] || key) + ']';
      }
      return String(v);
    });
  };

  U.placeholders = {
    name: 'Имя',
    niche: 'ниша',
    city: 'город',
    deals: 'N клиентов',
    revenue: 'выручка',
    leads: 'N заявок',
    cpl: 'стоимость заявки',
    price: 'цена',
    maintain: 'ведение в месяц',
    deadline: 'дедлайн'
  };

  // Ссылка tel: из телефона (8... превращаем в +7...)
  U.telHref = function (phone) {
    var d = String(phone || '').replace(/\D/g, '');
    if (d.length === 11 && d.charAt(0) === '8') d = '7' + d.slice(1);
    return d.length >= 10 ? 'tel:+' + d : '';
  };

  // Ссылка на чат из поля «Мессенджер»: полная ссылка, @ник или ник Телеграма
  U.chatHref = function (contact) {
    var c = String(contact || '').trim();
    if (!c) return '';
    if (/^https?:\/\//i.test(c)) return c;
    if (/^(t\.me|wa\.me|vk\.com)\//i.test(c)) return 'https://' + c;
    var nick = c.replace(/^@/, '');
    return /^[A-Za-z0-9_]{4,32}$/.test(nick) ? 'https://t.me/' + nick : '';
  };

  C.utils = U;
})((window.CRM = window.CRM || {}));
