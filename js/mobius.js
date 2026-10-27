// Möbius strip: P(t, s) = ((1 + s cos(t/2)) cos t, (1 + s cos(t/2)) sin t, s sin(t/2)),
// and P(t + 2π, s) = P(t, −s), so the other "side" is the same side. Pieces cut at
// s = 0 or s = ±w/3 use the same formula, so they pull apart without crossing.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('mobius');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var cutGroup = V.ctl(section, 'cut');
  var antBtn = V.ctl(section, 'ant');
  var edgeBtn = V.ctl(section, 'edge');
  var playBtn = V.ctl(section, 'play');

  var TAU = Math.PI * 2;
  var HW = 0.42;           // half the strip's width; the center circle has radius 1
  var NT = 72, NS = 4;     // quads around and across
  var D = 6;               // eye distance for perspective
  var CYAN = [110, 231, 255], AMBER = [255, 180, 84], DARK = [16, 20, 32];
  var LOOP = [[110, 231, 255], [167, 139, 250], [255, 95, 162], [255, 180, 84], [110, 231, 255]];

  var yaw = 0.5, pitch = 0.62, vyaw = 0;
  var playing = !V.reducedMotion;
  var showAnt = true, showEdge = false;
  var ant = 0;             // distance walked along the center line, 0..4π
  var paint = new Uint8Array(NT * 2);
  // Start the ant part of the way round, with its trail already painted.
  for (; ant < 2.4; ant += TAU / NT) paint[Math.floor(ant / TAU * NT)] = 1;
  var mode = 'whole';
  var cutT = 1, sepT = 1;
  var pulse = 0;
  var drag = null;

  var items = [];          // quads and overlays, sorted back to front each frame
  var used = 0;
  var cam = { cx: 0, cy: 0, unit: 1 };
  var trig = {};

  function P(u, s, out) {
    var r = 1 + s * Math.cos(u / 2);
    out[0] = r * Math.cos(u);
    out[1] = r * Math.sin(u);
    out[2] = s * Math.sin(u / 2);
    return out;
  }

  // World (z up) to camera space: x right, y into the screen, z up.
  function toCam(p, out) {
    var x = p[0] * trig.cy - p[1] * trig.sy, y = p[0] * trig.sy + p[1] * trig.cy, z = p[2];
    out[0] = x;
    out[1] = y * trig.cp - z * trig.sp;
    out[2] = y * trig.sp + z * trig.cp;
    return out;
  }

  function screen(c, out) {
    var k = D / (D + c[1]);
    out[0] = cam.cx + c[0] * k * cam.unit;
    out[1] = cam.cy - c[2] * k * cam.unit;
    return out;
  }

  function item() {
    var it = items[used];
    if (!it) { it = { pts: [0, 0, 0, 0, 0, 0, 0, 0], extra: null }; items[used] = it; }
    used++;
    it.extra = null;
    return it;
  }

  var tmpW = [0, 0, 0], tmpC = [0, 0, 0], tmpS = [0, 0];

  // A grid of quads over (u, s); fn(i, j) gives the quad's color.
  function grid(nu, nv, u0, u1, s0, s1, tag, colorFn) {
    var verts = [], i, j;
    for (i = 0; i <= nu; i++) {
      for (j = 0; j <= nv; j++) {
        var u = u0 + (u1 - u0) * i / nu, s = s0 + (s1 - s0) * j / nv;
        toCam(P(u, s, tmpW), tmpC);
        screen(tmpC, tmpS);
        verts.push(tmpC[0], tmpC[1], tmpC[2], tmpS[0], tmpS[1]);
      }
    }
    var L = [-0.35, -0.75, 0.55], ll = Math.hypot(L[0], L[1], L[2]);
    for (i = 0; i < nu; i++) {
      for (j = 0; j < nv; j++) {
        var a = (i * (nv + 1) + j) * 5, b = ((i + 1) * (nv + 1) + j) * 5;
        var c = b + 5, d = a + 5;
        // Normal from the two diagonals, in camera space.
        var ex = verts[c] - verts[a], ey = verts[c + 1] - verts[a + 1], ez = verts[c + 2] - verts[a + 2];
        var fx = verts[d] - verts[b], fy = verts[d + 1] - verts[b + 1], fz = verts[d + 2] - verts[b + 2];
        var nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
        var nl = Math.hypot(nx, ny, nz) || 1;
        var side = ny < 0 ? 0 : 1;
        var bright = 0.22 + 0.78 * Math.abs((nx * L[0] + ny * L[1] + nz * L[2]) / (nl * ll));
        var it = item();
        it.type = 0;
        it.depth = (verts[a + 1] + verts[b + 1] + verts[c + 1] + verts[d + 1]) / 4;
        // Grow each quad by half a pixel so neighbors overlap and no seams show.
        var p = it.pts, mx = (verts[a + 3] + verts[b + 3] + verts[c + 3] + verts[d + 3]) / 4;
        var my = (verts[a + 4] + verts[b + 4] + verts[c + 4] + verts[d + 4]) / 4;
        var corner = [a, b, c, d];
        for (var q = 0; q < 4; q++) {
          var vx = verts[corner[q] + 3] - mx, vy = verts[corner[q] + 4] - my, vl = Math.hypot(vx, vy) || 1;
          p[q * 2] = verts[corner[q] + 3] + vx / vl * 0.5;
          p[q * 2 + 1] = verts[corner[q] + 4] + vy / vl * 0.5;
        }
        it.fill = colorFn(i, j, side, bright);
        it.tag = tag;
        it.i = i;
        it.j = j;
        it.side = side;
      }
    }
  }

  function mix(base, b, alpha) {
    var r = Math.round(DARK[0] + (base[0] - DARK[0]) * b);
    var g = Math.round(DARK[1] + (base[1] - DARK[1]) * b);
    var bl = Math.round(DARK[2] + (base[2] - DARK[2]) * b);
    return alpha == null ? 'rgb(' + r + ',' + g + ',' + bl + ')' : 'rgba(' + r + ',' + g + ',' + bl + ',' + alpha + ')';
  }

  function stripColor(i, j, side, b) {
    var painted = showAnt && mode === 'whole' && (j === 1 || j === 2) && paint[side * NT + i];
    return mix(painted ? AMBER : CYAN, b * (painted ? 1 : 0.82));
  }

  // A line along the surface at height s, from u0 to u1, attached to quads so
  // that nearer parts of the strip can hide it.
  function lineOn(s, u0, u1, kind, color) {
    var n = Math.max(2, Math.round((u1 - u0) / (TAU / NT) / (kind === 3 ? 2 : 1)));
    for (var k = 0; k < n; k++) {
      var ua = u0 + (u1 - u0) * k / n, ub = u0 + (u1 - u0) * (k + 1) / n;
      var it = item();
      it.type = kind;
      toCam(P(ua, s, tmpW), tmpC);
      var depth = tmpC[1];
      screen(tmpC, tmpS);
      it.pts[0] = tmpS[0]; it.pts[1] = tmpS[1];
      toCam(P(ub, s, tmpW), tmpC);
      depth = (depth + tmpC[1]) / 2;
      screen(tmpC, tmpS);
      it.pts[2] = tmpS[0]; it.pts[3] = tmpS[1];
      it.depth = depth - 0.012;
      it.fill = color;
      it.u = ua;
    }
  }

  function addAnt() {
    var lap = ant < TAU ? 0 : 1, t = ant % TAU;
    // Surface normal at (t, 0), flipped on the second lap.
    var e = 0.001, a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
    P(t, 0, a); P(t + e, 0, b); P(t, e, c);
    var tu = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ts = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    var n = [tu[1] * ts[2] - tu[2] * ts[1], tu[2] * ts[0] - tu[0] * ts[2], tu[0] * ts[1] - tu[1] * ts[0]];
    var nl = Math.hypot(n[0], n[1], n[2]), tl = Math.hypot(tu[0], tu[1], tu[2]);
    var sgn = lap ? -1 : 1;
    var it = item();
    it.type = 1;
    it.extra = [];
    var depth = 0;
    [-0.085, 0, 0.08].forEach(function (off) {
      var w = [0, 0, 0];
      for (var k = 0; k < 3; k++) w[k] = a[k] + tu[k] / tl * off + n[k] / nl * 0.025 * sgn;
      var cc = toCam(w, [0, 0, 0]);
      depth += cc[1] / 3;
      it.extra.push(screen(cc, [0, 0]));
    });
    // Which way does the ant's side face? Compare its normal with the view.
    var nc = toCam([n[0] * sgn, n[1] * sgn, n[2] * sgn], [0, 0, 0]);
    it.hidden = nc[1] > 0;
    it.depth = depth + (it.hidden ? 0.03 : -0.03);
  }

  // ---- Frame ----

  function frame(dt, st) {
    var W = st.width, H = st.height;
    if (playing && !drag) {
      yaw += dt * 0.25;
      if (showAnt && mode === 'whole') {
        ant += dt * 0.55;
        if (ant >= 2 * TAU) { ant -= 2 * TAU; paint.fill(0); }
        var lap = ant < TAU ? 0 : 1, idx = Math.floor((ant % TAU) / TAU * NT) % NT;
        paint[lap * NT + idx] = 1;
      }
      pulse = (pulse + dt / 7) % 1;
    }
    if (!drag) {
      yaw += vyaw * dt;
      vyaw *= Math.exp(-dt * 2.5);
    }
    if (cutT < 1) cutT = Math.min(1, cutT + dt / (mode === 'third' ? 4.2 : 2.6));
    else if (sepT < 1) sepT = Math.min(1, sepT + dt / 2.2);

    trig = { cy: Math.cos(yaw), sy: Math.sin(yaw), cp: Math.cos(pitch), sp: Math.sin(pitch) };
    var m = Math.min(W, H);
    cam = { cx: W / 2, cy: H / 2 + m * 0.03, unit: m * 0.3 };
    used = 0;

    var lam = V.easeInOut(sepT);
    if (mode === 'whole' || cutT < 1) {
      grid(NT, NS, 0, TAU, -HW, HW, 0, stripColor);
      if (mode !== 'whole') {
        var reach = cutT * (mode === 'third' ? 2 * TAU : TAU);
        // Past t = 2π the formula itself carries s = w/3 over to the other edge's side.
        lineOn(mode === 'middle' ? 0 : HW / 3, 0, reach, 2, '#ffffff');
      }
      lineOn(HW, 0, 2 * TAU, 3, '');
      if (showAnt && mode === 'whole') addAnt();
    } else if (mode === 'middle') {
      // One band twice as long: s > 0 all the way round twice.
      var lo = 0.015 + 0.2 * lam, hi = HW + 0.16 * lam;
      grid(NT * 2, 3, 0, 2 * TAU, lo, hi, 1, function (i, j, side, b) {
        return mix(rgb(V.gradient(LOOP, i / (NT * 2))), b);
      });
    } else {
      // A thinner Möbius strip in the middle, linked with a long band outside it.
      var k = HW / 3 * (1 - 0.4 * lam);
      grid(NT, 2, 0, TAU, -k, k, 2, function (i, j, side, b) { return mix(CYAN, b * 0.9); });
      var gap = HW / 3 + 0.03 + 0.14 * lam;
      grid(NT * 2, 3, 0, 2 * TAU, gap, gap + HW * 2 / 3, 3, function (i, j, side, b) {
        return mix(rgb(V.gradient([[255, 209, 102], [255, 138, 92], [255, 95, 162], [255, 138, 92], [255, 209, 102]], i / (NT * 2))), b);
      });
    }

    var list = items.slice(0, used);
    list.sort(function (a, b) { return b.depth - a.depth; });
    draw(st.ctx, W, H, list);
    updateReadout();
  }

  function rgb(s) { return s.slice(4, -1).split(',').map(Number); }

  function draw(ctx, W, H, list) {
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    var edgeAt = pulse * 2 * TAU;
    for (var n = 0; n < list.length; n++) {
      var it = list[n], p = it.pts;
      if (it.type === 0) {
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[2], p[3]);
        ctx.lineTo(p[4], p[5]);
        ctx.lineTo(p[6], p[7]);
        ctx.closePath();
        ctx.fillStyle = it.fill;
        ctx.fill();
      } else if (it.type === 2 || it.type === 3) {
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[2], p[3]);
        if (it.type === 2) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.2;
        } else if (!showEdge) {
          ctx.strokeStyle = 'rgba(236,232,223,0.45)';
          ctx.lineWidth = 1.2;
        } else {
          var d = Math.abs(it.u - edgeAt);
          d = Math.min(d, 2 * TAU - d);
          var glow = Math.max(0, 1 - d / 0.9);
          ctx.strokeStyle = glow > 0 ? 'rgba(255,' + Math.round(95 + 160 * glow) + ',' + Math.round(162 + 93 * glow) + ',1)' : '#ff5fa2';
          ctx.lineWidth = 2.5 + glow * 2.5;
        }
        ctx.stroke();
      } else if (it.type === 1) {
        var e = it.extra, sizes = [0.036, 0.028, 0.042], u = cam.unit;
        ctx.globalAlpha = it.hidden ? 0.45 : 1;
        for (var k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(e[k][0], e[k][1], Math.max(3, sizes[k] * u), 0, TAU);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = '#0a0b10';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
    // The scissors, while cutting.
    if (mode !== 'whole' && cutT < 1) {
      var reach = cutT * (mode === 'third' ? 2 * TAU : TAU);
      var s = mode === 'middle' ? 0 : HW / 3;
      var at = screen(toCam(P(reach, s, [0, 0, 0]), [0, 0, 0]), [0, 0]);
      ctx.beginPath();
      ctx.arc(at[0], at[1], 6, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function updateReadout() {
    var text;
    if (mode === 'whole') {
      text = '1 side, 1 edge';
      if (showAnt) text += '\nAnt on lap ' + (ant < TAU ? 1 : 2) + ' of 2';
    } else if (cutT < 1) {
      text = 'Cutting ' + (mode === 'middle' ? 'down the middle' : 'a third of the way in');
      if (mode === 'third') text += '\nLap ' + (cutT < 0.5 ? 1 : 2) + ' of 2';
    } else if (mode === 'middle') {
      text = '1 loop, twice as long\n2 full twists, 2 sides';
    } else {
      text = '2 loops, linked together\nA thin Möbius + a long loop';
    }
    V.setText(readout, text);
  }

  V.createStage(canvas, { frame: frame });

  // ---- Drag to orbit ----

  canvas.addEventListener('pointerdown', function (e) {
    drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    vyaw = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-grabbing');
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var now = performance.now(), dx = (e.clientX - drag.x) * 0.008, dy = (e.clientY - drag.y) * 0.008;
    yaw += dx;
    pitch = Math.max(0.05, Math.min(1.45, pitch + dy));
    vyaw = vyaw * 0.5 + dx / Math.max((now - drag.t) / 1000, 0.008) * 0.5;
    drag = { x: e.clientX, y: e.clientY, t: now };
  });
  function endDrag() {
    if (!drag) return;
    if (performance.now() - drag.t > 80) vyaw = 0;
    drag = null;
    canvas.classList.remove('is-grabbing');
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ---- Controls ----

  V.segmented(cutGroup, function (v) {
    mode = v;
    if (v === 'whole') { cutT = sepT = 1; }
    else { cutT = V.reducedMotion ? 1 : 0; sepT = V.reducedMotion ? 1 : 0; }
  });
  V.toggle(antBtn, function (on) { showAnt = on; });
  V.toggle(edgeBtn, function (on) { showEdge = on; });
  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });
})();
