(function (C) {
  'use strict';

  var D = C.data;
  var P = C.proposal;

  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function rub(n) {
    return Number(n).toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽';
  }

  function list(items, cls) {
    return '<ul class="' + (cls || 'list') + '">' + items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
  }

  function row(label, value) {
    return '<div class="kv"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>';
  }

  var CSS = [
    ':root{--bg:#0a0b0c;--card:#111315;--card2:#171a1c;--ink:#f2f5f6;--muted:#98a3a7;--line:rgba(255,255,255,.09);--acc:#2dd4bf;--blue:#5b9dff;--acc2:#f5b84b;--accsoft:rgba(45,212,191,.1);--bluesoft:rgba(91,157,255,.09);--radius:24px;--grad:linear-gradient(135deg,#3b82f6,#2dd4bf);--on:#04201c}',
    'html.light{--bg:#f4f6f7;--card:#ffffff;--card2:#f6f8f9;--ink:#0f1729;--muted:#59656d;--line:rgba(15,23,41,.12);--acc:#0f766e;--blue:#2563eb;--acc2:#b45309;--accsoft:rgba(15,118,110,.09);--bluesoft:rgba(37,99,235,.07);--on:#ffffff}',
    '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}',
    '.wrap{max-width:1040px;margin:0 auto;padding:28px 18px 64px;display:flex;flex-direction:column;gap:20px}',
    '.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:34px}',
    '.hero{padding:48px 40px 44px;background:radial-gradient(700px 320px at 12% -8%,rgba(59,130,246,.2),transparent 62%),radial-gradient(620px 320px at 92% 112%,rgba(45,212,191,.13),transparent 62%),var(--card)}',
    'html.light .hero{background:radial-gradient(700px 320px at 12% -8%,rgba(59,130,246,.1),transparent 62%),var(--card)}',
    '.pill{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);background:rgba(255,255,255,.04);border-radius:999px;padding:6px 14px;font-size:13px;font-weight:600;color:var(--ink);margin-bottom:26px}.pill::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--grad)}',
    'h1{font-size:clamp(34px,6.4vw,62px);line-height:1.04;letter-spacing:-.035em;font-weight:900;margin:0 0 22px}',
    'h1 em,h2 em{font-style:normal;background:linear-gradient(90deg,#3b82f6,#2dd4bf 55%,#a7f3d0);-webkit-background-clip:text;background-clip:text;color:transparent}',
    'h2{font-size:clamp(26px,3.6vw,38px);letter-spacing:-.03em;line-height:1.12;font-weight:800;margin:0 0 10px}',
    'h3{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin:0 0 12px}',
    '.lead{font-size:clamp(17px,2vw,20px);max-width:760px;color:var(--muted);margin:0}.lead b{color:var(--ink)}',
    '.small{font-size:14px;color:var(--muted);max-width:720px;margin:14px 0 0}',
    '.sub{color:var(--muted);max-width:640px;margin:0}',
    '.sec-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:24px}.sec-pill{flex:none;border:1px solid rgba(91,157,255,.35);background:var(--bluesoft);color:var(--blue);border-radius:999px;padding:5px 13px;font-size:12px;font-weight:700;white-space:nowrap}',
    '.banner{background:rgba(245,184,75,.12);border:1px solid var(--acc2);color:var(--ink);border-radius:12px;padding:10px 14px;font-size:14px;margin-top:18px}',
    '.ab{display:grid;grid-template-columns:1fr 1fr;gap:16px}',
    '.col{border:1px solid var(--line);background:var(--card2);border-radius:18px;padding:20px 22px}.col.b{border-color:rgba(91,157,255,.4);background:var(--bluesoft)}.col.b .tag{color:var(--blue)}',
    '.kv{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid var(--line)}.kv:last-of-type{border-bottom:0}.kv span{color:var(--muted)}.kv b{text-align:right}',
    '.note{margin:12px 0 0;color:var(--muted);font-size:14px}',
    '.block-wide{margin-top:16px;border:1px solid var(--line);background:var(--card2);border-radius:18px;padding:18px 22px}.block-wide .tag{color:var(--blue)}.block-wide p{margin:8px 0 0}',
    '.tag{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}',
    '.mod{border:1px solid var(--line);border-radius:22px;background:linear-gradient(180deg,rgba(91,157,255,.07),transparent 150px),var(--card2);margin-top:18px;overflow:hidden}',
    '.mod-head{display:flex;gap:18px;align-items:flex-start;padding:26px 28px 22px}.mod-head>div{flex:1;min-width:0}',
    '.num{flex:none;width:44px;height:44px;border-radius:14px;background:var(--grad);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 8px 24px rgba(59,130,246,.28)}',
    '.mod-head .tag{color:var(--blue)}.mod-head h4{margin:4px 0 6px;font-size:clamp(20px,2.6vw,26px);letter-spacing:-.02em;line-height:1.2}.mod-head p{margin:0;color:var(--muted);max-width:640px}',
    '.stage-pill{flex:none;border:1px solid rgba(45,212,191,.35);background:var(--accsoft);color:var(--acc);border-radius:999px;padding:4px 12px;font-size:12px;font-weight:700}',
    '.mod-main{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:0 20px 20px;border-top:1px solid var(--line);padding-top:20px}.mod-main.solo{grid-template-columns:1fr}.mod-main.flip .vis{order:2}',
    '.vis{position:relative;border:1px solid var(--line);border-radius:20px;background:var(--card);padding:16px;display:grid;gap:12px;align-content:center;justify-items:center;min-height:240px}.vis.two{grid-template-columns:1fr 1fr}',
    '.vis .shot{margin:0;width:100%}.vis img{display:block;width:100%;height:auto;border-radius:12px;border:1px solid var(--line)}',
    '.vis-label{position:absolute;left:14px;bottom:14px;background:rgba(10,11,12,.82);color:#e8eef0;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:4px 12px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}',
    '.result{border:1px solid rgba(45,212,191,.28);border-radius:20px;background:linear-gradient(160deg,rgba(45,212,191,.1),rgba(45,212,191,.03));padding:24px}',
    '.result .chip{display:inline-block;border-radius:999px;background:rgba(45,212,191,.16);color:var(--acc);font-size:11px;font-weight:800;padding:3px 11px;margin-bottom:12px}',
    '.result h5{margin:0 0 8px;font-size:19px;letter-spacing:-.01em}.result p{margin:0;color:var(--muted)}',
    '.example{margin-top:16px;border:1px solid var(--line);background:rgba(0,0,0,.18);border-radius:14px;padding:14px 16px}html.light .example{background:rgba(15,23,41,.04)}.example p{margin:6px 0 0;color:var(--ink)}',
    '.mod-grid{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line)}.mod-grid>div{padding:20px 28px;border-bottom:1px solid var(--line)}.mod-grid>div:nth-child(odd){border-right:1px solid var(--line)}.mod-grid>div:nth-last-child(-n+2){border-bottom:0}',
    '.mod-grid p{margin:8px 0 0;color:var(--muted)}.mod-grid .tip{background:rgba(245,184,75,.07)}.mod-grid .tip .tag{color:var(--acc2)}',
    '.list{margin:10px 0 0;padding:0;list-style:none;color:var(--muted)}.list li{margin:6px 0;padding-left:16px;position:relative}.list li::before{content:"";position:absolute;left:0;top:.72em;width:5px;height:5px;border-radius:50%;background:var(--blue)}',
    '.checks{margin:14px 0 0;padding:0;list-style:none}.checks li{position:relative;padding:8px 0 8px 28px;border-bottom:1px solid var(--line)}.checks li:last-child{border-bottom:0}.checks li::before{content:"";position:absolute;left:4px;top:15px;width:5px;height:10px;border:solid var(--acc);border-width:0 2px 2px 0;transform:rotate(45deg)}',
    '#econ-table{width:100%;border-collapse:collapse;font-size:15px}#econ-table th,#econ-table td{padding:13px 12px;text-align:right;border-bottom:1px solid var(--line)}#econ-table th:first-child,#econ-table td:first-child{text-align:left;color:var(--muted)}#econ-table th{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700}#econ-table td.mid,#econ-table th.mid{background:var(--bluesoft);color:var(--ink);font-weight:700}#econ-table th.mid{color:var(--blue)}',
    '.btn{display:inline-block;border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:12px;padding:10px 16px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}.btn:hover{border-color:var(--blue)}',
    '.btn.primary{background:var(--grad);border-color:transparent;color:#fff}.btn.big{padding:14px 28px;font-size:17px;border-radius:14px}',
    '.steps::before{content:"";position:absolute;left:14%;right:14%;top:19px;height:2px;background:linear-gradient(90deg,#3b82f6,#2dd4bf);opacity:.4}',
    '.steps{position:relative;display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px}',
    '.step{position:relative;border:1px solid var(--line);background:var(--card2);border-radius:18px;padding:64px 20px 22px;text-align:center}.step .dot{position:absolute;left:50%;top:-4px;transform:translateX(-50%);width:46px;height:46px;border-radius:50%;background:var(--grad);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 6px rgba(59,130,246,.14),0 10px 28px rgba(59,130,246,.3)}',
    '.step .tag{color:var(--blue)}.step b{display:block;font-size:19px;margin:6px 0 8px}.step p{margin:0;color:var(--muted);font-size:15px}',
    '.price-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:16px;align-items:stretch}',
    '.incl{border:1px solid var(--line);background:var(--card2);border-radius:18px;padding:22px 24px}.incl h4{margin:0;font-size:17px}',
    '.pricebox{border:1px solid rgba(91,157,255,.35);border-radius:18px;padding:26px;background:radial-gradient(520px 260px at 80% -10%,rgba(59,130,246,.28),transparent 62%),radial-gradient(420px 260px at 0% 110%,rgba(45,212,191,.16),transparent 62%),var(--card2);display:flex;flex-direction:column;justify-content:center;gap:6px}',
    '.pricebox .tag{color:var(--blue)}.pricebox .price{font-size:clamp(38px,6vw,60px)}.pricebox p{margin:8px 0 0;color:var(--muted);font-size:15px}',
    '.price{font-size:clamp(30px,4vw,44px);font-weight:900;letter-spacing:-.03em;line-height:1.05;background:linear-gradient(90deg,#3b82f6,#2dd4bf);-webkit-background-clip:text;background-clip:text;color:transparent}.per{color:var(--muted);margin-top:-2px;font-size:14px}',
    '.maint{margin-top:16px;display:flex;justify-content:space-between;align-items:center;gap:16px;border:1px dashed rgba(91,157,255,.4);border-radius:16px;padding:18px 22px;background:var(--card2)}.maint h4{margin:4px 0}.maint p{margin:0;color:var(--muted);font-size:15px}.maint-price{text-align:right;white-space:nowrap}.maint-price b{display:block;font-size:26px;font-weight:900}.maint-price span{color:var(--muted);font-size:14px}@media(max-width:640px){.maint{flex-direction:column;align-items:flex-start}.maint-price{text-align:left}}',
    '.tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px}',
    '.tier{border:1px solid var(--line);background:var(--card2);border-radius:20px;padding:24px;display:flex;flex-direction:column;gap:8px}.tier.rec{border-color:rgba(91,157,255,.55);background:linear-gradient(180deg,var(--bluesoft),transparent 60%),var(--card2);box-shadow:0 0 0 1px rgba(91,157,255,.4)}',
    '.tier h4{margin:0;font-size:20px}.tier .tag{color:var(--blue)}',
    '.badge{align-self:flex-start;background:var(--grad);color:#fff;border-radius:999px;font-size:12px;font-weight:800;padding:3px 11px}',
    'details{margin-top:8px;border:1px solid var(--line);border-radius:12px;padding:2px 14px;background:rgba(255,255,255,.02)}summary{cursor:pointer;font-weight:600;padding:9px 0}details ul{color:var(--muted);font-size:14px}',
    '.blocks{margin-top:14px}',
    '.bonus{margin-top:18px;border:1px dashed var(--acc2);border-radius:20px;padding:24px;background:rgba(245,184,75,.06)}.bonus .tag{color:var(--acc2)}.bonus h4{margin:6px 0;font-size:21px}',
    '.cta{text-align:center;padding:56px 30px;background:radial-gradient(640px 300px at 50% -10%,rgba(59,130,246,.22),transparent 62%),radial-gradient(520px 260px at 50% 120%,rgba(45,212,191,.14),transparent 62%),var(--card)}',
    '.cta-ico{width:56px;height:56px;border-radius:16px;background:var(--grad);margin:0 auto 22px;display:flex;align-items:center;justify-content:center;box-shadow:0 12px 32px rgba(59,130,246,.32)}.cta-ico svg{width:26px;height:26px}',
    '.cta h2{max-width:760px;margin:0 auto 14px}.cta .sub{margin:0 auto 24px;text-align:center}.contacts{margin-top:24px;color:var(--muted);font-size:15px;line-height:1.8}.contacts a{color:var(--ink)}',
    '.top{display:flex;justify-content:flex-end;gap:8px}.top .btn{padding:7px 14px;font-size:13px;border-radius:999px}',
    '@media(max-width:760px){.card{padding:24px 18px}.hero{padding:30px 20px}.ab,.mod-main,.price-grid,.mod-grid{grid-template-columns:1fr}.mod-main.flip .vis{order:0}.mod-grid>div:nth-child(odd){border-right:0}.mod-grid>div:nth-last-child(-n+2){border-bottom:1px solid var(--line)}.mod-grid>div:last-child{border-bottom:0}.mod-head{padding:20px 18px 16px}.mod-head .stage-pill{display:none}.sec-head{flex-direction:column}#econ-table{font-size:13px}#econ-table th,#econ-table td{padding:9px 5px}.vis.two{grid-template-columns:1fr 1fr}}',
    '.pg,.pg>thead,.pg>tfoot,.pg>tbody,.pg>tbody>tr,.pg>tbody>tr>td{display:block;padding:0;border:0}.pg>thead,.pg>tfoot{display:none}',
    '@page{size:A4;margin:0}',
    '@media print{.pg{display:table;width:100%;border-collapse:collapse}.pg>thead{display:table-header-group}.pg>tfoot{display:table-footer-group}.pg>tbody{display:table-row-group}.pg>thead>tr,.pg>tfoot>tr,.pg>tbody>tr{display:table-row}.pg>thead>tr>td,.pg>tfoot>tr>td,.pg>tbody>tr>td{display:table-cell}.sp{height:13mm}',
    '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{background:var(--bg)}.wrap{max-width:none;padding:0 13mm;gap:14px}',
    '.top,.btn.noprint,.noprint{display:none!important}h1{font-size:32px}h2{font-size:23px}.card{box-shadow:none;padding:24px 26px}.hero{padding:30px 28px}',
    '.mod-main,.mod-grid{grid-template-columns:1fr 1fr}.ab,.price-grid{grid-template-columns:1fr 1fr}',
    '.box,.step,.col,.vis,.result,.example,.incl,.pricebox,.tier,.maint,.mod-grid>div,.card tr,li,.shot{break-inside:avoid}.mod{break-inside:auto}h1,h2,h3,h4,.tag{break-after:avoid}}'
  ].join('\n');

  // Таблица сценариев строится сразу в HTML: без скриптов, одинаково на экране и в печати
  function econTable(m) {
    var rows = [
      ['Заявок', 'leads', 0], ['Встреч', 'meetings', 0], ['Продаж', 'sales', 0],
      ['Рекламный бюджет', 'budget', 1], ['Выручка', 'revenue', 1], ['ROMI по рекламе', 'romi', 2], ['Выручка на 1 ₽ затрат в первый месяц', 'payback', 3]
    ];
    function fmt(kind, v) {
      if (kind === 1) return P.money(v);
      if (kind === 2) return Math.round(v).toLocaleString('ru-RU').replace(/\u00a0/g, ' ') + '%';
      if (kind === 3) return String(v).replace('.', ',') + '×';
      return String(v);
    }
    var thead = '<thead><tr><th>Показатель</th>' + m.econ.map(function (c, i) { return '<th' + (i === 1 ? ' class="mid"' : '') + '>' + esc(c.title) + '</th>'; }).join('') + '</tr></thead>';
    var tbody = '<tbody>' + rows.map(function (r) {
      return '<tr><td>' + r[0] + '</td>' + m.econ.map(function (c, i) { return '<td' + (i === 1 ? ' class="mid"' : '') + '>' + esc(fmt(r[2], c.res[r[1]])) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody>';
    return '<table id="econ-table">' + thead + tbody + '</table>';
  }

  function head(title, sub, pill) {
    return '<div class="sec-head"><div><h2>' + title + '</h2>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div>' + (pill ? '<span class="sec-pill">' + esc(pill) + '</span>' : '') + '</div>';
  }

  function checks(items) {
    return '<ul class="checks">' + items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
  }

  function blocksOf(t, open) {
    return (t.blocks || []).map(function (b) {
      return '<details' + (open ? ' open' : '') + '><summary>' + esc(b.title) + '</summary>' + list(b.items, 'list') + '</details>';
    }).join('');
  }

  // Карточка тарифа для режима «показать все три»
  function tierCard(t, rec) {
    return '<div class="tier' + (rec ? ' rec' : '') + '">' +
      (rec ? '<span class="badge">Рекомендуем</span>' : '') +
      '<h4>' + esc(t.name) + '</h4>' +
      '<div class="price">' + rub(t.price) + '</div><div class="per">разово, за запуск</div>' +
      '<div class="tag">Срок разработки: ' + esc(t.term) + '</div>' +
      (t.summary && t.summary.length ? '<details><summary>Что входит</summary>' + list(t.summary, 'list') + '</details>' : '') +
      blocksOf(t, false) + '</div>';
  }

  // Один тариф: слева состав, справа цена
  function priceGrid(t, maint) {
    return '<div class="price-grid"><div class="incl"><h4>Входит в стоимость</h4>' + (t.summary && t.summary.length ? checks(t.summary) : '') + '</div>' +
      '<div class="pricebox"><div class="tag">Стоимость работ: ' + esc(t.name) + '</div><div class="price">' + rub(t.price) + '</div><div class="per">разово, за запуск</div>' +
      '<p>Срок полной разработки: ' + esc(t.term) + '. Рекламный бюджет и внешние сервисы оплачиваются отдельно, если не указано иначе.</p></div></div>' + (maint || '') +
      ((t.blocks || []).length ? '<div class="blocks"><h3>Подробный состав работ</h3>' + blocksOf(t, true) + '</div>' : '');
  }

  // Ведение проекта: платится отдельно и только если клиент захочет продолжить работать после запуска
  function maintBlock(m) {
    var x = m.maintain;
    if (!x) return '';
    return '<div class="maint"><div><div class="tag">После запуска, по желанию</div><h4>' + esc(x.title) + '</h4>' +
      '<p>Если захотите продолжить работать вместе: ведём рекламу и аналитику, улучшаем результат каждый месяц.</p></div>' +
      '<div class="maint-price"><b>' + rub(x.price) + '</b><span>' + esc(x.per) + '</span></div></div>';
  }

  // Для предпросмотра внутри панели: сообщаем прокрутку наружу и восстанавливаем после обновления
  var FRAME_JS = '(function(){var op=[];window.addEventListener("beforeprint",function(){op=[];[].forEach.call(document.querySelectorAll("details"),function(d){if(!d.open){op.push(d);d.open=true;}});});window.addEventListener("afterprint",function(){op.forEach(function(d){d.open=false;});op=[];});if(window.parent===window)return;window.addEventListener("scroll",function(){parent.postMessage({kpY:window.scrollY},"*");},{passive:true});window.addEventListener("message",function(e){if(e.data&&typeof e.data.kpRestore==="number")window.scrollTo(0,e.data.kpRestore);});})();';

  function render(raw) {
    var m = P.model(raw);
    var p = m.p;
    var author = P.author();
    var city = String(p.city || '').trim();
    var where = city ? 'в городе ' + city : 'в вашем городе';
    var out = [];

    out.push('<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">');
    out.push('<title>Интерактивное предложение: ' + esc(p.niche || 'система привлечения клиентов') + (city ? ', ' + esc(city) : '') + '</title><style>' + CSS + '</style></head><body><table class="pg"><thead><tr><td><div class="sp"></div></td></tr></thead><tfoot><tr><td><div class="sp"></div></td></tr></tfoot><tbody><tr><td><main class="wrap">');
    out.push('<div class="top"><button class="btn noprint" id="theme" type="button">Светлая / тёмная</button><button class="btn noprint" type="button" onclick="window.print()">Печать / PDF</button></div>');

    // Первый экран
    out.push('<header class="card hero"><span class="pill">Интерактивное КП, персональное предложение' + (p.clientName ? ' для ' + esc(p.clientName) : '') + '</span>');
    out.push('<h1>Система привлечения клиентов для <em>' + esc(p.phrase) + '</em> ' + esc(where) + '</h1>');
    out.push('<p class="lead">Соберём понятную маркетинговую систему: <b>сайт и квиз + воронка в мессенджере + Яндекс Директ + аналитика</b>. Вы получаете стабильный поток заявок и видите стоимость каждой.</p>');
    out.push('<p class="small">Первые данные по заявкам можно увидеть после запуска рекламы.</p>');
    if (p.sample) out.push('<div class="banner">Пример: цифры в этом предложении условные. Подставьте данные клиента.</div>');
    out.push('</header>');

    // Точка А и Б
    if (m.aShown || m.bShown) {
      out.push('<section class="card">' + head('Фиксируем точку А и точку Б до старта', 'Сначала фиксируем текущую ситуацию и целевой результат, чтобы считать запуск не в кликах, а в заявках, встречах и договорах.', 'Точка отсчёта') + '<div class="ab">');
      out.push('<div class="col"><div class="tag">Точка А: сейчас</div>');
      if (m.a.leads) out.push(row('Заявки в месяц', String(m.a.leads)));
      if (m.a.deals) out.push(row('Договоры в месяц', String(m.a.deals)));
      if (m.a.cheque) out.push(row('Средний чек', rub(m.a.cheque)));
      if (m.a.deals && m.a.cheque) out.push(row('Текущая выручка', rub(m.a.revenue)));
      if (p.aNote) out.push('<p class="note">' + esc(p.aNote) + '</p>');
      out.push('</div><div class="col b"><div class="tag">Точка Б: план</div>');
      if (m.bShown) {
        out.push(row('План заявок', String(m.b.leads)));
        out.push(row('План договоров', String(m.b.deals)));
        out.push(row('Средний чек', rub(m.b.cheque)));
        out.push(row('Целевая выручка', rub(m.b.revenue)));
      } else {
        out.push('<p class="note">Укажите цель по договорам и средний чек.</p>');
      }
      if (p.bNote) out.push('<p class="note">' + esc(p.bNote) + '</p>');
      out.push('</div></div>');
      if (p.blockers) out.push('<div class="block-wide"><div class="tag">Что мешает прийти из точки А в точку Б</div><p>' + esc(p.blockers) + '</p></div>');
      out.push('</section>');
    }

    // Этапы
    if (m.modules.length) {
      out.push('<section class="card">' + head('Как устроена работа по этапам', 'Показываем, из каких элементов собирается система: трафик, страница, воронка, аналитика и контроль обработки заявок.', 'Поэтапно'));
      m.modules.forEach(function (mod, i) {
        var example = m.texts[mod.id] || '';
        var shots = p.shots !== false && /газобетон/i.test(p.niche || '') && D.proposalShots && D.proposalShots[mod.id];
        var n = i + 1;
        out.push('<article class="mod"><div class="mod-head"><span class="num">' + (n < 10 ? '0' + n : n) + '</span><div><div class="tag">Модуль системы</div><h4>' + esc(mod.title) + '</h4><p>' + esc(mod.intro) + '</p></div><span class="stage-pill">Этап ' + n + '</span></div>');
        var result = '<div class="result"><span class="chip">Результат этапа</span><h5>Как этот этап приближает к точке Б</h5><p>' + esc(mod.result.replace('{phrase}', p.phrase)) + '</p>' +
          (example ? '<div class="example"><div class="tag">Пример результата</div><p>' + esc(example) + '</p></div>' : '') + '</div>';
        if (shots && shots.length) {
          var shown = shots.slice(0, shots.length > 1 && shots[0].w < 500 ? 2 : 1);
          var vis = '<div class="vis' + (shown.length > 1 ? ' two' : '') + '">' + shown.map(function (x) {
            return '<figure class="shot"><img src="' + x.src + '" alt="' + esc(x.cap) + '" width="' + x.w + '" height="' + x.h + '"></figure>';
          }).join('') + '<span class="vis-label">Визуал этапа ' + n + '</span></div>';
          out.push('<div class="mod-main' + (i % 2 ? ' flip' : '') + '">' + vis + result + '</div>');
        } else {
          out.push('<div class="mod-main solo">' + result + '</div>');
        }
        out.push('<div class="mod-grid"><div><div class="tag">Что входит</div>' + list(mod.includes) + '</div>' +
          '<div><div class="tag">Как это работает</div><p>' + esc(mod.how) + '</p></div>' +
          '<div><div class="tag">Выгода для бизнеса</div><p>' + esc(mod.benefit) + '</p></div>' +
          '<div class="tip"><div class="tag">Совет эксперта</div><p>' + esc(mod.tip) + '</p></div></div></article>');
      });
      out.push('</section>');
    }

    // Экономика
    if (m.econShown) {
      out.push('<section class="card" id="econ">' + head('Экономика проекта до запуска', 'Считаем три сценария запуска: план заявок, цена заявки, конверсии и средний чек. Рекламный бюджет это следствие плана, а не вход.', 'Расчёт'));
      out.push('<div style="overflow-x:auto">' + econTable(m) + '</div>');
      out.push('<p class="note">Конверсии в расчёте: заявка во встречу ' + m.meet + '%, встреча в договор ' + m.pay + '%. Цена заявки ' + esc(P.money(m.cpl)) + ' ориентир по данным рынка для ниши, точная стоимость станет известна после запуска. Затраты в строке «Выручка на 1 ₽ затрат» это реклама плюс месяц работы по выбранному тарифу.</p></section>');
    }

    // Как будет идти работа
    out.push('<section class="card">' + head('Как будет идти работа', 'Запуск идёт по короткому маршруту: собираем связку, запускаем трафик, смотрим первые данные и докручиваем слабые места.', 'Таймлайн') + '<div class="steps">');
    D.proposalPhases.forEach(function (ph, i) {
      out.push('<div class="step"><span class="dot">' + (i < 9 ? '0' : '') + (i + 1) + '</span><div class="tag">Фаза ' + (i + 1) + '</div><b>' + esc(ph.t) + '</b><p>' + esc(ph.d) + '</p></div>');
    });
    out.push('</div><p class="note">Срок полной разработки: ' + esc(m.tier.term) + '.</p></section>');

    // Стоимость
    out.push('<section class="card">' + head('Стоимость решения', 'Рекламный бюджет платится отдельно напрямую в Яндекс и пополняется частями. Внешние сервисы оплачиваются отдельно, если не указано иначе.', 'Стоимость и состав'));
    if (p.showAll) {
      out.push('<div class="tiers">' + m.tiers.map(function (t) { return tierCard(t, t.id === m.tier.id); }).join('') + '</div>');
    } else {
      out.push(priceGrid(m.tier, maintBlock(m)));
    }
    if (p.showAll) out.push(maintBlock(m));
    if (p.bonus && D.offerBonus) {
      var b = D.offerBonus;
      var until = P.ruDate(p.bonusUntil);
      out.push('<div class="bonus"><div class="tag">Бонус для первых клиентов' + (until ? ', при оплате до ' + esc(until) : '') + '</div><h4>' + esc(b.title) + '</h4><p class="sub">Обычная стоимость ' + rub(b.normalPrice) + '. Делаем за свой счёт.</p>');
      out.push(b.blocks.map(function (blk) { return '<details><summary>' + esc(blk.title) + '</summary>' + list(blk.items, 'list') + '</details>'; }).join(''));
      out.push('</div>');
    }
    out.push('</section>');

    // Призыв
    var contacts = [];
    if (author.name) contacts.push(esc(author.name));
    if (author.phone) contacts.push('<a href="tel:' + esc(author.phone.replace(/[^\d+]/g, '')) + '">' + esc(author.phone) + '</a>');
    if (author.telegram) contacts.push('<a href="https://t.me/' + esc(author.telegram.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '')) + '">Telegram ' + esc(author.telegram) + '</a>');
    var ctaHref = author.telegram ? 'https://t.me/' + esc(author.telegram.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '')) : (author.phone ? 'tel:' + esc(author.phone.replace(/[^\d+]/g, '')) : '');
    out.push('<section class="card cta"><div class="cta-ico"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>');
    out.push('<h2>Готовы собрать систему привлечения клиентов для <em>' + esc(p.phrase) + '</em>?</h2><p class="sub">Обсудим запуск системы заявок</p>');
    if (ctaHref) out.push('<a class="btn primary big" href="' + ctaHref + '">Обсудить запуск</a>');
    if (contacts.length) out.push('<div class="contacts">' + contacts.join('<br>') + '</div>');
    out.push('</section>');
    out.push('</main></td></tr></tbody></table>');

    out.push('<script>(function(){var th=document.getElementById("theme");if(th)th.addEventListener("click",function(){document.documentElement.classList.toggle("light");});})();</script>');
    out.push('<script>' + FRAME_JS + '</script>');
    out.push('</body></html>');
    return out.join('\n');
  }

  P.html = render;
})((window.CRM = window.CRM || {}));
