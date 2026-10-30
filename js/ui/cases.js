(function (C) {
  'use strict';

  var h = C.dom.h;
  var U = C.utils;
  var D = C.data;
  var store = C.store;
  var K = C.cases;
  var CI = C.caseimage;

  var PAGE = 40;
  // Состояние вкладки: группа, строка поиска, ниша клиента (подбор), сколько показано
  var view = { cat: '', query: '', match: '', shown: PAGE, only: '', legacy: false };

  function copy(textValue, btn) {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard');
      navigator.clipboard.writeText(textValue);
    } catch (e) {
      var area = document.createElement('textarea');
      area.value = textValue;
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); } catch (err) { /* копирование недоступно */ }
      document.body.removeChild(area);
    }
    if (btn) {
      var old = btn.textContent;
      btn.textContent = 'Скопировано';
      setTimeout(function () { btn.textContent = old; }, 1200);
    }
  }

  var PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="56"><rect width="96" height="56" fill="#e6f2f0"/>' +
    '<text x="48" y="33" font-size="13" text-anchor="middle" fill="#16695f" font-family="sans-serif">Картинка</text></svg>');

  function flash(btn, label) {
    if (!btn) return;
    var old = btn.getAttribute('data-label') || btn.textContent;
    btn.setAttribute('data-label', old);
    btn.textContent = label;
    setTimeout(function () { btn.textContent = old; }, 1400);
  }

  function copyImage(c, btn) {
    if (!navigator.clipboard || !window.ClipboardItem) { flash(btn, 'Не поддерживается, скачай PNG'); return; }
    CI.blob(c, function (b) {
      if (!b) { flash(btn, 'Не получилось, скачай PNG'); return; }
      try {
        navigator.clipboard.write([new window.ClipboardItem({ 'image/png': b })]).then(
          function () { flash(btn, 'Скопировано'); },
          function () { flash(btn, 'Не получилось, скачай PNG'); }
        );
      } catch (e) {
        flash(btn, 'Не получилось, скачай PNG');
      }
    });
  }

  function savePng(c, btn) {
    var url = CI.dataUrl(c);
    if (!url) { flash(btn, 'Рисование недоступно'); return; }
    var a = document.createElement('a');
    a.href = url;
    a.download = CI.fileName(c);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Отправка клиенту: перетащи ручку «Текст» или картинку в поле чата; те же действия кнопками
  function sendTools(c) {
    var textHandle = h('span', { class: 'drag-handle', draggable: 'true', title: 'Перетащи в поле сообщения' }, 'Текст');
    textHandle.addEventListener('dragstart', function (e) {
      if (!e.dataTransfer) return;
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', K.text(c));
    });

    var thumb = h('img', { class: 'drag-thumb', draggable: 'true', alt: 'Картинка кейса', src: PLACEHOLDER, title: 'Перетащи в чат как картинку' });
    function ready() {
      var url = CI.dataUrl(c);
      if (url && thumb.getAttribute('src') !== url) thumb.setAttribute('src', url);
      return url;
    }
    ['mouseenter', 'focus', 'touchstart'].forEach(function (ev) { thumb.addEventListener(ev, ready); });
    thumb.addEventListener('dragstart', function (e) {
      var url = ready();
      if (!e.dataTransfer || !url) return;
      e.dataTransfer.effectAllowed = 'copy';
      try { e.dataTransfer.setData('DownloadURL', CI.mime(c) + ':' + CI.fileName(c) + ':' + url); } catch (err) { /* не поддерживается */ }
    });

    var copyText = h('button', { type: 'button', class: 'btn btn-small' }, 'Копировать текст');
    copyText.addEventListener('click', function () { copy(K.text(c), copyText); });
    var copyPic = h('button', { type: 'button', class: 'btn btn-small' }, 'Копировать картинку');
    copyPic.addEventListener('click', function () { copyImage(c, copyPic); });
    var save = h('button', { type: 'button', class: 'btn btn-small' }, 'Скачать картинку');
    save.addEventListener('click', function () { savePng(c, save); });

    return h('div', { class: 'case-send' },
      h('div', { class: 'case-drag-row' },
        h('span', { class: 'case-drag-label', text: 'Перетащи в чат:' }),
        textHandle, thumb
      ),
      h('div', { class: 'case-actions' }, copyText, copyPic, save)
    );
  }

  function hintLine(c) {
    var hint = K.hints(c);
    if (!hint || Number(c.leads) || Number(c.spend)) return null;
    return h('div', { class: 'case-nums', text: 'По заголовку материала: ' + hint.label + ' заявок. Сверь по ссылке.' });
  }

  function clone(c) {
    return JSON.parse(JSON.stringify(c));
  }

  function numbers(c) {
    var parts = [];
    if (Number(c.spend)) parts.push('Расход ' + U.fmtMoney(c.spend));
    if (Number(c.leads)) parts.push('Заявок ' + c.leads);
    if (K.cpl(c)) parts.push('Заявка около ' + U.fmtMoney(K.cpl(c)));
    if (c.period) parts.push(c.period);
    if (c.city) parts.push(c.city);
    return parts.join(' / ');
  }

  // Ссылки на материалы кейса. Если ссылок несколько, они нумеруются.
  function linkNodes(c) {
    var found = K.links(c);
    if (!found.length) return c.link ? h('div', { class: 'muted', text: 'Материал: ' + c.link }) : null;
    return h('div', { class: 'case-links' }, found.map(function (u, i) {
      return h('a', { href: u, target: '_blank', rel: 'noopener', text: found.length > 1 ? 'Материал ' + (i + 1) : 'Открыть материал' });
    }));
  }

  function authorNode(c) {
    if (!c.author) return null;
    return h('div', { class: 'muted' }, 'Исполнитель: ',
      c.authorLink ? h('a', { href: c.authorLink, target: '_blank', rel: 'noopener', text: c.author }) : c.author);
  }

  // Картинка кейса и полоска миниатюр: скрины из Директа, посадочных, CRM, чата. Выбранный скрин уходит клиенту.
  function gallery(cc, c) {
    var shots = c.shots || [];
    var box = h('div', { class: 'case-gallery' });
    var main = cc.screen ? h('img', { class: 'case-shot', src: cc.screen, alt: 'Скриншот', loading: 'lazy' }) : null;
    var caption = h('div', { class: 'muted case-shot-label' });
    function setCaption(shot) {
      caption.textContent = shot ? C.egokad.kindName(shot.kind) + ': ' + shot.label : '';
    }
    setCaption(shots.filter(function (x) { return x.file === cc.screen; })[0]);
    if (main) box.appendChild(main);
    if (!main && c.egokad) box.appendChild(h('p', { class: 'muted', text: 'Скринов по этой нише в папке EGOKAD пока нет.' }));
    if (shots.length > 1 || (shots.length === 1 && !main)) {
      var thumbs = h('div', { class: 'case-thumbs' });
      shots.forEach(function (shot) {
        var t = h('button', { type: 'button', class: 'case-thumb' + (shot.file === cc.screen ? ' is-active' : ''), title: C.egokad.kindName(shot.kind) + ': ' + shot.label },
          h('img', { src: shot.file, alt: shot.label, loading: 'lazy' }),
          h('span', { text: C.egokad.kindName(shot.kind) }));
        t.addEventListener('click', function () {
          cc.screen = shot.file;
          var img = box.querySelector('.case-shot');
          if (img) img.setAttribute('src', shot.file);
          else box.insertBefore(h('img', { class: 'case-shot', src: shot.file, alt: 'Скриншот' }), box.firstChild);
          Array.prototype.forEach.call(thumbs.children, function (x) { x.classList.remove('is-active'); });
          t.classList.add('is-active');
          setCaption(shot);
        });
        thumbs.appendChild(t);
      });
      box.appendChild(thumbs);
    }
    box.appendChild(caption);
    return box;
  }

  // actions: функция от рабочей копии кейса (в ней меняется выбранный скрин) либо готовый список
  function caseCard(c, actions) {
    var noNumbers = !c.result && !numbers(c);
    var cc = clone(c);
    var list = typeof actions === 'function' ? actions(cc) : actions;
    var shot = c.shots && c.shots.length ? gallery(cc, c) : (CI.screenOf(c) ? h('img', { class: 'case-shot', src: CI.screenOf(c), alt: 'Скриншот из Яндекс Директа', loading: 'lazy' }) : null);
    return h('article', { class: 'case' },
      h('div', { class: 'case-head' },
        h('span', { class: 'case-type', text: c.type }),
        h('span', { class: 'case-niche', text: K.category(c) })
      ),
      h('h4', { text: c.title }),
      shot,
      numbers(c) ? h('div', { class: 'case-nums', text: numbers(c) }) : null,
      c.result ? h('p', { text: c.result }) : null,
      hintLine(c),
      noNumbers ? h('p', { class: 'muted', text: 'Цифры и скриншоты смотри по ссылке.' }) : null,
      authorNode(c),
      linkNodes(c),
      h('div', { class: 'muted', text: c.mine ? 'Мой кейс' : c.egokad ? 'Источник: EGOKAD, навигация по нишам. Цены с НДС.' : 'Источник: ' + (c.source || 'не указан') + '. Перед отправкой открой материал и сверь цифры.' }),
      h('div', { class: 'case-actions case-card-actions' }, list)
    );
  }

  // ---------- Форма кейса ----------
  function editModal(existing, done) {
    var c = existing ? clone(existing) : { id: U.uid(), type: 'Мой кейс', mine: true, keys: [] };

    function input(key, label, type, hint) {
      var el = h('input', { type: type || 'text', class: 'input', value: c[key] === undefined || c[key] === 0 ? '' : c[key] });
      el.addEventListener('input', function () { c[key] = type === 'number' ? Number(el.value) || 0 : el.value; });
      return h('label', { class: 'field' }, h('span', { class: 'label', text: label }), el, hint ? h('span', { class: 'hint', text: hint }) : null);
    }

    var result = h('textarea', { class: 'input', rows: 3, value: c.result || '' });
    result.addEventListener('input', function () { c.result = result.value; });
    var type = h('select', { class: 'input', value: c.type }, D.caseTypes.map(function (t) { return h('option', { value: t }, t); }));
    type.addEventListener('change', function () { c.type = type.value; c.mine = type.value === 'Мой кейс'; });
    var err = h('p', { class: 'muted' });

    C.modal.open({
      title: existing ? 'Изменить кейс' : 'Новый кейс',
      body: h('div', null,
        h('div', { class: 'grid2' },
          input('niche', 'Ниша', 'text', 'Например: отделка балконов'),
          h('label', { class: 'field' }, h('span', { class: 'label', text: 'Тип' }), type),
          input('city', 'Город'),
          input('period', 'Период', 'text', 'за месяц, за 2 недели'),
          input('spend', 'Расход на рекламу, ₽', 'number'),
          input('leads', 'Заявок получено', 'number')
        ),
        input('title', 'Название кейса', 'text', 'Коротко: что и с каким результатом'),
        h('label', { class: 'field' }, h('span', { class: 'label', text: 'Результат словами' }), result),
        input('source', 'Откуда цифры', 'text', 'Договор, кабинет Директа, скриншот'),
        input('link', 'Ссылка или имя файла'),
        input('screen', 'Скрин из Директа', 'text', 'Путь к файлу, например files/cases/screens/balkony.png. Если указан, вместо нарисованной карточки уходит он'),
        h('p', { class: 'hint', text: 'Пиши только то, что можешь подтвердить. Нарисованные кейсы клиенты распознают сразу.' }),
        err
      ),
      actions: [
        { label: 'Отмена', onClick: function (close) { close(); } },
        {
          label: 'Сохранить', primary: true,
          onClick: function (close) {
            if (!String(c.title || '').trim() || !String(c.niche || '').trim()) {
              err.textContent = 'Заполни нишу и название.';
              return;
            }
            c.result = c.result || '';
            c.keys = K.keysFromNiche(c.niche);
            done(c);
            close();
          }
        }
      ]
    });
  }

  // ---------- Вкладка библиотеки ----------
  function render() {
    var root = h('div');

    function source() {
      return view.legacy ? store.legacyCases() : store.cases();
    }

    function visible(list) {
      if (view.match) return K.matchFor(view.match, list);
      var out = view.cat ? list.filter(function (c) { return K.category(c) === view.cat; }) : list;
      if (view.only === 'shots') out = out.filter(function (c) { return c.shots && c.shots.length; });
      if (view.only === 'focus') out = out.filter(function (c) { return c.focus < 2; });
      if (view.only === 'price') out = out.filter(function (c) { return c.prices && c.prices.length; });
      return K.search(out, view.query);
    }

    function draw() {
      C.dom.clear(root);
      var list = source();
      var shown = visible(list);

      root.appendChild(h('p', { class: 'muted', text: view.legacy
        ? 'Старые кейсы: цифры из практикумов и ссылки на посты исполнителей спринта. Скринов из Директа у них нет, поэтому по умолчанию они скрыты.'
        : 'Кейсы EGOKAD: реальная цена заявки по нишам и городам и скрины из Директа, посадочных, CRM и чатов. Твои кейсы лежат сверху. Подходящие по нише клиента кейсы сами появляются в его карточке.' }));

      if (view.match) {
        root.appendChild(h('div', { class: 'card card-soft' },
          h('p', null, 'Показаны кейсы по нише клиента: ', h('strong', { text: view.match }), '. Найдено: ' + shown.length + '.'),
          h('button', { type: 'button', class: 'btn btn-small', onClick: function () { view.match = ''; view.shown = PAGE; draw(); } }, 'Показать все кейсы')
        ));
      } else {
        var search = h('input', { type: 'search', class: 'input', placeholder: 'Поиск по нише, названию или исполнителю', value: view.query });
        search.addEventListener('input', function () {
          view.query = search.value;
          view.shown = PAGE;
          drawList();
        });
        root.appendChild(search);
        if (!view.legacy) {
          root.appendChild(h('div', { class: 'tabs' },
            [['', 'Все ниши'], ['focus', 'Газобетон и дома'], ['shots', 'Со скринами'], ['price', 'С ценой заявки']].map(function (f) {
              return h('button', { type: 'button', class: 'tab' + (view.only === f[0] ? ' is-active' : ''), onClick: function () { view.only = f[0]; view.shown = PAGE; draw(); } }, f[1]);
            })
          ));
        }
        root.appendChild(h('div', { class: 'tabs' },
          h('button', { type: 'button', class: 'tab' + (!view.cat ? ' is-active' : ''), onClick: function () { view.cat = ''; view.shown = PAGE; draw(); } }, 'Все (' + list.length + ')'),
          K.categories().map(function (g) {
            var n = list.filter(function (c) { return K.category(c) === g; }).length;
            if (!n) return null;
            return h('button', { type: 'button', class: 'tab' + (view.cat === g ? ' is-active' : ''), onClick: function () { view.cat = g; view.shown = PAGE; draw(); } }, g + ' (' + n + ')');
          })
        ));
      }

      root.appendChild(h('button', {
        type: 'button', class: 'btn btn-primary',
        onClick: function () {
          editModal(null, function (c) {
            var next = store.ownCases().map(clone);
            next.unshift(c);
            store.setCases(next);
            draw();
          });
        }
      }, 'Добавить свой кейс'));
      root.appendChild(h('button', {
        type: 'button', class: 'btn btn-small',
        onClick: function () { view.legacy = !view.legacy; view.cat = ''; view.only = ''; view.shown = PAGE; draw(); }
      }, view.legacy ? 'Вернуться к кейсам EGOKAD' : 'Показать старые кейсы без скринов (' + store.legacyCases().length + ')'));

      root.appendChild(h('div', { class: 'cases', id: 'cases-list' }));
      drawList();
    }

    function drawList() {
      var box = root.querySelector('#cases-list');
      if (!box) return;
      C.dom.clear(box);
      var shown = visible(source());
      shown.slice(0, view.shown).forEach(function (c) {
        var editable = !c.egokad && !view.legacy;
        box.appendChild(caseCard(c, function (cc) {
          return [
            sendTools(cc),
            editable ? h('button', {
              type: 'button', class: 'btn btn-small',
              onClick: function () {
                editModal(c, function (updated) {
                  store.setCases(store.ownCases().map(function (x) { return x.id === c.id ? updated : clone(x); }));
                  draw();
                });
              }
            }, 'Изменить') : null,
            editable ? h('button', {
              type: 'button', class: 'btn btn-small btn-danger',
              onClick: function () {
                if (window.confirm('Удалить кейс?')) {
                  store.setCases(store.ownCases().filter(function (x) { return x.id !== c.id; }).map(clone));
                  draw();
                }
              }
            }, 'Удалить') : null
          ];
        }));
      });
      if (!shown.length) box.appendChild(h('p', { class: 'muted', text: 'Ничего не найдено.' }));
      if (shown.length > view.shown) {
        box.appendChild(h('button', {
          type: 'button', class: 'btn cases-more',
          onClick: function () { view.shown += PAGE; drawList(); }
        }, 'Показать ещё (' + (shown.length - view.shown) + ')'));
      }
    }

    draw();
    return root;
  }

  // ---------- Подсказка в карточке клиента ----------
  function hint(lead, stage) {
    if (['meet', 'hold'].indexOf(stage.id) < 0) return null;
    var found = K.matchFor(lead.niche, store.cases());
    var head = h('h3', { text: 'Кейсы по нише клиента' });
    if (!lead.niche) {
      return h('section', { class: 'card card-soft' }, head,
        h('p', { class: 'muted', text: 'Укажи нишу клиента в блоке «Клиент», и здесь появятся подходящие кейсы.' }));
    }
    if (!found.length) {
      return h('section', { class: 'card card-soft' }, head,
        h('p', { text: 'Для ниши «' + lead.niche + '» кейсов пока нет. Покажи кейсы соседней ниши и не придумывай свои.' }),
        h('a', { class: 'btn btn-small', href: '#library/cases', text: 'Все кейсы' }));
    }
    // Сначала кейсы со ссылкой на материал: их можно открыть и показать на экране
    var sorted = found.slice().sort(function (a, b) {
      var sa = a.shots && a.shots.length ? 1 : 0;
      var sb = b.shots && b.shots.length ? 1 : 0;
      return sb - sa || K.links(b).length - K.links(a).length;
    });
    return h('section', { class: 'card' }, head,
      h('p', { class: 'muted', text: 'Найдено кейсов: ' + found.length + '. Открой материал, сверь цифры, потом отправляй.' }),
      sorted.slice(0, 5).map(function (c) {
        return h('div', { class: 'case-mini' },
          h('div', { class: 'strong', text: c.title }),
          c.result ? h('div', { class: 'muted', text: c.result }) : null,
          CI.screenOf(c) ? h('img', { class: 'case-shot', src: CI.screenOf(c), alt: 'Скриншот', loading: 'lazy' }) : null,
          hintLine(c),
          linkNodes(c),
          sendTools(c)
        );
      }),
      h('a', {
        class: 'btn btn-small', href: '#library/cases',
        onClick: function () { view.match = lead.niche; view.shown = PAGE; }
      }, 'Все ' + found.length + ' по нише')
    );
  }

  C.views = C.views || {};
  C.views.cases = { render: render, hint: hint, sendTools: sendTools };
})((window.CRM = window.CRM || {}));
