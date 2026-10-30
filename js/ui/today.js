(function (C) {
  'use strict';

  var h = C.dom.h;
  var U = C.utils;
  var D = C.data;
  var store = C.store;

  var NEED_NEXT = ['meet', 'pay', 'hold'];

  // Две буквы для кружка: имя и фамилия, иначе первая буква
  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0].charAt(0) + (parts[1] ? parts[1].charAt(0) : '')).toUpperCase();
  }

  function telHref(phone) {
    return U.telHref(phone);
  }

  // Главный блок: кому действовать прямо сейчас
  function hero(lead, reason) {
    var tel = telHref(lead.phone);
    return h('section', { class: 'hero' },
      h('div', { class: 'hero-eyebrow', text: 'Следующий шаг' }),
      h('div', { class: 'hero-main' },
        h('div', { class: 'avatar avatar-big', text: initials(lead.name) }),
        h('div', { class: 'hero-text' },
          h('h2', { class: 'hero-name', text: lead.name || 'Без имени' }),
          h('div', { class: 'hero-sub', text: [lead.niche, lead.city].filter(Boolean).join(', ') || 'Ниша и город не указаны' }),
          h('div', { class: 'hero-reason', text: reason }),
          lead.phone ? h('div', { class: 'hero-phone', text: lead.phone + (lead.contact ? ', ' + lead.contact : '') }) : null
        )
      ),
      h('div', { class: 'hero-actions' },
        tel ? h('a', { class: 'btn btn-primary btn-lg', href: tel, text: 'Позвонить' }) : null,
        h('a', { class: 'btn btn-lg' + (tel ? '' : ' btn-primary'), href: '#lead/' + lead.id, text: 'Открыть карточку' })
      )
    );
  }

  function row(lead, reason) {
    var stage = D.stageById(lead.stage);
    return h('a', { class: 'row', href: '#lead/' + lead.id },
      h('div', { class: 'avatar', text: initials(lead.name) }),
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title', text: lead.name || 'Без имени' }),
        h('div', { class: 'row-sub', text: [lead.niche, lead.city].filter(Boolean).join(', ') || 'Ниша и город не указаны' })
      ),
      h('div', { class: 'row-hint' },
        h('span', { class: 'chip chip-' + (stage ? stage.kind : 'main'), text: stage ? stage.title : '' }),
        h('span', { class: 'row-reason', text: reason })
      )
    );
  }

  var LIMIT = 8;

  // Длинные списки показываем по 8 строк, остальное по кнопке, чтобы экран не превращался в простыню
  function section(title, hint, leads, reasonFn, tone) {
    if (!leads.length) return null;
    var list = h('div', { class: 'list' }, leads.slice(0, LIMIT).map(function (l) { return row(l, reasonFn(l)); }));
    var more = null;
    if (leads.length > LIMIT) {
      more = h('button', { type: 'button', class: 'btn btn-small', onClick: function () {
        leads.slice(LIMIT).forEach(function (l) { list.appendChild(row(l, reasonFn(l))); });
        if (more.parentNode) more.parentNode.removeChild(more);
      } }, 'Показать ещё ' + (leads.length - LIMIT));
    }
    return h('section', { class: 'block block-' + (tone || 'plain') },
      h('h2', { text: title + ' (' + leads.length + ')' }),
      hint ? h('p', { class: 'muted', text: hint }) : null,
      list, more
    );
  }

  function render() {
    var leads = store.leads();
    var active = leads.filter(function (l) { return l.stage !== 'won' && l.stage !== 'lost'; });
    var stats = store.stats();

    var fresh = active.filter(function (l) { return l.stage === 'new'; })
      .sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });

    var overdue = active.filter(function (l) { return l.stage !== 'new' && U.isOverdue(l.nextAt); })
      .sort(function (a, b) { return a.nextAt < b.nextAt ? -1 : 1; });

    var soon = active.filter(function (l) {
      return l.stage !== 'new' && l.nextAt && !U.isOverdue(l.nextAt) && U.isSoon(l.nextAt);
    }).sort(function (a, b) { return a.nextAt < b.nextAt ? -1 : 1; });

    var noDate = active.filter(function (l) {
      return NEED_NEXT.indexOf(l.stage) >= 0 && !l.nextAt;
    });

    var target = fresh[0] || overdue[0] || soon[0] || null;
    var targetReason = target
      ? (target.stage === 'new' ? 'Новый лид, ' + U.daysSince(target.createdAt) + ' дн. назад. Звони сразу.'
        : (U.isOverdue(target.nextAt) ? 'Просрочен контакт: ' : 'Запланировано: ') + U.fmtDateTime(target.nextAt) + (target.nextNote ? ', ' + target.nextNote : ''))
      : '';

    var keyBanner = h('div', { class: 'key-banner' },
      h('div', null,
        h('strong', { text: 'Эфир №3: продажи. ' }),
        'Шпаргалка и разбор встреч.'
      ),
      h('div', { class: 'key-banner-links' },
        h('a', { class: 'btn btn-small btn-primary', href: '#sales', text: 'Открыть эфир №3' }),
        h('a', { class: 'btn btn-small', href: '#roadmap', text: 'Путь клиента' })
      )
    );

    var root = h('div', { class: 'view' },
      target ? hero(target, targetReason) : null,
      C.views.kpi.render()
    );

    var blocks = [
      section('Позвони сейчас', 'Звони в первые минуты.', fresh,
        function (l) { return 'Новый лид, ' + U.daysSince(l.createdAt) + ' дн. назад'; }, 'hot'),
      section('Просрочен контакт', 'Дата прошла. Звони или пиши.', overdue,
        function (l) { return 'Было назначено ' + U.fmtDateTime(l.nextAt) + (l.nextNote ? ': ' + l.nextNote : ''); }, 'hot'),
      section('Сегодня и завтра', null, soon,
        function (l) { return U.fmtDateTime(l.nextAt) + (l.nextNote ? ': ' + l.nextNote : ''); }),
      section('Нет даты следующего контакта', 'Без даты клиент пропадает. Поставь контакт на завтра.', noDate,
        function () { return 'Нужна дата'; }, 'warn')
    ].filter(Boolean);

    if (!blocks.length) {
      root.appendChild(h('div', { class: 'empty' },
        h('h2', { text: leads.length ? 'На сегодня задач нет' : 'Пока нет ни одного лида' }),
        h('p', { class: 'muted', text: leads.length
          ? 'Все контакты на будущие даты.'
          : 'Нажми «Новый лид» или клавишу N. Дальше панель подскажет шаги.' })
      ));
    } else {
      blocks.forEach(function (b) { root.appendChild(b); });
    }
    root.appendChild(keyBanner);
    return root;
  }

  C.views = C.views || {};
  C.views.today = { render: render };
})((window.CRM = window.CRM || {}));
