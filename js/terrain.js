// Fractal mountains by the diamond-square algorithm: each round sets the
// midpoints of every square and diamond to the average of their corners plus
// a random bump, and the bumps shrink by the roughness factor each round.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('terrain');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var roundsInput = V.ctl(section, 'rounds');
  var roundsOut = V.ctl(section, 'rounds-out');
  var seaBtn = V.ctl(section, 'sea');

  var MAX_ROUNDS = 6;
  var S = 1 << MAX_ROUNDS;       // 64 squares a side at full detail
  var S1 = S + 1;
  var HEIGHT = 0.42;             // world units per unit of height
  var BASE = -0.42;              // bottom of the slab
  var FLOOR = (BASE + 0.12) / HEIGHT;
  var SUN = norm([-0.55, 0.7, -0.45]);
  var TAU = Math.PI * 2;

  var seed = 7;
  var rnd = null;
  var rough = 0.55;
  var rounds = MAX_ROUNDS;
  var morph = 1;                 // how much of the newest round's bumps are in
  var build = null;              // step-by-step animation state
  var sea = true;
  var seaLevel = 0;
  var maxH = 1;
  var h = new Float32Array(S1 * S1);
  var colors = [];
  var dirty = true;

  var yaw = 0.7, pitch = 0.62, vyaw = 0, vpitch = 0;
  var paused = V.reducedMotion;
  var drag = null;
  // Screen points: the grid, then room for one wall at a time.
  var px = new Float32Array(S1 * S1 + S1 * 4), py = new Float32Array(S1 * S1 + S1 * 4);

  function norm(v) {
    var l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  function mulberry(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // One random number per grid point, so changing the roughness or the
  // number of rounds reshapes the same mountains instead of new ones.
  function reseed() {
    var r = mulberry(seed * 7919 + 13);
    rnd = new Float32Array(S1 * S1);
    for (var i = 0; i < rnd.length; i++) rnd[i] = r() * 2 - 1;
  }

  function diamondSquare(n, last) {
    var amp = 1;
    [0, S, S * S1, S * S1 + S].forEach(function (c) { h[c] = rnd[c] * 0.5; });
    for (var r = 1, step = S; r <= n; r++, step >>= 1) {
      var half = step >> 1, k = r === n ? last * amp : amp, x, y;
      for (y = half; y < S1; y += step) {
        for (x = half; x < S1; x += step) {
          h[y * S1 + x] = (h[(y - half) * S1 + x - half] + h[(y - half) * S1 + x + half] +
            h[(y + half) * S1 + x - half] + h[(y + half) * S1 + x + half]) / 4 + rnd[y * S1 + x] * k;
        }
      }
      for (y = 0; y < S1; y += half) {
        for (x = (y / half) % 2 ? 0 : half; x < S1; x += step) {
          var s = 0, c = 0;
          if (y >= half) { s += h[(y - half) * S1 + x]; c++; }
          if (y + half < S1) { s += h[(y + half) * S1 + x]; c++; }
          if (x >= half) { s += h[y * S1 + x - half]; c++; }
          if (x + half < S1) { s += h[y * S1 + x + half]; c++; }
          h[y * S1 + x] = s / c + rnd[y * S1 + x] * k;
        }
      }
      amp *= rough;
    }
  }

  // Sea level and the top of the color scale come from the finished
  // mountains, so they don't jump while a round grows in.
  function calibrate() {
    diamondSquare(MAX_ROUNDS, 1);
    var sorted = Array.prototype.slice.call(h).sort(function (a, b) { return a - b; });
    seaLevel = sorted[Math.floor(sorted.length * 0.3)];
    maxH = sorted[sorted.length - 1];
  }

  var STOPS = [
    [0, [205, 188, 140]],
    [0.05, [118, 160, 92]],
    [0.3, [64, 118, 76]],
    [0.55, [118, 108, 98]],
    [0.75, [150, 142, 134]],
    [0.86, [236, 232, 223]],
    [1, [250, 248, 244]]
  ];

  function ramp(t) {
    t = Math.max(0, Math.min(1, t));
    for (var i = 1; i < STOPS.length; i++) {
      if (t <= STOPS[i][0]) {
        var a = STOPS[i - 1], b = STOPS[i], f = (t - a[0]) / (b[0] - a[0]);
        return [a[1][0] + (b[1][0] - a[1][0]) * f, a[1][1] + (b[1][1] - a[1][1]) * f, a[1][2] + (b[1][2] - a[1][2]) * f];
      }
    }
    return STOPS[STOPS.length - 1][1];
  }

  function rebuild() {
    if (!rnd) { reseed(); calibrate(); }
    diamondSquare(rounds, morph);
    var n = 1 << rounds, st = S / n, cell = 2 / n;
    colors.length = n * n;
    for (var j = 0; j < n; j++) {
      for (var i = 0; i < n; i++) {
        var a = h[(j * st) * S1 + i * st], b = h[(j * st) * S1 + (i + 1) * st];
        var c = h[((j + 1) * st) * S1 + i * st], d = h[((j + 1) * st) * S1 + (i + 1) * st];
        var avg = (a + b + c + d) / 4, rgb;
        if (sea && Math.max(a, b, c, d) <= seaLevel) {
          var deep = Math.min(1, (seaLevel - avg) / 0.5);
          rgb = [52 - 26 * deep, 110 - 52 * deep, 150 - 50 * deep];
        } else {
          var top = sea ? seaLevel : -maxH;
          var col = ramp((avg - top) / (maxH - top));
          var dx = ((b + d) - (a + c)) / 2 * HEIGHT / cell, dz = ((c + d) - (a + b)) / 2 * HEIGHT / cell;
          var nl = Math.hypot(dx, 1, dz);
          var light = Math.max(0, (-dx * SUN[0] + SUN[1] - dz * SUN[2]) / nl);
          var f = 0.32 + 0.8 * light;
          rgb = [col[0] * f, col[1] * f, col[2] * f];
        }
        colors[j * n + i] = rgba(Math.round(Math.min(255, rgb[0])), Math.round(Math.min(255, rgb[1])),
          Math.round(Math.min(255, rgb[2])));
      }
    }
    dirty = false;
  }

  function height(idx) {
    var v = h[idx];
    return Math.max(sea && v < seaLevel ? seaLevel : v, FLOOR) * HEIGHT;
  }

  function frame(dt, st) {
    var moving = false;
    if (build) {
      build.t += dt;
      morph = Math.min(1, build.t / 0.7);
      if (build.t > 0.95) {
        if (!build.once && rounds < MAX_ROUNDS) {
          rounds++;
          morph = 0;
          build.t = 0;
          syncRounds();
        } else {
          build = null;
          morph = 1;
        }
      }
      dirty = true;
    }
    if (!drag) {
      if (!paused) { yaw += 0.12 * dt; moving = true; }
      if (Math.abs(vyaw) + Math.abs(vpitch) > 0.01) {
        yaw += vyaw * dt;
        pitch = clampPitch(pitch + vpitch * dt);
        var decay = Math.exp(-dt * 2.5);
        vyaw *= decay;
        vpitch *= decay;
        moving = true;
      }
    }
    if (dirty) { rebuild(); moving = true; }
    if (drag || moving || st.dirty) {
      st.dirty = false;
      lastMove = performance.now();
      sharp = false;
      draw(st, Math.min(st.dpr, 1.5));
    } else if (!sharp && st.dpr > 1.5 && performance.now() - lastMove > 200) {
      // Once it stops, draw again at full resolution.
      sharp = true;
      draw(st, st.dpr);
    }
  }

  // The 4,096 flat-shaded squares are filled by hand into an image, which
  // is much faster than as many canvas paths. Painter's order, no depth buffer.
  var raster = document.createElement('canvas');
  var rctx = raster.getContext('2d');
  var image = null, pix = null, bw = 0, bh = 0;
  var lastMove = 0, sharp = false;

  function tri(ax, ay, bx, by, cx, cy, col) {
    var t;
    if (ay > by) { t = ax; ax = bx; bx = t; t = ay; ay = by; by = t; }
    if (by > cy) { t = bx; bx = cx; cx = t; t = by; by = cy; cy = t; }
    if (ay > by) { t = ax; ax = bx; bx = t; t = ay; ay = by; by = t; }
    if (cy - ay < 1e-9) return;
    var kac = (cx - ax) / (cy - ay);
    var kab = by > ay ? (bx - ax) / (by - ay) : 0;
    var kbc = cy > by ? (cx - bx) / (cy - by) : 0;
    var y0 = Math.max(0, Math.ceil(ay - 0.5)), y1 = Math.min(bh, Math.ceil(cy - 0.5));
    for (var y = y0; y < y1; y++) {
      var yc = y + 0.5;
      var xa = ax + (yc - ay) * kac;
      var xb = yc < by ? ax + (yc - ay) * kab : bx + (yc - by) * kbc;
      if (xa > xb) { t = xa; xa = xb; xb = t; }
      var x0 = Math.max(0, Math.ceil(xa - 0.5)), x1 = Math.min(bw, Math.ceil(xb - 0.5));
      for (var x = y * bw + x0, end = y * bw + x1; x < end; x++) pix[x] = col;
    }
  }

  function quad(a, b, c, d, col) {
    tri(px[a], py[a], px[b], py[b], px[c], py[c], col);
    tri(px[a], py[a], px[c], py[c], px[d], py[d], col);
  }

  function draw(st, q) {
    var ctx = st.ctx, W = st.width, H = st.height;
    var w = Math.round(W * q), hh = Math.round(H * q);
    if (!image || bw !== w || bh !== hh) {
      bw = raster.width = w;
      bh = raster.height = hh;
      image = rctx.createImageData(bw, bh);
      pix = new Uint32Array(image.data.buffer);
    }
    pix.fill(0);

    var n = 1 << rounds, stp = S / n, n1 = n + 1;
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var D = 3.3, view = framing(W, H, cp, sp, D);
    var f = view.f * q, ox = view.x * q, oy = view.y * q;

    function project(x, y, z, k) {
      var x1 = x * cy - z * sy, z1 = x * sy + z * cy;
      var d = D - (y * sp + z1 * cp);
      px[k] = ox + f * x1 / d;
      py[k] = oy - f * (y * cp - z1 * sp) / d;
    }
    var i, j, a, b;
    for (j = 0; j <= n; j++) {
      for (i = 0; i <= n; i++) project(-1 + 2 * i / n, height((j * stp) * S1 + i * stp), -1 + 2 * j / n, j * n1 + i);
    }

    // Squares far to near, measured from the eye's spot over the grid.
    var ex = sy * D * cp, ez = cy * D * cp;
    var gi = (ex + 1) / 2 * n, gj = (ez + 1) / 2 * n;
    var oi = order(n, gi), oj = order(n, gj);
    for (b = 0; b < n; b++) {
      j = oj[b];
      for (a = 0; a < n; a++) {
        i = oi[a];
        var p = j * n1 + i;
        quad(p, p + 1, p + n1 + 1, p + n1, colors[j * n + i]);
      }
    }

    // The sides of the slab that face us, drawn last because they're nearest.
    var base = n1 * n1;
    if (gj > n) wall(0, n, 1, 0, n, stp, project, base);
    if (gj < 0) wall(0, 0, 1, 0, n, stp, project, base);
    if (gi > n) wall(n, 0, 0, 1, n, stp, project, base);
    if (gi < 0) wall(0, 0, 0, 1, n, stp, project, base);

    rctx.putImageData(image, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(raster, 0, 0, W, H);

    V.setText(readout, 'Round ' + rounds + ' · ' + (n * n).toLocaleString('en-US') +
      (n * n === 1 ? ' square' : ' squares') + '\nBumps shrink × ' + rough.toFixed(2) + ' a round\n' +
      'Surface dimension ≈ ' + (3 - Math.min(1, -Math.log(rough) / Math.LN2)).toFixed(2));
  }

  // Scale and center so the slab fits at every turn for this tilt: project
  // its corners, top and bottom, over a full turn.
  function framing(W, H, cp, sp, D) {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    var top = Math.max(maxH, seaLevel) * HEIGHT;
    for (var a = 0; a < 16; a++) {
      var cy = Math.cos(a * Math.PI / 8), sy = Math.sin(a * Math.PI / 8);
      for (var c = 0; c < 4; c++) {
        var x = c & 1 ? 1 : -1, z = c & 2 ? 1 : -1;
        var x1 = x * cy - z * sy, z1 = x * sy + z * cy;
        for (var k = 0; k < 2; k++) {
          var y = k ? top : BASE, d = D - (y * sp + z1 * cp);
          var px = x1 / d, py = -(y * cp - z1 * sp) / d;
          if (px < minX) minX = px; if (px > maxX) maxX = px;
          if (py < minY) minY = py; if (py > maxY) maxY = py;
        }
      }
    }
    var f = Math.min((W - 20) / (maxX - minX), (H - 20) / (maxY - minY));
    return { f: f, x: W / 2 - f * (minX + maxX) / 2, y: H / 2 - f * (minY + maxY) / 2 };
  }

  var EARTH = rgba(96, 80, 64), DEEP = rgba(40, 34, 28), WATER = rgba(44, 102, 146);

  function rgba(r, g, b) { return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; }

  // Walk one edge of the grid from (i0, j0) in steps (di, dj). Wall points
  // go after the grid's own points in px/py: top, sea line, a stratum, base.
  function wall(i0, j0, di, dj, n, stp, project, base) {
    for (var k = 0; k <= n; k++) {
      var i = i0 + di * k, j = j0 + dj * k;
      var x = -1 + 2 * i / n, z = -1 + 2 * j / n, v = Math.max(h[(j * stp) * S1 + i * stp], FLOOR) * HEIGHT;
      var top = sea ? Math.max(v, seaLevel * HEIGHT) : v;
      project(x, top, z, base + k * 4);
      project(x, v, z, base + k * 4 + 1);
      project(x, Math.min(v, top) - 0.09, z, base + k * 4 + 2);
      project(x, BASE, z, base + k * 4 + 3);
    }
    for (k = 0; k < n; k++) {
      var p = base + k * 4, q = p + 4;
      quad(p + 1, q + 1, q + 2, p + 2, EARTH);
      quad(p + 2, q + 2, q + 3, p + 3, DEEP);
      if (sea) quad(p, q, q + 1, p + 1, WATER);
    }
  }

  // Cell indices sorted farthest first from grid coordinate g.
  var orders = {};
  function order(n, g) {
    var key = n + ':' + (g < 0 ? 'a' : g > n ? 'b' : Math.floor(g));
    if (orders[key]) return orders[key];
    var o = [];
    for (var i = 0; i < n; i++) o.push(i);
    o.sort(function (a, b) { return Math.abs(b + 0.5 - g) - Math.abs(a + 0.5 - g); });
    orders[key] = o;
    return o;
  }

  function clampPitch(p) { return Math.max(0.25, Math.min(1.35, p)); }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function syncRounds() {
    roundsInput.value = String(rounds);
    var n = 1 << rounds;
    roundsOut.textContent = rounds + ' (' + (n * n).toLocaleString('en-US') + ' squares)';
  }

  roundsInput.addEventListener('input', function () {
    build = null;
    var r = parseInt(roundsInput.value, 10);
    morph = r === rounds + 1 ? 0 : 1;
    rounds = r;
    syncRounds();
    if (morph < 1) build = { t: 0, once: true };
    dirty = true;
  });
  syncRounds();

  V.range(V.ctl(section, 'rough'), V.ctl(section, 'rough-out'),
    function (v) { return '× ' + v.toFixed(2); },
    function (v) {
      rough = v;
      if (rnd) calibrate();
      dirty = true;
    });

  V.toggle(seaBtn, function (on) { sea = on; dirty = true; });

  V.ctl(section, 'new').addEventListener('click', function () {
    seed = (seed * 48271 + 11) % 2147483647;
    reseed();
    calibrate();
    dirty = true;
  });

  V.ctl(section, 'build').addEventListener('click', function () {
    rounds = 1;
    morph = 0;
    build = { t: 0 };
    syncRounds();
    dirty = true;
  });

  function setPaused(p) {
    paused = p;
    playBtn.textContent = paused ? 'Play' : 'Pause';
  }
  setPaused(paused);
  playBtn.addEventListener('click', function () { setPaused(!paused); });

  // ---- Drag to orbit ----

  canvas.addEventListener('pointerdown', function (e) {
    drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    vyaw = vpitch = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-grabbing');
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var now = performance.now();
    var dx = (e.clientX - drag.x) * 0.008;
    var dy = (e.clientY - drag.y) * 0.006;
    var dts = Math.max((now - drag.t) / 1000, 0.008);
    yaw = (yaw + dx) % TAU;
    pitch = clampPitch(pitch + dy);
    vyaw = vyaw * 0.5 + (dx / dts) * 0.5;
    vpitch = vpitch * 0.5 + (dy / dts) * 0.5;
    drag = { x: e.clientX, y: e.clientY, t: now };
    stage.dirty = true;
  });

  function endDrag() {
    if (!drag) return;
    if (performance.now() - drag.t > 80) vyaw = vpitch = 0;
    drag = null;
    canvas.classList.remove('is-grabbing');
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
})();
