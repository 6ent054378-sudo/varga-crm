(function (C) {
  'use strict';

  var h = C.dom.h;
  var U = C.utils;
  var D = C.data;
  var store = C.store;

  var KIND_LABEL = { say: 'Говори', ask: 'Спроси', tip: 'Важно', dont: 'Не делай', note: 'Заметка' };
  var keyHandler = null;

  // Подстановки в текст скрипта из карточки клиента и калькулятора
  function scriptVars(lead) {
    var d = lead.data || {};
    var res = C.calc.compute({ cheque: d.calc_cheque, deals: d.calc_deals, conv: d.calc_conv || 10, cpl: d.calc_cpl });
    // Стоимость заявки: введённая вручную, иначе по кейсам ниши и городу клиента
    var est = C.cpl.estimate(lead.niche, lead.city);
    var cplValue = Number(d.calc_cpl) || (est.known && !est.approx && est.how !== 'all' ? est.value : 0);
    return {
      cpl: cplValue ? U.fmtMoney(cplValue) : '',
      name: lead.name,
      niche: lead.niche,
      city: lead.city,
      deals: d.calc_deals,
      revenue: res.valid ? U.fmtMoney(res.revenue) : '',
      leads: res.valid ? res.leads : '',
      price: d.price_amount ? U.fmtMoney(d.price_amount) : '',
      maintain: U.fmtMoney(C.offer.maintain().price),
      deadline: d.price_deadline
    };
  }

  function sectionTitle(sec, i) {
    return sec.title || 'Шаг ' + (i + 1);
  }

  function lineNode(it, vars) {
    var node = h('div', { class: 'line line-' + it.k },
      h('span', { class: 'line-tag', text: KIND_LABEL[it.k] || '' }),
      h('p', { text: U.fill(it.t, vars) })
    );
    // Клик по фразе отмечает её как сказанную
    if (it.k === 'say' || it.k === 'ask') {
      node.classList.add('is-clickable');
      node.addEventListener('click', function () { node.classList.toggle('is-said'); });
    }
    return node;
  }

  // Скрипт этапа по шагам: один блок на экране, кнопки Назад и Дальше, стрелки на клавиатуре.
  function render(lead, stage, vars, opts) {
    opts = opts || {};
    var script = D.scripts[stage.id];
    var panel = h('aside', { class: 'script' });
    if (!script) return panel;

    var key = '_script_' + stage.id;
    var saved = Number(store.get(lead.id).data[key]);
    var idx = saved >= 0 && saved < script.sections.length ? saved : 0;
    var showAll = false;
    var body = h('div', { class: 'script-body' });
    var nav = h('div', { class: 'script-nav' });
    var chips = h('div', { class: 'script-chips' });

    function go(i) {
      idx = Math.max(0, Math.min(script.sections.length - 1, i));
      store.setData(lead.id, key, idx);
      draw();
    }

    function drawChips() {
      C.dom.clear(chips);
      script.sections.forEach(function (sec, i) {
        chips.appendChild(h('button', {
          type: 'button',
          class: 'step-chip' + (i === idx ? ' is-current' : i < idx ? ' is-past' : ''),
          title: sectionTitle(sec, i),
          onClick: function () { go(i); }
        }, String(i + 1)));
      });
    }

    function draw() {
      C.dom.clear(body);
      C.dom.clear(nav);
      var total = script.sections.length;

      if (showAll) {
        script.sections.forEach(function (sec, i) {
          body.appendChild(h('details', { class: 'sec', open: i === idx ? 'open' : null },
            h('summary', { text: sectionTitle(sec, i) }),
            h('div', { class: 'sec-body' }, sec.items.map(function (it) { return lineNode(it, vars); }))
          ));
        });
      } else {
        var sec = script.sections[idx];
        body.appendChild(h('div', { class: 'script-step', text: 'Шаг ' + (idx + 1) + ' из ' + total }));
        body.appendChild(h('h3', { class: 'script-title', text: sectionTitle(sec, idx) }));
        sec.items.forEach(function (it) { body.appendChild(lineNode(it, vars)); });
        if (idx < total - 1) {
          body.appendChild(h('div', { class: 'script-peek', text: 'Дальше: ' + sectionTitle(script.sections[idx + 1], idx + 1) }));
        } else {
          body.appendChild(h('div', { class: 'script-peek', text: 'Это последний шаг скрипта этапа.' }));
        }
      }

      drawChips();
      nav.appendChild(h('button', {
        type: 'button', class: 'btn', disabled: idx === 0 || showAll ? 'disabled' : null,
        onClick: function () { go(idx - 1); }
      }, 'Назад'));
      nav.appendChild(h('button', {
        type: 'button', class: 'btn btn-primary', disabled: idx >= total - 1 || showAll ? 'disabled' : null,
        onClick: function () { go(idx + 1); }
      }, 'Дальше'));
    }

    var toggle = h('button', {
      type: 'button', class: 'btn btn-small',
      onClick: function () {
        showAll = !showAll;
        toggle.textContent = showAll ? 'По шагам' : 'Весь скрипт';
        draw();
      }
    }, 'Весь скрипт');

    panel.appendChild(h('div', { class: 'script-head' },
      h('div', { class: 'eyebrow', text: 'Скрипт этапа' }),
      h('h2', { text: script.title }),
      h('div', { class: 'script-actions' },
        opts.onMap ? h('button', { type: 'button', class: 'btn btn-small btn-primary', onClick: opts.onMap }, 'Карта') : null,
        h('a', { class: 'btn btn-small', href: '#map/' + lead.id + '/' + stage.id }, opts.onMap ? 'Карта на весь экран' : 'Открыть картой'),
        toggle
      )
    ));
    panel.appendChild(chips);
    panel.appendChild(body);
    panel.appendChild(nav);
    draw();

    // Стрелки влево и вправо листают шаги, пока курсор не в поле ввода
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = function (e) {
      if (!document.body.contains(panel)) {
        document.removeEventListener('keydown', keyHandler);
        keyHandler = null;
        return;
      }
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || showAll) return;
      if (e.key === 'ArrowRight') go(idx + 1);
      else if (e.key === 'ArrowLeft') go(idx - 1);
    };
    document.addEventListener('keydown', keyHandler);

    return panel;
  }

  C.views = C.views || {};
  C.views.script = { render: render, vars: scriptVars };
})((window.CRM = window.CRM || {}));
