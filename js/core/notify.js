/* Уведомления о новых заявках: звук, всплывающая карточка и системное уведомление. */
(function (C) {
  'use strict';

  var U = C.utils;
  var box = null;

  function ensureBox() {
    if (box) return box;
    box = document.createElement('div');
    box.className = 'toast-box';
    document.body.appendChild(box);
    return box;
  }

  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
      setTimeout(function () { ctx.close(); }, 400);
    } catch (e) { /* звук не критичен */ }
  }

  function toast(lead) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'toast';
    var title = document.createElement('b');
    title.textContent = 'Новая заявка';
    var name = document.createElement('span');
    name.textContent = [lead.name, lead.city].filter(Boolean).join(' · ') || lead.phone || 'Без имени';
    var src = document.createElement('small');
    src.textContent = lead.source || '';
    el.appendChild(title);
    el.appendChild(name);
    if (lead.source) el.appendChild(src);
    el.addEventListener('click', function () {
      el.remove();
      if (lead.id) window.location.hash = '#lead/' + lead.id;
    });
    ensureBox().appendChild(el);
    setTimeout(function () { el.remove(); }, 9000);
  }

  function system(lead) {
    if (!window.Notification || Notification.permission !== 'granted') return;
    try {
      var n = new Notification('Новая заявка', {
        body: [lead.name, lead.phone, lead.city].filter(Boolean).join(' · ') || 'Открой CRM',
        tag: 'lead-' + lead.id,
        requireInteraction: false
      });
      n.onclick = function () {
        window.focus();
        if (lead.id) window.location.hash = '#lead/' + lead.id;
        n.close();
      };
    } catch (e) { /* iOS может запретить */ }
  }

  function newLeads(list) {
    if (!list || !list.length) return;
    beep();
    list.slice(0, 3).forEach(function (item) {
      var lead = item.data || item;
      if (item.id) lead.id = item.id;
      toast(lead);
      system(lead);
    });
    if (list.length > 3) {
      var more = document.createElement('div');
      more.className = 'toast toast-more';
      more.textContent = 'Ещё заявок: ' + (list.length - 3);
      ensureBox().appendChild(more);
      setTimeout(function () { more.remove(); }, 9000);
    }
  }

  C.notify = { newLeads: newLeads, ask: function () { return C.auth.requestNotifications(); } };
})((window.CRM = window.CRM || {}));
