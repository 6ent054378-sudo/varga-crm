(function (C) {
  'use strict';

  var D = (C.data = C.data || {});

  // Этап «Встреча»: диагностика, КП и закрытие идут одной встречей.
  // Скрипт и карта собраны из готовых частей: перед встречей, диагностика, КП, закрытие.
  var PARTS = ['booked', 'diag', 'kp', 'close'];

  D.scripts.meet = {
    title: 'Встреча: диагностика, КП, закрытие',
    sections: PARTS.reduce(function (all, id) { return all.concat(D.scripts[id].sections); }, [])
  };

  D.mindmaps.meet = {
    extraTitle: 'Перед встречей и скрипт практикума №3 (по блокам)',
    extraSections: PARTS.reduce(function (all, id) {
      return all.concat(id === 'booked' ? D.scripts.booked.sections.map(function (s) { return s.title; }) : D.mindmaps[id].extraSections);
    }, []),
    tree: {
      t: 'Встреча',
      c: [D.mindmaps.diag.tree, D.mindmaps.kp.tree, D.mindmaps.close.tree]
    }
  };
})((window.CRM = window.CRM || {}));
