// A hanging chain: 60 links with fixed lengths under gravity, relaxed with
// Verlet steps. It settles onto the catenary y = a·cosh((x − x₀)/a) + c, found
// from the ends and the length by solving √(L² − v²) = 2a·sinh(h/2a).
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('catenary');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var lengthInput = V.ctl(section, 'length');

  var N = 60;               // links
  var WORLD = 4;            // metres across the canvas
  var G = 9.81;
  var ITER = 40;            // constraint passes per step
  var px = new Float64Array(N + 1), py = new Float64Array(N + 1);
  var ox = new Float64Array(N + 1), oy = new Float64Array(N + 1);
  var A = { x: 0.6, y: 0.75 }, B = { x: 3.4, y: 0.75 };
  var L = 4.4;
  var rest = L / N;
  var arch = false;         // gravity points up the screen
  var showCosh = true, showPar = true;
  var held = null;          // { end: A|B } or { node: i }
  var hx = 0, hy = 0;       // where a held inner link is pulled to
  var s = 1, worldH = 3;
  var floorHit = false;
  var started = false;

  // ---- The exact curves, in "down" units u (along gravity) ----

  function u(y) { return arch ? -y : y; }

  // Catenary through (0, 0) and (h, v) with length len, v measured against
  // gravity: up = a·cosh((x − x0)/a) + c.
  function catenary(h, v, len) {
    var target = Math.sqrt(Math.max(len * len - v * v, 1e-9));
    var lo = Math.log(1e-3), hi = Math.log(1e3);
    for (var i = 0; i < 70; i++) {
      var m = (lo + hi) / 2, a = Math.exp(m), z = h / (2 * a);
      var f = z > 600 ? Infinity : 2 * a * Math.sinh(z);
      if (f > target) lo = m; else hi = m;
    }
    a = Math.exp((lo + hi) / 2);
    var x0 = h / 2 - a * Math.atanh(Math.max(-0.999999, Math.min(0.999999, v / len)));
    return { a: a, x0: x0, c: -a * Math.cosh(-x0 / a) };
  }

  // Parabola up = k(x − p)² + q through the same ends with the same length.
  function parabolaLength(k, h, v) {
    var p = h / 2 - v / (2 * k * h), u1 = -2 * k * p, u2 = 2 * k * (h - p);
    function F(w) { return w * Math.sqrt(1 + w * w) + Math.asinh(w); }
    return (F(u2) - F(u1)) / (4 * k);
  }
  function parabola(h, v, len) {
    var lo = Math.log(1e-4), hi = Math.log(1e4);
    for (var i = 0; i < 70; i++) {
      var m = (lo + hi) / 2;
      if (parabolaLength(Math.exp(m), h, v) < len) lo = m; else hi = m;
    }
    var k = Math.exp((lo + hi) / 2), p = h / 2 - v / (2 * k * h);
    return { k: k, p: p, q: -k * p * p };
  }

  // ---- Simulation ----

  // Hang the chain as a V from the two ends, then let it go.
  function drop() {
    var h = B.x - A.x, dy = B.y - A.y;
    var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    var half = L / 2, chord = Math.hypot(h, dy) / 2;
    var deep = Math.sqrt(Math.max(half * half - chord * chord, 0)) * (arch ? -1 : 1);
    for (var i = 0; i <= N; i++) {
      var f = i / N, x, y;
      if (f < 0.5) { x = A.x + (mx - A.x) * f * 2; y = A.y + (my + deep - A.y) * f * 2; }
      else { x = mx + (B.x - mx) * (f - 0.5) * 2; y = my + deep + (B.y - my - deep) * (f - 0.5) * 2; }
      px[i] = ox[i] = x;
      py[i] = oy[i] = y;
    }
  }

  function step(h) {
    var g = (arch ? -G : G) * h * h, i, k;
    for (i = 1; i < N; i++) {
      var vx = (px[i] - ox[i]) * 0.992, vy = (py[i] - oy[i]) * 0.992;
      ox[i] = px[i];
      oy[i] = py[i];
      px[i] += vx;
      py[i] += vy + g;
    }
    px[0] = A.x; py[0] = A.y; px[N] = B.x; py[N] = B.y;
    var heldNode = held && held.node !== undefined ? held.node : -1;
    if (heldNode > 0) { px[heldNode] = hx; py[heldNode] = hy; }
    var bottom = worldH - 0.06, top = 0.06;
    floorHit = false;
    for (k = 0; k < ITER; k++) {
      // Sweep both ways so neither end is favored.
      var fwd = k % 2 === 0;
      for (var j = 0; j < N; j++) {
        i = fwd ? j : N - 1 - j;
        var dx = px[i + 1] - px[i], dy = py[i + 1] - py[i];
        var d = Math.sqrt(dx * dx + dy * dy) || 1e-9;
        var diff = (d - rest) / d;
        var pinA = i === 0 || i === heldNode, pinB = i + 1 === N || i + 1 === heldNode;
        if (pinA && pinB) continue;
        var wa = pinA ? 0 : pinB ? 1 : 0.5, wb = pinB ? 0 : pinA ? 1 : 0.5;
        px[i] += dx * diff * wa; py[i] += dy * diff * wa;
        px[i + 1] -= dx * diff * wb; py[i + 1] -= dy * diff * wb;
      }
      for (i = 1; i < N; i++) {
        if (py[i] > bottom) { py[i] = bottom; floorHit = true; }
        if (py[i] < top) { py[i] = top; floorHit = true; }
      }
    }
  }

  function measured() {
    var len = 0;
    for (var i = 0; i < N; i++) len += Math.hypot(px[i + 1] - px[i], py[i + 1] - py[i]);
    return len;
  }

  // ---- Drawing ----

  function curve(ctx, fn) {
    ctx.beginPath();
    for (var i = 0; i <= 120; i++) {
      var x = A.x + (B.x - A.x) * i / 120;
      var y = fn(x - A.x);
      if (i) ctx.lineTo(x * s, y * s); else ctx.moveTo(x * s, y * s);
    }
    ctx.stroke();
  }

  function frame(dt, st) {
    var W = st.width, H = st.height, ctx = st.ctx;
    s = W / WORLD;
    worldH = H / s;
    if (!started) { started = true; fitEnds(); drop(); }
    var sub = 3, h = Math.min(dt, 1 / 30) / sub || 1 / 180;
    for (var k = 0; k < sub; k++) step(h);

    ctx.clearRect(0, 0, W, H);

    // The exact curves for the chain's actual length.
    var len = measured();
    var hspan = B.x - A.x, up = -(u(B.y) - u(A.y));
    var C = catenary(hspan, up, len), P = parabola(hspan, up, len);
    function cosh(x) { return A.y - (arch ? -1 : 1) * (C.a * Math.cosh((x - C.x0) / C.a) + C.c); }
    function para(x) { return A.y - (arch ? -1 : 1) * (P.k * (x - P.p) * (x - P.p) + P.q); }

    var dC = 0, dP = 0;
    for (var i = 1; i < N; i++) {
      var x = px[i] - A.x;
      dC = Math.max(dC, Math.abs(py[i] - cosh(x)));
      dP = Math.max(dP, Math.abs(py[i] - para(x)));
    }

    // Ground under an arch's feet.
    if (arch) {
      ctx.fillStyle = 'rgba(236,232,223,0.05)';
      ctx.fillRect(0, Math.max(A.y, B.y) * s + 6, W, H);
      ctx.strokeStyle = 'rgba(236,232,223,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.max(A.y, B.y) * s + 6.5);
      ctx.lineTo(W, Math.max(A.y, B.y) * s + 6.5);
      ctx.stroke();
    }

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (showPar) {
      ctx.strokeStyle = '#ffb454';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 6]);
      curve(ctx, para);
      ctx.setLineDash([]);
    }
    if (showCosh) {
      ctx.strokeStyle = 'rgba(255,95,162,0.9)';
      ctx.lineWidth = 10;
      ctx.globalAlpha = 0.42;
      curve(ctx, cosh);
      ctx.globalAlpha = 1;
    }

    // The chain: alternating links, or stone blocks for an arch.
    for (i = 0; i < N; i++) {
      var ax = px[i] * s, ay = py[i] * s, bx = px[i + 1] * s, by = py[i + 1] * s;
      if (arch) {
        var ang = Math.atan2(by - ay, bx - ax), seg = Math.hypot(bx - ax, by - ay);
        ctx.save();
        ctx.translate((ax + bx) / 2, (ay + by) / 2);
        ctx.rotate(ang);
        ctx.fillStyle = i % 2 ? '#8d8676' : '#a39b89';
        ctx.fillRect(-seg / 2 - 0.4, -6, seg + 0.8, 12);
        ctx.strokeStyle = '#0d0f16';
        ctx.lineWidth = 1;
        ctx.strokeRect(-seg / 2, -6, seg, 12);
        ctx.restore();
      } else {
        ctx.strokeStyle = i % 2 ? '#c9c4b8' : '#ece8df';
        ctx.lineWidth = i % 2 ? 2 : 4;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }

    // The two ends you can drag.
    [A, B].forEach(function (e) {
      ctx.fillStyle = '#0d0f16';
      ctx.strokeStyle = held && held.end === e ? '#ffffff' : 'rgba(236,232,223,0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(e.x * s, e.y * s, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    var lines = ['Chain ' + L.toFixed(2) + ' m, ends ' + Math.hypot(B.x - A.x, B.y - A.y).toFixed(2) + ' m apart'];
    if (floorHit) lines.push(arch ? 'The arch hits the top: shorten it' : 'Resting on the floor: shorten it');
    else if (held && held.node !== undefined) lines.push('Let go to see it settle');
    else {
      lines.push('Off the cosh curve by up to ' + gap(dC));
      lines.push('Off the parabola by up to ' + gap(dP));
    }
    V.setText(readout, lines.join('\n'));
  }

  function gap(m) { return m < 0.01 ? (m * 1000).toFixed(1) + ' mm' : (m * 100).toFixed(1) + ' cm'; }

  // Keep the ends on screen, clear of the readout, with room for the chain.
  function clampEnd(e) {
    var lo = arch ? worldH * 0.4 : Math.max(0.62, 100 / s), hi = arch ? worldH - 0.3 : worldH * 0.6;
    e.x = Math.max(0.2, Math.min(WORLD - 0.2, e.x));
    e.y = Math.max(lo, Math.min(hi, e.y));
  }

  function fitEnds() {
    clampEnd(A);
    clampEnd(B);
    if (B.x - A.x < 0.3) {
      var mid = (A.x + B.x) / 2;
      A.x = mid - 0.15;
      B.x = mid + 0.15;
    }
    var span = Math.hypot(B.x - A.x, B.y - A.y), max = L * 0.97;
    if (span > max) {
      var f = max / span, cx = (A.x + B.x) / 2, cy = (A.y + B.y) / 2;
      A.x = cx + (A.x - cx) * f; A.y = cy + (A.y - cy) * f;
      B.x = cx + (B.x - cx) * f; B.y = cy + (B.y - cy) * f;
    }
  }

  V.createStage(canvas, { frame: frame });

  // ---- Drag the ends, or grab a link ----

  V.drag(canvas, {
    hit: function (x, y) {
      if (Math.hypot(x - A.x * s, y - A.y * s) < 22) return { end: A };
      if (Math.hypot(x - B.x * s, y - B.y * s) < 22) return { end: B };
      var best = -1, bd = 16;
      for (var i = 1; i < N; i++) {
        var d = Math.hypot(x - px[i] * s, y - py[i] * s);
        if (d < bd) { bd = d; best = i; }
      }
      return best > 0 ? { node: best } : null;
    },
    move: function (h, x, y) {
      held = h;
      if (h.end) {
        var e = h.end, o = e === A ? B : A;
        e.x = x / s;
        e.y = y / s;
        clampEnd(e);
        // A stays left of B, and the ends can't be pulled further apart than the chain allows.
        if (e === A) A.x = Math.min(A.x, B.x - 0.3); else B.x = Math.max(B.x, A.x + 0.3);
        var dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy), max = L * 0.97;
        if (d > max) { e.x = o.x + dx / d * max; e.y = o.y + dy / d * max; }
      } else {
        hx = Math.max(0.05, Math.min(WORLD - 0.05, x / s));
        hy = Math.max(0.06, Math.min(worldH - 0.06, y / s));
      }
    },
    end: function () { held = null; }
  });

  // ---- Controls ----

  V.range(lengthInput, V.ctl(section, 'length-out'),
    function (v) { return v.toFixed(1) + ' m'; },
    function (v) {
      L = v;
      rest = L / N;
      if (started) fitEnds();
    });

  V.ctl(section, 'drop').addEventListener('click', function () { drop(); });

  V.toggle(V.ctl(section, 'arch'), function (on) {
    arch = on;
    // Mirror everything top to bottom, so the chain becomes its own arch.
    [A, B].forEach(function (e) { e.y = worldH - e.y; });
    for (var i = 0; i <= N; i++) { py[i] = worldH - py[i]; oy[i] = worldH - oy[i]; }
    fitEnds();
  });
  V.toggle(V.ctl(section, 'cosh'), function (on) { showCosh = on; });
  V.toggle(V.ctl(section, 'parabola'), function (on) { showPar = on; });
})();
