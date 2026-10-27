// Wallpaper groups: a lattice of translations plus a few rotations, mirrors
// and glides per tile. Strokes are drawn once per operation into one tile in
// lattice coordinates, which then repeats as a skewed pattern. A turn's center
// solves (I − M)·x = t; a reflection's line sits halfway across its shift, and
// what's left along the line is the glide.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('wallpaper');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var groupSeg = V.ctl(section, 'group');

  var S3 = Math.sqrt(3) / 2, H = 0.5;
  var LAT = {
    oblique: [[1, 0], [0.32, 0.9]], rect: [[1, 0], [0, 0.72]], centered: [[1, 0], [0.5, 0.625]],
    square: [[1, 0], [0, 1]], hex: [[1, 0], [0.5, S3]]
  };
  // [lattice, operations, description]. An operation is a rotation ('r', degrees)
  // or a reflection in a line at an angle ('m', degrees), then a shift in tile units.
  var GROUPS = {
    p1: ['oblique', [['r', 0]], 'slides only'],
    p2: ['oblique', [['r', 0], ['r', 180]], 'half turns'],
    pm: ['rect', [['r', 0], ['m', 90]], 'parallel mirrors'],
    pg: ['rect', [['r', 0], ['m', 90, 0, H]], 'parallel glides'],
    cm: ['centered', [['r', 0], ['m', 90]], 'mirrors with glides between'],
    pmm: ['rect', [['r', 0], ['r', 180], ['m', 0], ['m', 90]], 'mirrors both ways'],
    pmg: ['rect', [['r', 0], ['r', 180], ['m', 90, H, 0], ['m', 0, H, 0]], 'mirrors one way, glides the other'],
    pgg: ['rect', [['r', 0], ['r', 180], ['m', 0, H, H], ['m', 90, H, H]], 'glides both ways, half turns'],
    cmm: ['centered', [['r', 0], ['r', 180], ['m', 0], ['m', 90]], 'mirrors both ways, more half turns'],
    p4: ['square', [['r', 0], ['r', 90], ['r', 180], ['r', 270]], 'quarter turns'],
    p4m: ['square', [['r', 0], ['r', 90], ['r', 180], ['r', 270], ['m', 0], ['m', 45], ['m', 90], ['m', 135]],
      'quarter turns, mirrors four ways'],
    p4g: ['square', [['r', 0], ['r', 90], ['r', 180], ['r', 270], ['m', 0, H, H], ['m', 90, H, H], ['m', 45, H, H], ['m', 135, H, H]],
      'quarter turns, mirrors and glides'],
    p3: ['hex', [['r', 0], ['r', 120], ['r', 240]], 'third turns'],
    p3m1: ['hex', [['r', 0], ['r', 120], ['r', 240], ['m', 30], ['m', 90], ['m', 150]], 'third turns, all on mirrors'],
    p31m: ['hex', [['r', 0], ['r', 120], ['r', 240], ['m', 0], ['m', 60], ['m', 120]], 'third turns, some off mirrors'],
    p6: ['hex', [['r', 0], ['r', 60], ['r', 120], ['r', 180], ['r', 240], ['r', 300]], 'sixth turns'],
    p6m: ['hex', [['r', 0], ['r', 60], ['r', 120], ['r', 180], ['r', 240], ['r', 300],
      ['m', 0], ['m', 30], ['m', 60], ['m', 90], ['m', 120], ['m', 150]], 'sixth turns and mirrors']
  };
  var ORDER_COLOR = { 2: '#ffb454', 3: '#7ee0a1', 4: '#ff5fa2', 6: '#6ee7ff' };

  var name = 'p4m';
  var G = null;               // the current group, built for the current size
  var strokes = [];           // { pts: [[x, y] in tile units], color }
  var drawing = null;
  var tile = null, tileCtx = null, pattern = null, N = 256;
  var showElements = false, showCell = false;
  var elements = null;
  var W = 0, Hh = 0, L = 100, OX = 0, OY = 0, DPR = 1;
  var colorIndex = 0;
  var stage = null;

  function build() {
    var g = GROUPS[name], e = LAT[g[0]];
    var det = e[0][0] * e[1][1] - e[0][1] * e[1][0];
    var ops = g[1].map(function (op) {
      var a = op[1] * Math.PI / 180, M;
      if (op[0] === 'r') M = [Math.cos(a), -Math.sin(a), Math.sin(a), Math.cos(a)];
      else M = [Math.cos(2 * a), Math.sin(2 * a), Math.sin(2 * a), -Math.cos(2 * a)];
      var fx = op[2] || 0, fy = op[3] || 0;
      return { kind: op[0], deg: op[1], M: M, t: [fx * e[0][0] + fy * e[1][0], fx * e[0][1] + fy * e[1][1]] };
    });
    // Plane to lattice coordinates.
    var inv = [e[1][1] / det, -e[1][0] / det, -e[0][1] / det, e[0][0] / det];
    G = { e: e, inv: inv, ops: ops, desc: g[2] };
    elements = null;
    N = Math.max(64, Math.round(L * DPR * 1.25));
    tile = document.createElement('canvas');
    tile.width = tile.height = N;
    tileCtx = tile.getContext('2d');
    tileCtx.lineCap = 'round';
    tileCtx.lineJoin = 'round';
  }

  // ---- Painting strokes into the tile ----

  // Draw points a..b of a stroke once for every operation, at every lattice
  // shift that lands part of it inside the tile.
  function paint(s, a, b) {
    var ctx = tileCtx, I = G.inv, pts = s.pts, k, i, j;
    var path = new Path2D();
    path.moveTo(pts[a][0], pts[a][1]);
    for (k = a + 1; k <= b; k++) path.lineTo(pts[k][0], pts[k][1]);
    if (a === b) path.lineTo(pts[a][0] + 1e-4, pts[a][1]);
    ctx.strokeStyle = s.color;
    for (var o = 0; o < G.ops.length; o++) {
      var op = G.ops[o], M = op.M, u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (k = a; k <= b; k++) {
        var qx = M[0] * pts[k][0] + M[1] * pts[k][1] + op.t[0], qy = M[2] * pts[k][0] + M[3] * pts[k][1] + op.t[1];
        var u = I[0] * qx + I[1] * qy, v = I[2] * qx + I[3] * qy;
        if (u < u0) u0 = u; if (u > u1) u1 = u;
        if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
      // Matrix taking plane points through the operation into tile pixels.
      var A = [N * (I[0] * M[0] + I[1] * M[2]), N * (I[0] * M[1] + I[1] * M[3]),
        N * (I[2] * M[0] + I[3] * M[2]), N * (I[2] * M[1] + I[3] * M[3])];
      var tu = I[0] * op.t[0] + I[1] * op.t[1], tv = I[2] * op.t[0] + I[3] * op.t[1];
      for (i = Math.ceil(-u1 - 0.06); i <= Math.floor(1.06 - u0); i++) {
        for (j = Math.ceil(-v1 - 0.06); j <= Math.floor(1.06 - v0); j++) {
          ctx.setTransform(A[0], A[2], A[1], A[3], N * (tu + i), N * (tv + j));
          ctx.lineWidth = 2.75 / L;
          ctx.stroke(path);
        }
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    pattern = null;
    if (stage) stage.dirty = true;
  }

  function repaint() {
    if (!tileCtx) return;
    tileCtx.setTransform(1, 0, 0, 1, 0, 0);
    tileCtx.clearRect(0, 0, N, N);
    strokes.forEach(function (st) { paint(st, 0, st.pts.length - 1); });
    pattern = null;
    if (stage) stage.dirty = true;
  }

  // ---- Symmetry elements ----

  function findElements() {
    var centers = {}, lines = {}, e = G.e, R = Math.ceil(Math.max(W, Hh) / L) + 3;
    G.ops.forEach(function (o) {
      for (var i = -R; i <= R; i++) {
        for (var j = -R; j <= R; j++) {
          var vx = o.t[0] + i * e[0][0] + j * e[1][0], vy = o.t[1] + i * e[0][1] + j * e[1][1];
          var key, M = o.M;
          if (o.kind === 'r') {
            if (o.deg === 0) continue;
            // Solve (I − M)·x = v.
            var a = 1 - M[0], b = -M[1], c = -M[2], d = 1 - M[3], dt = a * d - b * c;
            var x = (d * vx - b * vy) / dt, y = (a * vy - c * vx) / dt;
            if (Math.abs(x) * L > W / 2 + 20 || Math.abs(y) * L > Hh / 2 + 20) continue;
            key = Math.round(x * 1000) + ',' + Math.round(y * 1000);
            var turn = Math.min(o.deg, 360 - o.deg), order = Math.round(360 / turn);
            if (!centers[key] || centers[key].order < order) centers[key] = { x: x, y: y, order: order };
          } else {
            var ang = o.deg * Math.PI / 180, ux = Math.cos(ang), uy = Math.sin(ang);
            var off = (-uy * vx + ux * vy) / 2, glide = ux * vx + uy * vy;
            if (Math.abs(off) * L > (W + Hh) / 2 + 20) continue;
            key = o.deg + ':' + Math.round(off * 1000);
            var gl = Math.abs(glide) < 1e-6;
            if (!lines[key]) lines[key] = { ang: ang, off: off, mirror: gl };
            else if (gl) lines[key].mirror = true;
          }
        }
      }
    });
    elements = {
      centers: Object.keys(centers).map(function (k) { return centers[k]; }),
      lines: Object.keys(lines).map(function (k) { return lines[k]; })
    };
  }

  function marker(ctx, x, y, order) {
    var r = 6.5, k;
    ctx.beginPath();
    if (order === 2) {
      ctx.ellipse(x, y, r * 1.1, r * 0.55, Math.PI / 4, 0, Math.PI * 2);
    } else {
      for (k = 0; k < order; k++) {
        var a = -Math.PI / 2 + Math.PI * 2 * k / order + (order === 4 ? Math.PI / 4 : 0);
        if (k) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
    }
    ctx.fillStyle = ORDER_COLOR[order] || '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#0a0b10';
    ctx.stroke();
  }

  function drawElements(ctx) {
    if (!elements) findElements();
    var D = W + Hh;
    elements.lines.forEach(function (l) {
      var ux = Math.cos(l.ang), uy = Math.sin(l.ang), px = OX - uy * l.off * L, py = OY + ux * l.off * L;
      ctx.setLineDash(l.mirror ? [] : [7, 6]);
      ctx.strokeStyle = l.mirror ? 'rgba(236,232,223,0.8)' : 'rgba(236,232,223,0.55)';
      ctx.lineWidth = l.mirror ? 1.5 : 1.25;
      ctx.beginPath();
      ctx.moveTo(px - ux * D, py - uy * D);
      ctx.lineTo(px + ux * D, py + uy * D);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    elements.centers.forEach(function (c) { marker(ctx, OX + c.x * L, OY + c.y * L, c.order); });
  }

  function drawCell(ctx) {
    var e = G.e;
    ctx.beginPath();
    ctx.moveTo(OX, OY);
    ctx.lineTo(OX + e[0][0] * L, OY + e[0][1] * L);
    ctx.lineTo(OX + (e[0][0] + e[1][0]) * L, OY + (e[0][1] + e[1][1]) * L);
    ctx.lineTo(OX + e[1][0] * L, OY + e[1][1] * L);
    ctx.closePath();
    ctx.fillStyle = 'rgba(126,224,161,0.06)';
    ctx.fill();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#7ee0a1';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function frame(dt, st) {
    if (!st.dirty) return;
    st.dirty = false;
    var ctx = st.ctx, e = G.e;
    ctx.clearRect(0, 0, W, Hh);
    if (!pattern) {
      pattern = ctx.createPattern(tile, 'repeat');
      pattern.setTransform(new DOMMatrix([e[0][0] * L / N, e[0][1] * L / N, e[1][0] * L / N, e[1][1] * L / N, OX, OY]));
    }
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, W, Hh);
    if (showCell) drawCell(ctx);
    if (showElements) drawElements(ctx);
    V.setText(readout, name + '\n' + G.desc + '\n' + G.ops.length + (G.ops.length > 1 ? ' copies' : ' copy') + ' per tile');
  }

  function resize(st) {
    W = st.width;
    Hh = st.height;
    DPR = st.dpr;
    L = Math.min(W, Hh) * 0.3;
    OX = W / 2;
    OY = Hh / 2;
    build();
    repaint();
  }

  stage = V.createStage(canvas, { frame: frame, resize: resize });

  // ---- Doodles ----

  function nextColor() {
    var c = V.gradient(V.SPECTRUM, (colorIndex * 0.37) % 1);
    colorIndex++;
    return c;
  }

  // A few smooth curls in tile units, from a seeded random walk of the heading.
  function doodle(seed) {
    var rnd = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    var out = [], n = 2 + Math.floor(rnd() * 2);
    for (var s = 0; s < n; s++) {
      var x = (rnd() - 0.5) * 0.6, y = (rnd() - 0.5) * 0.6, a = rnd() * Math.PI * 2;
      var turn = (rnd() - 0.5) * 0.5, pts = [[x, y]], len = 16 + Math.floor(rnd() * 20);
      for (var i = 0; i < len; i++) {
        turn += (rnd() - 0.5) * 0.08;
        turn = Math.max(-0.35, Math.min(0.35, turn));
        a += turn;
        x += Math.cos(a) * 0.022;
        y += Math.sin(a) * 0.022;
        pts.push([x, y]);
      }
      out.push({ pts: pts, color: nextColor() });
    }
    return out;
  }

  // ---- Drawing ----

  function local(e) {
    var r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left - OX) / L, (e.clientY - r.top - OY) / L];
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    drawing = { pts: [local(e)], color: nextColor() };
    strokes.push(drawing);
    paint(drawing, 0, 0);
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    var p = local(e), last = drawing.pts[drawing.pts.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) * L < 2.5) return;
    drawing.pts.push(p);
    paint(drawing, drawing.pts.length - 2, drawing.pts.length - 1);
  });

  function endStroke() { drawing = null; }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  // ---- Controls ----

  V.segmented(groupSeg, function (v) {
    name = v;
    if (!W) return;
    build();
    repaint();
  });

  V.toggle(V.ctl(section, 'elements'), function (on) { showElements = on; stage.dirty = true; });
  V.toggle(V.ctl(section, 'cell'), function (on) { showCell = on; stage.dirty = true; });

  V.ctl(section, 'undo').addEventListener('click', function () {
    strokes.pop();
    repaint();
  });
  V.ctl(section, 'clear').addEventListener('click', function () {
    strokes = [];
    repaint();
  });
  V.ctl(section, 'doodle').addEventListener('click', function () {
    strokes = doodle(1 + Math.floor(Math.random() * 1e6));
    repaint();
  });

  strokes = doodle(20251);
  if (W) repaint();
})();
