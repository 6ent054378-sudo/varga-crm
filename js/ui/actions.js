(function (C) {
  'use strict';

  var h = C.dom.h;
  var U = C.utils;
  var D = C.data;
  var store = C.store;

  // Перевод лида на этап с нужными вопросами (дата следующего контакта, причина слива).
  // afterMove вызывается после перевода, чтобы экран перерисовался.
  function move(leadId, stageId, afterMove) {
    var lead = store.get(leadId);
    var stage = D.stageById(stageId);
    if (!lead || !stage || lead.stage === stageId) return;

    function done() {
      if (afterMove) afterMove();
    }

    if (stageId === 'lost') {
      var reasonSel = h('select', { class: 'input' },
        D.lostReasons.map(function (r) { return h('option', { value: r }, r); })
      );
      C.modal.open({
        title: 'Причина слива',
        body: h('label', { class: 'field' }, h('span', { class: 'label', text: 'Почему клиент не купил' }), reasonSel),
        actions: [
          { label: 'Отмена', onClick: function (close) { close(); } },
          {
            label: 'Перенести в слив', primary: true,
            onClick: function (close) {
              store.moveStage(leadId, 'lost', { reason: reasonSel.value });
              close();
              done();
            }
          }
        ]
      });
      return;
    }

    if (stage.requiresNext) {
      var when = h('input', { type: 'datetime-local', class: 'input', value: U.tomorrowAt(12) });
      var note = h('input', { type: 'text', class: 'input', placeholder: 'Например: позвонить по КП' });
      var reason = stageId === 'hold'
        ? h('input', { type: 'text', class: 'input', placeholder: 'Что сказал клиент' })
        : null;
      C.modal.open({
        title: 'Следующий контакт: «' + stage.title + '»',
        body: h('div', null,
          h('p', { class: 'muted', text: 'Правило: следующий контакт завтра, максимум послезавтра. Без даты клиент пропадает.' }),
          reason ? h('label', { class: 'field' }, h('span', { class: 'label', text: 'Причина' }), reason) : null,
          h('label', { class: 'field' }, h('span', { class: 'label', text: 'Когда' }), when),
          h('label', { class: 'field' }, h('span', { class: 'label', text: 'О чём разговор' }), note)
        ),
        actions: [
          { label: 'Отмена', onClick: function (close) { close(); } },
          {
            label: 'Перевести', primary: true,
            onClick: function (close) {
              if (!when.value) {
                when.focus();
                return;
              }
              store.moveStage(leadId, stageId, {
                nextAt: when.value,
                nextNote: note.value,
                reason: reason ? reason.value : ''
              });
              close();
              done();
            }
          }
        ]
      });
      return;
    }

    store.moveStage(leadId, stageId);
    done();
  }

  C.actions = { move: move };
})((window.CRM = window.CRM || {}));
