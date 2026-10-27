// Untangle: each level is built from straight lines in general position, with
// a dot wherever two lines meet and an edge between neighboring dots along a
// line, so it's planar by construction. K5 and K3,3 are not: one crossing stays.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('planarity');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var levelGroup = V.ctl(section, 'level');
  var nextBtn = V.ctl(section, 'next');

  var TAU = Math.PI * 2;
  var PINK = '#ff5fa2', GREEN = '#7ee0a1', VIOLET = '#a78bfa';
  // Straight-line drawings with a single crossing, the best possible.
  var BEST = {
    k5: [[0.72, 0.47], [0.9, 0.17], [0.22, 0.38], [0.51, 0.53], [0.71, 0.89]],
    k33: [[0.69, 0.67], [0.14, 0.83], [0.88, 0.14], [0.16, 0.28], [0.68, 0.39], [0.87, 0.87]]
  };

  var level = '2';
  var pts = [];          // { x, y } in [0, 1], the play area
  var edges = [];        // [a, b]
  var solved = [];       // a layout with the fewest crossings
  var crossing = [];     // per edge: does it cross anything?
  var count = 0;
  var moves = 0;
  var won = false, glow = 0, shown = false;
  var tween = null;
  var held = null, hover = -1;
  var W = 0, H = 0;

  function lineLevel(m) {
    var lines = [], i, j;
    for (i = 0; i < m; i++) {
      var a = (i + 0.15 + Math.random() * 0.7) * Math.PI / m;
      lines.push({ nx: Math.cos(a), ny: Math.sin(a), d: (Math.random() - 0.5) * 0.6 });
    }
    lines.sort(function () { return Math.random() - 0.5; });
    var at = {}, verts = [];
    for (i = 0; i < m; i++) {
      for (j = i + 1; j < m; j++) {
        var A = lines[i], B = lines[j], det = A.nx * B.ny - A.ny * B.nx;
        verts.push({ x: (A.d * B.ny - B.d * A.ny) / det, y: (A.nx * B.d - B.nx * A.d) / det, li: i, lj: j });
        at[i + ',' + j] = verts.length - 1;
      }
    }
    var list = [];
    for (i = 0; i < m; i++) {
      var on = [];
      for (j = 0; j < m; j++) {
        if (j === i) continue;
        var v = at[Math.min(i, j) + ',' + Math.max(i, j)];
        on.push({ v: v, s: -verts[v].x * lines[i].ny + verts[v].y * lines[i].nx });
      }
      on.sort(function (p, q) { return p.s - q.s; });
      for (j = 1; j < on.length; j++) list.push([on[j - 1].v, on[j].v]);
    }
    return { verts: fit(verts.map(function (v) { return [v.x, v.y]; })), edges: list };
  }

  // Scale a layout into the play area, keeping its shape.
  function fit(P) {
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    P.forEach(function (p) {
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    });
    var s = 0.84 / Math.max(x1 - x0, y1 - y0);
    return P.map(function (p) { return [0.5 + (p[0] - (x0 + x1) / 2) * s, 0.53 + (p[1] - (y0 + y1) / 2) * s * 0.92]; });
  }

  function load(name) {
    level = name;
    var g;
    if (name === 'k5') {
      g = { verts: BEST.k5, edges: [] };
      for (var i = 0; i < 5; i++) for (var j = i + 1; j < 5; j++) g.edges.push([i, j]);
    } else if (name === 'k33') {
      g = { verts: BEST.k33, edges: [] };
      for (i = 0; i < 3; i++) for (j = 3; j < 6; j++) g.edges.push([i, j]);
    } else {
      g = lineLevel(+name + 3);
    }
    edges = g.edges;
    solved = g.verts.map(function (p) { return { x: p[0], y: p[1] }; });
    shuffle();
  }

  // Put the dots on a ring in random order, which tangles almost every edge.
  function shuffle() {
    var n = solved.length, order = [];
    for (var i = 0; i < n; i++) order.push(i);
    order.sort(function () { return Math.random() - 0.5; });
    pts = [];
    for (i = 0; i < n; i++) {
      var a = -Math.PI / 2 + TAU * order[i] / n;
      pts[i] = { x: 0.5 + 0.4 * Math.cos(a), y: 0.54 + 0.4 * Math.sin(a) };
    }
    moves = 0;
    won = false;
    shown = false;
    glow = 0;
    tween = null;
    nextBtn.disabled = true;
    measure();
    if (!count && n > 6) shuffle();
    stage.dirty = true;
  }

  function orient(p, q, r) { return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x); }

  function measure() {
    crossing = edges.map(function () { return false; });
    count = 0;
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i];
      for (var j = i + 1; j < edges.length; j++) {
        var f = edges[j];
        if (e[0] === f[0] || e[0] === f[1] || e[1] === f[0] || e[1] === f[1]) continue;
        var a = pts[e[0]], b = pts[e[1]], c = pts[f[0]], d = pts[f[1]];
        if (orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0) {
          crossing[i] = crossing[j] = true;
          count++;
        }
      }
    }
    var floor = level === 'k5' || level === 'k33' ? 1 : 0;
    if (count <= floor && !won && moves > 0) {
      won = true;
      glow = 1;
      nextBtn.disabled = level === 'k33';
    } else if (count > floor) {
      won = false;
    }
  }

  // ---- Drawing ----

  function px(p) {
    var m = 26;
    return { x: m + p.x * (W - 2 * m), y: m + p.y * (H - 2 * m) };
  }

  function draw(st) {
    var ctx = st.ctx, i;
    ctx.clearRect(0, 0, W, H);
    var P = pts.map(px), clean = won && count === 0;
    ctx.lineCap = 'round';

    var nb = {};
    if (held) edges.forEach(function (e) {
      if (e[0] === held.i) nb[e[1]] = 1;
      if (e[1] === held.i) nb[e[0]] = 1;
    });

    // Clean edges first, then crossing ones on top so they stand out.
    for (var pass = 0; pass < 2; pass++) {
      for (i = 0; i < edges.length; i++) {
        var e = edges[i], bad = crossing[i];
        if ((pass === 1) !== bad) continue;
        var touch = held && (e[0] === held.i || e[1] === held.i);
        ctx.beginPath();
        ctx.moveTo(P[e[0]].x, P[e[0]].y);
        ctx.lineTo(P[e[1]].x, P[e[1]].y);
        if (clean) {
          ctx.strokeStyle = GREEN;
          ctx.lineWidth = 2.5;
          ctx.shadowColor = 'rgba(126,224,161,' + (0.4 + glow * 0.5) + ')';
          ctx.shadowBlur = 6 + glow * 14;
        } else if (bad) {
          ctx.strokeStyle = PINK;
          ctx.globalAlpha = touch ? 1 : 0.78;
          ctx.lineWidth = touch ? 3 : 2;
        } else {
          ctx.strokeStyle = touch ? '#ffffff' : 'rgba(236,232,223,0.6)';
          ctx.lineWidth = touch ? 3 : 2;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    }

    var r = Math.max(8, Math.min(W, H) * 0.017);
    for (i = 0; i < P.length; i++) {
      var p = P[i], on = held && held.i === i, near = hover === i || nb[i];
      var fill = '#ece8df';
      if (level === 'k33') fill = i < 3 ? '#ffb454' : '#6ee7ff';
      if (on) fill = VIOLET;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + (on || near ? 7 : 4), 0, TAU);
      ctx.fillStyle = on ? 'rgba(167,139,250,0.3)' : near ? 'rgba(167,139,250,0.2)' : 'rgba(167,139,250,0.1)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, on ? r + 1.5 : r, 0, TAU);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    var name = level === 'k5' ? 'K₅' : level === 'k33' ? 'K₃,₃' : 'Level ' + level;
    var line2;
    if (level === 'k5' || level === 'k33') {
      line2 = count === 1 ? '1 crossing: the best possible' : count + ' crossings (best is 1)';
    } else if (clean && shown) {
      line2 = 'Untangled for you';
    } else if (clean) {
      line2 = 'Untangled in ' + moves + ' move' + (moves === 1 ? '' : 's') + '!';
    } else {
      line2 = count + ' crossing' + (count === 1 ? '' : 's');
    }
    V.setText(readout, name + ': ' + P.length + ' dots\n' + line2);
  }

  function frame(dt, st) {
    W = st.width;
    H = st.height;
    var busy = false;
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 1.3);
      var k = V.easeInOut(tween.t);
      for (var i = 0; i < pts.length; i++) {
        pts[i].x = tween.from[i].x + (solved[i].x - tween.from[i].x) * k;
        pts[i].y = tween.from[i].y + (solved[i].y - tween.from[i].y) * k;
      }
      measure();
      if (tween.t >= 1) tween = null;
      busy = true;
    }
    if (glow > 0) { glow = Math.max(0, glow - dt * 0.8); busy = true; }
    if (!busy && !st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Pointer ----

  function dotAt(x, y) {
    var best = -1, bd = Math.max(18, Math.min(W, H) * 0.04);
    pts.forEach(function (p, i) {
      var q = px(p), d = Math.hypot(q.x - x, q.y - y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  V.drag(canvas, {
    hit: function (x, y) {
      var i = dotAt(x, y);
      return i >= 0 ? { i: i, moved: false } : null;
    },
    move: function (h, x, y, first) {
      held = h;
      tween = null;
      if (first) { stage.dirty = true; return; }
      var m = 26;
      pts[h.i].x = Math.max(0, Math.min(1, (x - m) / (W - 2 * m)));
      pts[h.i].y = Math.max(0, Math.min(1, (y - m) / (H - 2 * m)));
      if (!h.moved) { h.moved = true; moves++; shown = false; }
      measure();
      stage.dirty = true;
    },
    end: function () {
      held = null;
      stage.dirty = true;
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || held) return;
    var r = canvas.getBoundingClientRect(), i = dotAt(e.clientX - r.left, e.clientY - r.top);
    if (i !== hover) { hover = i; stage.dirty = true; }
  });
  canvas.addEventListener('pointerleave', function () { hover = -1; stage.dirty = true; });

  // ---- Controls ----

  V.segmented(levelGroup, load);
  nextBtn.addEventListener('click', function () {
    var order = ['1', '2', '3', '4', '5', '6', 'k5', 'k33'];
    var next = order[Math.min(order.length - 1, order.indexOf(level) + 1)];
    V.setSegmented(levelGroup, next);
    load(next);
  });
  V.ctl(section, 'shuffle').addEventListener('click', shuffle);
  V.ctl(section, 'show').addEventListener('click', function () {
    tween = { t: V.reducedMotion ? 1 : 0, from: pts.map(function (p) { return { x: p.x, y: p.y }; }) };
    if (!moves) moves = 1;
    won = false;
    shown = true;
  });

  load('2');
})();
