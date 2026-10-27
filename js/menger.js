// Menger sponge: cut a cube into 27, remove the center and the six face
// centers, and repeat on the 20 cubes left. Orthographic projection, so
// drawing the grid far-to-near along each axis is an exact painter's order.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('menger');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var nextBtn = V.ctl(section, 'next');
  var viewGroup = V.ctl(section, 'view');
  var levelInput = V.ctl(section, 'level');
  var levelOut = V.ctl(section, 'level-out');

  var MAX_LEVEL = 3;
  var TAU = Math.PI * 2;
  var LIGHT = norm([-0.6, 0.65, 0.45]);
  var DARK = [92, 30, 72], MID = [222, 80, 146], BRIGHT = [255, 200, 225];

  var grids = [];
  var level = 2;
  var trans = 1;          // 0 → 1 while the newest holes shrink away
  var yaw = 0.3, pitch = 0.5, vyaw = 0, vpitch = 0;
  var carpet = 0, carpetTarget = 0;
  var tween = null;
  var paused = V.reducedMotion;
  var drag = null;
  var cubes = offscreen();
  var blocks = offscreen();

  function offscreen() {
    var c = document.createElement('canvas');
    return { canvas: c, ctx: c.getContext('2d') };
  }

  function norm(v) {
    var l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  // A cell survives if no digit position has two or more 1s in base 3.
  function inSponge(i, j, k, L) {
    for (var s = 0; s < L; s++) {
      var ones = (i % 3 === 1 ? 1 : 0) + (j % 3 === 1 ? 1 : 0) + (k % 3 === 1 ? 1 : 0);
      if (ones >= 2) return false;
      i = (i / 3) | 0; j = (j / 3) | 0; k = (k / 3) | 0;
    }
    return true;
  }

  // cells: 1 = solid, 2 = removed in this round (still solid one round back).
  // mask: which of the six neighbors are solid, for hiding buried cubes.
  function grid(L) {
    if (grids[L]) return grids[L];
    var N = Math.pow(3, L), n3 = N * N * N;
    var cells = new Uint8Array(n3), mask = new Uint8Array(n3);
    var i, j, k, idx, cubes = 0, faces = 0;
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) for (k = 0; k < N; k++) {
      idx = (i * N + j) * N + k;
      if (inSponge(i, j, k, L)) { cells[idx] = 1; cubes++; }
      else if (L > 0 && inSponge((i / 3) | 0, (j / 3) | 0, (k / 3) | 0, L - 1)) cells[idx] = 2;
    }
    function solid(a, b, c) {
      return a >= 0 && b >= 0 && c >= 0 && a < N && b < N && c < N && cells[(a * N + b) * N + c] === 1;
    }
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) for (k = 0; k < N; k++) {
      idx = (i * N + j) * N + k;
      if (cells[idx] !== 1) continue;
      var m = (solid(i + 1, j, k) ? 1 : 0) | (solid(i - 1, j, k) ? 2 : 0) |
        (solid(i, j + 1, k) ? 4 : 0) | (solid(i, j - 1, k) ? 8 : 0) |
        (solid(i, j, k + 1) ? 16 : 0) | (solid(i, j, k - 1) ? 32 : 0);
      mask[idx] = m;
      for (var b = 0; b < 6; b++) if (!(m & (1 << b))) faces++;
    }
    grids[L] = { N: N, cells: cells, mask: mask, cubes: cubes, faces: faces };
    return grids[L];
  }

  // Images of the world axes in view space.
  function axes() {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    return [
      [cy, sy * sp, -sy * cp],
      [0, cp, sp],
      [sy, -cy * sp, cy * cp]
    ];
  }

  function shade(n, f) {
    var b = 0.5 + 0.5 * (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    var a = b < 0.6 ? DARK : MID, c = b < 0.6 ? MID : BRIGHT, t = b < 0.6 ? b / 0.6 : (b - 0.6) / 0.4;
    return 'rgb(' + Math.round((a[0] + (c[0] - a[0]) * t) * f) + ',' +
      Math.round((a[1] + (c[1] - a[1]) * t) * f) + ',' +
      Math.round((a[2] + (c[2] - a[2]) * t) * f) + ')';
  }

  // Every cube projects to the same shape, so draw one per depth shade into
  // an atlas and stamp it.
  function cubeAtlas(E, half, K) {
    var sw = spriteSize(E, 0, half), sh = spriteSize(E, 1, half);
    sizeAtlas(cubes, sw * K, sh);
    var ctx = cubes.ctx;
    var corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
    for (var v = 0; v < K; v++) {
      var ox = v * sw + sw / 2, oy = sh / 2;
      var f = K > 1 ? 0.5 + 0.5 * v / (K - 1) : 1;
      for (var a = 0; a < 3; a++) {
        var z = E[a][2];
        if (Math.abs(z) < 1e-4) continue;
        var s = z > 0 ? 1 : -1;
        var b = E[(a + 1) % 3], c = E[(a + 2) % 3];
        var fx = E[a][0] * s * half, fy = E[a][1] * s * half;
        ctx.fillStyle = shade([E[a][0] * s, E[a][1] * s, E[a][2] * s], f);
        ctx.beginPath();
        for (var q = 0; q < 4; q++) {
          var u = corners[q][0] * half, w = corners[q][1] * half;
          var px = ox + fx + b[0] * u + c[0] * w, py = oy - (fy + b[1] * u + c[1] * w);
          if (q) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
    return { canvas: cubes.canvas, sw: sw, sh: sh, K: K };
  }

  function spriteSize(E, axis, half) {
    return Math.ceil(2 * half * (Math.abs(E[0][axis]) + Math.abs(E[1][axis]) + Math.abs(E[2][axis]))) + 4;
  }

  function sizeAtlas(a, w, h) {
    if (a.canvas.width !== w || a.canvas.height !== h) {
      a.canvas.width = w;
      a.canvas.height = h;
    } else {
      a.ctx.clearRect(0, 0, w, h);
    }
  }

  // Stamp a grid of sprites far to near on each axis. Everything is in
  // device pixels. o: center x, y and depth z of the grid's cube; side: its
  // edge in pixels; zside: its edge in depth units. A cube whose three front
  // neighbors are solid is buried, so it's skipped when cull is set.
  function drawGrid(ctx, g, E, o, side, zside, src, depth, cull, shrink) {
    var N = g.N, cells = g.cells, mask = g.mask;
    var step = side / N, base = -(N - 1) / 2;
    var x0 = o.x + step * base * (E[0][0] + E[1][0] + E[2][0]);
    var y0 = o.y - step * base * (E[0][1] + E[1][1] + E[2][1]);
    var zs = zside / N;
    var z0 = o.z + zs * base * (E[0][2] + E[1][2] + E[2][2]);
    var dxi = step * E[0][0], dxj = step * E[1][0], dxk = step * E[2][0];
    var dyi = -step * E[0][1], dyj = -step * E[1][1], dyk = -step * E[2][1];
    var dzi = zs * E[0][2], dzj = zs * E[1][2], dzk = zs * E[2][2];
    var oi = E[0][2] >= 0 ? 1 : -1, oj = E[1][2] >= 0 ? 1 : -1, ok = E[2][2] >= 0 ? 1 : -1;
    var need = (Math.abs(E[0][2]) > 1e-4 ? (oi > 0 ? 1 : 2) : 0) |
      (Math.abs(E[1][2]) > 1e-4 ? (oj > 0 ? 4 : 8) : 0) |
      (Math.abs(E[2][2]) > 1e-4 ? (ok > 0 ? 16 : 32) : 0);
    var K = src.K, sw = src.sw, sh = src.sh;

    for (var a = 0; a < N; a++) {
      var i = oi > 0 ? a : N - 1 - a;
      for (var b = 0; b < N; b++) {
        var j = oj > 0 ? b : N - 1 - b;
        var row = (i * N + j) * N;
        for (var c = 0; c < N; c++) {
          var k = ok > 0 ? c : N - 1 - c;
          var cell = cells[row + k];
          if (!cell) continue;
          var s = 1;
          if (cell === 2) {
            if (shrink <= 0.01) continue;
            s = shrink;
          } else if (cull && (mask[row + k] & need) === need) continue;
          var v = 0;
          if (K > 1) {
            var z = z0 + i * dzi + j * dzj + k * dzk;
            v = Math.min(K - 1, Math.max(0, Math.floor((z - depth.min) / depth.span * K)));
          }
          var px = x0 + i * dxi + j * dxj + k * dxk;
          var py = y0 + i * dyi + j * dyj + k * dyk;
          ctx.drawImage(src.canvas, v * sw, 0, sw, sh, px - sw * s / 2, py - sh * s / 2, sw * s, sh * s);
        }
      }
    }
  }

  function frame(dt, st) {
    var moving = false;
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 1.1);
      var e = V.easeInOut(tween.t);
      yaw = tween.y0 + (tween.y1 - tween.y0) * e;
      pitch = tween.p0 + (tween.p1 - tween.p0) * e;
      if (tween.t >= 1) tween = null;
      moving = true;
    } else if (!drag && !carpetTarget) {
      if (!paused) { yaw += 0.28 * dt; moving = true; }
      if (Math.abs(vyaw) + Math.abs(vpitch) > 0.01) {
        yaw += vyaw * dt;
        pitch = clampPitch(pitch + vpitch * dt);
        var decay = Math.exp(-dt * 2.5);
        vyaw *= decay;
        vpitch *= decay;
        moving = true;
      }
    }
    if (carpet !== carpetTarget) {
      carpet = carpetTarget ? Math.min(1, carpet + dt / 1.1) : Math.max(0, carpet - dt / 0.8);
      moving = true;
    }
    if (trans < 1) {
      trans = Math.min(1, trans + dt / 0.9);
      moving = true;
    }
    if (!moving && !st.dirty && !drag) return;
    st.dirty = false;
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height, dpr = st.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, st.canvas.width, st.canvas.height);

    var E = axes();
    // Fit below the readout.
    var top = 64, fit = Math.min(W, H - top) * dpr;
    var side = fit / (1.8 - 0.7 * V.easeInOut(carpet));
    var zr = Math.abs(E[0][2]) + Math.abs(E[1][2]) + Math.abs(E[2][2]);
    var depth = { min: -zr / 2, span: Math.max(zr, 1e-6) };
    var shrink = 1 - V.easeInOut(trans);
    var center = { x: W * dpr / 2, y: (top + (H - top) / 2) * dpr, z: 0 };
    var N = Math.pow(3, level);
    // Pad each cube by most of a pixel so neighbors overlap and leave no seams.
    var half = side / N / 2 + 0.7;

    if (level < 3) {
      var src = cubeAtlas(E, half, level === 0 ? 1 : level === 1 ? 6 : 16);
      drawGrid(ctx, grid(level), E, center, side, 1, src, depth, true, shrink);
    } else {
      // Level 3 is 400 copies of a level-1 sponge, so build that block once
      // per depth shade and stamp it: about 700 stamps instead of 6,000.
      var K = 16, cube = cubeAtlas(E, half, K);
      var bside = side / 9, bw = spriteSize(E, 0, bside / 2 + 1), bh = spriteSize(E, 1, bside / 2 + 1);
      sizeAtlas(blocks, bw * K, bh);
      for (var v = 0; v < K; v++) {
        var o = { x: v * bw + bw / 2, y: bh / 2, z: depth.min + (v + 0.5) / K * depth.span };
        drawGrid(blocks.ctx, grid(1), E, o, bside, 1 / 9, cube, depth, true, shrink);
      }
      drawGrid(ctx, grid(2), E, center, side, 1, { canvas: blocks.canvas, sw: bw, sh: bh, K: K }, depth, false, 0);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateReadout(grid(level));
  }

  function fmt(n) { return n.toLocaleString('en-US'); }

  function updateReadout(g) {
    if (carpetTarget) {
      V.setText(readout, 'Round ' + level + ' · seen straight on\n' +
        'Sierpinski carpet, ' + fmt(Math.pow(8, level)) + (level === 1 ? ' square' : ' squares') + '\n' +
        'Area ' + Math.pow(8 / 9, level).toFixed(3) + ' of the square');
    } else {
      V.setText(readout, 'Round ' + level + ' · ' + fmt(g.cubes) + (g.cubes === 1 ? ' cube' : ' cubes') + '\n' +
        'Volume  ' + (g.cubes / Math.pow(27, level)).toFixed(3) + ' of the cube\n' +
        'Surface ' + (g.faces / Math.pow(9, level)).toFixed(2) + ' (the cube: 6)');
    }
  }

  function clampPitch(p) { return Math.max(-1.45, Math.min(1.45, p)); }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setLevel(n, animate) {
    n = Math.max(0, Math.min(MAX_LEVEL, n));
    trans = animate && n === level + 1 ? 0 : 1;
    level = n;
    levelInput.value = String(n);
    levelOut.textContent = String(n);
    nextBtn.textContent = n >= MAX_LEVEL ? 'Start over' : 'Cut again';
    stage.dirty = true;
  }

  levelInput.addEventListener('input', function () {
    setLevel(parseInt(levelInput.value, 10), true);
  });
  nextBtn.addEventListener('click', function () {
    setLevel(level >= MAX_LEVEL ? 0 : level + 1, true);
  });
  setLevel(level, false);

  function setView(v) {
    V.setSegmented(viewGroup, v);
    var on = v === 'carpet' ? 1 : 0;
    if (on === carpetTarget) return;
    carpetTarget = on;
    vyaw = vpitch = 0;
    if (on) {
      var q = Math.PI / 2;
      tween = { t: 0, y0: yaw, y1: Math.round(yaw / q) * q, p0: pitch, p1: 0 };
    } else {
      tween = { t: 0, y0: yaw, y1: yaw + 0.62, p0: pitch, p1: 0.5 };
    }
    stage.dirty = true;
  }
  V.segmented(viewGroup, setView);

  function setPaused(p) {
    paused = p;
    playBtn.textContent = paused ? 'Play' : 'Pause';
  }
  setPaused(paused);
  playBtn.addEventListener('click', function () { setPaused(!paused); });

  // ---- Drag to orbit ----

  canvas.addEventListener('pointerdown', function (e) {
    if (carpetTarget) setView('sponge');
    tween = null;
    drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    vyaw = vpitch = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-grabbing');
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var now = performance.now();
    var dx = (e.clientX - drag.x) * 0.008;
    var dy = (e.clientY - drag.y) * 0.008;
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
