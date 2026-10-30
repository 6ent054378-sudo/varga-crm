(function (C) {
  'use strict';

  var h = C.dom.h;
  var D = C.data;
  var store = C.store;
  var MM = C.mindmap;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var KIND_LABEL = { say: 'Говори', ask: 'Спроси', tip: 'Важно', dont: 'Не делай', note: 'Заметка' };
  var BRANCHES = 6;
  var PREFS_KEY = 'marketing_crm_map_prefs';
  var FREE_KEY = 'marketing_crm_map_full';
  var HELP = [
    ['Дальше / назад', 'пробел, Enter, стрелка вправо / стрелка влево'],
    ['Соседняя ветка', 'стрелки вверх и вниз'],
    ['Свернуть или развернуть ветку', 'Tab или клик по ветке'],
    ['Свернуть всё до этапов', 'Esc или C'],
    ['Развернуть всё', 'E'],
    ['Перейти к этапу', 'цифры 1-9'],
    ['Поиск по фразам', 'клавиша / или Ctrl+K'],
    ['Режим чтения: только крупная фраза', 'R'],
    ['Вместить в экран', 'F или двойной клик по пустому месту'],
    ['Вернуться к текущей фразе', '0 или кнопка «К фразе»'],
    ['Двигать карту', 'перетащить мышью или пальцем, колесо и тачпад, Shift + стрелки'],
    ['Масштаб вокруг курсора', 'Ctrl или Cmd + колесо, щипок двумя пальцами'],
    ['Масштаб', '+ и −'],
    ['Отметить фразу сказанной', 'двойной клик по фразе']
  ];

  var fullPrefs = loadPrefs({ mode: 'map', zoom: 1, focus: true, onlySay: false, font: 1, reader: false });
  var embPrefs = { mode: 'right', zoom: 0.9 };
  var keyHandler = null;

  function loadPrefs(defaults) {
    try {
      var saved = JSON.parse(window.localStorage.getItem(PREFS_KEY));
      if (saved && typeof saved === 'object') {
        Object.keys(defaults).forEach(function (k) { if (k !== 'zoom' && k !== 'reader' && saved[k] !== undefined) defaults[k] = saved[k]; });
      }
    } catch (e) { /* хранилище недоступно */ }
    return defaults;
  }

  function savePrefs() {
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: fullPrefs.mode, focus: fullPrefs.focus, onlySay: fullPrefs.onlySay, font: fullPrefs.font })); } catch (e) { /* хранилище недоступно */ }
  }

  function loadFree() {
    try { return JSON.parse(window.localStorage.getItem(FREE_KEY)) || {}; } catch (e) { return {}; }
  }

  function saveFree(said) {
    try { window.localStorage.setItem(FREE_KEY, JSON.stringify(said)); } catch (e) { /* хранилище недоступно */ }
  }

  function svgEl(name, attrs) {
    var el = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  function clampZoom(z) {
    return Math.max(0.4, Math.min(1.6, Math.round(z * 10) / 10));
  }

  function shortTitle(text) {
    var t = String(text).replace(/^\d+\.\s*/, '');
    return t.length > 26 ? t.slice(0, 25) + '…' : t;
  }

  // opts.embedded: компактная карта внутри карточки клиента (раскладка вправо, аккордеон веток)
  function render(leadId, stageArg, opts) {
    opts = opts || {};
    var emb = !!opts.embedded;
    var prefs = emb ? embPrefs : fullPrefs;
    var free = leadId === 'full';
    var lead = free ? { id: 'full', name: 'Скрипт', data: { _said_full: loadFree() } } : store.get(leadId);
    if (!lead) {
      return h('div', { class: 'view' },
        h('div', { class: 'empty' },
          h('h2', { text: 'Клиент не найден' }),
          h('a', { href: '#board', class: 'btn', text: 'К доске' })
        )
      );
    }

    var withScript = D.stages.filter(function (s) { return !!D.scripts[s.id]; });
    var stageId = free ? 'full' : (D.scripts[stageArg] ? stageArg : (D.scripts[lead.stage] ? lead.stage : 'qual'));
    var vars = free ? {} : C.views.script.vars(lead);
    var baseTree = MM.buildTree(stageId, vars);
    var tree = baseTree;
    var order = MM.leaves(tree);
    var saidKey = '_said_' + stageId;
    var said = {};
    var saved = lead.data[saidKey];
    if (saved && typeof saved === 'object') Object.keys(saved).forEach(function (k) { said[k] = true; });

    var collapsed = {};
    var focusIdx = -1;
    var selectedId = null;
    var tab = 'node';
    var lay = null;
    var helpOpen = false;

    var canvas = h('div', { class: 'mm-canvas' });
    var scaleEl = h('div', { class: 'mm-scale' });
    canvas.appendChild(scaleEl);
    // Свободный холст: положение карты (x, y в пикселях экрана) и масштаб prefs.zoom
    var view = { x: 0, y: 0 };
    var anim = null;
    var panel = h('aside', { class: 'mm-card mm-panel' });
    var phrase = h('div', { class: 'mm-phrase' });
    var zoomLabel = h('span', { class: 'mm-zoom-label' });
    var progress = h('span', { class: 'mm-progress' });
    var stagesBar = h('div', { class: 'mm-card mm-stages' });
    var searchBox = h('div', { class: 'mm-search-results' });
    var searchInput = h('input', { class: 'mm-search', type: 'search', placeholder: 'Найти фразу (/)' });
    var helpBox = h('div', { class: 'mm-card mm-help' });
    var root = h('div', { class: emb ? 'mm-view mm-embed' : 'mm-view' + (prefs.reader ? ' is-reader' : '') });

    function persist() {
      if (free) saveFree(said);
      else store.setData(lead.id, saidKey, said);
    }

    function doneCount() {
      return order.filter(function (n) { return said[n.id]; }).length;
    }

    function rebuildTree() {
      tree = !emb && prefs.onlySay ? (MM.prune(baseTree, function (n) { return n.k === 'say' || n.k === 'ask'; }) || baseTree) : baseTree;
      order = MM.leaves(tree);
    }

    // ---------- Рисование карты ----------
    function drawMap() {
      lay = MM.layout(tree, { collapsed: collapsed, mode: prefs.mode });
      C.dom.clear(scaleEl);
      scaleEl.style.width = lay.width + 'px';
      scaleEl.style.height = lay.height + 'px';
      applyView();

      var svg = svgEl('svg', { class: 'mm-links', width: lay.width, height: lay.height, viewBox: '0 0 ' + lay.width + ' ' + lay.height });
      lay.links.forEach(function (l) {
        var dx = (l.x2 - l.x1) / 2;
        var d = 'M' + l.x1 + ' ' + l.y1 + ' C' + (l.x1 + dx) + ' ' + l.y1 + ', ' + (l.x2 - dx) + ' ' + l.y2 + ', ' + l.x2 + ' ' + l.y2;
        svg.appendChild(svgEl('path', {
          d: d, fill: 'none', class: 'mm-link mm-b' + (l.branch % BRANCHES),
          'stroke-width': l.depth === 1 ? 4 : l.depth === 2 ? 2.6 : 1.8
        }));
      });
      scaleEl.appendChild(svg);

      var focusId = focusIdx >= 0 && order[focusIdx] ? order[focusIdx].id : null;
      lay.nodes.forEach(function (n) {
        var node = n.node;
        var cls = 'mm-node mm-d' + Math.min(n.depth, 2) + (n.branch >= 0 ? ' mm-b' + (n.branch % BRANCHES) : '');
        if (node.k) cls += ' mm-k-' + node.k;
        if (node.c && n.depth > 0) cls += ' mm-branch';
        if (said[node.id]) cls += ' is-said';
        if (selectedId === node.id) cls += ' is-selected';
        if (focusId === node.id) cls += ' is-focus';
        var el = h('div', {
          class: cls, 'data-id': node.id,
          style: 'left:' + n.x + 'px;top:' + n.y + 'px;width:' + n.w + 'px;min-height:' + n.h + 'px'
        },
          node.k ? h('span', { class: 'mm-tag mm-tag-' + node.k, text: KIND_LABEL[node.k] || '' }) : null,
          h('span', { class: 'mm-text', text: node.t })
        );
        el.addEventListener('click', function () { onNodeClick(node, n); });
        el.addEventListener('dblclick', function () { if (!node.c) toggleSaid(node.id); });
        if (node.c && n.depth > 0) {
          var dot = h('button', {
            type: 'button', class: 'mm-toggle ' + (n.side > 0 ? 'mm-toggle-r' : 'mm-toggle-l'),
            title: n.collapsed ? 'Развернуть' : 'Свернуть'
          }, n.collapsed ? String(countLeaves(node)) : '−');
          dot.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleBranch(node.id);
          });
          el.appendChild(dot);
        }
        scaleEl.appendChild(el);
      });
    }

    function onNodeClick(node, n) {
      if (emb && node.c) { select(MM.leaves(node)[0].id); return; }
      if (node.c && n.depth > 0) {
        // Клик по ветке: первый раскрывает и выделяет, повторный на открытой ветке сворачивает
        if (collapsed[node.id] || selectedId !== node.id) select(node.id);
        else toggleBranch(node.id);
        return;
      }
      select(node.id);
    }

    function toggleBranch(id) {
      if (collapsed[id]) {
        delete collapsed[id];
        if (emb || prefs.focus) collapseSiblings(id);
      } else {
        collapsed[id] = true;
      }
      draw();
    }

    function countLeaves(node) {
      return MM.leaves(node).length;
    }

    // Аккордеон: раскрыта только цепочка к выбранному узлу, соседние ветки свёрнуты
    function collapseSiblings(id) {
      var trail = MM.pathTo(tree, id).map(function (n) { return n.id; });
      MM.pathTo(tree, id).forEach(function (n) {
        (n.c || []).forEach(function (k) {
          if (k.c && trail.indexOf(k.id) < 0) collapsed[k.id] = true;
        });
      });
    }

    // Всё свёрнуто до верхнего уровня: видны только этапы
    function collapseAll() {
      collapsed = {};
      (function walk(n, depth) {
        (n.c || []).forEach(function (k) {
          if (k.c) { collapsed[k.id] = true; walk(k, depth + 1); }
        });
      })(tree, 0);
    }

    // ---------- Верхний уровень: этапы со счётчиками ----------
    function branchProgress(node) {
      var ls = MM.leaves(node);
      var done = ls.filter(function (l) { return said[l.id]; }).length;
      return { done: done, total: ls.length };
    }

    function drawStages() {
      C.dom.clear(stagesBar);
      var trail = selectedId ? MM.pathTo(tree, selectedId).map(function (n) { return n.id; }) : [];
      (tree.c || []).forEach(function (k, i) {
        var pr = branchProgress(k);
        var active = trail.indexOf(k.id) >= 0;
        var chip = h('button', {
          type: 'button', title: k.t,
          class: 'mm-chip mm-b' + (i % BRANCHES) + (active ? ' is-active' : '') + (pr.total && pr.done === pr.total ? ' is-done' : '')
        },
          h('span', { class: 'mm-chip-n', text: String(i + 1) }),
          h('span', { class: 'mm-chip-t', text: shortTitle(k.t) }),
          h('span', { class: 'mm-chip-p', text: pr.done + '/' + pr.total })
        );
        chip.addEventListener('click', function () { chip.blur(); jumpToBranch(i); });
        stagesBar.appendChild(chip);
      });
    }

    function jumpToBranch(i) {
      var k = tree.c && tree.c[i];
      if (!k) return;
      var leaves = MM.leaves(k);
      var target = leaves.filter(function (l) { return !said[l.id]; })[0] || leaves[0];
      select(target.id);
    }

    // ---------- Поиск ----------
    function drawSearch() {
      C.dom.clear(searchBox);
      var found = MM.search(tree, searchInput.value, 8);
      searchBox.classList.toggle('is-open', found.length > 0);
      found.forEach(function (f) {
        var item = h('button', { type: 'button', class: 'mm-result' },
          h('span', { class: 'mm-result-path', text: f.path.slice(0, -1).join('  /  ') }),
          h('span', { class: 'mm-result-text', text: f.node.t.length > 110 ? f.node.t.slice(0, 109) + '…' : f.node.t })
        );
        item.addEventListener('click', function () {
          searchInput.value = '';
          drawSearch();
          select(f.node.id);
        });
        searchBox.appendChild(item);
      });
    }

    // Крупная текущая фраза над встроенной картой
    function drawPhrase() {
      C.dom.clear(phrase);
      var node = selectedId ? MM.find(tree, selectedId) : null;
      if (!node) return;
      var path = MM.pathTo(tree, node.id).slice(1, -1).map(function (n) { return n.t; });
      if (path.length) phrase.appendChild(h('div', { class: 'mm-crumbs', text: path.join('  /  ') }));
      if (node.k) phrase.appendChild(h('span', { class: 'mm-tag mm-tag-' + node.k, text: KIND_LABEL[node.k] }));
      phrase.appendChild(h('p', { class: 'mm-phrase-text', text: node.t }));
      var row = h('div', { class: 'mm-phrase-nav' },
        h('button', { type: 'button', class: 'btn', onClick: back }, 'Назад'),
        h('button', { type: 'button', class: 'btn btn-primary', onClick: next }, 'Дальше'),
        h('button', { type: 'button', class: 'btn btn-small', onClick: function () { toggleSaid(node.id); } }, said[node.id] ? 'Вернуть в работу' : 'Отметить сказанным')
      );
      phrase.appendChild(row);
    }

    // ---------- Панель справа ----------
    function drawPanel() {
      C.dom.clear(panel);
      var tabs = h('div', { class: 'mm-tabs' },
        h('button', { type: 'button', class: 'mm-tab' + (tab === 'node' ? ' is-active' : ''), onClick: function () { tab = 'node'; drawPanel(); } }, 'Фраза'),
        h('button', { type: 'button', class: 'mm-tab' + (tab === 'map' ? ' is-active' : ''), onClick: function () { tab = 'map'; drawPanel(); } }, 'Настройки')
      );
      panel.appendChild(tabs);
      if (tab === 'map') panel.appendChild(mapTab()); else panel.appendChild(nodeTab());
    }

    function nodeTab() {
      var box = h('div', { class: 'mm-panel-body' });
      var node = selectedId ? MM.find(tree, selectedId) : null;
      if (!node) {
        box.appendChild(h('p', { class: 'muted', text: 'Нажми на этап сверху или на узел карты. Здесь появится крупный текст, который можно читать вслух.' }));
        return box;
      }
      var path = MM.pathTo(tree, node.id).slice(1, -1).map(function (n) { return n.t; });
      if (path.length) box.appendChild(h('div', { class: 'mm-crumbs', text: path.join('  /  ') }));
      if (node.k) box.appendChild(h('span', { class: 'mm-tag mm-tag-' + node.k, text: KIND_LABEL[node.k] }));
      box.appendChild(h('p', { class: 'mm-big', style: 'font-size:' + Math.round(19 * prefs.font) + 'px', text: node.t }));
      if (node.c) {
        box.appendChild(h('ul', { class: 'mm-kids' }, node.c.map(function (k) {
          return h('li', null, h('a', { href: '#', onClick: function (e) { e.preventDefault(); select(k.id); } }, k.t));
        })));
      } else {
        box.appendChild(h('button', {
          type: 'button', class: 'btn mm-btn-block', onClick: function () { toggleSaid(node.id); }
        }, said[node.id] ? 'Вернуть в работу' : 'Отметить сказанным'));
        var following = focusIdx >= 0 ? order[focusIdx + 1] : null;
        if (following && order[focusIdx] && order[focusIdx].id === node.id) {
          box.appendChild(h('div', { class: 'mm-next' },
            h('div', { class: 'mm-label', text: 'Следом' }),
            h('p', { class: 'mm-next-text', text: following.t.length > 220 ? following.t.slice(0, 219) + '…' : following.t })
          ));
        }
      }
      return box;
    }

    function toggleRow(label, hint, value, onChange) {
      var box = h('input', { type: 'checkbox', checked: !!value });
      box.addEventListener('change', function () { onChange(box.checked); });
      return h('label', { class: 'mm-switch' }, box, h('span', null, h('strong', { text: label }), h('small', { text: hint })));
    }

    function mapTab() {
      function seg(label, mode) {
        return h('button', {
          type: 'button', class: 'mm-seg' + (prefs.mode === mode ? ' is-active' : ''),
          onClick: function () { prefs.mode = mode; savePrefs(); draw(); drawPanel(); }
        }, label);
      }
      return h('div', { class: 'mm-panel-body' },
        toggleRow('Одна ветка', 'при открытии ветки остальные сворачиваются', prefs.focus, function (v) {
          prefs.focus = v;
          savePrefs();
          if (v && selectedId) { collapseSiblings(selectedId); draw(); }
        }),
        toggleRow('Только что говорить', 'скрыть правила и заметки, оставить фразы и вопросы', prefs.onlySay, function (v) {
          prefs.onlySay = v;
          savePrefs();
          rebuildTree();
          collapseAll();
          var keep = selectedId && MM.find(tree, selectedId) ? selectedId : (order[0] && order[0].id);
          selectedId = null;
          if (keep) select(keep); else draw();
          drawPanel();
        }),
        h('div', { class: 'mm-label', text: 'Размер текста во вкладке «Фраза»' }),
        h('div', { class: 'mm-segs' },
          h('button', { type: 'button', class: 'mm-seg', onClick: function () { prefs.font = Math.max(0.8, Math.round((prefs.font - 0.2) * 10) / 10); savePrefs(); drawPanel(); } }, 'А−'),
          h('button', { type: 'button', class: 'mm-seg', onClick: function () { prefs.font = Math.min(2, Math.round((prefs.font + 0.2) * 10) / 10); savePrefs(); drawPanel(); } }, 'А+')
        ),
        h('div', { class: 'mm-label', text: 'Раскладка' }),
        h('div', { class: 'mm-segs' }, seg('Карта', 'map'), seg('Вправо', 'right')),
        h('div', { class: 'mm-label', text: 'Ветки' }),
        h('div', { class: 'mm-segs' },
          h('button', { type: 'button', class: 'mm-seg', onClick: expandAll }, 'Развернуть всё'),
          h('button', { type: 'button', class: 'mm-seg', onClick: foldAll }, 'Свернуть до этапов')
        ),
        h('div', { class: 'mm-label', text: 'Отметки' }),
        h('button', {
          type: 'button', class: 'btn mm-btn-block',
          onClick: function () { said = {}; persist(); focusIdx = 0; select(order[0].id); }
        }, 'Сбросить сказанное')
      );
    }

    function expandAll() { collapsed = {}; draw(); }

    function foldAll() { collapseAll(); draw(); }

    function drawHelp() {
      C.dom.clear(helpBox);
      helpBox.style.display = helpOpen ? 'block' : 'none';
      if (!helpOpen) return;
      helpBox.appendChild(h('div', { class: 'mm-label', text: 'Клавиши' }));
      HELP.forEach(function (row) {
        helpBox.appendChild(h('div', { class: 'mm-help-row' }, h('strong', { text: row[0] }), h('span', { text: row[1] })));
      });
    }

    // ---------- Действия ----------
    function draw() {
      // Карта пересчитывается от левого верхнего угла: удерживаем выбранный узел на том же месте экрана
      var before = lay && selectedId ? lay.nodes.filter(function (x) { return x.id === selectedId; })[0] : null;
      drawMap();
      if (before) {
        var after = lay.nodes.filter(function (x) { return x.id === selectedId; })[0];
        if (after) {
          view.x += (before.x - after.x) * prefs.zoom;
          view.y += (before.y - after.y) * prefs.zoom;
          applyView();
        }
      }
      if (emb) drawPhrase();
      else { drawPanel(); drawStages(); }
      progress.textContent = 'Сказано ' + doneCount() + ' из ' + order.length;
    }

    // ---------- Свободное перемещение ----------
    function visibleSize() {
      var w = canvas.clientWidth;
      var panelW = emb || prefs.reader ? 0 : 340;
      return { w: Math.max(120, w - panelW), h: canvas.clientHeight };
    }

    function clampView() {
      if (!lay) return;
      var vis = { w: canvas.clientWidth, h: canvas.clientHeight };
      if (!vis.w || !vis.h) return;
      var k = prefs.zoom;
      var keep = 140;  // сколько пикселей карты всегда остаётся на экране
      view.x = Math.min(vis.w - keep, Math.max(keep - lay.width * k, view.x));
      view.y = Math.min(vis.h - keep, Math.max(keep - lay.height * k, view.y));
    }

    function applyView() {
      scaleEl.style.transform = 'translate(' + Math.round(view.x) + 'px,' + Math.round(view.y) + 'px) scale(' + prefs.zoom + ')';
      zoomLabel.textContent = Math.round(prefs.zoom * 100) + '%';
    }

    function stopAnim() {
      if (anim && window.cancelAnimationFrame) window.cancelAnimationFrame(anim);
      anim = null;
    }

    function moveTo(x, y, smooth) {
      stopAnim();
      var from = { x: view.x, y: view.y };
      if (!smooth || !window.requestAnimationFrame) {
        view.x = x; view.y = y; clampView(); applyView();
        return;
      }
      var begun = null;
      function step(ts) {
        if (begun === null) begun = ts;
        var t = Math.min(1, (ts - begun) / 260);
        var e = 1 - Math.pow(1 - t, 3);
        view.x = from.x + (x - from.x) * e;
        view.y = from.y + (y - from.y) * e;
        applyView();
        anim = t < 1 ? window.requestAnimationFrame(step) : null;
        if (t >= 1) clampView();
      }
      anim = window.requestAnimationFrame(step);
    }

    // Центрируем узел в видимой части холста
    function scrollTo(id, instant) {
      if (!lay) return;
      var n = lay.nodes.filter(function (x) { return x.id === id; })[0];
      if (!n) return;
      var vis = visibleSize();
      moveTo(vis.w / 2 - (n.x + n.w / 2) * prefs.zoom, vis.h / 2 - (n.y + n.h / 2) * prefs.zoom, !instant);
    }

    // Масштаб вокруг точки экрана (по умолчанию центр видимой части)
    function zoomAt(z, cx, cy) {
      var vis = visibleSize();
      if (cx === undefined) { cx = vis.w / 2; cy = vis.h / 2; }
      var nz = clampZoom(z);
      var ratio = nz / prefs.zoom;
      view.x = cx - (cx - view.x) * ratio;
      view.y = cy - (cy - view.y) * ratio;
      prefs.zoom = nz;
      clampView();
      applyView();
    }

    function select(id, noScroll) {
      selectedId = id;
      order.forEach(function (n, i) { if (n.id === id) focusIdx = i; });
      MM.pathTo(tree, id).forEach(function (n) { delete collapsed[n.id]; });
      if (emb || prefs.focus) collapseSiblings(id);
      tab = 'node';
      draw();
      if (!noScroll) scrollTo(id);
    }

    function toggleSaid(id) {
      if (said[id]) delete said[id]; else said[id] = true;
      persist();
      draw();
    }

    function next() {
      if (focusIdx >= 0) said[order[focusIdx].id] = true;
      var i = Math.min(order.length - 1, focusIdx + 1);
      persist();
      select(order[i].id);
    }

    function back() {
      var i = Math.max(0, focusIdx - 1);
      if (focusIdx > 0) delete said[order[i].id];
      persist();
      select(order[i].id);
    }

    // Соседний узел того же уровня: вверх и вниз по стрелкам
    function sibling(dir) {
      if (!selectedId) { select(order[0].id); return; }
      var trail = MM.pathTo(tree, selectedId);
      var parent = trail[trail.length - 2];
      if (!parent) return;
      var idx = -1;
      parent.c.forEach(function (k, i) { if (k.id === selectedId) idx = i; });
      var target = parent.c[idx + dir];
      if (target) select(target.id);
    }

    function setZoom(z) { zoomAt(z); }

    // Вместить всю видимую карту в экран и выровнять по центру
    function fit() {
      lay = MM.layout(tree, { collapsed: collapsed, mode: prefs.mode });
      var vis = visibleSize();
      var top = emb ? 0 : 120;
      var k = vis.w <= 0 || vis.h <= 0 ? 1 : Math.max(0.4, Math.min(vis.w / lay.width, (vis.h - top) / lay.height, 1));
      prefs.zoom = clampZoom(k);
      view.x = (vis.w - lay.width * prefs.zoom) / 2;
      view.y = top + (vis.h - top - lay.height * prefs.zoom) / 2;
      draw();
    }

    function setReader(on) {
      prefs.reader = on;
      savePrefs();
      root.classList.toggle('is-reader', on);
      tab = 'node';
      if (!on && selectedId) setTimeout(function () { scrollTo(selectedId, true); }, 0);
      drawPanel();
      drawReaderButton();
    }

    var readerBtn = h('button', { type: 'button', class: 'mm-icon', title: 'Только крупная фраза, без карты (R)' });
    readerBtn.addEventListener('click', function () { setReader(!prefs.reader); });
    function drawReaderButton() {
      readerBtn.textContent = prefs.reader ? 'Показать карту' : 'Режим чтения';
    }

    // ---------- Сборка экрана ----------
    var stageTitle = free ? 'Полный скрипт продаж' : D.scripts[stageId].title;
    var stageSelect = h('select', { class: 'mm-select', value: stageId },
      withScript.map(function (s) { return h('option', { value: s.id }, s.title); }));
    stageSelect.addEventListener('change', function () {
      window.location.hash = '#map/' + lead.id + '/' + stageSelect.value;
    });

    if (emb) {
      root.appendChild(h('div', { class: 'mm-embed-head' },
        h('div', { class: 'mm-embed-title' },
          h('div', { class: 'eyebrow', text: 'Скрипт этапа' }),
          h('strong', { text: stageTitle })
        ),
        h('div', { class: 'mm-embed-tools' },
          progress,
          h('button', { type: 'button', class: 'mm-icon', title: 'Уменьшить', onClick: function () { setZoom(prefs.zoom - 0.1); } }, '−'),
          zoomLabel,
          h('button', { type: 'button', class: 'mm-icon', title: 'Увеличить', onClick: function () { setZoom(prefs.zoom + 0.1); } }, '+'),
          h('button', { type: 'button', class: 'mm-icon', title: 'Вместить в панель', onClick: fit }, 'Вместить'),
          h('button', {
            type: 'button', class: 'mm-icon', title: 'Развернуть все ветки',
            onClick: function () { collapsed = {}; draw(); }
          }, 'Все ветки'),
          h('a', { class: 'mm-icon mm-link-btn', href: '#map/' + lead.id + '/' + stageId, title: 'Карта на весь экран' }, 'На весь экран'),
          opts.onSwitch ? h('button', { type: 'button', class: 'mm-icon', title: 'Скрипт по шагам', onClick: opts.onSwitch }, 'Шаги') : null
        )
      ));
      root.appendChild(phrase);
      root.appendChild(canvas);
    } else {
      searchInput.addEventListener('input', drawSearch);
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { searchInput.value = ''; drawSearch(); searchInput.blur(); }
        if (e.key === 'Enter') {
          var first = MM.search(tree, searchInput.value, 1)[0];
          if (first) { searchInput.value = ''; drawSearch(); select(first.node.id); searchInput.blur(); }
        }
      });
      drawReaderButton();
      root.appendChild(canvas);
      root.appendChild(h('div', { class: 'mm-card mm-top' },
        free
          ? h('a', { class: 'mm-back', href: '#sales/full', title: 'К тексту скрипта' }, '← Эфир №3')
          : h('a', { class: 'mm-back', href: '#lead/' + lead.id, title: 'К карточке клиента' }, '← ' + (lead.name || 'Клиент')),
        h('span', { class: 'mm-title', text: stageTitle }),
        h('div', { class: 'mm-search-wrap' }, searchInput, searchBox),
        readerBtn,
        h('button', { type: 'button', class: 'mm-icon', title: 'Свернуть всё до этапов (Esc)', onClick: foldAll }, 'Свернуть всё'),
        h('button', { type: 'button', class: 'mm-icon', title: 'Подсказка по клавишам', onClick: function () { helpOpen = !helpOpen; drawHelp(); } }, '?')
      ));
      root.appendChild(stagesBar);
      root.appendChild(helpBox);
      root.appendChild(h('div', { class: 'mm-card mm-top-right' }, progress));
      root.appendChild(panel);
      root.appendChild(h('div', { class: 'mm-card mm-zoom' },
        free ? null : stageSelect,
        h('button', { type: 'button', class: 'mm-icon', title: 'Уменьшить', onClick: function () { setZoom(prefs.zoom - 0.1); } }, '−'),
        zoomLabel,
        h('button', { type: 'button', class: 'mm-icon', title: 'Увеличить', onClick: function () { setZoom(prefs.zoom + 0.1); } }, '+'),
        h('button', { type: 'button', class: 'mm-icon mm-fit', title: 'Вместить в экран (F)', onClick: fit }, 'Вместить'),
        h('button', { type: 'button', class: 'mm-icon', title: 'Вернуться к текущей фразе (0)', onClick: function () { if (selectedId) scrollTo(selectedId); } }, 'К фразе')
      ));
      root.appendChild(h('div', { class: 'mm-card mm-steps' },
        h('button', { type: 'button', class: 'btn', onClick: back }, 'Назад'),
        h('button', { type: 'button', class: 'btn btn-primary', onClick: next }, 'Дальше')
      ));
      drawHelp();
    }

    // Перетаскивание карты: мышью и пальцем, щипок двумя пальцами для масштаба, колесо для прокрутки
    var pointers = {};
    var gesture = null;
    var suppressClick = false;

    function pointerId(e) { return e.pointerId === undefined ? 'mouse' : e.pointerId; }

    function startGesture() {
      var ids = Object.keys(pointers);
      if (ids.length === 1) {
        var p = pointers[ids[0]];
        gesture = { type: 'pan', sx: p.x, sy: p.y, vx: view.x, vy: view.y, moved: false };
      } else if (ids.length >= 2) {
        var a = pointers[ids[0]];
        var b = pointers[ids[1]];
        var rect = canvas.getBoundingClientRect();
        gesture = {
          type: 'pinch', dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: prefs.zoom,
          cx: (a.x + b.x) / 2 - rect.left, cy: (a.y + b.y) / 2 - rect.top, vx: view.x, vy: view.y, moved: true
        };
      } else {
        gesture = null;
      }
    }

    canvas.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0 && e.pointerType !== 'touch') return;
      if (e.target.closest && e.target.closest('.mm-toggle')) return;
      stopAnim();
      suppressClick = false;
      pointers[pointerId(e)] = { x: e.clientX, y: e.clientY };
      startGesture();
    });
    function onMove(e) {
      if (!document.body.contains(root)) {
        removeGlobal();
        return;
      }
      var id = pointerId(e);
      if (!pointers[id] || !gesture) return;
      pointers[id] = { x: e.clientX, y: e.clientY };
      if (gesture.type === 'pan') {
        var dx = e.clientX - gesture.sx;
        var dy = e.clientY - gesture.sy;
        if (!gesture.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
        gesture.moved = true;
        canvas.classList.add('is-drag');
        view.x = gesture.vx + dx;
        view.y = gesture.vy + dy;
        clampView();
        applyView();
      } else {
        var ids = Object.keys(pointers);
        if (ids.length < 2) return;
        var a = pointers[ids[0]];
        var b = pointers[ids[1]];
        var d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        var nz = clampZoom(gesture.zoom * d / gesture.dist);
        var ratio = nz / gesture.zoom;
        var rect = canvas.getBoundingClientRect();
        var mx = (a.x + b.x) / 2 - rect.left;
        var my = (a.y + b.y) / 2 - rect.top;
        view.x = mx - (gesture.cx - gesture.vx) * ratio;
        view.y = my - (gesture.cy - gesture.vy) * ratio;
        prefs.zoom = nz;
        clampView();
        applyView();
      }
    }

    function onUp(e) {
      var id = pointerId(e);
      if (!pointers[id]) return;
      var moved = gesture && gesture.moved;
      delete pointers[id];
      canvas.classList.remove('is-drag');
      if (moved) {
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 0);
      }
      startGesture();
    }

    function removeGlobal() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    }

    // Клик после перетаскивания не должен открывать узел
    canvas.addEventListener('click', function (e) {
      if (suppressClick) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    // Колесо и тачпад: прокрутка карты; с Ctrl или Cmd (щипок на тачпаде): масштаб вокруг курсора
    canvas.addEventListener('wheel', function (e) {
      // В карточке клиента обычная прокрутка листает страницу, масштаб только с Ctrl или Cmd
      if (emb && !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      stopAnim();
      var rect = canvas.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(prefs.zoom * Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top);
      } else {
        view.x -= e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        view.y -= e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        clampView();
        applyView();
      }
    }, { passive: false });

    // Двойной клик по пустому месту: вместить всё
    canvas.addEventListener('dblclick', function (e) {
      if (e.target.closest && e.target.closest('.mm-node')) return;
      fit();
    });

    // Клавиши
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = function (e) {
      if (!document.body.contains(root)) {
        document.removeEventListener('keydown', keyHandler);
        keyHandler = null;
        return;
      }
      var tag = e.target && e.target.tagName;
      var typing = ['INPUT', 'TEXTAREA', 'SELECT'].indexOf(tag) >= 0;
      if (!emb && ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')))) {
        e.preventDefault();
        searchInput.focus();
        return;
      }
      var key = e.key;
      if (!emb && e.shiftKey && /^Arrow/.test(key)) {
        e.preventDefault();
        stopAnim();
        view.x += key === 'ArrowLeft' ? 120 : key === 'ArrowRight' ? -120 : 0;
        view.y += key === 'ArrowUp' ? 120 : key === 'ArrowDown' ? -120 : 0;
        clampView();
        applyView();
        return;
      }
      if (typing || (['BUTTON', 'A'].indexOf(tag) >= 0 && (key === ' ' || key === 'Enter'))) return;
      if (key === 'ArrowRight' || (!emb && (key === ' ' || key === 'Enter'))) { e.preventDefault(); next(); }
      else if (key === 'ArrowLeft') { e.preventDefault(); back(); }
      else if (key === '+' || key === '=') setZoom(prefs.zoom + 0.1);
      else if (key === '-') setZoom(prefs.zoom - 0.1);
      else if (emb) return;
      else if (key === 'ArrowDown') { e.preventDefault(); sibling(1); }
      else if (key === 'ArrowUp') { e.preventDefault(); sibling(-1); }
      else if (key === 'Tab') { e.preventDefault(); if (selectedId) { var sel = MM.find(tree, selectedId); if (sel && sel.c) toggleBranch(selectedId); } }
      else if (key === 'Escape' || key === 'c' || key === 'C' || key === 'с' || key === 'С') { foldAll(); }
      else if (key === 'e' || key === 'E' || key === 'у' || key === 'У') { expandAll(); }
      else if (key === 'r' || key === 'R' || key === 'к' || key === 'К') { setReader(!prefs.reader); }
      else if (key === 'f' || key === 'F' || key === 'а' || key === 'А') { fit(); }
      else if (key === '?') { helpOpen = !helpOpen; drawHelp(); }
      else if (key === '0') { if (selectedId) scrollTo(selectedId); }
      else if (/^[1-9]$/.test(key)) { jumpToBranch(Number(key) - 1); }
    };
    document.addEventListener('keydown', keyHandler);

    // Старт: первая ещё не сказанная фраза. В полноэкранной карте всё свёрнуто, раскрыта только её ветка
    var start = 0;
    for (var i = 0; i < order.length; i++) {
      if (!said[order[i].id]) { start = i; break; }
    }
    focusIdx = start;
    selectedId = order[start].id;
    if (!emb) collapseAll();
    MM.pathTo(tree, selectedId).forEach(function (n) { delete collapsed[n.id]; });
    if (emb) collapseSiblings(selectedId);
    draw();
    setTimeout(function () { scrollTo(selectedId, true); }, 0);

    return root;
  }

  C.views = C.views || {};
  C.views.map = { render: render };
})((window.CRM = window.CRM || {}));
