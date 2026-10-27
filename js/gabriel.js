// Gabriel's horn: y = 1/x for x ≥ 1 spun around the x-axis. Discs of area
// π/x² add up to π(1 − 1/L) → π, while rings of length 2π/x add up to more
// than 2π ln L, which never stops growing.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('gabriel');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var lenInput = V.ctl(section, 'len');
  var lenOut = V.ctl(section, 'len-out');

  var TAU = Math.PI * 2;
  var NI = 30, NJ = 28;
  var XMAX = 12;      // drawn length; the numbers use the real cutoff
  var D = 15;         // eye distance
  var DECADES = 6;

  var L = 10;
  var sweep = V.reducedMotion ? TAU : 0;
  var YAW = 0.5, PITCH = 0.3;
  var yaw = YAW, pitch = PITCH, vyaw = 0, vpitch = 0;
  var orbit = null;
  var G = null;

  var nPts = (NI + 1) * (NJ + 1);
  var PX = new Float32Array(nPts), PY = new Float32Array(nPts), PZ = new Float32Array(nPts);
  var VX = new Float32Array(nPts), VY = new Float32Array(nPts);
  var order = [], depth = new Float32Array(NI * NJ + 1);

  function volume(c) { return Math.PI * (1 - 1 / c); }

  // 2π ∫ (1/x)√(1 + 1/x⁴) dx from 1 to c, in closed form.
  function surface(c) {
    function g(w) { var q = Math.sqrt(1 + w); return 2 * q - 2 * Math.log(1 + q); }
    return TAU * (Math.log(c) + (g(1) - g(Math.pow(c, -4))) / 4);
  }

  function frame(dt, st) {
    if (sweep < TAU) {
      sweep = Math.min(TAU, sweep + dt * TAU / 3.4);
      st.dirty = true;
    }
    if (!orbit && (vyaw || vpitch)) {
      yaw += vyaw * dt;
      pitch = clampPitch(pitch + vpitch * dt);
      var decay = Math.exp(-dt * 3);
      vyaw *= decay;
      vpitch *= decay;
      if (Math.abs(vyaw) + Math.abs(vpitch) < 0.01) vyaw = vpitch = 0;
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function clampPitch(p) { return Math.max(-1.3, Math.min(1.3, p)); }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    var square = W / H < 1.1;
    var split = Math.round(H * (square ? 0.63 : 0.67));
    G = { split: split };
    ctx.clearRect(0, 0, W, H);

    var xEnd = Math.min(L, XMAX);
    var CX = 5.6;
    var unit = Math.min(W * 0.09, split * 0.19);
    var ox = W * 0.5, oy = split * 0.54;
    var cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);

    // World (x along the axis) to screen. VX/VY keep the view-space point
    // before perspective, for the facing test.
    var out = { x: 0, y: 0, z: 0, vx: 0, vy: 0 };
    function proj(x, y, z) {
      x -= CX;
      var x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
      var y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      var s = D / (D - z2);
      out.x = ox + x1 * s * unit;
      out.y = oy - y2 * s * unit;
      out.z = z2;
      out.vx = x1;
      out.vy = y2;
      return out;
    }
    function rot(x, y, z) {
      var x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
      return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
    }

    // The axis, behind everything.
    ctx.strokeStyle = 'rgba(236,232,223,0.16)';
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    proj(-0.2, 0, 0);
    ctx.moveTo(out.x, out.y);
    proj(XMAX + 2, 0, 0);
    ctx.lineTo(out.x, out.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Rings spaced evenly in log x, so they bunch up where the horn flares.
    var i, j, k, lnEnd = Math.log(xEnd);
    for (i = 0; i <= NI; i++) {
      var xi = Math.exp(lnEnd * i / NI), ri = 1 / xi;
      for (j = 0; j <= NJ; j++) {
        var th = sweep * j / NJ;
        k = i * (NJ + 1) + j;
        proj(xi, ri * Math.cos(th), ri * Math.sin(th));
        PX[k] = out.x; PY[k] = out.y; PZ[k] = out.z; VX[k] = out.vx; VY[k] = out.vy;
      }
    }

    order.length = 0;
    for (i = 0; i < NI; i++) {
      for (j = 0; j < NJ; j++) {
        k = i * (NJ + 1) + j;
        var q = i * NJ + j;
        depth[q] = PZ[k] + PZ[k + 1] + PZ[k + NJ + 1] + PZ[k + NJ + 2];
        order.push(q);
      }
    }
    var capped = L <= XMAX && sweep >= TAU;
    if (capped) {
      depth[NI * NJ] = proj(xEnd, 0, 0).z * 4;
      order.push(NI * NJ);
    }
    order.sort(function (a, b) { return depth[a] - depth[b]; });

    var light = [-0.38, 0.56, 0.74];
    for (var o = 0; o < order.length; o++) {
      var qd = order[o];
      if (qd === NI * NJ) {
        // The cut end, a flat disc facing along the axis.
        var nc = rot(1, 0, 0);
        var lc = Math.max(0, nc[0] * light[0] + nc[1] * light[1] + nc[2] * light[2]);
        ctx.fillStyle = shade(Math.abs(lc) * 0.6 + 0.35, false);
        ctx.beginPath();
        for (j = 0; j < NJ; j++) {
          k = NI * (NJ + 1) + j;
          if (j) ctx.lineTo(PX[k], PY[k]); else ctx.moveTo(PX[k], PY[k]);
        }
        ctx.closePath();
        ctx.fill();
        continue;
      }
      i = Math.floor(qd / NJ);
      j = qd % NJ;
      k = i * (NJ + 1) + j;
      var xm = Math.exp(lnEnd * (i + 0.5) / NI), tm = sweep * (j + 0.5) / NJ;
      var inv = 1 / Math.sqrt(1 + 1 / (xm * xm * xm * xm));
      var n = rot(inv / (xm * xm), inv * Math.cos(tm), inv * Math.sin(tm));
      // Facing the eye at (0, 0, D)?
      var px = VX[k], py = VY[k], pz = PZ[k];
      var front = n[0] * -px + n[1] * -py + n[2] * (D - pz) > 0;
      if (!front) { n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; }
      var lam = Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
      var col = shade(front ? 0.2 + 0.8 * lam : 0.14 + 0.5 * lam, !front);
      // Grow each quad by a hair instead of stroking it, to hide the seams.
      var c0 = k, c1 = k + 1, c2 = k + NJ + 2, c3 = k + NJ + 1;
      var mx = (PX[c0] + PX[c1] + PX[c2] + PX[c3]) / 4, my = (PY[c0] + PY[c1] + PY[c2] + PY[c3]) / 4;
      ctx.fillStyle = col;
      ctx.beginPath();
      grown(ctx, c0, mx, my, true);
      grown(ctx, c1, mx, my, false);
      grown(ctx, c2, mx, my, false);
      grown(ctx, c3, mx, my, false);
      ctx.fill();
      if (i % 4 === 0 && front) {
        ctx.strokeStyle = 'rgba(255,255,255,0.13)';
        ctx.beginPath();
        ctx.moveTo(PX[k], PY[k]);
        ctx.lineTo(PX[k + 1], PY[k + 1]);
        ctx.stroke();
      }
    }

    // The rim of the mouth.
    ctx.strokeStyle = 'rgba(236,232,223,0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (j = 0; j <= NJ; j++) {
      if (j) ctx.lineTo(PX[j], PY[j]); else ctx.moveTo(PX[j], PY[j]);
    }
    ctx.stroke();

    // While it spins up, the curve y = 1/x sweeping out the surface.
    if (sweep < TAU) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (i = 0; i <= 60; i++) {
        var xc = Math.exp(Math.log(XMAX) * i / 60);
        proj(xc, Math.cos(sweep) / xc, Math.sin(sweep) / xc);
        if (i) ctx.lineTo(out.x, out.y); else ctx.moveTo(out.x, out.y);
      }
      ctx.stroke();
    }

    // Where the horn carries on past the drawing.
    if (L > XMAX) {
      ctx.fillStyle = '#9b9daf';
      ctx.font = '500 11px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      proj(XMAX + 0.6, 0, 0);
      ctx.fillText('…', out.x, out.y);
    }

    drawCharts(ctx, W, H, split);

    V.setText(readout,
      'Horn from x = 1 to ' + lenText(L) + '\n' +
      'Volume  ' + volume(L).toFixed(4) + '  → π = 3.1416\n' +
      'Surface ' + surface(L).toFixed(L < 10 ? 3 : 2) + '  → no limit');
  }

  function grown(ctx, c, mx, my, first) {
    var dx = PX[c] - mx, dy = PY[c] - my, len = Math.sqrt(dx * dx + dy * dy) || 1;
    var x = PX[c] + dx / len * 0.6, y = PY[c] + dy / len * 0.6;
    if (first) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }

  function shade(t, inside) {
    t = Math.max(0, Math.min(1.15, t));
    var r = inside ? 92 : 167, g = inside ? 64 : 139, b = inside ? 190 : 250;
    return 'rgb(' + Math.round(Math.min(255, r * t + 18)) + ',' +
      Math.round(Math.min(255, g * t + 16)) + ',' + Math.round(Math.min(255, b * t + 26)) + ')';
  }

  function lenText(v) {
    if (v < 10) return v.toFixed(2);
    return Math.round(v).toLocaleString('en-US');
  }

  var SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶'];

  // Volume levels off at π; surface area keeps climbing, a nearly straight
  // line on a log axis, which is what growing like ln L looks like.
  function drawCharts(ctx, W, H, split) {
    var gap = 22, top = split + 34, bottom = H - 26;
    var cw = (W - 24 - gap) / 2;
    var charts = [
      { l: 12, max: 4, f: volume, title: 'Volume', mark: Math.PI, markLabel: 'π', ticks: [] },
      { l: 12 + cw + gap, max: 100, f: surface, title: 'Surface area', ticks: [25, 50, 75] }
    ];

    ctx.strokeStyle = 'rgba(236,232,223,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(12, split + 12.5);
    ctx.lineTo(W - 12, split + 12.5);
    ctx.stroke();

    ctx.font = '500 11px "IBM Plex Mono", monospace';
    var u = Math.log(L) / Math.LN10 / DECADES;
    charts.forEach(function (c) {
      var r = c.l + cw - 22;
      function cx(t) { return c.l + t * (r - c.l); }
      function cy(v) { return bottom - v / c.max * (bottom - top); }

      ctx.strokeStyle = 'rgba(236,232,223,0.18)';
      ctx.beginPath();
      ctx.moveTo(c.l, Math.round(bottom) + 0.5);
      ctx.lineTo(r, Math.round(bottom) + 0.5);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#6f7286';
      [0, 3, 6].forEach(function (d) {
        ctx.fillText(d === 0 ? '1' : '10' + SUP[d], Math.min(r - 8, Math.max(c.l + 4, cx(d / DECADES))), bottom + 6);
      });

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      c.ticks.forEach(function (t) {
        var y = Math.round(cy(t)) + 0.5;
        ctx.strokeStyle = 'rgba(236,232,223,0.07)';
        ctx.beginPath();
        ctx.moveTo(c.l, y);
        ctx.lineTo(r, y);
        ctx.stroke();
        ctx.fillText(String(t), r + 5, y);
      });
      if (c.mark) {
        var my = Math.round(cy(c.mark)) + 0.5;
        ctx.strokeStyle = 'rgba(236,232,223,0.45)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(c.l, my);
        ctx.lineTo(r, my);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ece8df';
        ctx.fillText(c.markLabel, r + 5, my);
      }

      // The whole curve faintly, the part up to L brightly.
      ctx.lineJoin = 'round';
      for (var pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? '#a78bfa' : 'rgba(167,139,250,0.3)';
        ctx.lineWidth = pass ? 2.2 : 1.4;
        ctx.beginPath();
        var end = pass ? u : 1;
        for (var s = 0; s <= 120; s++) {
          var t = end * s / 120;
          var y = cy(c.f(Math.pow(10, t * DECADES)));
          if (s) ctx.lineTo(cx(t), y); else ctx.moveTo(cx(t), y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = '#a78bfa';
      ctx.strokeStyle = '#0d0f16';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx(u), cy(c.f(L)), 4.5, 0, TAU);
      ctx.stroke();
      ctx.fill();

      ctx.fillStyle = '#9b9daf';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(c.title, c.l, top - 10);
    });
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Drag to turn the horn ----

  canvas.addEventListener('pointerdown', function (e) {
    var rect = canvas.getBoundingClientRect();
    if (!G || e.clientY - rect.top > G.split) return;
    orbit = { x: e.clientX, y: e.clientY, t: performance.now() };
    vyaw = vpitch = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-grabbing');
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!orbit) return;
    var now = performance.now();
    var dx = (e.clientX - orbit.x) * 0.008;
    var dy = (e.clientY - orbit.y) * 0.008;
    var dts = Math.max((now - orbit.t) / 1000, 0.008);
    yaw += dx;
    pitch = clampPitch(pitch + dy);
    vyaw = vyaw * 0.5 + (dx / dts) * 0.5;
    vpitch = vpitch * 0.5 + (dy / dts) * 0.5;
    orbit = { x: e.clientX, y: e.clientY, t: now };
    stage.dirty = true;
  });

  function endOrbit() {
    if (!orbit) return;
    if (performance.now() - orbit.t > 80) vyaw = vpitch = 0;
    orbit = null;
    canvas.classList.remove('is-grabbing');
  }
  canvas.addEventListener('pointerup', endOrbit);
  canvas.addEventListener('pointercancel', endOrbit);

  // ---- Controls ----

  V.range(lenInput, lenOut,
    function (v) { return 'x = ' + lenText(Math.pow(10, v)); },
    function (v) { L = Math.pow(10, v); stage.dirty = true; });

  V.ctl(section, 'spin').addEventListener('click', function () {
    sweep = 0;
    stage.dirty = true;
  });

  V.ctl(section, 'view').addEventListener('click', function () {
    yaw = YAW;
    pitch = PITCH;
    vyaw = vpitch = 0;
    stage.dirty = true;
  });
})();
