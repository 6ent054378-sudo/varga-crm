(function (C) {
  'use strict';

  var h = C.dom.h;
  var U = C.utils;
  var D = C.data;
  var P = C.proposal;
  var store = C.store;

  var keyHandler = null;
  var position = {};
  var demoChoice = '';
  var showNotes = true;
  var hintSeen = false;

  var TAG = { say: 'Говори', ask: 'Спроси', tip: 'Важно', dont: 'Не делай' };
  var KEYS = [
    ['← →', 'листать слайды (ещё Пробел и PageUp/PageDown)'],
    ['N', 'показать или спрятать подсказки, что говорить'],
    ['F', 'на весь экран и обратно'],
    ['?', 'эта подсказка'],
    ['Esc', 'выйти из показа']
  ];

  function money(v) {
    return U.fmtMoney(Math.round(v)) || '0 ₽';
  }

  function bullets(items, cls) {
    return h('ul', { class: cls || 'pres-list' }, items.map(function (t) { return h('li', { text: t }); }));
  }

  function bigNum(value, label) {
    return h('div', { class: 'pres-num' }, h('div', { class: 'pres-num-v', text: String(value) }), h('div', { class: 'pres-num-l', text: label }));
  }

  function head(meta, title) {
    return [
      h('div', { class: 'pres-kicker', text: meta.kicker }),
      h('h2', { class: 'pres-h', text: title || meta.title })
    ];
  }

  // Без клиента: демо на газобетоне с условными цифрами. Ничего не сохраняется.
  function demoLead() {
    var f = D.focus || {};
    return { id: '', demo: true, name: '', niche: f.niche || '', city: '', data: {} };
  }

  // Одна модель на КП и презентатор: цифры вводятся один раз в генераторе КП
  function modelFor(lead) {
    var params;
    if (lead.demo) {
      params = P.sample(P.defaults(null));
      if (demoChoice) params.tier = demoChoice;
    } else {
      params = P.paramsFor(lead);
    }
    var m = P.model(params);
    return { m: m, est: C.cpl.estimate(m.p.niche, m.p.city) };
  }

  function priceRange(est) {
    return est.low === est.high ? money(est.value) : money(est.low).replace(' ₽', '') + '-' + money(est.high);
  }

  function kpHref(lead) {
    return '#kp' + (lead.demo ? '' : '/' + lead.id);
  }

  function fixLink(lead, text) {
    return lead.demo ? null : h('a', { class: 'btn btn-primary', href: kpHref(lead), text: text || 'Заполнить в генераторе КП' });
  }

  // ---------- Слайды ----------
  function slideGoal(meta, lead, f) {
    var m = f.m;
    var box = h('div', { class: 'pres-slide' }, head(meta, (m.p.niche || 'Ваша ниша') + (m.p.city ? ', ' + m.p.city : '')));
    box.appendChild(h('h3', { class: 'pres-sub-h', text: 'Ваша цель' }));
    var d = lead.data || {};
    if (d.b_goal) box.appendChild(h('p', { class: 'pres-quote', text: '«' + d.b_goal + '»' }));
    if (d.d_quote) box.appendChild(h('p', { class: 'pres-quote', text: '«' + d.d_quote + '»' }));
    if (m.bShown) {
      box.appendChild(h('div', { class: 'pres-nums' },
        bigNum(m.b.deals, 'договоров в месяц'),
        bigNum(money(m.b.revenue), 'выручки в месяц'),
        bigNum(m.b.leads, 'заявок для этого нужно')
      ));
      if (lead.demo) box.appendChild(h('p', { class: 'pres-note', text: 'Демо: цифры условные.' }));
    } else {
      box.appendChild(h('p', { class: 'pres-lead', text: 'Впиши цель по договорам и средний чек в генераторе КП, и здесь появятся договоры, выручка и нужное число заявок.' }));
      box.appendChild(fixLink(lead));
    }
    return box;
  }

  function slideAB(meta, lead, f) {
    var m = f.m;
    var box = h('div', { class: 'pres-slide' }, head(meta));
    if (m.aShown && m.bShown) {
      var row = function (label, x, y) {
        return h('div', { class: 'ab-row' }, h('div', { class: 'ab-label', text: label }), h('div', { text: String(x) }), h('div', { text: String(y) }));
      };
      box.appendChild(h('div', { class: 'ab-grid pres-ab' },
        h('div', { class: 'ab-head' }, ''), h('div', { class: 'ab-head', text: 'Сейчас' }), h('div', { class: 'ab-head', text: 'Цель' }),
        row('Заявок в месяц', m.a.leads || 'нет данных', m.b.leads),
        row('Договоров в месяц', m.a.deals || 'нет данных', m.b.deals),
        row('Средний чек', money(m.a.cheque), money(m.b.cheque)),
        row('Выручка в месяц', money(m.a.revenue), money(m.b.revenue))
      ));
      var extra = (m.b.revenue - m.a.revenue) * 12;
      if (extra > 0) box.appendChild(h('div', { class: 'pres-total' }, 'За 12 месяцев: ', h('strong', { text: '+' + money(extra) + ' выручки' })));
    } else if (m.bShown) {
      box.appendChild(h('p', { class: 'pres-lead', text: 'Цель на месяц:' }));
      box.appendChild(h('div', { class: 'pres-nums' }, bigNum(m.b.deals, 'договоров'), bigNum(money(m.b.revenue), 'выручки')));
      box.appendChild(h('p', { class: 'pres-note', text: 'Спроси, сколько договоров и заявок сейчас, и впиши в блок «Точка А» генератора КП: слайд станет сравнением.' }));
      box.appendChild(fixLink(lead, 'Открыть генератор КП'));
    } else if (f.est.known) {
      box.appendChild(h('p', { class: 'pres-lead', text: 'Цена заявки в вашей нише' + (m.p.city ? ' и городе ' + m.p.city : '') + ':' }));
      box.appendChild(h('div', { class: 'pres-nums' }, bigNum(priceRange(f.est), 'за заявку с НДС')));
      box.appendChild(h('p', { class: 'pres-note', text: 'Данные EGOKAD по нише. Впиши цели в генераторе КП, и здесь будет сравнение.' }));
      box.appendChild(fixLink(lead));
    } else {
      box.appendChild(h('p', { class: 'pres-lead', text: 'Впиши данные клиента в генераторе КП, и здесь будет сравнение.' }));
      box.appendChild(fixLink(lead));
    }
    return box;
  }

  function slideEcon(meta, lead, f) {
    var m = f.m;
    var box = h('div', { class: 'pres-slide' }, head(meta, 'Сколько заявок нужно под вашу цель'));
    if (!m.econShown) {
      box.appendChild(h('p', { class: 'pres-lead', text: 'Для расчёта нужны цель по договорам, средний чек и цена заявки.' + (m.miss.length ? ' Не хватает: ' + m.miss.join(', ') + '.' : '') }));
      box.appendChild(fixLink(lead));
      return box;
    }
    box.appendChild(h('div', { class: 'pres-tiers' }, m.econ.map(function (c, i) {
      return h('div', { class: 'pres-tier pres-price' + (i === 1 ? ' is-chosen' : '') },
        h('h3', { text: c.title }),
        h('div', { class: 'pres-price-v', text: P.money(c.res.revenue) }),
        h('div', { class: 'pres-price-per', text: 'выручка в месяц' }),
        h('p', { class: 'pres-note', text: c.res.leads + ' заявок, ' + c.res.meetings + ' встреч, ' + c.res.sales + ' продаж' }),
        h('p', { class: 'pres-note', text: 'Рекламный бюджет ' + P.money(c.res.budget) }));
    })));
    box.appendChild(h('p', { class: 'pres-note', text: 'Цена заявки ' + P.money(m.cpl) + ' это ориентир по рынку, точная станет известна после запуска. Конверсии: заявка во встречу ' + m.meet + '%, встреча в договор ' + m.pay + '%.' }));
    return box;
  }

  function slideHow(meta) {
    var box = h('div', { class: 'pres-slide' }, head(meta, 'Заявка не теряется ни на одном шаге'));
    box.appendChild(h('div', { class: 'pres-flow' }, D.presentFlow.map(function (s, i) {
      return h('div', { class: 'pres-step' },
        h('div', { class: 'pres-step-n', text: String(i + 1) }),
        h('div', { class: 'pres-step-t', text: s.t }),
        h('div', { class: 'pres-step-d', text: s.d }));
    })));
    return box;
  }

  // Доверие без выдуманных кейсов: рыночные цифры с источником, примеры посадочных, условия старта
  function slideTrust(meta, lead, f) {
    var box = h('div', { class: 'pres-slide' }, head(meta, 'Что вы увидите до оплаты'));
    var niche = f.m.p.niche;
    var rec = (D.egokad || []).filter(function (r) { return r.niche === C.egokad.match(niche); })[0];
    var landings = rec && rec.landings ? rec.landings : [];

    var market = h('div', { class: 'pres-card' }, h('h3', { text: 'Цены рынка' }));
    if (f.est.known) {
      market.appendChild(h('div', { class: 'pres-card-big', text: priceRange(f.est) }));
      market.appendChild(h('p', { class: 'pres-card-cap', text: 'за заявку с НДС в нише «' + (f.est.names[0] || niche) + '». Источник: EGOKAD, не наш кейс.' }));
    } else {
      market.appendChild(h('p', { class: 'pres-card-cap', text: 'Укажи нишу клиента, и здесь появятся цены заявок по данным EGOKAD.' }));
    }

    var samples = h('div', { class: 'pres-card' }, h('h3', { text: 'Примеры по нише' }));
    if (landings.length) {
      samples.appendChild(h('p', { class: 'pres-card-cap', text: 'Посадочная и квиз из подборки EGOKAD. Показываем как формат, не как свой результат.' }));
      landings.slice(0, 3).forEach(function (u) {
        samples.appendChild(h('a', { class: 'btn', href: u, target: '_blank', rel: 'noopener', text: u.replace(/^https?:\/\//, '') }));
      });
    } else {
      samples.appendChild(h('p', { class: 'pres-card-cap', text: 'Для этой ниши примеров посадочных в подборке нет. Покажи макет с пометкой «макет».' }));
    }

    var start = h('div', { class: 'pres-card' }, h('h3', { text: 'Условия старта' }),
      bullets([
        'Расчёт цели и плана на встрече, бесплатно',
        'Бонус ' + D.offerBonus.normalPrice.toLocaleString('ru-RU') + ' ₽ за наш счёт ' + D.offerBonus.condition,
        'Рекламный бюджет платите напрямую в Яндекс'
      ], 'pres-list'));

    box.appendChild(h('div', { class: 'pres-cards' }, market, samples, start));
    return box;
  }

  function slideWhat(meta) {
    var box = h('div', { class: 'pres-slide' }, head(meta));
    var cols = h('div', { class: 'pres-tiers' });
    C.offer.tiers().forEach(function (t) {
      var more = h('div', { class: 'pres-more', hidden: 'hidden' }, t.blocks.map(function (b) {
        return h('details', null, h('summary', { text: b.title }), bullets(b.items, 'pres-sub'));
      }));
      var toggle = h('button', { type: 'button', class: 'btn btn-small' }, 'Что входит');
      toggle.addEventListener('click', function () {
        if (more.hasAttribute('hidden')) { more.removeAttribute('hidden'); toggle.textContent = 'Скрыть'; }
        else { more.setAttribute('hidden', 'hidden'); toggle.textContent = 'Что входит'; }
      });
      cols.appendChild(h('div', { class: 'pres-tier' },
        h('h3', { text: t.name }),
        h('p', { class: 'pres-tier-head', text: t.headline }),
        t.summary.length ? bullets(t.summary) : null,
        toggle, more));
    });
    box.appendChild(cols);
    return box;
  }

  function slideBonus(meta) {
    var b = D.offerBonus;
    var box = h('div', { class: 'pres-slide' },
      h('div', { class: 'pres-kicker', text: meta.kicker + ': ' + b.condition }),
      h('h2', { class: 'pres-h', text: b.title }),
      h('p', { class: 'pres-lead', text: 'Обычная стоимость ' + b.normalPrice.toLocaleString('ru-RU') + ' ₽. Делаем за свой счёт.' })
    );
    box.appendChild(h('div', { class: 'pres-tiers' }, b.blocks.map(function (blk) {
      return h('div', { class: 'pres-tier' }, h('h3', { text: blk.title }), bullets(blk.items));
    })));
    return box;
  }

  // Выбор тарифа пишем в карточку и в сохранённые параметры КП, чтобы КП и презентатор совпадали
  function chooseTier(lead, tierId) {
    if (lead.demo) { demoChoice = tierId; return; }
    C.offer.choose(lead.id, tierId);
    var fresh = store.get(lead.id);
    if (fresh && fresh.data.kp_params) {
      try {
        var saved = JSON.parse(fresh.data.kp_params);
        saved.tier = tierId;
        store.setData(lead.id, 'kp_params', JSON.stringify(saved));
      } catch (e) { /* параметры повреждены: КП соберётся из карточки */ }
    }
  }

  function slidePrices(meta, lead, rerender) {
    var chosen = lead.demo ? demoChoice : (store.get(lead.id).data.price_tariff || '');
    var box = h('div', { class: 'pres-slide' }, head(meta));
    box.appendChild(h('div', { class: 'pres-tiers' }, C.offer.tiers().map(function (t) {
      return h('div', { class: 'pres-tier pres-price' + (chosen === t.id ? ' is-chosen' : '') },
        h('h3', { text: t.name }),
        h('div', { class: 'pres-price-v', text: money(t.price) }),
        h('div', { class: 'pres-price-per', text: 'разово, за запуск' }),
        h('p', { class: 'pres-note', text: 'Срок разработки ' + t.term }),
        h('button', {
          type: 'button', class: 'btn' + (chosen === t.id ? ' btn-primary' : ''),
          onClick: function () { chooseTier(lead, t.id); rerender(); }
        }, chosen === t.id ? 'Выбрано' : 'Клиент выбрал'));
    })));
    box.appendChild(h('p', { class: 'pres-note', text: 'Цена разовая. Рекламный бюджет отдельно. ' + C.offer.bonusText() }));
    box.appendChild(h('p', { class: 'pres-note pres-maint', text: C.offer.maintainText() + '.' }));
    return box;
  }

  function slideAsk(meta, lead, f, done) {
    var m = f.m;
    var goal = m.bShown ? m.b.leads + ' заявок и ' + money(m.b.revenue) : 'вашей цели';
    var box = h('div', { class: 'pres-slide pres-final' },
      h('div', { class: 'pres-kicker', text: meta.kicker }),
      h('h2', { class: 'pres-h pres-h-big', text: 'Нужна ли вам помощь в получении ' + goal + '?' })
    );
    if (lead.demo) {
      box.appendChild(h('div', { class: 'tools' },
        h('a', { class: 'btn btn-primary', href: '#board', text: 'Выбрать клиента на доске' }),
        h('a', { class: 'btn', href: '#library/objections', text: 'Возражения' })
      ));
      return box;
    }
    box.appendChild(h('div', { class: 'tools' },
      h('button', { type: 'button', class: 'btn btn-primary', onClick: function () { C.actions.move(lead.id, 'pay', done); } }, 'Да, оплата'),
      h('button', { type: 'button', class: 'btn', onClick: function () { C.actions.move(lead.id, 'hold', done); } }, 'Думает'),
      h('a', { class: 'btn', href: '#library/objections', text: 'Возражения' }),
      h('a', { class: 'btn', href: '#lead/' + lead.id, text: 'В карточку' })
    ));
    return box;
  }

  function notesPanel(meta) {
    return h('div', { class: 'pres-notes-list' }, meta.notes.map(function (n) {
      return h('div', { class: 'pres-note-line pres-note-' + n.k },
        h('span', { class: 'pres-note-tag', text: TAG[n.k] || 'Важно' }),
        h('span', { text: n.t }));
    }));
  }

  // ---------- Экран подготовки ----------
  function readiness(lead, f) {
    var m = f.m;
    var p = m.p;
    return [
      {
        label: 'Цель и средний чек', ok: m.bShown,
        value: m.bShown ? m.b.deals + ' договоров по ' + money(m.b.cheque) + ', нужно ' + m.b.leads + ' заявок' : 'Не заполнено: слайды «Цель», «Было и станет» и «Экономика» будут пустыми'
      },
      {
        label: 'Цена заявки', ok: !!m.cpl,
        value: m.cpl ? money(m.cpl) + (f.est.known ? ', ориентир по данным EGOKAD' : '') : 'Укажи нишу и город, или впиши цену вручную в генераторе КП'
      },
      {
        label: 'Точка А: что сейчас', ok: m.aShown, optional: true,
        value: m.aShown ? (m.a.leads || 0) + ' заявок, ' + (m.a.deals || 0) + ' договоров в месяц' : 'Необязательно, но со сравнением «было и станет» слайд сильнее'
      },
      { label: 'Тариф', ok: true, value: m.tier.name + ', ' + money(m.tier.price) + ' разово, ведение ' + money(m.maintain.price) + ' в месяц по желанию. Клиент выберет на слайде «Стоимость»' },
      {
        label: 'Бонус за оплату', ok: !!p.bonus, optional: true,
        value: p.bonus ? 'Включён' + (P.ruDate(p.bonusUntil) ? ', до ' + P.ruDate(p.bonusUntil) : '') : 'Выключен в генераторе КП, на слайде бонус всё равно покажется'
      }
    ];
  }

  function keysList() {
    return h('div', { class: 'prep-keys' }, KEYS.map(function (k) {
      return h('div', { class: 'prep-key' }, h('kbd', { text: k[0] }), h('span', { text: k[1] }));
    }));
  }

  function prepView(lead) {
    var f = modelFor(lead);
    var key = lead.demo ? 'demo' : lead.id;
    var items = readiness(lead, f);
    var ready = f.m.bShown;

    var picker = h('select', { class: 'input' },
      h('option', { value: 'demo' }, 'Демо без клиента (условные цифры)'),
      store.leads().filter(function (l) { return l.stage !== 'lost'; }).map(function (l) {
        return h('option', { value: l.id }, (l.name || 'Без имени') + (l.niche ? ', ' + l.niche : ''));
      }));
    picker.value = key;
    picker.addEventListener('change', function () { window.location.hash = '#present/' + picker.value; });

    var list = h('ul', { class: 'prep-list' }, items.map(function (it) {
      var state = it.ok ? 'Готово' : (it.optional ? 'Можно добавить' : 'Нужно заполнить');
      return h('li', { class: 'prep-item ' + (it.ok ? 'is-ok' : (it.optional ? 'is-opt' : 'is-need')) },
        h('span', { class: 'prep-state', text: state }),
        h('div', null, h('strong', { text: it.label }), h('div', { class: 'muted', text: it.value })));
    }));

    var go = h('a', { class: 'btn btn-primary prep-go', href: '#present/' + key + '/go', text: 'Начать показ' });
    var fix = lead.demo ? null : h('a', { class: 'btn', href: kpHref(lead), text: ready ? 'Править цифры в генераторе КП' : 'Заполнить цифры в генераторе КП' });
    var back = lead.demo
      ? h('a', { class: 'btn', href: '#board', text: 'Выбрать клиента на доске' })
      : h('a', { class: 'btn', href: '#lead/' + lead.id, text: 'В карточку клиента' });

    return h('div', { class: 'view pres-prep' },
      h('div', { class: 'page-head' },
        h('h1', { text: 'Презентатор КП' }),
        h('p', { class: 'muted', text: 'Показ КП клиенту на встрече по шагам, на весь экран. Подсказки, что говорить, видишь только ты. Цифры берутся из генератора КП, второй раз вводить ничего не нужно.' })
      ),
      h('div', { class: 'grid2 prep-grid' },
        h('section', { class: 'card' },
          h('h3', { text: '1. Для кого показываем' }),
          h('label', { class: 'field' }, h('span', { class: 'label', text: 'Клиент' }), picker),
          lead.demo ? h('p', { class: 'muted', text: 'Демо покажет, как всё выглядит. Для настоящей встречи выбери клиента: цифры подтянутся из его карточки и КП.' }) : null),
        h('section', { class: 'card' }, h('h3', { text: '2. Что готово' }), list)
      ),
      h('section', { class: 'card' },
        h('h3', { text: '3. Показ' }),
        !ready && !lead.demo ? h('p', { class: 'prep-warn', text: 'Без цели и среднего чека три слайда будут пустыми. Лучше заполнить до встречи.' }) : null,
        h('div', { class: 'tools' }, go, fix, back),
        keysList()
      ),
      h('section', { class: 'card' },
        h('h3', { text: 'Порядок встречи' }),
        h('ol', { class: 'prep-steps' }, D.presentSlides.map(function (s) {
          return h('li', null, h('strong', { text: s.title }), h('span', { class: 'muted', text: ' ' + (s.about || '') }));
        }))
      )
    );
  }

  // ---------- Показ ----------
  function showView(lead) {
    var slides = D.presentSlides;
    var key = lead.demo ? 'demo' : lead.id;
    var idx = position[key] || 0;
    var exitHref = '#present/' + key;

    var stage = h('div', { class: 'pres-stage' });
    var progress = h('div', { class: 'pres-progress' });
    var counter = h('span', { class: 'pres-counter' });
    var notes = h('div', { class: 'pres-notes' });
    var notesBtn = h('button', { type: 'button', class: 'btn btn-small' });
    var backBtn = h('button', { type: 'button', class: 'btn pres-nav' }, 'Назад');
    var nextBtn = h('button', { type: 'button', class: 'btn btn-primary pres-nav' }, 'Дальше');
    var hint = h('div', { class: 'pres-hint' }, 'Листай стрелками или кнопками. N подсказки, F весь экран, ? помощь.');
    var help = h('div', { class: 'pres-help', hidden: 'hidden' },
      h('div', { class: 'pres-help-box' },
        h('h3', { text: 'Как управлять показом' }),
        keysList(),
        h('p', { class: 'muted', text: 'Подсказки внизу видишь только ты, если не расшариваешь экран целиком. Перед показом экрана в Zoom скрой их клавишей N.' }),
        h('button', { type: 'button', class: 'btn btn-primary', onClick: function () { toggleHelp(); } }, 'Понятно')));
    var root = h('div', { class: 'view pres' });

    function build(meta, f) {
      var id = meta.id;
      if (id === 'goal') return slideGoal(meta, lead, f);
      if (id === 'ab') return slideAB(meta, lead, f);
      if (id === 'econ') return slideEcon(meta, lead, f);
      if (id === 'how') return slideHow(meta);
      if (id === 'trust') return slideTrust(meta, lead, f);
      if (id === 'what') return slideWhat(meta);
      if (id === 'bonus') return slideBonus(meta);
      if (id === 'prices') return slidePrices(meta, lead, show);
      return slideAsk(meta, lead, f, function () { window.location.hash = '#lead/' + lead.id; });
    }

    function show() {
      idx = Math.max(0, Math.min(slides.length - 1, idx));
      position[key] = idx;
      var meta = slides[idx];
      var f = modelFor(lead.demo ? lead : (store.get(lead.id) || lead));
      C.dom.clear(stage);
      stage.appendChild(build(meta, f));
      counter.textContent = (idx + 1) + ' / ' + slides.length + '  ' + meta.title;
      C.dom.clear(progress);
      slides.forEach(function (s, i) {
        progress.appendChild(h('button', {
          type: 'button', class: 'pres-seg' + (i < idx ? ' is-past' : '') + (i === idx ? ' is-active' : ''), title: s.title,
          onClick: function () { idx = i; show(); }
        }));
      });
      C.dom.clear(notes);
      notes.appendChild(notesPanel(meta));
      notes.hidden = !showNotes;
      notesBtn.textContent = showNotes ? 'Скрыть подсказки' : 'Подсказки';
      backBtn.disabled = idx === 0;
      nextBtn.disabled = idx === slides.length - 1;
      hint.hidden = hintSeen || idx > 0;
    }

    function go(step) {
      idx += step;
      if (idx > 0) hintSeen = true;
      show();
    }
    function toggleNotes() { showNotes = !showNotes; show(); }
    function toggleHelp() { help.hidden = !help.hidden; }
    function fullscreen() {
      var el = document.documentElement;
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      else if (el.requestFullscreen) el.requestFullscreen();
    }

    backBtn.addEventListener('click', function () { go(-1); });
    nextBtn.addEventListener('click', function () { go(1); });
    notesBtn.addEventListener('click', toggleNotes);

    var top = h('div', { class: 'pres-top' },
      h('a', { class: 'btn btn-small', href: exitHref, text: 'Выйти' }),
      h('div', { class: 'pres-who' },
        h('strong', { text: lead.demo ? 'Демо' : (lead.name || 'Клиент') }),
        h('span', { class: 'muted', text: lead.demo ? 'без клиента, цифры условные' : [lead.niche, lead.city].filter(Boolean).join(', ') })),
      progress,
      notesBtn,
      h('button', { type: 'button', class: 'btn btn-small', title: 'Клавиша F', onClick: fullscreen }, 'На весь экран'),
      h('button', { type: 'button', class: 'btn btn-small', title: 'Клавиша ?', onClick: toggleHelp }, '?')
    );
    var foot = h('div', { class: 'pres-foot' }, backBtn, counter, nextBtn);

    root.appendChild(top);
    root.appendChild(stage);
    root.appendChild(hint);
    root.appendChild(notes);
    root.appendChild(foot);
    root.appendChild(help);

    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = function (e) {
      if (!document.body.contains(root)) { document.removeEventListener('keydown', keyHandler); keyHandler = null; return; }
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { go(-1); }
      else if (e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') { toggleNotes(); }
      else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') { fullscreen(); }
      else if (e.key === '?') { toggleHelp(); }
      else if (e.key === 'Escape') { if (!help.hidden) toggleHelp(); else window.location.hash = exitHref; }
    };
    document.addEventListener('keydown', keyHandler);
    show();
    return root;
  }

  // leadId: id клиента или demo; mode: go запускает показ, иначе экран подготовки
  function render(leadId, mode) {
    var lead = leadId && leadId !== 'demo' ? store.get(leadId) : demoLead();
    if (!lead) {
      return h('div', { class: 'view' }, h('div', { class: 'empty' }, h('h2', { text: 'Клиент не найден' }), h('a', { href: '#board', class: 'btn', text: 'К доске' })));
    }
    if (mode === 'go') return showView(lead);
    if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
    return prepView(lead);
  }

  C.views = C.views || {};
  C.views.present = { render: render };
})((window.CRM = window.CRM || {}));
