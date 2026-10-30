(function (C) {
  'use strict';

  var D = C.data;
  var U = C.utils;

  var HOLES = { name: 'имя', niche: 'ниша', city: 'город', when: 'дата и время' };

  function firstName(full) {
    return String(full || '').trim().split(/\s+/)[0] || '';
  }

  function vars(lead) {
    lead = lead || {};
    return {
      name: firstName(lead.name),
      niche: lead.niche || '',
      city: lead.city || '',
      when: lead.nextAt ? U.fmtDateTime(lead.nextAt) : ''
    };
  }

  // Подстановка: пустое значение превращается в [подсказку], чтобы было видно, что дописать
  function fill(text, lead) {
    var v = vars(lead);
    return String(text).replace(/\{(\w+)\}/g, function (m, key) {
      return v[key] ? v[key] : '[' + (HOLES[key] || key) + ']';
    });
  }

  function holes(text) {
    return (String(text).match(/\[[^\]]+\]/g) || []).length;
  }

  // Все шаблоны: готовые и свои
  function all() {
    var own = C.store.templates().map(function (t) {
      return { id: t.id, group: 'own', stages: [], title: t.title, use: '', text: t.text, own: true };
    });
    return D.messageTemplates.concat(own);
  }

  function groups() {
    return D.templateGroups.concat([{ id: 'own', title: 'Свои' }]);
  }

  // Шаблоны под этап лида: сначала подходящие по этапу
  function forStage(stageId) {
    var list = all();
    var match = list.filter(function (t) { return t.stages.indexOf(stageId) >= 0; });
    var rest = list.filter(function (t) { return t.stages.indexOf(stageId) < 0; });
    return { match: match, rest: rest };
  }

  C.templates = { fill: fill, vars: vars, holes: holes, all: all, groups: groups, forStage: forStage, firstName: firstName };
})((window.CRM = window.CRM || {}));
