(function (C) {
  'use strict';

  var U = C.utils;
  var calc = C.calc;

  // Текст КП для показа на созвоне. Собирается из того, что записано в карточке.
  // Цена идёт отдельным блоком в конце: её показываем только на этапе закрытия.
  function build(lead) {
    var d = lead.data || {};
    var res = calc.compute({
      cheque: d.calc_cheque,
      deals: d.calc_deals,
      conv: d.calc_conv || 10,
      cpl: d.calc_cpl
    });
    var name = lead.name || '[Имя]';
    var niche = lead.niche || '[ниша]';
    var city = lead.city || '[город]';
    var lines = [];

    lines.push('Коммерческое предложение для ' + name);
    lines.push(niche + ', ' + city);
    lines.push('');

    lines.push('1. Ваша цель');
    if (d.b_goal) lines.push('Вы сказали: ' + d.b_goal);
    if (res.valid) {
      lines.push(
        'Цель в цифрах: ' + d.calc_deals + ' клиентов в месяц, это ' + U.fmtMoney(res.revenue) +
        ' выручки. Для этого нужно около ' + res.leads + ' квалифицированных заявок в месяц.'
      );
    } else {
      lines.push('Цель в цифрах: [посчитай во вкладке «Калькулятор» и сохрани в карточку]');
    }
    if (d.d_quote) lines.push('«' + d.d_quote + '»');
    lines.push('');

    lines.push('2. Что сейчас мешает');
    if (d.a_pain) lines.push(d.a_pain);
    if (d.a_tried) lines.push('Пробовали: ' + d.a_tried);
    if (d.b_block) lines.push('Мешает дойти самому: ' + d.b_block);
    lines.push('');

    lines.push('3. Что вы получаете');
    lines.push('Трафик по запросам вашей ниши в городе ' + city + ', сайт-конвертер и утепляющая воронка: заявка не остывает, менеджер звонит подготовленному человеку.');
    C.offer.tiers().forEach(function (t) {
      lines.push('• ' + t.name + ': ' + t.channels + ', разработка ' + t.term + '.');
    });
    lines.push('Все заявки с ответами человека приходят вам в CRM.');
    lines.push('');
    lines.push('Бонус: ' + C.offer.bonusText());
    lines.push('');

    lines.push('Вопрос: нужна ли вам помощь в получении ' + (res.valid ? res.leads + ' заявок и ' + U.fmtMoney(res.revenue) : '[цели]') + '?');
    lines.push('');
    lines.push('--- Только для себя, клиенту не показывать до закрытия ---');
    lines.push('Тарифы: ' + C.offer.tiers().map(function (t) { return t.name + ' ' + U.fmtMoney(t.price); }).join(', ') + ' разово, плюс рекламный бюджет. ' + C.offer.maintainText() + '.');
    lines.push('Выбрано: ' + (d.price_amount ? U.fmtMoney(d.price_amount) : '[цена]') + '. Дедлайн: ' + (d.price_deadline || '[дедлайн]'));

    return lines.join('\n');
  }

  C.kp = { build: build };
})((window.CRM = window.CRM || {}));
