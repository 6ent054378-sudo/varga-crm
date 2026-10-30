(function (C) {
  'use strict';

  var D = (C.data = C.data || {});

  D.sources = [
    'Холодные звонки',
    'Директ (пулька)',
    'Лендинг Varga Digital',
    'Директ (личные сообщения)',
    'Лидлайк',
    'Голубин бот',
    'Авито',
    'ВК',
    'Рекомендация / партнёрка',
    'База знакомых',
    'Другое'
  ];

  D.lostReasons = [
    'Нет потребности',
    'Нет денег',
    'Нет менеджера / отдела продаж (слил бы заявки)',
    'Ушёл к другому подрядчику',
    'Не дошёл на встречу, не выходит на связь',
    'Душнила, не наш клиент',
    'Требует гарантий результата',
    'Другое'
  ];

  // Основной путь клиента слева направо, затем боковые статусы.
  // requiresNext: при переводе на этап приложение требует дату следующего контакта
  // (правило курса: следующий контакт назначаем на завтра, максимум послезавтра).
  D.stages = [
    {
      id: 'new',
      title: 'Новый лид',
      kind: 'main',
      goal: 'Позвонить сразу.',
      action: 'Позвони сейчас: лид остывает за часы.',
      requiresNext: false,
      checklist: [
        { id: 'c1', text: 'Записал источник и контакты' },
        { id: 'c2', text: 'Позвонил (если не дозвонился, написал в мессенджер и перезвонил позже)' }
      ],
      fields: []
    },
    {
      id: 'qual',
      title: 'Звонок',
      kind: 'main',
      goal: 'Дозвониться в первые 5 минут, понять, подходит ли клиент, и записать на встречу.',
      action: 'Звони сразу. Задай вопросы из скрипта и запиши на встречу сегодня или завтра.',
      requiresNext: false,
      checklist: [
        { id: 'c1', text: 'Позвонил сразу (не дозвонился: написал в мессенджер и перезвонил позже)' },
        { id: 'c2', text: 'Открытие: объяснил цель звонка' },
        { id: 'c3', text: 'Выяснил: опыт и платный трафик, кто обрабатывает заявки, ЛПР' },
        { id: 'c4', text: 'Коротко рассказал о результатах' },
        { id: 'c5', text: 'Предложил встречу в Zoom и назначил время (двойное подтверждение)' },
        { id: 'c6', text: 'Оценил сегмент и красные флаги' }
      ],
      fields: [
        { key: 'q_exp', label: 'Откуда сейчас берёт клиентов', type: 'text', hint: 'Если «Авито», уточни: платное продвижение или просто объявление.' },
        { key: 'q_paid', label: 'Был опыт платного трафика', type: 'select', options: ['', 'Да', 'Нет', 'Не выяснил'] },
        {
          key: 'q_sales', label: 'Кто обрабатывает заявки', type: 'select',
          options: ['', 'Есть менеджер / отдел продаж', 'Сам собственник, готов заниматься только заявками', 'Никого нет', 'Не выяснил']
        },
        { key: 'q_lpr', label: 'Решения принимает сам (ЛПР)', type: 'select', options: ['', 'Да', 'Нет', 'Не выяснил'] },
        {
          key: 'q_class', label: 'Класс лида', type: 'select',
          options: ['', 'A: есть боль, деньги и срочность', 'B: есть деньги, но не горит', 'C: есть боль, нет денег', 'Z: не дозвон / мусор'],
          hint: 'Основное время тратим на класс A.'
        },
        { key: 'q_segment', label: 'Сегмент клиента', type: 'select', options: D.segmentOptions, hint: 'Два маркера сарафанника («сайт друг сделал», «звонят нецелевые», «всё индивидуально», скрипта нет) значит сегмент 3.' },
        { key: 'q_flag', label: 'Красные флаги', type: 'select', options: D.flagOptions, hint: 'Потестить без цели роста, сломанная экономика, перекладывает ответственность: не берём.' },
        { key: 'q_notes', label: 'Заметки по звонку', type: 'textarea' }
      ]
    },
    {
      id: 'meet',
      title: 'Встреча',
      kind: 'main',
      goal: 'На одной встрече: диагностика, КП, цена и оплата. Клиент часто не доходит до второй встречи, поэтому закрываем сразу.',
      action: 'Диагностика, КП, закрытие. 3 тарифа и бонус за оплату в течение 3 дней. Не уходи без оплаты или даты.',
      requiresNext: true,
      phases: [
        { id: 'pre', title: 'Перед встречей' },
        { id: 'diag', title: 'Диагностика' },
        { id: 'kp', title: 'КП' },
        { id: 'close', title: 'Закрытие' }
      ],
      checklist: [
        { id: 'b_1', phase: 'pre', text: 'Написал подтверждение (время, ссылка на Zoom)' },
        { id: 'b_2', phase: 'pre', text: 'Отправил видео с кейсом, как обещал' },
        { id: 'b_3', phase: 'pre', text: 'Позвонил и напомнил за час до встречи' },
        { id: 'b_4', phase: 'pre', text: 'Подготовил кейсы под нишу клиента' },
        { id: 'd_0', phase: 'diag', text: 'Приветствие, на ты или на вы' },
        { id: 'd_1', phase: 'diag', text: 'Самопрезентация (1-1,5 минуты, цифры и кейсы в его нише)' },
        { id: 'd_2', phase: 'diag', text: 'Задал фрейм и получил «да»' },
        { id: 'd_3', phase: 'diag', text: 'Точка А (6 вопросов)' },
        { id: 'd_4', phase: 'diag', text: 'Точка Б (цель на 30 дней)' },
        { id: 'd_5', phase: 'diag', text: 'Спросил, что мешает дойти самому' },
        { id: 'd_6', phase: 'diag', text: 'Зафиксировал и получил «всё верно»' },
        { id: 'd_7', phase: 'diag', text: 'Посчитал воронку (калькулятор) и получил согласие с планом' },
        { id: 'k_1', phase: 'kp', text: 'Открыл КП с цели клиента в цифрах' },
        { id: 'k_2', phase: 'kp', text: 'Показал 3 тарифа: что входит и какой результат' },
        { id: 'k_3', phase: 'kp', text: 'Каждый этап: боль клиента, что делаем, выгода' },
        { id: 'k_4', phase: 'kp', text: 'Спросил «нужна ли моя помощь в получении…»' },
        { id: 'x_1', phase: 'close', text: 'Назвал бонус и дедлайн (оплата в течение 3 дней)' },
        { id: 'x_2', phase: 'close', text: 'Назвал сроки запуска, затем цену' },
        { id: 'x_3', phase: 'close', text: 'Повторил цель клиента и спросил «нужна ли моя помощь»' },
        { id: 'x_4', phase: 'close', text: 'Отработал возражения' },
        { id: 'x_5', phase: 'close', text: 'Получил да или назначил дату следующего контакта' }
      ],
      fields: [
        { key: 'm_held', phase: 'pre', label: 'Встреча', type: 'select', options: ['', 'Назначена', 'Состоялась', 'Не пришёл, перенесли', 'Не пришёл'], hint: 'Поставь «Состоялась», когда провёл. Это считается в метриках.' },
        { key: 'b_resched', phase: 'pre', label: 'Переносов встречи', type: 'select', options: ['0', '1', '2'], hint: 'Не больше двух переносов.' },
        { key: 'q_segment', phase: 'diag', label: 'Сегмент клиента', type: 'select', options: D.segmentOptions },
        { key: 'q_flag', phase: 'diag', label: 'Красные флаги', type: 'select', options: D.flagOptions },
        { key: 'a_years', phase: 'diag', label: 'А1. Сколько в бизнесе, чем занимается', type: 'text' },
        { key: 'a_sources', phase: 'diag', label: 'А2. Откуда сейчас берёт клиентов', type: 'textarea' },
        { key: 'a_load', phase: 'diag', label: 'А3. Загрузка, сколько сделок в месяц', type: 'text' },
        { key: 'a_cheque', phase: 'diag', label: 'А4. Средний чек (минимум и максимум)', type: 'text' },
        { key: 'a_pain', phase: 'diag', label: 'А5. Что беспокоит больше всего', type: 'textarea' },
        { key: 'a_tried', phase: 'diag', label: 'А6. Что пробовал и чем закончилось', type: 'textarea' },
        { key: 'b_goal', phase: 'diag', label: 'Б1. Цель на 30 дней (его словами)', type: 'textarea' },
        { key: 'b_why', phase: 'diag', label: 'Б2. Что это даст ему лично', type: 'textarea' },
        { key: 'b_block', phase: 'diag', label: 'Б3. Что мешает дойти самому', type: 'textarea' },
        { key: 'd_quote', phase: 'diag', label: 'Фраза клиента для КП', type: 'text', hint: 'Дословная цитата. Вставим в КП, это вызывает доверие.' },
        { key: 'kp_reaction', phase: 'kp', label: 'Реакция и вопросы клиента', type: 'textarea' },
        { key: 'price_tariff', phase: 'close', label: 'Тариф', type: 'tariff' },
        { key: 'price_amount', phase: 'close', label: 'Цена, ₽', type: 'number' },
        { key: 'price_split', phase: 'close', label: 'Схема оплаты', type: 'select', options: ['', '100% сразу', '50% / 50%', 'Другое'] },
        { key: 'price_deadline', phase: 'close', label: 'Дедлайн и веская причина', type: 'text', placeholder: 'Оплата в течение 3 дней: мультиквизы и таргет ВК за наш счёт' },
        { key: 'c_objections', phase: 'close', label: 'Возражения и что ответил', type: 'textarea' }
      ]
    },
    {
      id: 'pay',
      title: 'Ждём оплату',
      kind: 'main',
      goal: 'Получить деньги в оговорённый срок.',
      action: 'Карточка предприятия на созвоне, договор за 20 минут, срок оплаты записан.',
      requiresNext: true,
      checklist: [
        { id: 'c1', text: 'Получил карточку предприятия' },
        { id: 'c2', text: 'Отправил договор и счёт' },
        { id: 'c3', text: 'Спросил и записал, до какого момента ждать оплату' },
        { id: 'c4', text: 'Получил контакт специалиста клиента для передачи заявок' }
      ],
      fields: [
        { key: 'pay_deadline', label: 'Оплата до', type: 'datetime' },
        { key: 'pay_contact', label: 'Контакт специалиста клиента (куда отправлять заявки)', type: 'text' }
      ]
    },
    {
      id: 'won',
      title: 'Оплачено',
      kind: 'main',
      goal: 'Запустить работу и закрепить клиента.',
      action: 'Назначь старт, передай клиенту следующий шаг. Когда придут первые лиды, попроси отзыв.',
      requiresNext: false,
      checklist: [
        { id: 'c1', text: 'Назначил дату старта работ' },
        { id: 'c2', text: 'Сообщил клиенту, что будет в ближайшие 3 5 дней' },
        { id: 'c3', text: 'Запросил отзыв после первых заявок' }
      ],
      fields: [
        { key: 'won_amount', label: 'Сумма оплаты, ₽', type: 'number' },
        { key: 'won_start', label: 'Старт работ', type: 'date' },
        { key: 'won_cost', label: 'Расход на исполнение, ₽ (необязательно)', type: 'number', hint: 'Если внесёшь, в «Деньгах» появится прибыль.' }
      ]
    },
    {
      id: 'hold',
      title: 'Думает / отложено',
      kind: 'side',
      goal: 'Вернуть в диалог в течение 1 2 дней.',
      action: 'Следующий контакт завтра или послезавтра. Напомни, что мощность ограничена.',
      requiresNext: true,
      checklist: [
        { id: 'c1', text: 'Отправил КП и пару кейсов' },
        { id: 'c2', text: 'Договорился о конкретном времени следующего звонка' },
        { id: 'c3', text: 'Взял резервный способ связи' }
      ],
      fields: [
        { key: 'hold_reason', label: 'Почему отложил', type: 'textarea' }
      ]
    },
    {
      id: 'lost',
      title: 'Слив / отказ',
      kind: 'side',
      goal: 'Зафиксировать причину и оставить контакт в базе.',
      action: 'Если клиент адекватный, но рано, оставайся на связи: он может вернуться.',
      requiresNext: false,
      checklist: [],
      fields: [
        { key: 'lost_reason', label: 'Причина', type: 'lostReason' }
      ]
    }
  ];

  // Вероятность сделки по этапу: 0,1 заявка/квалификация, 0,5 встреча/презентация, 0,9 есть сумма и согласие
D.stageProbability = { new: 0.1, qual: 0.2, meet: 0.5, pay: 0.9, won: 1, hold: 0.2, lost: 0 };

  // Вероятность сделки лида: на встрече после названной цены она выше (0,9), как раньше на этапе закрытия
  D.leadProbability = function (lead) {
    if (lead.stage === 'meet' && Number(lead.data && lead.data.price_amount) > 0) return 0.9;
    return D.stageProbability[lead.stage] || 0;
  };

D.mainStageIds = ['new', 'qual', 'meet', 'pay', 'won'];

  // Старые этапы (встреча назначена, диагностика, КП, закрытие) слиты в один этап «Встреча»
  D.legacyStage = { booked: 'meet', diag: 'meet', kp: 'meet', close: 'meet' };

  D.resolveStage = function (id) {
    return D.legacyStage[id] || id;
  };

  D.stageById = function (id) {
    id = D.resolveStage(id);
    for (var i = 0; i < D.stages.length; i++) {
      if (D.stages[i].id === id) return D.stages[i];
    }
    return null;
  };

  // Следующий этап основного пути. Для боковых и последнего возвращает null.
  D.nextStage = function (id) {
    var i = D.mainStageIds.indexOf(id);
    if (i < 0 || i >= D.mainStageIds.length - 1) return null;
    return D.stageById(D.mainStageIds[i + 1]);
  };
})((window.CRM = window.CRM || {}));
