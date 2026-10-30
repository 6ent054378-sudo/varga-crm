(function (C) {
  'use strict';

  var D = C.data;
  var U = C.utils;

  var WIDTH = [230, 200, 270];
  var FONT = [17, 15, 14];
  var HGAP = 72;
  var VGAP = 14;
  var PAD = 70;

  // ---------- Построение дерева ----------
  function leafKind(text) {
    return /\?\s*$/.test(text) ? 'ask' : 'say';
  }

  function fromMind(n, vars) {
    var node = { t: U.fill(n.t, vars) };
    if (n.c && n.c.length) node.c = n.c.map(function (k) { return fromMind(k, vars); });
    else node.k = n.k || leafKind(n.t);
    return node;
  }

  function fromSection(sec, i, vars) {
    return {
      t: sec.title || 'Шаг ' + (i + 1),
      c: sec.items.map(function (it) { return { t: U.fill(it.t, vars), k: it.k }; })
    };
  }

  function assignIds(node, id) {
    node.id = id;
    (node.c || []).forEach(function (k, i) { assignIds(k, id + '.' + i); });
    return node;
  }

  // Дерево для этапа: для квалификации оригинальная карта из xmind, для остальных этапов блоки скрипта
  // Полная карта продажи: этапы, блоки и фразы из D.fullScript
  function fullTree(vars) {
    var kinds = { say: 'say', ask: 'ask', tip: 'tip', dont: 'tip', note: 'tip' };
    var root = {
      t: 'Полный скрипт продаж',
      c: D.fullScript.map(function (st, i) {
        return {
          t: (i + 1) + '. ' + st.title,
          c: [{ t: 'Цель: ' + st.goal, k: 'tip' }].concat(st.parts.map(function (part) {
            return {
              t: part.title,
              c: part.items.map(function (it) {
                var prefix = it.k === 'dont' ? 'Не делай: ' : '';
                return { t: prefix + U.fill(it.t, vars), k: kinds[it.k] || 'tip' };
              })
            };
          }))
        };
      })
    };
    return assignIds(root, 'r');
  }

  function buildTree(stageId, vars) {
    if (stageId === 'full') return fullTree(vars || {});
    var script = D.scripts[stageId];
    if (!script) return null;
    var mm = D.mindmaps && D.mindmaps[stageId];
    var root;
    if (mm) {
      root = fromMind(mm.tree, vars);
      var extra = (mm.extraSections || []).map(function (title) {
        var idx = -1;
        script.sections.forEach(function (s, i) { if (s.title === title) idx = i; });
        return idx < 0 ? null : fromSection(script.sections[idx], idx, vars);
      }).filter(Boolean);
      (mm.extraTrees || []).forEach(function (t) { root.c.push(fromMind(t, vars)); });
      if (extra.length) root.c.push({ t: mm.extraTitle || 'Дополнительно', c: extra });
    } else {
      root = {
        t: script.title,
        c: script.sections.map(function (s, i) { return fromSection(s, i, vars); })
      };
    }
    root.t = script.title;
    return assignIds(root, 'r');
  }

  // Листья в порядке чтения скрипта
  function leaves(root) {
    var list = [];
    (function walk(n) {
      if (!n.c) { list.push(n); return; }
      n.c.forEach(walk);
    })(root);
    return list;
  }

  function find(root, id) {
    var found = null;
    (function walk(n) {
      if (found) return;
      if (n.id === id) { found = n; return; }
      (n.c || []).forEach(walk);
    })(root);
    return found;
  }

  // Копия дерева только с теми листьями, для которых pred(лист) истина. Идентификаторы сохраняются.
  function prune(node, pred) {
    if (!node.c) return pred(node) ? node : null;
    var kids = node.c.map(function (k) { return prune(k, pred); }).filter(Boolean);
    if (!kids.length) return null;
    var copy = {};
    Object.keys(node).forEach(function (key) { copy[key] = node[key]; });
    copy.c = kids;
    return copy;
  }

  // Поиск узлов по тексту (без учёта регистра): список {node, path}
  function search(root, query, limit) {
    var q = String(query || '').toLowerCase().trim();
    var out = [];
    if (q.length < 2) return out;
    (function walk(n, trail) {
      if (out.length >= (limit || 8)) return;
      if (trail.length && n.t.toLowerCase().indexOf(q) >= 0) out.push({ node: n, path: trail.slice(1).map(function (x) { return x.t; }) });
      (n.c || []).forEach(function (k) { walk(k, trail.concat([n])); });
    })(root, []);
    return out;
  }

  // Цепочка узлов от корня до узла (включительно)
  function pathTo(root, id) {
    var out = [];
    (function walk(n, trail) {
      if (n.id === id) { out = trail.concat([n]); return; }
      (n.c || []).forEach(function (k) { walk(k, trail.concat([n])); });
    })(root, []);
    return out;
  }

  // ---------- Размеры ----------
  function box(node, depth) {
    var d = Math.min(depth, 2);
    var w = WIDTH[d];
    var font = FONT[d];
    var perLine = Math.max(8, Math.floor((w - 26) / (font * 0.52)));
    var lines = Math.max(1, Math.ceil(node.t.length / perLine));
    var h = Math.round(lines * font * 1.4) + 16 + (node.k ? 18 : 0);
    return { w: w, h: h };
  }

  function visibleKids(node, collapsed) {
    return node.c && !collapsed[node.id] ? node.c : [];
  }

  function measure(node, depth, collapsed) {
    var b = box(node, depth);
    var kids = visibleKids(node, collapsed).map(function (k) { return measure(k, depth + 1, collapsed); });
    var total = kids.reduce(function (s, k) { return s + k.H; }, 0) + Math.max(0, kids.length - 1) * VGAP;
    return { node: node, w: b.w, h: b.h, kids: kids, total: total, H: Math.max(b.h, total) };
  }

  // mode: 'map' (по часовой стрелке, как в xmind) или 'right' (всё вправо)
  function layout(root, opts) {
    opts = opts || {};
    var collapsed = opts.collapsed || {};
    var mode = opts.mode === 'right' ? 'right' : 'map';
    var nodes = [];
    var links = [];
    var rootBox = box(root, 0);
    var rootNode = { id: root.id, node: root, depth: 0, side: 0, x: -rootBox.w / 2, y: -rootBox.h / 2, w: rootBox.w, h: rootBox.h, branch: -1 };
    nodes.push(rootNode);

    var kids = root.c && !collapsed[root.id] ? root.c : [];
    var split = mode === 'right' ? kids.length : Math.ceil(kids.length / 2);
    var groups = [
      { side: 1, items: kids.slice(0, split), offset: 0 },
      { side: -1, items: kids.slice(split), offset: split }
    ];

    function place(m, depth, side, edgeX, top, parent, branch) {
      var y = top + (m.H - m.h) / 2;
      var x = side > 0 ? edgeX : edgeX - m.w;
      var rec = { id: m.node.id, node: m.node, depth: depth, side: side, x: x, y: y, w: m.w, h: m.h, branch: branch, collapsed: !!(m.node.c && collapsed[m.node.id]) };
      nodes.push(rec);
      var near = side > 0 ? x : x + m.w;
      var far = side > 0 ? x + m.w : x;
      links.push({
        id: m.node.id, depth: depth, branch: branch,
        x1: parent.px, y1: parent.py, x2: near, y2: y + m.h
      });
      var childEdge = side > 0 ? far + HGAP : far - HGAP;
      var cTop = top + (m.H - m.total) / 2;
      m.kids.forEach(function (k) {
        place(k, depth + 1, side, childEdge, cTop, { px: far, py: y + m.h }, branch);
        cTop += k.H + VGAP;
      });
    }

    groups.forEach(function (g) {
      if (!g.items.length) return;
      var ms = g.items.map(function (k) { return measure(k, 1, collapsed); });
      var total = ms.reduce(function (s, k) { return s + k.H; }, 0) + (ms.length - 1) * VGAP;
      var top = -total / 2;
      var edge = g.side > 0 ? rootBox.w / 2 + HGAP : -rootBox.w / 2 - HGAP;
      ms.forEach(function (m, i) {
        place(m, 1, g.side, edge, top, { px: g.side > 0 ? rootBox.w / 2 : -rootBox.w / 2, py: 0 }, g.offset + i);
        top += m.H + VGAP;
      });
    });

    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(function (n) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x + n.w);
      minY = Math.min(minY, n.y - 14); maxY = Math.max(maxY, n.y + n.h + 14);
    });
    var dx = PAD - minX;
    var dy = PAD - minY;
    nodes.forEach(function (n) { n.x += dx; n.y += dy; });
    links.forEach(function (l) { l.x1 += dx; l.x2 += dx; l.y1 += dy; l.y2 += dy; });
    return { nodes: nodes, links: links, width: Math.round(maxX - minX + PAD * 2), height: Math.round(maxY - minY + PAD * 2) };
  }

  C.mindmap = { prune: prune, search: search, buildTree: buildTree, leaves: leaves, find: find, pathTo: pathTo, layout: layout, box: box };
})((window.CRM = window.CRM || {}));
