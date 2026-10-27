// Minimum spanning tree: the shortest set of roads that joins every city.
// Kruskal adds the shortest road that doesn't close a loop; Prim grows one
// tree by its shortest road out. Both find the same tree when lengths differ.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('mst');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var algoGroup = V.ctl(section, 'algo');

  var TAU = Math.PI * 2;
  var GREEN = '#7ee0a1';
  var MAX = 60;
  var MARGIN = 22;
  var SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  var PIECES = ['#6ee7ff', '#ff5fa2', '#ffb454', '#a78bfa', '#7c8cff', '#7ee0a1'];
  var cities = [];       // { x, y } in [0, 1]
  var algo = 'kruskal';
  var run = null;        // the animation in progress
  var tree = [];         // [a, b] for the finished tree
  var speed = 1;
  var held = null, dragged = false;
  var W = 0, H = 0;
  var first = true;

  function scatter(n) {
    cities = [];
    for (var tries = 0; cities.length < n && tries < 4000; tries++) {
      var c = { x: 0.04 + Math.random() * 0.92, y: 0.04 + Math.random() * 0.92 };
      // Leave the readout corner free, and don't crowd.
      if (c.x * W < 250 && c.y * H < 80) continue;
      var ok = cities.every(function (o) { return Math.hypot((o.x - c.x) * W, (o.y - c.y) * H) > Math.min(W, H) * 0.09; });
      if (ok || tries > 3000) cities.push(c);
    }
  }

  function px(c) { return { x: MARGIN + c.x * (W - 2 * MARGIN), y: MARGIN + c.y * (H - 2 * MARGIN) }; }

  function dist(a, b) {
    var p = px(cities[a]), q = px(cities[b]);
    return Math.hypot(p.x - q.x, p.y - q.y);
  }

  // The map is 100 km across.
  function km(d) { return d * 100 / (W - 2 * MARGIN); }

  // Prim's algorithm in O(n²), for the live tree while dragging.
  function prim() {
    var n = cities.length, inTree = [], key = [], parent = [], out = [];
    if (n < 2) return out;
    for (var i = 0; i < n; i++) { inTree.push(false); key.push(Infinity); parent.push(-1); }
    key[0] = 0;
    for (var step = 0; step < n; step++) {
      var u = -1;
      for (i = 0; i < n; i++) if (!inTree[i] && (u < 0 || key[i] < key[u])) u = i;
      inTree[u] = true;
      if (parent[u] >= 0) out.push([parent[u], u]);
      for (i = 0; i < n; i++) {
        if (inTree[i]) continue;
        var d = dist(u, i);
        if (d < key[i]) { key[i] = d; parent[i] = u; }
      }
    }
    return out;
  }

  function total(list) {
    var s = 0;
    list.forEach(function (e) { s += dist(e[0], e[1]); });
    return km(s);
  }

  // ---- Animated runs ----

  function startRun() {
    var n = cities.length;
    if (n < 2) { run = null; tree = []; return; }
    if (algo === 'kruskal') {
      var all = [];
      for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) all.push([i, j, dist(i, j)]);
      all.sort(function (a, b) { return a[2] - b[2]; });
      var parent = [], size = [], tint = [];
      for (i = 0; i < n; i++) { parent.push(i); size.push(1); tint.push(-1); }
      run = {
        kind: 'kruskal', all: all, k: 0, parent: parent, size: size, tint: tint,
        added: [], skipped: 0, flashes: [], cur: null, wait: 0.5
      };
    } else {
      var key = [], from = [], inTree = [];
      for (i = 0; i < n; i++) { key.push(Infinity); from.push(-1); inTree.push(false); }
      run = { kind: 'prim', key: key, from: from, inTree: inTree, added: [], cur: null, wait: 0.5 };
      primAdd(0);
    }
    tree = [];
  }

  function root(p, i) {
    while (p[i] !== i) { p[i] = p[p[i]]; i = p[i]; }
    return i;
  }

  // A new piece gets the color fewest other pieces are using.
  function freeTint(R) {
    var used = PIECES.map(function () { return 0; });
    for (var i = 0; i < R.parent.length; i++) {
      if (R.parent[i] === i && R.size[i] > 1) used[R.tint[i]]++;
    }
    var best = 0;
    for (i = 1; i < used.length; i++) if (used[i] < used[best]) best = i;
    return best;
  }

  function primAdd(u) {
    var R = run;
    R.inTree[u] = true;
    for (var i = 0; i < cities.length; i++) {
      if (R.inTree[i]) continue;
      var d = dist(u, i);
      if (d < R.key[i]) { R.key[i] = d; R.from[i] = u; }
    }
  }

  function runStep() {
    var R = run, n = cities.length;
    if (R.kind === 'kruskal') {
      var e = R.all[R.k++], a = root(R.parent, e[0]), b = root(R.parent, e[1]);
      if (a !== b) {
        if (R.size[a] > R.size[b]) { var t = a; a = b; b = t; }
        R.tint[b] = R.size[b] > 1 ? R.tint[b] : R.size[a] > 1 ? R.tint[a] : freeTint(R);
        R.parent[a] = b;
        R.size[b] += R.size[a];
        R.added.push([e[0], e[1]]);
        R.cur = { e: e, ok: true, t: 0 };
      } else {
        R.skipped++;
        R.flashes.push({ e: e, t: 1 });
        R.cur = { e: e, ok: false, t: 0 };
      }
      R.wait = (a !== b ? 0.42 : 0.16) / speed;
    } else {
      var best = -1;
      for (var i = 0; i < n; i++) if (!R.inTree[i] && (best < 0 || R.key[i] < R.key[best])) best = i;
      R.added.push([R.from[best], best]);
      R.cur = { e: [R.from[best], best], ok: true, t: 0 };
      primAdd(best);
      R.wait = 0.5 / speed;
    }
    if (R.added.length === n - 1) {
      tree = R.added.slice();
      R.done = true;
      R.wait = 0.8;
    }
  }

  // ---- Drawing ----

  function tintOf(R, i) {
    var r = root(R.parent, i);
    return R.size[r] > 1 ? PIECES[R.tint[r]] : '#9b9daf';
  }

  function seg(ctx, a, b) {
    var p = px(cities[a]), q = px(cities[b]);
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
  }

  function draw(st) {
    var ctx = st.ctx, i, n = cities.length;
    ctx.clearRect(0, 0, W, H);

    // A faint 10 km grid.
    var step = (W - 2 * MARGIN) / 10;
    ctx.strokeStyle = 'rgba(236,232,223,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var gx = MARGIN; gx <= W - MARGIN + 1; gx += step) { ctx.moveTo(gx, 0); ctx.lineTo(gx, H); }
    for (var gy = MARGIN; gy <= H; gy += step) { ctx.moveTo(0, gy); ctx.lineTo(W, gy); }
    ctx.stroke();

    ctx.lineCap = 'round';
    var R = run && !run.done ? run : null;
    var group = null;
    if (R && R.kind === 'kruskal') {
      group = [];
      for (i = 0; i < n; i++) group.push(tintOf(R, i));
    }

    if (R && R.kind === 'prim') {
      // Each outside city's cheapest link to the tree so far.
      ctx.setLineDash([3, 6]);
      ctx.strokeStyle = 'rgba(236,232,223,0.32)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      for (i = 0; i < n; i++) if (!R.inTree[i] && R.from[i] >= 0) seg(ctx, R.from[i], i);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (R && R.kind === 'kruskal') {
      R.flashes.forEach(function (f) {
        ctx.beginPath();
        seg(ctx, f.e[0], f.e[1]);
        ctx.strokeStyle = 'rgba(255,95,162,' + (0.85 * f.t) + ')';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    var edges = R ? R.added : tree;
    edges.forEach(function (e) {
      ctx.beginPath();
      seg(ctx, e[0], e[1]);
      ctx.strokeStyle = group ? group[e[0]] : GREEN;
      ctx.lineWidth = 3;
      ctx.stroke();
    });

    if (R && R.cur && R.cur.t < 1) {
      ctx.beginPath();
      seg(ctx, R.cur.e[0], R.cur.e[1]);
      ctx.strokeStyle = R.cur.ok ? '#ffffff' : '#ff5fa2';
      ctx.globalAlpha = 1 - R.cur.t * 0.6;
      ctx.lineWidth = 5;
      ctx.shadowColor = R.cur.ok ? '#ffffff' : '#ff5fa2';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    for (i = 0; i < n; i++) {
      var p = px(cities[i]), c = GREEN;
      if (group) c = group[i];
      else if (R && R.kind === 'prim') c = R.inTree[i] ? GREEN : '#6f7286';
      ctx.beginPath();
      ctx.arc(p.x, p.y, held === i ? 8 : 5.5, 0, TAU);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    var roads = edges.length, lines = [];
    if (R) {
      lines.push((R.kind === 'kruskal' ? 'Kruskal: ' : 'Prim: ') + roads + ' of ' + (n - 1) + ' roads');
      lines.push('Length so far ' + Math.round(total(edges)) + ' km');
      if (R.kind === 'kruskal') lines.push('Skipped ' + R.skipped + ' that close a loop');
    } else {
      lines.push(n + ' cities, ' + roads + ' roads');
      lines.push('Total length ' + Math.round(total(edges)) + ' km');
      if (n >= 3) lines.push(cayley(n));
    }
    V.setText(readout, lines.join('\n'));
  }

  // Cayley: n cities can be joined by n^(n-2) different trees.
  function cayley(n) {
    var e = String(n - 2).split('').map(function (d) { return SUP[+d]; }).join('');
    var lg = (n - 2) * Math.log10(n);
    if (lg < 6) return n + e + ' = ' + Math.round(Math.pow(n, n - 2)).toLocaleString() + ' possible trees';
    var p = Math.floor(lg), m = Math.pow(10, lg - p);
    var pe = String(p).split('').map(function (d) { return SUP[+d]; }).join('');
    return n + e + ' ≈ ' + m.toFixed(1) + ' × 10' + pe + ' trees';
  }

  function frame(dt, st) {
    W = st.width;
    H = st.height;
    if (first) {
      first = false;
      scatter(18);
      if (V.reducedMotion) tree = prim(); else startRun();
    }
    var busy = false;
    if (run) {
      busy = true;
      if (run.cur) run.cur.t = Math.min(1, run.cur.t + dt * 2.4 * speed);
      if (run.flashes) {
        run.flashes.forEach(function (f) { f.t -= dt * 1.6; });
        run.flashes = run.flashes.filter(function (f) { return f.t > 0; });
      }
      run.wait -= dt;
      if (run.wait <= 0) {
        if (run.done) run = null;
        else runStep();
      }
    }
    if (!busy && !st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Pointer ----

  function cityAt(x, y) {
    var best = -1, bd = 18;
    cities.forEach(function (c, i) {
      var p = px(c), d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  function live() {
    run = null;
    tree = prim();
    stage.dirty = true;
  }

  V.drag(canvas, {
    hit: function (x, y) { var i = cityAt(x, y); return i >= 0 ? { i: i } : null; },
    move: function (h, x, y, firstMove) {
      held = h.i;
      dragged = !firstMove;
      cities[h.i].x = Math.max(0, Math.min(1, (x - MARGIN) / (W - 2 * MARGIN)));
      cities[h.i].y = Math.max(0, Math.min(1, (y - MARGIN) / (H - 2 * MARGIN)));
      if (!firstMove) live();
    },
    end: function () { held = null; stage.dirty = true; }
  });

  canvas.addEventListener('click', function (e) {
    if (dragged) { dragged = false; return; }
    var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (cityAt(x, y) >= 0 || cities.length >= MAX) return;
    cities.push({
      x: Math.max(0, Math.min(1, (x - MARGIN) / (W - 2 * MARGIN))),
      y: Math.max(0, Math.min(1, (y - MARGIN) / (H - 2 * MARGIN)))
    });
    live();
  });

  // ---- Controls ----

  V.segmented(algoGroup, function (v) { algo = v; if (W) startRun(); stage.dirty = true; });
  V.ctl(section, 'build').addEventListener('click', function () { if (W) startRun(); stage.dirty = true; });
  V.ctl(section, 'scatter').addEventListener('click', function () {
    if (!W) return;
    scatter(18);
    startRun();
    stage.dirty = true;
  });
  V.ctl(section, 'clear').addEventListener('click', function () {
    cities = [];
    run = null;
    tree = [];
    stage.dirty = true;
  });
  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return v.toFixed(1) + '×'; },
    function (v) { speed = v; });
})();
