(function (C) {
  'use strict';

  // Диапазон из шаблона КП спринта: «средняя цена целевой заявки 240-1490 рублей с НДС (зависит от города)»
  var KP_RANGE = { low: 240, high: 1490 };

  // Оценка стоимости заявки: ниша клиента и город. Цены берутся из данных EGOKAD (js/core/egokad.js).
  function estimate(niche, city) {
    return C.egokad.estimate(niche, city);
  }

  function describe(est, niche, city) {
    return C.egokad.describe(est, niche, city);
  }

  C.cpl = { KP_RANGE: KP_RANGE, estimate: estimate, describe: describe };
})((window.CRM = window.CRM || {}));
