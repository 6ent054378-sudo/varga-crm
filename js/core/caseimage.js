(function (C) {
  'use strict';

  var U = C.utils;
  var K = C.cases;

  var W = 1080;
  var PAD = 56;
  var FONT = '"Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  var INK = '#1f2933';
  var MUTED = '#5f6b73';
  var ACCENT = '#16695f';
  var SOFT = '#e6f2f0';
  var cache = {};

  // Рисуем карточку кейса на canvas. Возвращает canvas или null, если рисование недоступно.
  function context(cv) {
    try {
      return cv.getContext ? cv.getContext('2d') : null;
    } catch (e) {
      return null;
    }
  }

  function wrap(ctx, text, maxW, maxLines) {
    var words = String(text || '').split(/\s+/).filter(Boolean);
    var lines = [];
    var line = '';
    words.forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    if (maxLines && lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = lines[maxLines - 1].replace(/[\s.,;:]*$/, '') + '...';
    }
    return lines;
  }

  function host(c) {
    var l = K.links(c)[0] || '';
    var m = l.match(/^https?:\/\/(?:www\.)?([^\/]+)/);
    return m ? m[1] : '';
  }

  // Крупные цифры сверху: расход, заявки, стоимость заявки, либо число из заголовка материала
  function stats(c) {
    var out = [];
    if (Number(c.spend)) out.push({ v: U.fmtMoney(c.spend), l: 'расход на рекламу' });
    if (Number(c.leads)) out.push({ v: String(c.leads), l: 'заявок' });
    if (K.cpl(c)) out.push({ v: U.fmtMoney(K.cpl(c)), l: 'стоимость заявки' });
    if (!out.length) {
      var hint = K.hints(c);
      if (hint) out.push({ v: hint.label, l: 'заявок, по заголовку материала' });
    }
    return out.slice(0, 3);
  }

  // Один проход раскладки: считает высоту, а при draw = true ещё и рисует
  function paint(ctx, c, draw) {
    var y = 0;
    var inner = W - PAD * 2;

    if (draw) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, 4000);
    }

    // Шапка
    var headH = 74;
    if (draw) {
      ctx.fillStyle = ACCENT;
      ctx.fillRect(0, 0, W, headH);
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 28px ' + FONT;
      ctx.textBaseline = 'middle';
      ctx.fillText(K.category(c) + '  /  ' + (c.type || 'Кейс'), PAD, headH / 2);
    }
    y = headH + 44;

    // Название ниши или кейса
    ctx.font = '700 50px ' + FONT;
    ctx.textBaseline = 'top';
    var title = wrap(ctx, c.niche || c.title, inner, 3);
    title.forEach(function (ln) {
      if (draw) { ctx.fillStyle = INK; ctx.font = '700 50px ' + FONT; ctx.textBaseline = 'top'; ctx.fillText(ln, PAD, y); }
      y += 62;
    });
    y += 14;

    // Цифры
    var st = stats(c);
    if (st.length) {
      var gap = 20;
      var bw = Math.floor((inner - gap * (st.length - 1)) / st.length);
      st.forEach(function (s, i) {
        var x = PAD + i * (bw + gap);
        if (draw) {
          ctx.fillStyle = SOFT;
          ctx.fillRect(x, y, bw, 138);
          ctx.fillStyle = ACCENT;
          ctx.font = '700 46px ' + FONT;
          ctx.textBaseline = 'top';
          ctx.fillText(s.v, x + 20, y + 22);
          ctx.fillStyle = MUTED;
          ctx.font = '400 24px ' + FONT;
          ctx.fillText(s.l, x + 20, y + 88);
        }
      });
      y += 138 + 36;
    }

    // Описание результата
    ctx.font = '400 32px ' + FONT;
    var body = c.result ? wrap(ctx, c.result, inner, 7) : [];
    if (!body.length && !st.length) body = wrap(ctx, c.title, inner, 4);
    body.forEach(function (ln) {
      if (draw) { ctx.fillStyle = INK; ctx.font = '400 32px ' + FONT; ctx.textBaseline = 'top'; ctx.fillText(ln, PAD, y); }
      y += 46;
    });
    y += 24;

    // Подвал
    var foot = [];
    if (c.author) foot.push('Исполнитель: ' + c.author);
    if (host(c)) foot.push('Материал: ' + host(c));
    if (c.city) foot.push(c.city);
    if (foot.length) {
      if (draw) {
        ctx.fillStyle = '#d5dcdf';
        ctx.fillRect(PAD, y, inner, 2);
      }
      y += 22;
      foot.forEach(function (ln) {
        if (draw) { ctx.fillStyle = MUTED; ctx.font = '400 26px ' + FONT; ctx.textBaseline = 'top'; ctx.fillText(ln, PAD, y); }
        y += 36;
      });
    }
    return y + 36;
  }

  function canvasFor(c) {
    var cv = document.createElement('canvas');
    var ctx = context(cv);
    if (!ctx) return null;
    cv.width = W;
    cv.height = 800;
    var h = paint(ctx, c, false);
    cv.width = W;
    cv.height = Math.max(420, h);
    ctx = context(cv);
    paint(ctx, c, true);
    return cv;
  }

  // Ключ кэша зависит от содержимого, чтобы правка кейса обновляла картинку
  function key(c) {
    return [c.id, c.niche, c.title, c.result, c.spend, c.leads, c.author, c.city].join('|');
  }

  // Настоящий скрин из Директа: поле screen у кейса или запись из D.caseScreens по нише
  function screenOf(c) {
    if (c.screen) return String(c.screen);
    var list = (C.data && C.data.caseScreens) || [];
    var niche = String(c.niche || '').toLowerCase();
    for (var i = 0; i < list.length; i++) {
      var keys = list[i].keys || [];
      for (var j = 0; j < keys.length; j++) {
        if (keys[j] && niche.indexOf(String(keys[j]).toLowerCase()) >= 0) return list[i].file;
      }
    }
    return '';
  }

  function dataUrl(c) {
    var shot = screenOf(c);
    if (shot) return shot;
    var k = key(c);
    if (cache[k] !== undefined) return cache[k];
    var cv = canvasFor(c);
    var url = '';
    if (cv) {
      try { url = cv.toDataURL('image/png'); } catch (e) { url = ''; }
    }
    cache[k] = url;
    return url;
  }

  // Скрин в blob: сначала через fetch, при ошибке (открыто из файла) через canvas.
  // Буфер обмена принимает только PNG, поэтому JPEG перерисовывается в PNG.
  function shotBlob(url, cb) {
    function toPng(src, done, revoke) {
      var img = new window.Image();
      img.onload = function () {
        try {
          var cv = document.createElement('canvas');
          cv.width = img.naturalWidth;
          cv.height = img.naturalHeight;
          cv.getContext('2d').drawImage(img, 0, 0);
          cv.toBlob(function (b) { if (revoke) revoke(); done(b || null); }, 'image/png');
        } catch (e) { if (revoke) revoke(); done(null); }
      };
      img.onerror = function () { if (revoke) revoke(); done(null); };
      img.src = src;
    }
    function viaCanvas() { toPng(url, cb); }
    if (!window.fetch) { viaCanvas(); return; }
    window.fetch(url).then(function (r) { return r.ok ? r.blob() : Promise.reject(new Error('нет файла')); }).then(function (b) {
      if (b.type === 'image/png' || !window.URL || !window.URL.createObjectURL) { cb(b); return; }
      var obj = window.URL.createObjectURL(b);
      toPng(obj, function (png) { cb(png || b); }, function () { window.URL.revokeObjectURL(obj); });
    }, viaCanvas);
  }

  function blob(c, cb) {
    var shot = screenOf(c);
    if (shot) { shotBlob(shot, cb); return; }
    var cv = canvasFor(c);
    if (!cv || !cv.toBlob) { cb(null); return; }
    try {
      cv.toBlob(function (b) { cb(b || null); }, 'image/png');
    } catch (e) {
      cb(null);
    }
  }

  function fileName(c) {
    var shot = screenOf(c);
    if (shot) {
      var base = shot.split('/').pop().split('?')[0] || 'screen.png';
      return c.egokad ? c.id + '_' + base : base;
    }
    return 'keis-' + String(c.id || 'case').replace(/[^a-z0-9_-]/gi, '') + '.png';
  }

  // Тип файла для перетаскивания: у скрина по расширению, у нарисованной карточки PNG
  function mime(c) {
    var shot = screenOf(c);
    if (!shot) return 'image/png';
    var ext = (shot.split('?')[0].split('.').pop() || '').toLowerCase();
    return { jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/png';
  }

  C.caseimage = { screenOf: screenOf, dataUrl: dataUrl, blob: blob, fileName: fileName, mime: mime, stats: stats };
})((window.CRM = window.CRM || {}));
