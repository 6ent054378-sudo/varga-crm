(function (C) {
  'use strict';

  var h = C.dom.h;
  var U = C.utils;
  var D = C.data;
  var store = C.store;

  // ---------- Скрипт этапа ----------
  // Режим скрипта в карточке: 'map' (майндкарта) или 'steps' (шаги). Запоминаем до перезагрузки.
  var scriptMode = 'map';

  function scriptPanel(lead, stage, rerender) {
    if (!C.data.scripts[stage.id]) return h('aside', { class: 'script' });
    if (scriptMode === 'map') {
      return C.views.map.render(lead.id, stage.id, {
        embedded: true,
        onSwitch: function () { scriptMode = 'steps'; rerender(); }
      });
    }
    return C.views.script.render(lead, stage, C.views.script.vars(lead), {
      onMap: function () { scriptMode = 'map'; rerender(); }
    });
  }

  // ---------- Поля формы ----------
  function bindSave(el, lead, key, isCore) {
    el.addEventListener('change', function () {
      if (isCore) {
        var patch = {};
        patch[key] = el.value;
        store.patch(lead.id, patch);
      } else {
        store.setData(lead.id, key, el.value);
      }
    });
    return el;
  }

  function fieldNode(lead, f) {
    var current = lead.data[f.key];
    var control;
    if (f.type === 'textarea') {
      control = h('textarea', { class: 'input', rows: 3, value: current || '', placeholder: f.placeholder || '' });
    } else if (f.type === 'select') {
      control = h('select', { class: 'input', value: current || '' },
        f.options.map(function (o) { return h('option', { value: o }, o || 'Не выбрано'); }));
    } else if (f.type === 'tariff') {
      var tariffs = store.tariffs();
      control = h('select', { class: 'input', value: current || '' },
        h('option', { value: '' }, 'Не выбрано'),
        tariffs.map(function (t) { return h('option', { value: t.id }, t.name); }));
      control.addEventListener('change', function () {
        var t = tariffs.filter(function (x) { return x.id === control.value; })[0];
        if (t && !lead.data.price_amount) {
          store.setData(lead.id, 'price_amount', t.price);
          var amount = document.getElementById('f-price_amount');
          if (amount) amount.value = t.price;
        }
      });
    } else if (f.type === 'lostReason') {
      control = h('select', { class: 'input', value: current || '' },
        h('option', { value: '' }, 'Не выбрано'),
        D.lostReasons.map(function (r) { return h('option', { value: r }, r); }));
    } else if (f.type === 'datetime') {
      control = h('input', { type: 'datetime-local', class: 'input', value: current || '' });
    } else if (f.type === 'date') {
      control = h('input', { type: 'date', class: 'input', value: current || '' });
    } else if (f.type === 'number') {
      control = h('input', { type: 'number', class: 'input', value: current || '', min: '0', inputmode: 'numeric' });
    } else {
      control = h('input', { type: 'text', class: 'input', value: current || '', placeholder: f.placeholder || '' });
    }
    control.id = 'f-' + f.key;
    bindSave(control, lead, f.key, false);
    return h('label', { class: 'field' },
      h('span', { class: 'label', text: f.label }),
      control,
      f.hint ? h('span', { class: 'hint', text: f.hint }) : null
    );
  }

  function contactForm(lead) {
    function core(key, label, placeholder, type) {
      var input = h('input', { type: type || 'text', class: 'input', value: lead[key] || '', placeholder: placeholder || '', list: key === 'niche' ? 'egokad-niches' : null });
      bindSave(input, lead, key, true);
      // Подсказки ниш из данных EGOKAD: по точному названию находятся кейсы и цена заявки
      var nicheList = key === 'niche' ? h('datalist', { id: 'egokad-niches' }, (D.egokad || []).map(function (n) { return h('option', { value: n.niche }); })) : null;
      return h('label', { class: 'field' }, h('span', { class: 'label', text: label }), input, nicheList);
    }
    var source = h('select', { class: 'input', value: lead.source || '' },
      h('option', { value: '' }, 'Не выбрано'),
      D.sources.map(function (s) { return h('option', { value: s }, s); }));
    bindSave(source, lead, 'source', true);

    return h('section', { class: 'card' },
      h('h3', { text: 'Клиент' }),
      h('div', { class: 'grid2' },
        core('name', 'Имя'),
        core('phone', 'Телефон', '+7', 'tel'),
        core('contact', 'Мессенджер / ссылка'),
        h('label', { class: 'field' }, h('span', { class: 'label', text: 'Откуда пришёл' }), source),
        core('niche', 'Ниша', 'Например: отделка балконов'),
        core('city', 'Город')
      )
    );
  }

  function nextContactBox(lead) {
    var when = h('input', { type: 'datetime-local', class: 'input', value: lead.nextAt || '' });
    var note = h('input', { type: 'text', class: 'input', value: lead.nextNote || '', placeholder: 'О чём разговор' });
    function save() { store.setNext(lead.id, when.value, note.value); }
    when.addEventListener('change', save);
    note.addEventListener('change', save);
    var tomorrow = h('button', {
      type: 'button', class: 'btn btn-small',
      onClick: function () { when.value = U.tomorrowAt(12); save(); }
    }, 'Завтра в 12:00');
    return h('section', { class: 'card' },
      h('h3', { text: 'Следующий контакт' }),
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, h('span', { class: 'label', text: 'Когда' }), when),
        h('label', { class: 'field' }, h('span', { class: 'label', text: 'О чём' }), note)
      ),
      tomorrow
    );
  }

  // Части этапа «Встреча»: перед встречей, диагностика, КП, закрытие
  function currentPhase(lead, stage) {
    if (!stage.phases) return '';
    var saved = lead.data._phase;
    if (stage.phases.some(function (p) { return p.id === saved; })) return saved;
    return lead.data.m_held === 'Состоялась' ? 'diag' : 'pre';
  }

  function inPhase(item, phase) {
    return !phase || item.phase === phase;
  }

  function phaseBar(lead, stage, rerender) {
    if (!stage.phases) return null;
    var phase = currentPhase(lead, stage);
    var saved = lead.checks[stage.id] || {};
    return h('div', { class: 'phase-bar' }, stage.phases.map(function (p, i) {
      var items = stage.checklist.filter(function (c) { return c.phase === p.id; });
      var done = items.filter(function (c) { return saved[c.id]; }).length;
      return h('button', {
        type: 'button', class: 'phase' + (p.id === phase ? ' is-active' : '') + (items.length && done === items.length ? ' is-done' : ''),
        onClick: function () { store.setData(lead.id, '_phase', p.id); rerender(); }
      }, (i + 1) + '. ' + p.title, h('span', { class: 'count', text: done + '/' + items.length }));
    }));
  }

  function checklist(lead, stage) {
    if (!stage.checklist.length) return null;
    var phase = currentPhase(lead, stage);
    var list = stage.checklist.filter(function (c) { return inPhase(c, phase); });
    var saved = lead.checks[stage.id] || {};
    var done = list.filter(function (c) { return saved[c.id]; }).length;
    var counter = h('span', { class: 'count', text: done + ' из ' + list.length });
    var items = list.map(function (c) {
      var box = h('input', { type: 'checkbox', checked: !!saved[c.id] });
      box.addEventListener('change', function () {
        store.toggleCheck(lead.id, stage.id, c.id, box.checked);
        var s = store.get(lead.id).checks[stage.id] || {};
        counter.textContent = list.filter(function (x) { return s[x.id]; }).length + ' из ' + list.length;
      });
      return h('label', { class: 'check' }, box, h('span', { text: c.text }));
    });
    return h('section', { class: 'card' },
      h('h3', null, 'Чек-лист ', counter),
      items
    );
  }

  function stageForm(lead, stage) {
    if (!stage.fields.length) return null;
    var phase = currentPhase(lead, stage);
    return h('section', { class: 'card' },
      h('h3', { text: 'Записи' }),
      stage.fields.filter(function (f) { return inPhase(f, phase); }).map(function (f) { return fieldNode(lead, f); })
    );
  }

  function historyBox(lead, rerender) {
    var input = h('input', { type: 'text', class: 'input', placeholder: 'Заметка о звонке или сообщении' });
    function add() {
      var text = input.value.trim();
      if (!text) return;
      store.addNote(lead.id, text);
      rerender();
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
    var current = store.get(lead.id);
    return h('section', { class: 'card' },
      h('h3', { text: 'История' }),
      h('div', { class: 'add-note' }, input, h('button', { type: 'button', class: 'btn', onClick: add }, 'Добавить')),
      h('ul', { class: 'history' }, current.history.slice(0, 30).map(function (e) {
        return h('li', { class: 'h-' + e.type },
          h('span', { class: 'h-time', text: U.fmtDateTime(e.at) }),
          h('span', { text: e.text })
        );
      }))
    );
  }

  // ---------- Шапка со ступенями ----------
  function header(lead, stage, rerender) {
    var next = D.nextStage(lead.stage);
    var stepper = h('div', { class: 'stepper' }, D.mainStageIds.map(function (id) {
      var s = D.stageById(id);
      var idxCur = D.mainStageIds.indexOf(lead.stage);
      var idx = D.mainStageIds.indexOf(id);
      var cls = 'step' + (id === lead.stage ? ' is-current' : idxCur >= 0 && idx < idxCur ? ' is-done' : '');
      return h('button', {
        type: 'button', class: cls, title: s.goal,
        onClick: function () { C.actions.move(lead.id, id, rerender); }
      }, s.title);
    }));

    var tel = U.telHref(lead.phone);
    var chat = U.chatHref(lead.contact);
    var quick = h('div', { class: 'quick' },
      tel ? h('a', { class: 'btn btn-small', href: tel, title: lead.phone }, 'Позвонить') : null,
      chat ? h('a', { class: 'btn btn-small', href: chat, target: '_blank', rel: 'noopener' }, 'Написать') : null,
      h('button', { type: 'button', class: 'btn btn-small', onClick: function () { C.views.templates.openFor(store.get(lead.id) || lead); } }, 'Сообщение')
    );

    var buttons = h('div', { class: 'head-actions' },
      next ? h('button', {
        type: 'button', class: 'btn btn-primary',
        onClick: function () { C.actions.move(lead.id, next.id, rerender); }
      }, 'Дальше: ' + next.title) : null,
      lead.stage !== 'hold' && lead.stage !== 'won' && lead.stage !== 'lost'
        ? h('button', { type: 'button', class: 'btn', onClick: function () { C.actions.move(lead.id, 'hold', rerender); } }, 'Думает')
        : null,
      lead.stage !== 'lost' && lead.stage !== 'won'
        ? h('button', { type: 'button', class: 'btn', onClick: function () { C.actions.move(lead.id, 'lost', rerender); } }, 'Слив')
        : null,
      h('button', {
        type: 'button', class: 'btn btn-danger',
        onClick: function () {
          if (window.confirm('Удалить клиента навсегда?')) {
            store.remove(lead.id);
            window.location.hash = '#board';
          }
        }
      }, 'Удалить')
    );

    return h('div', { class: 'lead-head' },
      h('a', { class: 'back', href: '#board', text: 'К доске' }),
      h('div', { class: 'lead-title' },
        h('h1', { text: lead.name || 'Без имени' }),
        h('span', { class: 'chip chip-' + stage.kind, text: stage.title })
      ),
      stepper,
      quick,
      h('div', { class: 'now' },
        h('div', { class: 'eyebrow', text: 'Что делать сейчас' }),
        h('p', { text: stage.action })
      ),
      buttons
    );
  }

  // ---------- Дополнительные инструменты по этапам ----------
  function tools(lead, stage) {
    var list = [];
    if (stage.id === 'meet') {
      list.push(h('button', {
        type: 'button', class: 'btn btn-primary',
        onClick: function () { window.location.hash = '#present/' + lead.id; }
      }, 'Показать КП'));
      list.push(h('button', {
        type: 'button', class: 'btn',
        onClick: function () { window.location.hash = '#kp/' + lead.id; }
      }, 'Сформировать КП'));
      list.push(h('button', {
        type: 'button', class: 'btn',
        onClick: function () { window.location.hash = '#calc/' + lead.id; }
      }, 'Калькулятор'));
      list.push(h('button', { type: 'button', class: 'btn', onClick: function () { showKp(lead); } }, 'Текст КП'));
    }
    if (['meet', 'pay'].indexOf(stage.id) >= 0) {
      list.push(h('a', { class: 'btn', href: '#sales' }, 'Шпаргалка'));
    }
    if (['meet', 'hold'].indexOf(stage.id) >= 0) {
      list.push(h('button', {
        type: 'button', class: 'btn',
        onClick: function () { window.location.hash = '#library/objections'; }
      }, 'Возражения'));
    }
    if (stage.id === 'won') {
      list.push(h('button', {
        type: 'button', class: 'btn btn-primary',
        onClick: function () { window.location.hash = '#project/' + lead.id; }
      }, 'Ведение проекта'));
    }
    if (!list.length) return null;
    return h('div', { class: 'tools' }, list);
  }

  function fileItem(f) {
    return h('li', { class: 'file' },
      h('a', { href: D.fileHref(f.file), target: '_blank', rel: 'noopener', text: f.title }),
      f.key ? h('span', { class: 'badge-key', text: 'главный' }) : null,
      h('div', { class: 'muted', text: f.use })
    );
  }

  function materials(stage) {
    var list = D.filesFor(stage.id);
    if (!list.length) return null;
    return h('section', { class: 'card' },
      h('h3', { text: 'Что открыть и отправить на этом этапе' }),
      h('ul', { class: 'files' }, list.map(fileItem))
    );
  }

  function showKp(lead) {
    var fresh = store.get(lead.id);
    var area = h('textarea', { class: 'input kp-text', rows: 18, readonly: 'readonly' });
    area.value = C.kp.build(fresh);
    C.modal.open({
      title: 'Текст КП для ' + (fresh.name || 'клиента'),
      body: area,
      actions: [
        { label: 'Закрыть', onClick: function (close) { close(); } },
        {
          label: 'Скопировать', primary: true,
          onClick: function () {
            area.select();
            try {
              if (navigator.clipboard) navigator.clipboard.writeText(area.value);
              else document.execCommand('copy');
            } catch (e) {
              document.execCommand('copy');
            }
          }
        }
      ]
    });
  }

  // ---------- Сборка экрана ----------
  function render(leadId) {
    var lead = store.get(leadId);
    if (!lead) {
      return h('div', { class: 'view' },
        h('div', { class: 'empty' },
          h('h2', { text: 'Клиент не найден' }),
          h('a', { href: '#board', class: 'btn', text: 'К доске' })
        )
      );
    }
    var stage = D.stageById(lead.stage);
    var root = h('div', { class: 'view lead-view' });

    function rerender() {
      var fresh = render(leadId);
      root.replaceWith(fresh);
      C.app.syncRoot(fresh);
    }

    root.appendChild(header(lead, stage, rerender));
    root.appendChild(h('div', { class: 'lead-grid' },
      h('div', { class: 'lead-left' },
        tools(lead, stage),
        phaseBar(lead, stage, rerender),
        nextContactBox(lead),
        materials(stage),
        C.views.segments.hint(lead, stage),
        C.views.cases.hint(lead, stage),
        checklist(lead, stage),
        stageForm(lead, stage),
        contactForm(lead),
        h('section', { class: 'card' },
          h('h3', { text: 'Общие заметки' }),
          (function () {
            var ta = h('textarea', { class: 'input', rows: 3, value: lead.notes || '' });
            bindSave(ta, lead, 'notes', true);
            return ta;
          })()
        ),
        historyBox(lead, rerender)
      ),
      scriptPanel(lead, stage, rerender)
    ));
    return root;
  }

  C.views = C.views || {};
  C.views.lead = { render: render };
})((window.CRM = window.CRM || {}));
