(function (C) {
  'use strict';

  var h = C.dom.h;
  var U = C.utils;
  var D = C.data;
  var store = C.store;
  var S = C.sales;

  var TABS = [
    { id: 'full', title: 'Полный скрипт' },
    { id: 'cheat', title: 'Шпаргалка на звонок' },
    { id: 'rules', title: 'Главные правила' },
    { id: 'review', title: 'Разбор встречи' }
  ];

  // Клиент для подстановки фраз и разбора встречи. Хранится до перезагрузки страницы.
  var picked = '';

  function stat(label, value, tone) {
    return h('div', { class: 'stat' + (tone ? ' stat-' + tone : '') },
      h('div', { class: 'stat-value', text: String(value) }),
      h('div', { class: 'stat-label', text: label })
    );
  }

  function numbersBlock(leads) {
    var n = S.numbers(leads);
    var weekTone = n.week.held >= n.week.target ? 'ok' : '';
    var blocks = [
      h('div', { class: 'stats' },
        stat('Разборов за 7 дней (норма ' + n.week.target + ')', n.week.held, weekTone),
        stat('Разборов всего', n.held),
        stat('Дошли до цены', n.priced),
        stat('Оплатили' + (n.held ? ' (' + n.conv + '% от разборов)' : ''), n.paid)
      )
    ];
    if (n.noNext.length) {
      blocks.push(h('div', { class: 'warn-box' },
        h('strong', { text: 'Нет даты следующего контакта: ' + n.noNext.length + '. ' }),
        'Правило эфира: клиент без даты пропадает. Поставь контакт на завтра или послезавтра: ',
        n.noNext.slice(0, 8).map(function (l, i) {
          return [i ? ', ' : '', h('a', { href: '#lead/' + l.id, text: l.name || 'Без имени' })];
        })
      ));
    }
    return blocks;
  }

  function clientSelect(leads, onChange) {
    var sel = h('select', { class: 'input', value: picked },
      h('option', { value: '' }, 'Без клиента'),
      leads.map(function (l) { return h('option', { value: l.id }, (l.name || 'Без имени') + (l.niche ? ', ' + l.niche : '')); }));
    sel.value = picked;
    sel.addEventListener('change', function () { picked = sel.value; onChange(); });
    return h('label', { class: 'field' }, h('span', { class: 'label', text: 'Подставить данные клиента' }), sel);
  }

  // ---------- Полный скрипт: от заявки до оплаты ----------
  var KIND = { say: 'Говори', ask: 'Спроси', tip: 'Важно', dont: 'Не делай', note: 'Заметка' };

  function fullTab(leads) {
    var root = h('div');
    function draw() {
      C.dom.clear(root);
      var lead = picked ? store.get(picked) : null;
      var vars = lead ? C.views.script.vars(lead) : {};
      root.appendChild(h('div', { class: 'road-links' },
        h('a', { class: 'btn btn-primary', href: '#map/full', text: 'Открыть как майнд-карту' })
      ));
      root.appendChild(clientSelect(leads, draw));
      root.appendChild(h('p', { class: 'muted', text: 'Дословный скрипт от заявки до оплаты. Собран из тренинга по продажам (xmind), тренинга NAAP и скриптов квалификации, закрытия и переноса. Иди сверху вниз и читай вслух. В [скобках] подставляешь своё, имя и нишу приложение подставит само, если выбрать клиента.' }));
      root.appendChild(h('div', { class: 'acc' }, D.fullScript.map(function (st, i) {
        var attrs = { class: 'sec' };
        return h('details', attrs,
          h('summary', null, (i + 1) + '. ' + st.title, h('span', { class: 'sec-time', text: st.time })),
          h('div', { class: 'sec-body' },
            h('p', { class: 'strong', text: st.goal }),
            st.parts.map(function (part) {
              return h('section', { class: 'script-part' },
                h('h4', { text: part.title }),
                part.items.map(function (it) {
                  var tone = it.k === 'say' || it.k === 'ask' ? 'say' : it.k === 'dont' ? 'dont' : 'tip';
                  return h('div', { class: 'line line-' + tone },
                    h('span', { class: 'line-tag', text: KIND[it.k] || 'Важно' }),
                    h('p', { text: U.fill(it.t, vars) })
                  );
                })
              );
            })
          )
        );
      })));
      root.appendChild(h('details', { class: 'sec' },
        h('summary', { text: 'Типичные отклонения от скрипта: за них тренер снижает оценку' }),
        h('div', { class: 'sec-body' }, D.scriptRules.map(function (r) {
          return h('div', { class: 'line line-dont' },
            h('span', { class: 'line-tag', text: 'Не делай' }),
            h('p', null, r.text + '. ', h('strong', { text: 'Лучше: ' }), r.say)
          );
        }))
      ));
      root.appendChild(h('div', { class: 'road-links' },
        h('a', { class: 'btn btn-small btn-primary', href: '#trainer', text: 'Тренировать по этапам' }),
        h('a', { class: 'btn btn-small', href: '#library/objections', text: 'Возражения' }),
        h('a', { class: 'btn btn-small', href: '#roadmap', text: 'Путь клиента' })
      ));
    }
    draw();
    return root;
  }

  // ---------- Шпаргалка ----------
  function cheatTab(leads) {
    var root = h('div');
    function draw() {
      C.dom.clear(root);
      var lead = picked ? store.get(picked) : null;
      var vars = lead ? C.views.script.vars(lead) : {};
      root.appendChild(clientSelect(leads, draw));
      root.appendChild(h('p', { class: 'muted', text: 'Порядок встречи: открытие, точка А, точка Б, план в заявках, КП, закрытие, фиксация. Фразы можно говорить почти дословно. Подставляются имя, ниша, цель и цифры из карточки и калькулятора.' }));
      root.appendChild(h('div', { class: 'acc' }, D.salesCheat.map(function (sec, i) {
        var attrs = {};
        attrs.class = 'sec';
        return h('details', attrs,
          h('summary', null, (i + 1) + '. ' + sec.title, h('span', { class: 'sec-time', text: sec.time })),
          h('div', { class: 'sec-body' },
            h('p', { class: 'strong', text: sec.goal }),
            sec.say.map(function (t) {
              return h('div', { class: 'line line-say' },
                h('span', { class: 'line-tag', text: 'Говори' }),
                h('p', { text: U.fill(t, vars) })
              );
            }),
            h('div', { class: 'line line-tip' },
              h('span', { class: 'line-tag', text: 'Правило' }),
              h('p', { text: sec.rule })
            )
          )
        );
      })));
      root.appendChild(h('div', { class: 'road-links' },
        h('a', { class: 'btn btn-small', href: '#library/objections', text: 'Возражения: готовые ответы' }),
        h('a', { class: 'btn btn-small', href: '#calc', text: 'Калькулятор воронки' }),
        h('a', { class: 'btn btn-small', href: '#library/cases', text: 'Кейсы' })
      ));
    }
    draw();
    return root;
  }

  // ---------- Правила ----------
  function rulesTab() {
    return h('div', null,
      h('p', { class: 'muted', text: 'Главное из практикума №3. Прочитай один раз целиком, потом заглядывай перед звонком.' }),
      h('ol', { class: 'rules' }, D.salesRules.map(function (r) {
        return h('li', { class: 'rule' },
          h('div', { class: 'rule-title', text: r.title }),
          h('p', { text: r.text })
        );
      })),
      h('p', null, 'Полный текст практикума: ',
        h('a', { href: D.fileHref('Практикум_№3_Скрипт_продаж_и_первые_оплаты_транскрипт.txt'), target: '_blank', rel: 'noopener', text: 'расшифровка эфира №3' }), '.')
    );
  }

  // ---------- Разбор встречи ----------
  function copyText(value, btn) {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard');
      navigator.clipboard.writeText(value);
    } catch (e) {
      var area = document.createElement('textarea');
      area.value = value;
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); } catch (err) { /* копирование недоступно */ }
      document.body.removeChild(area);
    }
    var old = btn.textContent;
    btn.textContent = 'Скопировано';
    setTimeout(function () { btn.textContent = old; }, 1200);
  }

  function reviewTab(leads) {
    var root = h('div');
    var checks = {};
    var note = '';

    function draw() {
      C.dom.clear(root);
      root.appendChild(h('p', { class: 'muted', text: 'После каждой встречи отметь, что получилось. Приложение покажет, какие пункты ты пропускаешь чаще всего, и сохранит разбор в историю клиента.' }));
      root.appendChild(clientSelect(leads, function () { checks = {}; note = ''; draw(); }));

      var counter = h('span', { class: 'count' });
      function refresh() {
        var s = S.score(checks);
        counter.textContent = s.done + ' из ' + s.total;
      }
      root.appendChild(h('section', { class: 'card' },
        h('h3', null, 'Как прошла встреча ', counter),
        D.reviewCriteria.map(function (c) {
          var box = h('input', { type: 'checkbox', checked: !!checks[c.id] });
          box.addEventListener('change', function () { checks[c.id] = box.checked; refresh(); });
          return h('label', { class: 'check' }, box, h('span', { text: c.text }));
        }),
        (function () {
          var ta = h('textarea', { class: 'input', rows: 3, placeholder: 'Что скажу иначе в следующий раз', value: note });
          ta.addEventListener('input', function () { note = ta.value; });
          return ta;
        })(),
        h('div', { class: 'road-links' },
          h('button', {
            type: 'button', class: 'btn btn-primary',
            onClick: function () {
              if (!picked) { window.alert('Выбери клиента, к карточке которого сохранить разбор.'); return; }
              S.addReview(picked, checks, note);
              checks = {};
              note = '';
              draw();
            }
          }, 'Сохранить разбор в карточку')
        )
      ));
      refresh();

      var weak = S.weakest(store.leads(), 3);
      var lead = picked ? store.get(picked) : null;
      var past = lead ? S.reviews(lead) : [];
      root.appendChild(h('section', { class: 'card' },
        h('h3', { text: 'Что пропускаешь чаще всего' }),
        weak.length
          ? h('ol', { class: 'road-list' }, weak.map(function (w) { return h('li', { text: w.text + ' (пропущено ' + w.miss + ' из ' + w.total + ')' }); }))
          : h('p', { class: 'muted', text: 'Пока нет сохранённых разборов.' }),
        past.length
          ? h('div', null,
            h('h4', { text: 'Разборы этого клиента' }),
            h('ul', { class: 'road-list' }, past.slice(0, 5).map(function (r) {
              return h('li', { text: U.fmtDateTime(r.at) + ': ' + r.done + ' из ' + r.total + (r.note ? '. ' + r.note : '') });
            })))
          : null
      ));

      var promptText = S.prompt();
      var copyBtn = h('button', { type: 'button', class: 'btn' }, 'Скопировать запрос для Claude');
      copyBtn.addEventListener('click', function () { copyText(promptText, copyBtn); });
      root.appendChild(h('section', { class: 'card' },
        h('h3', { text: 'Разбор записи через Claude' }),
        h('p', { class: 'muted', text: 'Скопируй запрос, вставь его в чат с Claude и приложи расшифровку своей встречи. Он оценит её по тем же критериям.' }),
        copyBtn
      ));
    }
    draw();
    return root;
  }

  function render(tabId) {
    var leads = store.leads();
    var active = TABS.filter(function (t) { return t.id === tabId; })[0] || TABS[0];
    var root = h('div', { class: 'view sales-view' });
    var body = h('div', { class: 'sales-body' });

    root.appendChild(h('h1', { text: 'Эфир №3: продажи' }));
    root.appendChild(h('p', { class: 'muted', text: 'Самый важный практикум спринта: как провести встречу, назвать цену и получить первую оплату. Здесь шпаргалка на звонок, главные правила и разбор своих встреч.' }));
    numbersBlock(leads).forEach(function (n) { root.appendChild(n); });
    root.appendChild(h('div', { class: 'tabs' }, TABS.map(function (t) {
      return h('a', { class: 'tab' + (t.id === active.id ? ' is-active' : ''), href: '#sales/' + t.id, text: t.title });
    })));

    if (active.id === 'rules') body.appendChild(rulesTab());
    else if (active.id === 'review') body.appendChild(reviewTab(leads));
    else if (active.id === 'cheat') body.appendChild(cheatTab(leads));
    else body.appendChild(fullTab(leads));
    root.appendChild(body);
    return root;
  }

  C.views = C.views || {};
  C.views.sales = { render: render };
})((window.CRM = window.CRM || {}));
