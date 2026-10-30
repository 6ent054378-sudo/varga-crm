(function (C) {
  'use strict';

  var h = C.dom.h;
  var U = C.utils;
  var store = C.store;
  var MN = C.money;

  var PERIODS = [
    { id: 'month', title: 'Этот месяц' },
    { id: 'prev', title: 'Прошлый месяц' },
    { id: 'all', title: 'Всё время' }
  ];
  var EXPENSE_CATS = ['Исполнитель', 'Реклама', 'Сервисы и подписки', 'Налоги', 'Другое'];

  function money(v) {
    return U.fmtMoney(v) || '0 ₽';
  }

  function stat(label, value) {
    return h('div', { class: 'stat' },
      h('div', { class: 'stat-value', text: value }),
      h('div', { class: 'stat-label', text: label }));
  }

  // Необязательная запись расхода: прибыль считается, только если расходы внесены
  function expenseForm(rerender) {
    var category = h('select', { class: 'input' }, EXPENSE_CATS.map(function (c) { return h('option', { value: c }, c); }));
    var amount = h('input', { type: 'number', class: 'input', min: '0', placeholder: 'Сумма, ₽' });
    var note = h('input', { type: 'text', class: 'input', placeholder: 'За что' });
    var err = h('p', { class: 'muted' });
    return h('details', { class: 'card' },
      h('summary', { text: 'Расходы и прибыль (по желанию)' }),
      h('p', { class: 'muted', text: 'Не обязательно. Внеси расход, и ниже появится прибыль.' }),
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, h('span', { class: 'label', text: 'Статья' }), category),
        h('label', { class: 'field' }, h('span', { class: 'label', text: 'Сумма, ₽' }), amount)
      ),
      h('label', { class: 'field' }, h('span', { class: 'label', text: 'Комментарий' }), note),
      err,
      h('button', {
        type: 'button', class: 'btn',
        onClick: function () {
          var sum = Number(amount.value);
          if (!sum || sum <= 0) { err.textContent = 'Укажи сумму.'; return; }
          store.addMoney({ type: 'expense', category: category.value, amount: sum, date: new Date().toISOString().slice(0, 10), note: note.value.trim() });
          rerender();
        }
      }, 'Добавить расход')
    );
  }

  function table(list, rerender) {
    if (!list.length) return h('p', { class: 'muted', text: 'Пока пусто. Оплаты появятся, когда клиент перейдёт в «Оплачено».' });
    return h('table', { class: 'table' },
      h('thead', null, h('tr', null,
        h('th', { text: 'Дата' }), h('th', { text: 'Что' }), h('th', { text: 'Сумма' }), h('th', { text: '' }))),
      h('tbody', null, list.map(function (r) {
        return h('tr', null,
          h('td', { text: new Date(r.at).toLocaleDateString('ru-RU') }),
          h('td', { text: (r.note ? r.note + ': ' : '') + r.category }),
          h('td', { class: r.type === 'income' ? 'money-in' : 'money-out', text: (r.type === 'income' ? '+' : '−') + money(r.amount) }),
          h('td', null, r.auto ? null : h('button', {
            type: 'button', class: 'btn btn-small btn-danger',
            onClick: function () { store.removeMoney(r.id); rerender(); }
          }, 'Удалить')));
      }))
    );
  }

  function render(periodId) {
    var period = PERIODS.filter(function (p) { return p.id === periodId; })[0] || PERIODS[0];
    var list = MN.rows(store.leads(), store.money().entries, MN.range(period.id));
    var sum = MN.summary(list);
    var wait = MN.pending(store.leads());
    var goal = store.money().goal;

    function rerender() { C.app.render(); }

    var goalInput = h('input', { type: 'number', class: 'input input-small', min: '0', value: goal || '', placeholder: 'Цель, ₽' });
    goalInput.addEventListener('change', function () { store.setMoneyGoal(goalInput.value); rerender(); });
    var pct = goal > 0 ? Math.min(100, Math.round((sum.income / goal) * 100)) : 0;

    return h('div', { class: 'view' },
      h('h1', { text: 'Деньги' }),
      h('p', { class: 'muted', text: 'Всё считается из карточек клиентов. Заполнять ничего не нужно.' }),
      h('div', { class: 'tabs' }, PERIODS.map(function (p) {
        return h('a', { class: 'tab' + (p.id === period.id ? ' is-active' : ''), href: '#money/' + p.id }, p.title);
      })),
      h('div', { class: 'stats' },
        stat('Получено', money(sum.income)),
        stat('Ждём оплату', money(wait.waiting)),
        stat('Прогноз по клиентам', money(wait.forecast)),
        sum.expense ? stat('Прибыль', money(sum.profit)) : null
      ),
      h('div', { class: 'goal-row' },
        h('span', { class: 'muted', text: 'Цель на месяц:' }), goalInput,
        goal > 0 ? h('div', { class: 'progress' }, h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: 'width:' + pct + '%' })), h('span', { class: 'count', text: pct + '%' })) : null
      ),
      h('section', { class: 'card' }, h('h3', { text: 'Оплаты' }), table(list, rerender)),
      expenseForm(rerender)
    );
  }

  C.views = C.views || {};
  C.views.money = { render: render };
})((window.CRM = window.CRM || {}));
