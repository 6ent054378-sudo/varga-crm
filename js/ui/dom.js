(function (C) {
  'use strict';

  function append(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(function (c) { append(el, c); });
    } else if (child.nodeType) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }

  // Мини-хелпер создания элементов: h('div', {class:'x', onClick:fn}, children...)
  function h(tag, attrs) {
    var el = document.createElement(tag);
    var deferredValue;
    var hasValue = false;
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'value') { deferredValue = v; hasValue = true; }
        else if (k === 'checked') el.checked = !!v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    // value select/textarea/input задаём после появления детей (для select)
    if (hasValue) el.value = deferredValue;
    return el;
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  C.dom = { h: h, clear: clear };
})((window.CRM = window.CRM || {}));
