(function (C) {
  'use strict';

  var h = C.dom.h;
  var current = null;

  function close() {
    if (current && current.parentNode) current.parentNode.removeChild(current);
    current = null;
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  // opts: {title, body (node), actions: [{label, primary, onClick(close)}]}
  function open(opts) {
    close();
    var actions = (opts.actions || []).map(function (a) {
      return h('button', {
        type: 'button',
        class: 'btn' + (a.primary ? ' btn-primary' : ''),
        onClick: function () { a.onClick(close); }
      }, a.label);
    });

    var box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal-head' },
        h('h3', { text: opts.title || '' }),
        h('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': 'Закрыть', onClick: close }, 'Закрыть')
      ),
      h('div', { class: 'modal-body' }, opts.body),
      actions.length ? h('div', { class: 'modal-foot' }, actions) : null
    );

    current = h('div', {
      class: 'overlay',
      onClick: function (e) { if (e.target === current) close(); }
    }, box);

    document.body.appendChild(current);
    document.addEventListener('keydown', onKey);
    var first = box.querySelector('input, select, textarea, button.btn-primary');
    if (first) first.focus();
    return close;
  }

  C.modal = { open: open, close: close };
})((window.CRM = window.CRM || {}));
