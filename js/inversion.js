// Circle inversion in a circle of radius r about O: P goes to P′ on ray OP with
// |OP|·|OP′| = r². Lines miss O → circles through O; circles miss O → circles;
// circles through O → lines. Angles between curves are kept.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('inversion');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var hint = V.ctl(section, 'hint');
  var drawTools = V.ctl(section, 'draw-tools');
  var driftBtn = V.ctl(section, 'drift');

  var TAU = Math.PI * 2;
  var CYAN = '110,231,255', VIOLET = '167,139,250', PINK = '255,95,162';
  var AMP = { line: 0.45, circle: 0.45, grid: 0.3, draw: 0.22 };

  // Everything in units of the mirror radius, measured from O.
  var mode = 'grid';
  var line = [[-1.25, 1.0], [1.25, 0.25]];
  var circ = { c: [0.95, -0.55], rim: [1.45, -0.55] };
  var grid = { o: [0.17, 0.11], step: 0.42 };
  var strokes = [];
  var stroke = null;
  var drift = !V.reducedMotion;
  var t = 0;
  var held = null;
  var probe = null;
  var W = 0, H = 0, R = 1, OX = 0, OY = 0;

  function off() {
    var a = drift ? AMP[mode] : 0;
    return [a * Math.sin(t * 0.23), a * Math.sin(t * 0.17 + 1.1)];
  }

  function sx(p) { return OX + p[0] * R; }
  function sy(p) { return OY + p[1] * R; }
  function inv(p) {
    var d = p[0] * p[0] + p[1] * p[1];
    return d < 1e-12 ? [1e6, 1e6] : [p[0] / d, p[1] / d];
  }
  function add(p, o) { return [p[0] + o[0], p[1] + o[1]]; }

  // A full line through p with direction d, in screen pixels.
  function strokeLine(ctx, p, d) {
    var n = Math.hypot(d[0], d[1]), L = (W + H) * 2;
    if (!n) return;
    ctx.beginPath();
    ctx.moveTo(sx(p) - d[0] / n * L, sy(p) - d[1] / n * L);
    ctx.lineTo(sx(p) + d[0] / n * L, sy(p) + d[1] / n * L);
    ctx.stroke();
  }

  // A circle given in mirror units. Huge ones are drawn as the short arc that
  // crosses the view, since canvas arcs misbehave at radii of millions of pixels.
  function circlePath(ctx, c, r) {
    var pr = r * R;
    if (pr < 3000) {
      ctx.moveTo(sx(c) + pr, sy(c));
      ctx.arc(sx(c), sy(c), pr, 0, TAU);
      return;
    }
    var dx = -c[0], dy = -c[1], dn = Math.hypot(dx, dy) || 1;
    var a0 = Math.atan2(dy, dx), span = Math.min(Math.PI, 1.5 * (W + H) / pr);
    for (var i = 0; i <= 64; i++) {
      var a = a0 - span + 2 * span * i / 64;
      var x = sx(c) + Math.cos(a) * pr, y = sy(c) + Math.sin(a) * pr;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
  }

  function strokeCircle(ctx, c, r) {
    ctx.beginPath();
    circlePath(ctx, c, r);
    ctx.stroke();
  }

  // Image of the line through a and b: a circle through O, or the line itself.
  function lineImage(a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy);
    var delta = (a[0] * dy - a[1] * dx) / n;          // signed distance from O
    if (Math.abs(delta) < 1e-6) return { line: true, p: a, d: [dx, dy], delta: 0 };
    var fx = -dy / n * delta, fy = dx / n * delta;    // foot of the perpendicular
    var f = inv([fx, fy]);
    return { c: [f[0] / 2, f[1] / 2], r: 1 / (2 * Math.abs(delta)), delta: Math.abs(delta) };
  }

  function circleImage(c, rho) {
    var D2 = c[0] * c[0] + c[1] * c[1], k = D2 - rho * rho;
    if (Math.abs(k) < 1e-6) {
      // Through O: the image is the line at distance 1/(2ρ), square to OC.
      var D = Math.sqrt(D2) || 1, u = [c[0] / D, c[1] / D], q = 1 / (2 * rho);
      return { line: true, p: [u[0] * q, u[1] * q], d: [-u[1], u[0]] };
    }
    return { c: [c[0] / k, c[1] / k], r: rho / Math.abs(k) };
  }

  function strokeImage(ctx, img) {
    if (img.line) strokeLine(ctx, img.p, img.d);
    else strokeCircle(ctx, img.c, img.r);
  }

  function handle(ctx, p, big) {
    ctx.beginPath();
    ctx.arc(sx(p), sy(p), big ? 8 : 6.5, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0a0b10';
    ctx.stroke();
  }

  function densify(pts) {
    var out = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      for (var k = 1; k <= 24; k++) {
        out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k / 24, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k / 24]);
      }
    }
    return out;
  }

  function centroid() {
    var x = 0, y = 0, n = 0;
    strokes.forEach(function (s) { s.forEach(function (p) { x += p[0]; y += p[1]; n++; }); });
    return n ? [x / n, y / n] : null;
  }

  // Map a drawn path point by point, adding points wherever the image stretches.
  function pathImage(ctx, pts, o) {
    var lim = (W + H) / R, pen = false, prev = null;
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var a = add(pts[i], o), steps = 1;
      if (prev) {
        var ia = inv(prev), ib = inv(a);
        steps = Math.min(64, Math.max(1, Math.ceil(Math.hypot(ib[0] - ia[0], ib[1] - ia[1]) * R / 4)));
      }
      for (var k = prev ? 1 : steps; k <= steps; k++) {
        var p = prev ? [prev[0] + (a[0] - prev[0]) * k / steps, prev[1] + (a[1] - prev[1]) * k / steps] : a;
        var q = inv(p);
        if (Math.abs(q[0]) > lim || Math.abs(q[1]) > lim) { pen = false; continue; }
        if (pen) ctx.lineTo(sx(q), sy(q));
        else { ctx.moveTo(sx(q), sy(q)); pen = true; }
      }
      prev = a;
    }
    ctx.stroke();
  }

  function frame(dt, st) {
    if (drift && !held && !stroke) {
      t += dt;
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    W = st.width;
    H = st.height;
    R = Math.min(W, H) * 0.27;
    OX = W / 2;
    OY = H / 2;

    var ctx = st.ctx, o = off(), text = '', i, img;
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.arc(OX, OY, R, 0, TAU);
    ctx.fillStyle = 'rgba(236,232,223,0.035)';
    ctx.fill();

    if (mode === 'grid') {
      ctx.lineCap = 'butt';
      var g0 = add(grid.o, o), step = grid.step, span = Math.ceil(8 / step), k;
      var xs = [], ys = [];
      for (k = -span; k <= span; k++) {
        xs.push(g0[0] + k * step);
        ys.push(g0[1] + k * step);
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + CYAN + ',0.22)';
      ctx.beginPath();
      xs.forEach(function (x) { if (Math.abs(x * R) < W) { ctx.moveTo(OX + x * R, 0); ctx.lineTo(OX + x * R, H); } });
      ctx.stroke();
      ctx.strokeStyle = 'rgba(' + VIOLET + ',0.22)';
      ctx.beginPath();
      ys.forEach(function (y) { if (Math.abs(y * R) < H) { ctx.moveTo(0, OY + y * R); ctx.lineTo(W, OY + y * R); } });
      ctx.stroke();

      // x = c becomes the circle of radius 1/(2|c|) centered at (1/(2c), 0).
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(' + CYAN + ',0.9)';
      ctx.beginPath();
      xs.forEach(function (x) {
        if (Math.abs(x) < 1e-6) { ctx.moveTo(OX, 0); ctx.lineTo(OX, H); }
        else circlePath(ctx, [1 / (2 * x), 0], 1 / (2 * Math.abs(x)));
      });
      ctx.stroke();
      ctx.strokeStyle = 'rgba(' + VIOLET + ',0.9)';
      ctx.beginPath();
      ys.forEach(function (y) {
        if (Math.abs(y) < 1e-6) { ctx.moveTo(0, OY); ctx.lineTo(W, OY); }
        else circlePath(ctx, [0, 1 / (2 * y)], 1 / (2 * Math.abs(y)));
      });
      ctx.stroke();
      handle(ctx, g0, held && held.kind === 'grid');
      text = 'a square grid of lines\nimages: circles through O,\nstill crossing at right angles';
    } else if (mode === 'line') {
      var a = add(line[0], o), b = add(line[1], o);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(' + CYAN + ',0.4)';
      strokeLine(ctx, a, [b[0] - a[0], b[1] - a[1]]);
      img = lineImage(a, b);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgb(' + CYAN + ')';
      strokeImage(ctx, img);
      handle(ctx, a, held && held.kind === 'a');
      handle(ctx, b, held && held.kind === 'b');
      text = img.line ? 'the line passes through O\nso it is its own image' :
        'line ' + img.delta.toFixed(2) + ' r from O\nimage: a circle through O,\n' + (1 / img.delta).toFixed(2) + ' r across';
    } else if (mode === 'circle') {
      var c = add(circ.c, o), rim = add(circ.rim, o), rho = Math.hypot(rim[0] - c[0], rim[1] - c[1]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(' + PINK + ',0.45)';
      strokeCircle(ctx, c, rho);
      img = circleImage(c, rho);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgb(' + PINK + ')';
      strokeImage(ctx, img);
      handle(ctx, c, held && held.kind === 'c');
      handle(ctx, rim, held && held.kind === 'rim');
      var dO = Math.hypot(c[0], c[1]);
      text = 'circle of radius ' + rho.toFixed(2) + ' r\n' + (img.line ? 'through O: its image is a line' :
        'image: radius ' + img.r.toFixed(2) + ' r' + (dO < rho ? '\nO is inside it' : ''));
    } else {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(236,232,223,0.4)';
      var all = stroke ? strokes.concat([stroke]) : strokes;
      for (i = 0; i < all.length; i++) {
        ctx.beginPath();
        for (var j = 0; j < all[i].length; j++) {
          var p = add(all[i][j], o);
          if (j) ctx.lineTo(sx(p), sy(p));
          else ctx.moveTo(sx(p), sy(p));
        }
        ctx.stroke();
      }
      ctx.lineWidth = 2.25;
      for (i = 0; i < all.length; i++) {
        ctx.strokeStyle = V.gradient(V.SPECTRUM, (i * 0.23) % 1);
        pathImage(ctx, all[i], o);
      }
      var cen = centroid();
      if (cen && !stroke) handle(ctx, add(cen, o), held && held.kind === 'move');
      text = all.length ? 'your drawing (faint)\nand its image (bright)' : 'draw something\nnear the mirror circle';
    }

    ctx.beginPath();
    ctx.arc(OX, OY, R, 0, TAU);
    ctx.strokeStyle = '#ece8df';
    ctx.lineWidth = 1.75;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(OX - 5, OY); ctx.lineTo(OX + 5, OY);
    ctx.moveTo(OX, OY - 5); ctx.lineTo(OX, OY + 5);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = '600 12px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = '#ece8df';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('O', OX + 6, OY + 4);

    // Hover probe: a point, its image, and the ray they share.
    if (probe && !held && !stroke) {
      var pq = inv(probe), d1 = Math.hypot(probe[0], probe[1]);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(236,232,223,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(OX, OY);
      var far = Math.max(d1, 1 / Math.max(d1, 1e-3)), ux = probe[0] / (d1 || 1), uy = probe[1] / (d1 || 1);
      ctx.lineTo(OX + ux * Math.min(far, (W + H) / R) * R, OY + uy * Math.min(far, (W + H) / R) * R);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx(probe), sy(probe), 3.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgb(' + PINK + ')';
      ctx.beginPath();
      ctx.arc(sx(pq), sy(pq), 4, 0, TAU);
      ctx.fill();
      text = 'OP = ' + d1.toFixed(2) + ' r\nOP′ = ' + (1 / d1).toFixed(2) + ' r\nOP × OP′ = r²';
    }
    V.setText(readout, text);
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Pointer ----

  function toUnits(x, y) { return [(x - OX) / R, (y - OY) / R]; }

  function handles() {
    var o = off(), list = [];
    if (mode === 'grid') list.push(['grid', add(grid.o, o)]);
    else if (mode === 'line') list.push(['a', add(line[0], o)], ['b', add(line[1], o)]);
    else if (mode === 'circle') list.push(['c', add(circ.c, o)], ['rim', add(circ.rim, o)]);
    else if (centroid()) list.push(['move', add(centroid(), o)]);
    return list;
  }

  V.drag(canvas, {
    hit: function (x, y) {
      var list = handles(), best = null, bd = 20;
      for (var i = 0; i < list.length; i++) {
        var d = Math.hypot(sx(list[i][1]) - x, sy(list[i][1]) - y);
        if (d < bd) { bd = d; best = list[i]; }
      }
      return best ? { kind: best[0], last: toUnits(x, y) } : null;
    },
    move: function (h, x, y) {
      held = h;
      var p = toUnits(x, y), o = off(), q = [p[0] - o[0], p[1] - o[1]];
      if (h.kind === 'grid') grid.o = q;
      else if (h.kind === 'a' || h.kind === 'b') {
        var other = line[h.kind === 'a' ? 1 : 0];
        if (Math.hypot(q[0] - other[0], q[1] - other[1]) > 0.05) line[h.kind === 'a' ? 0 : 1] = q;
      } else if (h.kind === 'c') {
        circ.rim = [circ.rim[0] + q[0] - circ.c[0], circ.rim[1] + q[1] - circ.c[1]];
        circ.c = q;
      } else if (h.kind === 'rim') {
        if (Math.hypot(q[0] - circ.c[0], q[1] - circ.c[1]) > 0.05) circ.rim = q;
      } else if (h.kind === 'move') {
        var dx = p[0] - h.last[0], dy = p[1] - h.last[1];
        strokes.forEach(function (s) { s.forEach(function (pt) { pt[0] += dx; pt[1] += dy; }); });
      }
      h.last = p;
      stage.dirty = true;
    },
    end: function () {
      held = null;
      stage.dirty = true;
    }
  });

  // Freehand drawing, in draw mode, anywhere off the move handle.
  canvas.addEventListener('pointerdown', function (e) {
    if (mode !== 'draw' || held || e.button !== 0) return;
    var r = canvas.getBoundingClientRect(), o = off(), p = toUnits(e.clientX - r.left, e.clientY - r.top);
    canvas.setPointerCapture(e.pointerId);
    stroke = [[p[0] - o[0], p[1] - o[1]]];
    stage.dirty = true;
  });

  canvas.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect(), p = toUnits(e.clientX - r.left, e.clientY - r.top);
    if (stroke) {
      var o = off(), q = [p[0] - o[0], p[1] - o[1]], last = stroke[stroke.length - 1];
      if (Math.hypot(q[0] - last[0], q[1] - last[1]) * R > 2.5) stroke.push(q);
      stage.dirty = true;
    } else if (e.pointerType === 'mouse' && mode !== 'draw') {
      probe = Math.hypot(p[0], p[1]) > 0.04 ? p : null;
      stage.dirty = true;
    }
  });

  function endStroke() {
    if (!stroke) return;
    if (stroke.length > 1) strokes.push(stroke);
    stroke = null;
    stage.dirty = true;
  }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', function () { probe = null; stage.dirty = true; });

  // ---- Controls ----

  function bake(sign) {
    var o = off(), f = function (p) { p[0] += sign * o[0]; p[1] += sign * o[1]; };
    f(grid.o); f(line[0]); f(line[1]); f(circ.c); f(circ.rim);
    strokes.forEach(function (s) { s.forEach(f); });
  }

  V.segmented(V.ctl(section, 'shape'), function (v) {
    bake(1);
    mode = v;
    bake(-1);
    var drawing = v === 'draw';
    canvas.classList.toggle('is-draggable', drawing);
    canvas.classList.toggle('is-drawing', drawing);
    hint.hidden = !drawing;
    drawTools.hidden = !drawing;
    probe = null;
    if (drawing && !strokes.length) {
      // A starter doodle: a square around O, whose sides come out as four
      // circles through O, and a small ring outside that comes in.
      var sq = [[-0.5, -0.5], [0.6, -0.5], [0.6, 0.6], [-0.5, 0.6], [-0.5, -0.5]], ring = [], k;
      for (k = 0; k <= 36; k++) ring.push([1.45 + 0.22 * Math.cos(TAU * k / 36), -0.95 + 0.22 * Math.sin(TAU * k / 36)]);
      strokes = [densify(sq), ring];
      var o = off();
      strokes.forEach(function (st) { st.forEach(function (p) { p[0] -= o[0]; p[1] -= o[1]; }); });
    }
    stage.dirty = true;
  });

  driftBtn.setAttribute('aria-pressed', String(drift));
  V.toggle(driftBtn, function (on) {
    bake(1);
    drift = on;
    bake(-1);
    stage.dirty = true;
  });

  V.ctl(section, 'clear').addEventListener('click', function () {
    strokes = [];
    stage.dirty = true;
  });
})();
