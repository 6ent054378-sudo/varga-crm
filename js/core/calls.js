(function (C) {
  'use strict';

  var D = C.data;
  var U = C.utils;
  var store = C.store;

  var MAX_CHARS = 85000;

  function num(v) {
    var n = C.proposal ? C.proposal.num(v) : Number(v);
    return n > 0 ? n : 0;
  }

  function text(v, max) {
    return typeof v === 'string' ? v.trim().slice(0, max || 600) : '';
  }

  function list(v, max) {
    return (Array.isArray(v) ? v : []).map(function (x) { return text(typeof x === 'string' ? x : '', 400); }).filter(Boolean).slice(0, max || 12);
  }

  // Достаём JSON из ответа модели, даже если вокруг него есть лишний текст
  function parseJson(raw) {
    var s = String(raw || '').trim();
    var a = s.indexOf('{');
    var b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  }

  // Приводим ответ модели к безопасной форме: типы, длины, никаких чужих полей
  function normalize(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var c = raw.client && typeof raw.client === 'object' ? raw.client : {};
    var r = raw.review && typeof raw.review === 'object' ? raw.review : {};
    var ck = r.checklist && typeof r.checklist === 'object' ? r.checklist : {};
    var checklist = {};
    D.callChecklist.forEach(function (row) {
      var v = ck[row[0]];
      checklist[row[0]] = v === true ? true : v === false ? false : null;
    });
    var step = raw.next_step && typeof raw.next_step === 'object' ? raw.next_step : {};
    var handler = ['manager', 'owner', 'nobody'].indexOf(c.who_handles_leads) >= 0 ? c.who_handles_leads : '';
    return {
      summary: text(raw.summary, 1200),
      client: {
        name: text(c.name, 120), company: text(c.company, 160), niche: text(c.niche, 160), city: text(c.city, 120),
        cheque: num(c.cheque_rub), goalDeals: num(c.goal_deals_per_month), goalText: text(c.goal_text, 400),
        leadsNow: num(c.leads_now_per_month), dealsNow: num(c.deals_now_per_month), adBudgetNow: num(c.ad_budget_now_rub),
        sources: text(c.current_sources, 300), handler: handler, pains: list(c.pains, 8)
      },
      objections: (Array.isArray(raw.objections) ? raw.objections : []).map(function (o) {
        return { text: text(o && o.text, 300), answer: text(o && o.answer, 500) };
      }).filter(function (o) { return o.text; }).slice(0, 8),
      agreements: list(raw.agreements, 8),
      next: { action: text(step.action, 300), when: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(step.when || '')) ? String(step.when).slice(0, 16) : '' },
      stage: D.callStageNames[raw.stage] ? raw.stage : '',
      review: {
        score: Math.max(0, Math.min(10, Math.round(Number(r.score) || 0))),
        good: list(r.good, 8), missed: list(r.missed, 8), advice: list(r.advice, 8), checklist: checklist
      },
      message: text(raw.client_message, 1500)
    };
  }

  function messages(transcript, lead) {
    var today = new Date().toISOString().slice(0, 10) + ' (' + ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'][new Date().getDay()] + ')';
    var ctx = lead ? 'Клиент в CRM: ' + [lead.name, lead.niche, lead.city].filter(Boolean).join(', ') + '.' : 'Клиент в CRM пока не выбран.';
    return [
      { role: 'system', content: D.callPrompt.replace('{today}', today) },
      { role: 'user', content: ctx + '\n\nРасшифровка разговора:\n' + String(transcript).slice(0, MAX_CHARS) }
    ];
  }

  // Разбор расшифровки моделью. Промис с нормализованным результатом.
  function analyze(transcript, lead) {
    if (!String(transcript || '').trim()) return Promise.reject(new Error('В расшифровке нет текста.'));
    return C.trainerapi.chat(messages(transcript, lead), 'call').then(function (res) {
      var json = parseJson(res.text);
      if (!json) throw new Error('Модель вернула ответ не в том формате. Нажми «Разобрать заново».');
      return normalize(json);
    });
  }

  // Расшифровка по кускам. onProgress(done, total). Возвращает объединённый текст.
  function transcribeAll(chunks, onProgress) {
    var parts = [];
    var chain = Promise.resolve();
    chunks.forEach(function (wav, i) {
      chain = chain.then(function () {
        return C.trainerapi.transcribe(wav).then(function (res) {
          parts.push(String(res.text || '').trim());
          if (onProgress) onProgress(i + 1, chunks.length);
        });
      });
    });
    return chain.then(function () { return parts.filter(Boolean).join('\n'); });
  }

  // Что можно записать в карточку: строки с текущим и новым значением. checked: ставить ли галочку по умолчанию.
  function plan(lead, a) {
    var d = (lead && lead.data) || {};
    var c = a.client;
    var rows = [];
    function row(key, label, current, next, apply) {
      if (next === '' || next === 0 || next === null || next === undefined) return;
      var cur = current === undefined || current === null ? '' : String(current);
      if (cur === String(next)) return;
      rows.push({ key: key, label: label, current: cur, next: String(next), checked: !cur, apply: apply });
    }
    var niche = c.niche ? (C.egokad.match(c.niche) || c.niche) : '';
    row('name', 'Имя', lead && lead.name, c.name, function (id) { store.patch(id, { name: c.name }); });
    row('niche', 'Ниша', lead && lead.niche, niche, function (id) { store.patch(id, { niche: niche }); });
    row('city', 'Город', lead && lead.city, c.city, function (id) { store.patch(id, { city: c.city }); });
    row('cheque', 'Средний чек, ₽', d.calc_cheque, c.cheque, function (id) { store.setData(id, 'calc_cheque', String(c.cheque)); });
    row('goal', 'Цель: договоров в месяц', d.calc_deals, c.goalDeals, function (id) { store.setData(id, 'calc_deals', String(c.goalDeals)); });
    row('leads', 'Заявок сейчас в месяц', d.calc_a_leads, c.leadsNow, function (id) { store.setData(id, 'calc_a_leads', String(c.leadsNow)); });
    row('deals', 'Договоров сейчас в месяц', d.calc_a_sales, c.dealsNow, function (id) { store.setData(id, 'calc_a_sales', String(c.dealsNow)); });
    row('budget', 'Рекламный бюджет сейчас, ₽', d.calc_a_budget, c.adBudgetNow, function (id) { store.setData(id, 'calc_a_budget', String(c.adBudgetNow)); });
    row('goalText', 'Цель словами клиента', d.b_goal, c.goalText, function (id) { store.setData(id, 'b_goal', c.goalText); });
    row('sources', 'Откуда берёт клиентов', d.q_exp, c.sources, function (id) { store.setData(id, 'q_exp', c.sources); });
    row('handler', 'Кто обрабатывает заявки', d.q_sales, D.callSalesMap[c.handler] || '', function (id) { store.setData(id, 'q_sales', D.callSalesMap[c.handler]); });
    if (a.next.action || a.next.when) {
      var nextText = [a.next.when ? U.fmtDateTime(a.next.when) : '', a.next.action].filter(Boolean).join(': ');
      row('next', 'Следующий контакт', lead && lead.nextAt ? [U.fmtDateTime(lead.nextAt), lead.nextNote].filter(Boolean).join(': ') : '', nextText, function (id) {
        store.patch(id, { nextAt: a.next.when || (lead && lead.nextAt) || '', nextNote: a.next.action || '' });
      });
    }
    if (a.summary) {
      rows.push({
        key: 'notes', label: 'Итоги в заметки карточки', current: '', next: a.summary, checked: true,
        apply: function (id) {
          var fresh = store.get(id);
          var stamp = '[' + new Date().toLocaleDateString('ru-RU') + ' разговор] ';
          store.patch(id, { notes: (fresh.notes ? fresh.notes + '\n\n' : '') + stamp + a.summary + (c.pains.length ? '\nБоли: ' + c.pains.join('; ') : '') });
        }
      });
    }
    if (a.stage && lead && lead.stage !== a.stage) {
      rows.push({
        key: 'stage', label: 'Перевести на этап', current: (D.stageById(lead.stage) || {}).title || '', next: D.callStageNames[a.stage], checked: false,
        apply: function (id) { store.moveStage(id, a.stage); }
      });
    }
    return rows;
  }

  // Применяет отмеченные строки. Без выбранного клиента сначала заводит карточку.
  function apply(call, lead, rows) {
    var target = lead;
    if (!target) {
      target = store.add({ name: (call.analysis && call.analysis.client.name) || 'Клиент из разговора', niche: '', city: '', source: 'Другое' });
    }
    // КП соберётся заново из свежих цифр, а не из старых сохранённых параметров
    rows.forEach(function (r) { r.apply(target.id); });
    store.setData(target.id, 'kp_params', '');
    call.leadId = target.id;
    call.appliedAt = U.nowIso();
    store.saveCall(call);
    return target;
  }

  function newCall(fields) {
    return Object.assign({
      id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      at: U.nowIso(), leadId: '', source: 'record', fileName: '', seconds: 0, transcript: '', analysis: null, appliedAt: ''
    }, fields || {});
  }

  C.calls = {
    MAX_CHARS: MAX_CHARS, parseJson: parseJson, normalize: normalize, messages: messages, analyze: analyze,
    transcribeAll: transcribeAll, plan: plan, apply: apply, newCall: newCall
  };
})((window.CRM = window.CRM || {}));
