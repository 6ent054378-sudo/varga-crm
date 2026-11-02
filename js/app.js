(function (C) {
  'use strict';

  var h = C.dom.h;
  var U = C.utils;
  var D = C.data;
  var store = C.store;

  var root = null; // текущий узел экрана
  var mount = null;

  function navLink(href, label, id, current, key, badge) {
    return h('a', { class: 'nav-link' + (id === current ? ' is-active' : '') + (key ? ' nav-link-key' : ''), href: href },
      label, badge ? h('span', { class: 'nav-badge', text: String(badge), title: 'Требуют внимания' }) : null);
  }

  // Сколько лидов ждут действия: новые и с просроченным контактом
  function attention() {
    return store.leads().filter(function (l) {
      if (l.stage === 'won' || l.stage === 'lost') return false;
      return l.stage === 'new' || U.isOverdue(l.nextAt);
    }).length;
  }

  var TITLES = { templates: 'Шаблоны', today: 'Сегодня', board: 'Доска', lead: 'Лид', calls: 'Разговоры', calc: 'Калькулятор', kp: 'Генератор КП', trainer: 'Тренажёр', money: 'Деньги', present: 'Презентатор', sales: 'Эфир №3', roadmap: 'Путь клиента', journey: 'Путь', library: 'Библиотека', metrics: 'Итоги', map: 'Карта', project: 'Проект' };

  function parseHash() {
    var raw = (window.location.hash || '#today').replace(/^#/, '');
    var parts = raw.split('/');
    return { name: parts[0] || 'today', arg: parts[1] || '', arg2: parts[2] || '' };
  }

  function addLeadModal() {
    var name = h('input', { type: 'text', class: 'input', placeholder: 'Имя' });
    var phone = h('input', { type: 'tel', class: 'input', placeholder: '+7' });
    var contact = h('input', { type: 'text', class: 'input', placeholder: 'Телеграм, ссылка или ник' });
    var niche = h('input', { type: 'text', class: 'input', value: C.data.focus ? C.data.focus.niche : '', placeholder: 'Например: дома из газобетона' });
    var city = h('input', { type: 'text', class: 'input' });
    var source = h('select', { class: 'input' },
      D.sources.map(function (s) { return h('option', { value: s }, s); }));

    function field(label, el) {
      return h('label', { class: 'field' }, h('span', { class: 'label', text: label }), el);
    }

    C.modal.open({
      title: 'Новый лид',
      body: h('div', null,
        h('div', { class: 'grid2' },
          field('Имя', name), field('Телефон', phone),
          field('Мессенджер', contact), field('Откуда пришёл', source),
          field('Ниша', niche), field('Город', city)
        )
      ),
      actions: [
        { label: 'Отмена', onClick: function (close) { close(); } },
        {
          label: 'Добавить и открыть', primary: true,
          onClick: function (close) {
            if (!name.value.trim() && !phone.value.trim() && !contact.value.trim()) {
              name.focus();
              return;
            }
            var lead = store.add({
              name: name.value.trim(),
              phone: phone.value.trim(),
              contact: contact.value.trim(),
              niche: niche.value.trim(),
              city: city.value.trim(),
              source: source.value
            });
            close();
            window.location.hash = '#lead/' + lead.id;
          }
        }
      ]
    });
  }


  // Приём заявок с пульки: адрес воркера и ключ, ручной забор
  function intakeBlock() {
    var cfg = C.intake.settings();
    var url = h('input', { type: 'text', class: 'input', value: cfg.url, placeholder: 'https://pulka-leads.имя.workers.dev' });
    var key = h('input', { type: 'password', class: 'input', value: cfg.key, placeholder: 'Ключ из настроек воркера' });
    var msg = h('p', { class: 'muted', text: cfg.lastError ? 'Последняя ошибка: ' + cfg.lastError : (cfg.lastAt ? 'Последний забор: ' + U.fmtDateTime(cfg.lastAt) : 'Пока не подключено.') });
    function apply() {
      C.intake.save(url.value, key.value);
      C.intake.start(render);
    }
    return h('details', { class: 'card' },
      h('summary', { text: 'Заявки с пульки' }),
      h('p', { class: 'muted', text: 'Заявки с пульки приходят в «Новый лид». Адрес и ключ хранятся только здесь и не попадают в резервную копию.' }),
      h('label', { class: 'field' }, h('span', { class: 'label', text: 'Адрес воркера' }), url),
      h('label', { class: 'field' }, h('span', { class: 'label', text: 'Ключ' }), key),
      msg,
      h('button', {
        type: 'button', class: 'btn',
        onClick: function () {
          apply();
          msg.textContent = 'Проверяю...';
          C.intake.sync().then(function (res) {
            msg.textContent = res.ok ? 'Связь есть. Новых заявок: ' + res.added : 'Ошибка: ' + res.error;
            if (res.added) render();
          });
        }
      }, 'Сохранить и забрать заявки')
    );
  }

  function dataModal() {
    var fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'input' });
    var msg = h('p', { class: 'muted' });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var res = C.storage.parse(String(reader.result));
        if (!res.ok) {
          msg.textContent = res.error;
          return;
        }
        if (window.confirm('Заменить текущие данные резервной копией? Сейчас клиентов: ' + store.leads().length)) {
          if (C.sync && C.sync.beginImport) C.sync.beginImport();
          store.replaceAll(res.state);
          C.modal.close();
          render();
        }
      };
      reader.readAsText(f);
    });
    C.modal.open({
      title: 'Данные',
      body: h('div', null,
        h('p', { text: 'Всё хранится в этом браузере. Очистка данных сайтов или другой браузер удалит клиентов, поэтому качай копию раз в неделю.' }),
        h('p', { class: 'muted', text: usageText() }),
        h('button', {
          type: 'button', class: 'btn btn-primary',
          onClick: function () { C.storage.download(store.snapshot()); }
        }, 'Скачать резервную копию'),
        h('div', { class: 'spacer' }),
        h('label', { class: 'field' }, h('span', { class: 'label', text: 'Загрузить резервную копию' }), fileInput),
        msg,
        h('div', { class: 'spacer' }),
        intakeBlock()
      ),
      actions: [{ label: 'Закрыть', onClick: function (close) { close(); } }]
    });
  }

  // Меню: рабочее сверху, продажа и итоги группами, обучение свёрнуто (открывается само, если ты внутри него)
  var SELL = [
    ['#templates', 'Шаблоны', 'templates'],
    ['#calc', 'Калькулятор', 'calc'],
    ['#kp', 'Генератор КП', 'kp'],
    ['#present', 'Презентатор', 'present']
  ];
  var RESULTS = [
    ['#money', 'Деньги', 'money'],
    ['#metrics', 'Итоги', 'metrics']
  ];
  var LEARN = [
    ['#trainer', 'Тренажёр', 'trainer'],
    ['#sales', 'Эфир №3', 'sales'],
    ['#roadmap', 'Путь клиента', 'roadmap'],
    ['#journey', 'Чек-лист', 'journey'],
    ['#library', 'Библиотека', 'library']
  ];

  function chrome(current) {
    function group(title, items) {
      return h('div', { class: 'nav-group' },
        h('div', { class: 'nav-title', text: title }),
        items.map(function (m) { return navLink(m[0], m[1], m[2], current); }));
    }
    var inLearn = LEARN.some(function (m) { return m[2] === current; });
    var learn = h('details', { class: 'nav-more nav-group' + (inLearn ? ' is-active' : '') },
      h('summary', { class: 'nav-title', text: 'Обучение' }),
      h('div', { class: 'nav-more-list' }, LEARN.map(function (m) { return navLink(m[0], m[1], m[2], current); }))
    );
    if (inLearn) learn.setAttribute('open', 'open');
    return h('aside', { class: 'sidebar' },
      h('div', { class: 'brand', text: 'Путь продаж' }),
      h('button', { type: 'button', class: 'btn btn-primary side-new', title: 'Горячая клавиша: N', onClick: addLeadModal }, 'Новый лид'),
      h('button', { type: 'button', class: 'side-search', title: 'Горячая клавиша: Ctrl+K или /', onClick: function () { C.search.open(); } }, 'Поиск', h('kbd', { text: '/' })),
      h('nav', { class: 'nav' },
        navLink('#today', 'Сегодня', 'today', current, false, attention()),
        navLink('#board', 'Доска', 'board', current),
        navLink('#calls', 'Разговоры', 'calls', current),
        group('Продажа', SELL),
        group('Анализ', RESULTS),
        learn
      ),
      h('button', { type: 'button', class: 'btn btn-ghost side-data', onClick: dataModal }, 'Данные')
    );
  }

  function syncWarning() {
    var st = C.sync && C.sync.status ? C.sync.status() : null;
    if (!st || !st.error) return null;
    return h('div', { class: 'warn-bar' },
      h('span', { text: 'Нет связи с облаком: ' + st.error + '. Заявки с других устройств могут не прийти.' }),
      h('button', { type: 'button', class: 'btn btn-small', onClick: function () { C.sync.pull(0).then(render); } }, 'Повторить')
    );
  }

  function warning() {
    var syncBar = syncWarning();
    if (syncBar) return syncBar;
    if (C.storage.available) return null;
    if (C.storage.full) return h('div', { class: 'warn-bar', text: 'В браузере кончилось место, новые данные не сохраняются. Скачай копию и удали старые разговоры.' });
    return h('div', { class: 'warn-bar', text: 'Браузер не сохраняет данные: всё пропадёт после закрытия вкладки. Открой в Chrome в обычном окне.' });
  }

  var lastHash = null;

  function usageText() {
    var u = C.storage.usage(store.snapshot());
    var mb = (u.bytes / 1048576).toFixed(1).replace('.', ',');
    return 'Занято ' + mb + ' МБ из примерно 5' + (u.share > 0.7 ? '. Места мало: скачай копию и удали старые разговоры.' : '.');
  }

  // Напоминание о резервной копии: если есть лиды, а копии не было неделю
  function backupBar() {
    if (!store.leads().length) return null;
    var info = C.storage.backupInfo();
    if (info.snoozed || (info.days !== null && info.days < 7)) return null;
    var text = info.days === null ? 'Резервной копии ещё не было.' : 'Резервной копии не было ' + info.days + ' дн.';
    var bar = h('div', { class: 'backup-bar' },
      h('span', { text: text + ' Данные в облаке, копия — страховка.' }),
      h('button', { type: 'button', class: 'btn btn-small btn-primary', onClick: function () { C.storage.download(store.snapshot()); render(); } }, 'Скачать копию'),
      h('button', { type: 'button', class: 'btn btn-small', onClick: function () { C.storage.snoozeBackup(1); render(); } }, 'Завтра')
    );
    return bar;
  }

  function render() {
    var route = parseHash();
    // Перерисовка на том же экране (пришла заявка, переставили карточку) не должна кидать страницу вверх
    var sameScreen = lastHash === window.location.hash;
    var keepY = sameScreen ? (window.pageYOffset || 0) : 0;
    lastHash = window.location.hash;
    var view;
    if (route.name === 'board') view = C.views.board.render(render);
    else if (route.name === 'lead') view = C.views.lead.render(route.arg);
    else if (route.name === 'calc') view = C.views.calculator.render(route.arg);
    else if (route.name === 'present') view = C.views.present.render(route.arg, route.arg2);
    else if (route.name === 'kp') view = C.views.proposal.render(route.arg);
    else if (route.name === 'calls') view = C.views.calls.render(route.arg);
    else if (route.name === 'templates') view = C.views.templates.render(route.arg);
    else if (route.name === 'project') view = C.views.project.render(route.arg);
    else if (route.name === 'metrics') view = C.views.metrics.render(route.arg);
    else if (route.name === 'map') view = C.views.map.render(route.arg, route.arg2);
    else if (route.name === 'money') view = C.views.money.render(route.arg);
    else if (route.name === 'trainer') view = C.views.trainer.render();
    else if (route.name === 'sales') view = C.views.sales.render(route.arg);
    else if (route.name === 'roadmap') view = C.views.roadmap.render(route.arg);
    else if (route.name === 'journey') view = C.views.journey.render();
    else if (route.name === 'library') view = C.views.library.render(route.arg);
    else view = C.views.today.render();

    var current = route.name === 'map' && route.arg === 'full' ? 'sales' : (['lead', 'map', 'project'].indexOf(route.name) >= 0 || ((route.name === 'present' || route.name === 'kp') && route.arg && route.arg !== 'demo') ? 'board' : route.name);
    C.dom.clear(mount);
    var warn = warning();
    var main = h('main', { class: 'main' + (route.name === 'map' ? ' main-full' : '') }, view);
    mount.appendChild(h('div', { class: 'shell' }, chrome(current), h('div', { class: 'content' }, warn, backupBar(), main)));
    root = view;
    window.scrollTo(0, keepY);
    var n = attention();
    document.title = (n ? '(' + n + ') ' : '') + (TITLES[route.name] || 'Сегодня') + ' · Путь продаж';
  }

  // Горячие клавиши: N новый лид, / или Ctrl+K поиск. В полях ввода, поверх окон и на карте не срабатывают.
  function onHotkey(e) {
    var key = e.key;
    var ctrlK = (e.ctrlKey || e.metaKey) && (key === 'k' || key === 'K' || key === 'л' || key === 'Л');
    if (!ctrlK && (e.ctrlKey || e.metaKey || e.altKey)) return;
    var isNew = key === 'n' || key === 'N' || key === 'т' || key === 'Т';
    var isFind = key === '/' || ctrlK;
    if (!isNew && !isFind) return;
    var t = e.target;
    var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable);
    if (typing && !ctrlK) return;
    if (document.querySelector('.overlay') && !ctrlK) return;
    if (window.location.hash.indexOf('#map') === 0 && !ctrlK) return;
    if (/^#present\/[^/]+\/go/.test(window.location.hash) && !ctrlK) return;
    e.preventDefault();
    if (isNew) addLeadModal(); else C.search.open();
  }

  // Карточка лида перерисовывает себя сама и сообщает новый корневой узел
  function syncRoot(node) {
    root = node;
  }

  // Подсказка в меню и заголовке вкладки без перерисовки экрана
  function refreshBadge() {
    var n = attention();
    var link = document.querySelector('.nav a[href="#today"]');
    if (link) {
      var b = link.querySelector('.nav-badge');
      if (n && !b) { b = h('span', { class: 'nav-badge', title: 'Требуют внимания' }); link.appendChild(b); }
      if (b && n) b.textContent = String(n);
      if (b && !n) link.removeChild(b);
    }
    var base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = (n ? '(' + n + ') ' : '') + base;
  }

  // Пришли новые заявки: список перерисовываем только там, где он есть и пользователь ничего не вводит.
  // Везде остальное (форма КП, запись разговора, заметка в карточке) не трогаем, чтобы не стереть ввод.
  function onIntake() {
    if (document.querySelector('.overlay')) { refreshBadge(); return; }
    var name = parseHash().name;
    var el = document.activeElement;
    var typing = el && /^(input|textarea|select)$/i.test(el.tagName);
    if ((name === 'today' || name === 'board') && !typing) render();
    else refreshBadge();
  }

  function init() {
    mount = document.getElementById('app');
    // Telegram добавляет в адрес свои параметры запуска: #tgWebAppData=... — это не экран CRM.
    if (/^#tgWebAppData/i.test(window.location.hash)) {
      try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* старый WebView */ }
    }
    store.init();
    window.addEventListener('hashchange', render);
    if (!init.hot) { init.hot = true; document.addEventListener('keydown', onHotkey); }
    if (C.auth.inTelegram()) {
      document.body.classList.add('tma');
      try {
        var tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#12181a');
        tg.setBackgroundColor('#12181a');
      } catch (e) { /* старый клиент Telegram */ }
    }
    C.auth.ready().then(function (ok) {
      if (!ok) return;
      render();
      C.sync.onError(render);
      C.sync.start();
    });
  }

  C.app = { init: init, render: render, syncRoot: syncRoot, onIntake: onIntake };

  document.addEventListener('DOMContentLoaded', init);
})((window.CRM = window.CRM || {}));
