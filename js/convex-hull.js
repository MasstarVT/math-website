// Convex hull: the smallest convex shape around a set of points. Gift
// wrapping swings a line around from each hull point until every point lies
// to its left (about n × h tests). Graham scan sorts by angle, then walks
// around once keeping only left turns. A rubber band shows the answer.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('convex-hull');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var shapeGroup = V.ctl(section, 'shape');

  var BW = 400, BH = 300;
  var BAND = 120;           // points along the rubber band
  var GREEN = '#7ee0a1';

  var pts = [];
  var method = 'gift';
  var shape = 'random';
  var count = 24;
  var rate = 32;
  var playing = !V.reducedMotion;
  var events = [];          // the recorded run of the chosen algorithm
  var ev = 0;               // events replayed so far
  var acc = 0;
  var hull = [];            // final hull, counterclockwise on screen
  var S = null;             // replay state
  var band = null;          // { x, y, vx, vy } arrays
  var M = null;
  var held = null;
  var dragged = false;
  var started = false;

  // ---- Geometry. y points down on screen, so flip it for "left". ----

  function cross(a, b, c) {
    return (b.x - a.x) * (a.y - c.y) - (a.y - b.y) * (c.x - a.x);
  }
  function dist2(a, b) { return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y); }

  function scatter() {
    pts = [];
    started = true;
    for (var i = 0; i < count; i++) {
      var x, y;
      if (shape === 'ring') {
        var a = Math.random() * Math.PI * 2, r = 1 - Math.random() * 0.004;
        x = BW / 2 + Math.cos(a) * r * BH * 0.44;
        y = BH / 2 + Math.sin(a) * r * BH * 0.44;
      } else if (shape === 'cloud') {
        // A bell-shaped cloud: most points crowd the middle.
        var u = Math.max(1e-9, Math.random()), v = Math.random(), m = Math.sqrt(-2 * Math.log(u));
        x = BW / 2 + m * Math.cos(2 * Math.PI * v) * BW * 0.13;
        y = BH / 2 + m * Math.sin(2 * Math.PI * v) * BH * 0.15;
      } else {
        x = 20 + Math.random() * (BW - 40);
        y = 20 + Math.random() * (BH - 40);
      }
      pts.push({ x: Math.max(8, Math.min(BW - 8, x)), y: Math.max(8, Math.min(BH - 8, y)) });
    }
    rerun(true);
  }

  // Record every orientation test the algorithm makes, so it can be replayed.
  function record() {
    var n = pts.length, out = [], i;
    if (n < 3) return { events: out, hull: pts.slice() };
    if (method === 'gift') {
      var start = 0;
      for (i = 1; i < n; i++) if (pts[i].x < pts[start].x || (pts[i].x === pts[start].x && pts[i].y < pts[start].y)) start = i;
      var h = [start], p = start, guard = 0;
      do {
        var q = p === 0 ? 1 : 0;
        for (i = 0; i < n; i++) {
          if (i === p || i === q) continue;
          var o = cross(pts[p], pts[q], pts[i]);
          out.push({ t: 'test', p: p, q: q, r: i, better: o < 0 || (o === 0 && dist2(pts[p], pts[i]) > dist2(pts[p], pts[q])) });
          if (out[out.length - 1].better) q = i;
        }
        out.push({ t: 'take', p: p, q: q });
        p = q;
        if (p !== start) h.push(p);
      } while (p !== start && ++guard < n);
      return { events: out, hull: h.map(function (k) { return pts[k]; }) };
    }
    // Graham scan from the lowest point on screen.
    var piv = 0;
    for (i = 1; i < n; i++) if (pts[i].y > pts[piv].y || (pts[i].y === pts[piv].y && pts[i].x < pts[piv].x)) piv = i;
    var order = [];
    for (i = 0; i < n; i++) if (i !== piv) order.push(i);
    var P = pts[piv];
    order.sort(function (a, b) {
      var aa = Math.atan2(P.y - pts[a].y, pts[a].x - P.x), ab = Math.atan2(P.y - pts[b].y, pts[b].x - P.x);
      return aa - ab || dist2(P, pts[a]) - dist2(P, pts[b]);
    });
    for (i = 0; i < order.length; i++) out.push({ t: 'ray', k: i, order: order, piv: piv });
    var stack = [piv, order[0]];
    out.push({ t: 'stack', s: stack.slice() });
    for (i = 1; i < order.length; i++) {
      var c = order[i];
      for (;;) {
        var a2 = stack[stack.length - 2], b2 = stack[stack.length - 1];
        var left = stack.length < 2 ? true : cross(pts[a2], pts[b2], pts[c]) > 0;
        out.push({ t: 'test', a: a2, b: b2, c: c, left: left, s: stack.slice() });
        if (left) break;
        stack.pop();
        out.push({ t: 'pop', s: stack.slice() });
        if (stack.length < 2) break;
      }
      stack.push(c);
      out.push({ t: 'stack', s: stack.slice() });
    }
    return { events: out, hull: stack.map(function (k) { return pts[k]; }) };
  }

  function rerun(animate) {
    var r = record();
    events = r.events;
    hull = r.hull;
    ev = animate && method !== 'band' ? 0 : events.length;
    acc = 0;
    S = { edges: [], tests: 0, pops: 0, last: null, rays: 0, stack: null };
    if (!animate || method === 'band') replayAll();
    if (method === 'band' && animate) resetBand();
    stage.dirty = true;
  }

  function apply(e) {
    S.last = e;
    if (e.t === 'test') S.tests++;
    if (e.t === 'take') S.edges.push([e.p, e.q]);
    if (e.t === 'ray') S.rays = e.k + 1;
    if (e.t === 'pop') S.pops++;
    if (e.s) S.stack = e.s;
  }

  function replayAll() {
    for (var i = 0; i < events.length; i++) apply(events[i]);
    S.last = null;
  }

  // ---- The rubber band ----

  function hullCenter() {
    var cx = 0, cy = 0;
    for (var i = 0; i < hull.length; i++) { cx += hull[i].x; cy += hull[i].y; }
    return { x: cx / Math.max(1, hull.length), y: cy / Math.max(1, hull.length) };
  }

  function resetBand() {
    band = { x: new Float64Array(BAND), y: new Float64Array(BAND), vx: new Float64Array(BAND), vy: new Float64Array(BAND) };
    var c = hullCenter(), R = Math.sqrt(BW * BW + BH * BH) * 0.55;
    for (var k = 0; k < BAND; k++) {
      var a = k / BAND * Math.PI * 2;
      band.x[k] = c.x + Math.cos(a) * R;
      band.y[k] = c.y + Math.sin(a) * R;
    }
  }

  // Where the ray from the middle at angle a meets the hull.
  function onHull(c, a) {
    var ux = Math.cos(a), uy = Math.sin(a), best = 0, n = hull.length;
    if (n < 2) return { x: c.x, y: c.y };
    for (var i = 0; i < n; i++) {
      var p = hull[i], q = hull[(i + 1) % n];
      var ex = q.x - p.x, ey = q.y - p.y, den = ux * ey - uy * ex;
      if (Math.abs(den) < 1e-12) continue;
      var t = ((p.x - c.x) * ey - (p.y - c.y) * ex) / den;
      var s = ((p.x - c.x) * uy - (p.y - c.y) * ux) / den;
      if (t > best && s >= -1e-9 && s <= 1 + 1e-9) best = t;
    }
    return { x: c.x + ux * best, y: c.y + uy * best };
  }

  function stepBand(dt) {
    if (!band) resetBand();
    var c = hullCenter(), moving = false;
    var h = Math.min(dt, 1 / 30), K = 90, D = 15;
    for (var k = 0; k < BAND; k++) {
      var T = onHull(c, k / BAND * Math.PI * 2);
      var ax = (T.x - band.x[k]) * K - band.vx[k] * D, ay = (T.y - band.y[k]) * K - band.vy[k] * D;
      band.vx[k] += ax * h;
      band.vy[k] += ay * h;
      band.x[k] += band.vx[k] * h;
      band.y[k] += band.vy[k] * h;
      if (Math.abs(band.vx[k]) + Math.abs(band.vy[k]) > 0.05 || Math.abs(T.x - band.x[k]) + Math.abs(T.y - band.y[k]) > 0.05) moving = true;
    }
    return moving;
  }

  function frame(dt, st) {
    if (!started) scatter();
    var moved = false;
    if (method === 'band') {
      if (playing || held) moved = stepBand(dt);
      if (!moved && playing && !held) setPlaying(false);
    } else if (playing && ev < events.length && !held) {
      acc += dt * rate;
      var m = Math.floor(acc);
      acc -= m;
      for (var k = 0; k < m && ev < events.length; k++) apply(events[ev++]);
      if (ev >= events.length) { S.last = null; setPlaying(false); }
      moved = true;
    }
    if (!moved && !st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  // ---- Drawing ----

  function layout(st) {
    var W = st.width, H = st.height, top = 72, pad = 14;
    var s = Math.min((W - pad * 2) / BW, (H - top - pad) / BH);
    return { W: W, H: H, s: s, x: (W - BW * s) / 2, y: top + (H - top - pad - BH * s) / 2 };
  }

  function X(p) { return M.x + p.x * M.s; }
  function Y(p) { return M.y + p.y * M.s; }

  function line(ctx, a, b, color, width, dash) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(X(a), Y(a));
    ctx.lineTo(X(b), Y(b));
    ctx.stroke();
    if (dash) ctx.setLineDash([]);
  }

  function drawHull(ctx, alpha) {
    if (hull.length < 2) return;
    ctx.beginPath();
    for (var i = 0; i < hull.length; i++) {
      if (i) ctx.lineTo(X(hull[i]), Y(hull[i])); else ctx.moveTo(X(hull[i]), Y(hull[i]));
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(126,224,161,' + 0.08 * alpha + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(126,224,161,' + alpha + ')';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function draw(st) {
    var ctx = st.ctx, i;
    M = layout(st);
    ctx.clearRect(0, 0, M.W, M.H);
    var done = method === 'band' || ev >= events.length;
    var onHullSet = new Set(done ? hull : []);
    var e = S.last;

    if (method === 'band') {
      if (band) {
        ctx.beginPath();
        for (var k = 0; k <= BAND; k++) {
          var bx = M.x + band.x[k % BAND] * M.s, by = M.y + band.y[k % BAND] * M.s;
          if (k) ctx.lineTo(bx, by); else ctx.moveTo(bx, by);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(126,224,161,0.07)';
        ctx.fill();
        ctx.strokeStyle = '#ff8a5c';
        ctx.lineWidth = 3.5;
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    } else if (done) {
      drawHull(ctx, 1);
    } else if (method === 'gift') {
      for (i = 0; i < S.edges.length; i++) line(ctx, pts[S.edges[i][0]], pts[S.edges[i][1]], GREEN, 2.5);
      if (e && e.t === 'test') {
        line(ctx, pts[e.p], pts[e.r], 'rgba(236,232,223,0.35)', 1.2);
        line(ctx, pts[e.p], pts[e.better ? e.r : e.q], 'rgba(126,224,161,0.85)', 1.6, [5, 4]);
      }
      for (i = 0; i < S.edges.length; i++) onHullSet.add(pts[S.edges[i][0]]);
    } else {
      // Graham: the fan of rays in sorted order, then the stack as a chain.
      var r0 = events.length ? events[0] : null;
      if (r0 && r0.t === 'ray') {
        var piv = pts[r0.piv];
        for (i = 0; i < S.rays; i++) {
          line(ctx, piv, pts[r0.order[i]], V.gradient(V.SPECTRUM, i / Math.max(1, r0.order.length - 1)), 1, null);
        }
        ctx.globalAlpha = 1;
      }
      if (S.stack) {
        for (i = 0; i + 1 < S.stack.length; i++) line(ctx, pts[S.stack[i]], pts[S.stack[i + 1]], GREEN, 2.5);
        for (i = 0; i < S.stack.length; i++) onHullSet.add(pts[S.stack[i]]);
      }
      if (e && e.t === 'test' && e.a !== undefined) {
        line(ctx, pts[e.b], pts[e.c], e.left ? 'rgba(126,224,161,0.9)' : '#ff5fa2', 2, [5, 4]);
      }
    }

    for (i = 0; i < pts.length; i++) {
      var p = pts[i], hot = onHullSet.has(p);
      ctx.fillStyle = p === held ? '#ffffff' : hot ? GREEN : '#c4c1ba';
      ctx.beginPath();
      ctx.arc(X(p), Y(p), p === held ? 6.5 : hot ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // The point being tested, and the one the line swings from.
    if (!done && e) {
      var focus = method === 'gift' ? (e.t === 'test' ? e.r : e.q) : e.t === 'test' && e.c !== undefined ? e.c : -1;
      if (focus >= 0) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(X(pts[focus]), Y(pts[focus]), 9, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    updateReadout(done);
  }

  function updateReadout(done) {
    var lines = [];
    var tests = S.tests, h = done ? hull.length : null;
    if (method === 'gift') {
      lines.push('Gift wrapping: ' + tests.toLocaleString() + ' tests');
    } else if (method === 'graham') {
      lines.push('Graham scan: ' + tests.toLocaleString() + ' tests, ' + S.pops + ' thrown out');
    } else {
      lines.push('Rubber band');
    }
    lines.push(pts.length + ' points' + (h !== null ? ', ' + h + ' on the hull' : ''));
    if (done && method === 'gift' && h) lines.push('n × h = ' + pts.length + ' × ' + h + ' = ' + (pts.length * h).toLocaleString());
    if (done && method === 'graham') lines.push('Plus sorting ' + (pts.length - 1) + ' points by angle');
    V.setText(readout, lines.join('\n'));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Pointer: drag points, click empty space to add one ----

  function nearest(x, y) {
    var bi = -1, bd = Infinity;
    for (var i = 0; i < pts.length; i++) {
      var dd = (X(pts[i]) - x) * (X(pts[i]) - x) + (Y(pts[i]) - y) * (Y(pts[i]) - y);
      if (dd < bd) { bd = dd; bi = i; }
    }
    return { i: bi, d: Math.sqrt(bd) };
  }

  V.drag(canvas, {
    hit: function (x, y) {
      if (!M) return null;
      var n = nearest(x, y);
      return n.i >= 0 && n.d < 16 ? pts[n.i] : null;
    },
    move: function (p, x, y, first) {
      dragged = !first;
      held = p;
      p.x = Math.max(4, Math.min(BW - 4, (x - M.x) / M.s));
      p.y = Math.max(4, Math.min(BH - 4, (y - M.y) / M.s));
      V.setSegmented(shapeGroup, '');
      rerun(false);
    },
    end: function () {
      held = null;
      if (method === 'band') setPlaying(true);
      stage.dirty = true;
    }
  });

  canvas.addEventListener('click', function (e) {
    if (dragged) { dragged = false; return; }
    if (!M) return;
    var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (x < M.x || y < M.y || x > M.x + BW * M.s || y > M.y + BH * M.s || nearest(x, y).d < 16) return;
    if (pts.length >= 300) return;
    pts.push({ x: (x - M.x) / M.s, y: (y - M.y) / M.s });
    V.setSegmented(shapeGroup, '');
    rerun(false);
    if (method === 'band') setPlaying(true);
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);

  playBtn.addEventListener('click', function () {
    if (!playing && (method === 'band' || ev >= events.length)) rerun(true);
    setPlaying(!playing);
  });

  V.ctl(section, 'step').addEventListener('click', function () {
    setPlaying(false);
    if (method === 'band') return;
    if (ev >= events.length) rerun(true);
    apply(events[ev++]);
    if (ev >= events.length) S.last = null;
    stage.dirty = true;
  });

  V.segmented(V.ctl(section, 'method'), function (v) {
    method = v;
    rerun(true);
    setPlaying(true);
  });

  V.segmented(shapeGroup, function (v) {
    shape = v;
    scatter();
    setPlaying(true);
  });

  V.range(V.ctl(section, 'count'), V.ctl(section, 'count-out'),
    function (v) { return String(v); },
    function (v) {
      count = v;
      if (started) { scatter(); setPlaying(true); }
    });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return Math.round(Math.pow(2, v)).toLocaleString() + ' tests / s'; },
    function (v) { rate = Math.pow(2, v); });
})();
