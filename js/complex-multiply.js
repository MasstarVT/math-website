// Multiplying complex numbers multiplies their lengths and adds their angles:
// (r·e^(iα))(s·e^(iβ)) = rs·e^(i(α + β)). So multiplying by w turns and scales
// the whole plane, powers of z climb a spiral, and the n roots of 1 split the circle.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('complex-multiply');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var modeGroup = V.ctl(section, 'mode');
  var nWrap = V.ctl(section, 'n-wrap');
  var nInput = V.ctl(section, 'n');
  var nOut = V.ctl(section, 'n-out');
  var playBtn = V.ctl(section, 'play');

  var Z_COL = '#6ee7ff', W_COL = '#ff5fa2', P_COL = '#ffb454';
  var TAU = Math.PI * 2;
  var RANGE = 2.1;         // complex units from the center to the nearer edge
  var MAX_LEN = 1.45;

  var mode = 'product';
  var z = [1, 0];
  var w = [1, 0];
  var n = 12;
  var anim = V.reducedMotion ? -1 : 0;   // 0..1 while playing, -1 when idle
  var stage;

  function mul(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
  function len(a) { return Math.hypot(a[0], a[1]); }
  function arg(a) { var t = Math.atan2(a[1], a[0]); return t < 0 ? t + TAU : t; }
  function polar(r, t) { return [r * Math.cos(t), r * Math.sin(t)]; }
  function deg(t) { var d = t * 180 / Math.PI; return d > 359.95 ? 0 : d; }

  var SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  function sup(k) { return String(k).split('').map(function (c) { return SUP[+c]; }).join(''); }

  function cx(a) {
    var re = Math.abs(a[0]) < 0.005 ? 0 : a[0], im = Math.abs(a[1]) < 0.005 ? 0 : a[1];
    return (re < 0 ? '−' : '') + Math.abs(re).toFixed(2) + (im < 0 ? ' − ' : ' + ') + Math.abs(im).toFixed(2) + 'i';
  }

  function rootName(k) {
    if (k === 2) return 'a square root of 1';
    if (k === 3) return 'a cube root of 1';
    return 'a ' + k + 'th root of 1';
  }

  function arrow(ctx, x0, y0, x1, y1, color, width) {
    var dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    if (l < 1) return;
    var ux = dx / l, uy = dy / l, head = Math.min(11, l * 0.45);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 - ux * head * 0.8, y1 - uy * head * 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * head - uy * head * 0.45, y1 - uy * head + ux * head * 0.45);
    ctx.lineTo(x1 - ux * head + uy * head * 0.45, y1 - uy * head - ux * head * 0.45);
    ctx.closePath();
    ctx.fill();
  }

  function frame(dt, st) {
    if (anim >= 0) {
      anim += dt / (mode === 'product' ? 2.2 : 3.2);
      if (anim >= 1.25) anim = -1;
    } else if (!st.dirty) {
      return;
    }
    st.dirty = false;

    var W = st.width, H = st.height, ctx = st.ctx;
    var s = Math.min(W, H) / 2 / RANGE;
    var ox = W / 2, oy = H / 2;
    function X(p) { return ox + p[0] * s; }
    function Y(p) { return oy - p[1] * s; }
    var t = anim < 0 ? 1 : Math.min(1, anim);

    ctx.clearRect(0, 0, W, H);

    // Grid, axes, unit circle.
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(236,232,223,0.06)';
    ctx.beginPath();
    var gx = Math.ceil(W / 2 / s), gy = Math.ceil(H / 2 / s), i;
    for (i = -gx; i <= gx; i++) { ctx.moveTo(ox + i * s, 0); ctx.lineTo(ox + i * s, H); }
    for (i = -gy; i <= gy; i++) { ctx.moveTo(0, oy + i * s); ctx.lineTo(W, oy + i * s); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236,232,223,0.2)';
    ctx.beginPath();
    ctx.moveTo(0, oy);
    ctx.lineTo(W, oy);
    ctx.moveTo(ox, 0);
    ctx.lineTo(ox, H);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236,232,223,0.32)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(ox, oy, s, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#6f7286';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('1', ox + s + 4, oy + 4);
    ctx.fillText('−1', ox - s + 4, oy + 4);
    ctx.fillText('i', ox + 5, oy - s - 15);
    ctx.fillText('−i', ox + 5, oy + s + 3);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    function dot(p, r, color, ring) {
      ctx.beginPath();
      ctx.arc(X(p), Y(p), r, 0, TAU);
      ctx.fillStyle = color;
      ctx.fill();
      if (ring) {
        ctx.strokeStyle = '#0a0b10';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    function label(p, text, color, dist) {
      var l = len(p) || 1;
      ctx.font = '600 14px "IBM Plex Sans", sans-serif';
      ctx.fillStyle = color;
      ctx.fillText(text, X(p) + p[0] / l * dist, Y(p) - p[1] / l * dist);
    }
    function arc(r, a0, a1, color, width) {
      if (Math.abs(a1 - a0) < 1e-4) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(ox, oy, r, -a0, -a1, true);
      ctx.stroke();
    }

    var line1, line2, line3;

    if (mode === 'product') {
      var zw = mul(z, w), az = arg(z), aw = arg(w);
      // 0, 1, z and 0, w, zw are the same triangle, turned and scaled by w.
      [[[1, 0], z, 'rgba(110,231,255,'], [w, zw, 'rgba(255,180,84,']].forEach(function (tri) {
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(X(tri[0]), Y(tri[0]));
        ctx.lineTo(X(tri[1]), Y(tri[1]));
        ctx.closePath();
        ctx.fillStyle = tri[2] + '0.1)';
        ctx.fill();
        ctx.strokeStyle = tri[2] + '0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      arc(22, 0, az, Z_COL, 2);
      arc(30, 0, aw, W_COL, 2);
      // The angle of zw is the two angles end to end.
      var R3 = Math.min(len(zw) * s * 0.55, 60);
      R3 = Math.max(R3, 42);
      arc(R3, 0, az, 'rgba(110,231,255,0.75)', 3);
      arc(R3, az, az + aw * t, 'rgba(255,95,162,0.75)', 3);

      // While playing, z turns and grows into zw: z·w^t.
      var cur = polar(len(z) * Math.pow(len(w), t), az + aw * t);
      if (anim >= 0) {
        ctx.strokeStyle = 'rgba(255,180,84,0.6)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        for (i = 0; i <= 60; i++) {
          var u = i / 60 * t, q = polar(len(z) * Math.pow(len(w), u), az + aw * u);
          if (i) ctx.lineTo(X(q), Y(q)); else ctx.moveTo(X(q), Y(q));
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      arrow(ctx, ox, oy, X(z), Y(z), Z_COL, 2.5);
      arrow(ctx, ox, oy, X(w), Y(w), W_COL, 2.5);
      arrow(ctx, ox, oy, X(cur), Y(cur), P_COL, 3);
      dot(z, 7, Z_COL, true);
      dot(w, 7, W_COL, true);
      label(z, 'z', Z_COL, 18);
      label(w, 'w', W_COL, 18);
      label(cur, t < 1 ? 'z·wᵗ' : 'zw', P_COL, 22);

      var dz = deg(az), dw = deg(aw), sum = dz + dw;
      line1 = 'zw = ' + cx(zw);
      line2 = 'lengths ' + len(z).toFixed(2) + ' × ' + len(w).toFixed(2) + ' = ' + (len(z) * len(w)).toFixed(2);
      line3 = 'angles ' + dz.toFixed(0) + '° + ' + dw.toFixed(0) + '°' +
        (Math.round(dz) + Math.round(dw) >= 360 ? ' − 360°' : '') + ' = ' + deg(arg(zw)).toFixed(0) + '°';
    } else {
      var isRoots = mode === 'roots', r = len(z), th = arg(z);
      var shown = anim < 0 ? n : Math.min(n, Math.floor(anim * (n + 1)));

      if (isRoots) {
        // The n roots of 1 make a regular polygon.
        ctx.strokeStyle = 'rgba(126,224,161,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (i = 0; i <= n; i++) {
          var rp = polar(1, i * TAU / n);
          if (i) ctx.lineTo(X(rp), Y(rp)); else ctx.moveTo(X(rp), Y(rp));
        }
        ctx.stroke();
        for (i = 0; i < n; i++) dot(polar(1, i * TAU / n), 5, '#7ee0a1', false);
      }

      // The smooth spiral r^u·e^(iθu) through all the powers.
      ctx.strokeStyle = 'rgba(255,180,84,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      var steps = Math.max(40, n * 24), lim = RANGE * 1.6;
      for (i = 0; i <= steps; i++) {
        var u2 = i / steps * shown, pr = Math.pow(r, u2);
        if (pr > lim) break;
        var sp = polar(pr, th * u2);
        if (i) ctx.lineTo(X(sp), Y(sp)); else ctx.moveTo(X(sp), Y(sp));
      }
      ctx.stroke();

      var pts = [[1, 0]];
      for (i = 1; i <= n; i++) pts.push(mul(pts[i - 1], z));
      // Every step is the same triangle, turned and scaled.
      for (i = 0; i < shown; i++) {
        if (len(pts[i + 1]) > RANGE * 1.2) break;
        ctx.fillStyle = V.gradient(V.SPECTRUM, i / Math.max(1, n - 1));
        ctx.globalAlpha = 0.13;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(X(pts[i]), Y(pts[i]));
        ctx.lineTo(X(pts[i + 1]), Y(pts[i + 1]));
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.font = '500 12px "IBM Plex Mono", monospace';
      for (i = shown; i >= 0; i--) {
        if (len(pts[i]) > lim) continue;
        var col = V.gradient(V.SPECTRUM, i / Math.max(1, n));
        dot(pts[i], i === n ? 6 : 4, i === n ? '#ffffff' : col, false);
        if (i >= 2 && (i <= 4 || i === n)) {
          ctx.fillStyle = i === n ? '#ffffff' : '#9b9daf';
          var lp = pts[i], ll = len(lp) || 1;
          ctx.fillText('z' + sup(i), X(lp) + lp[0] / ll * 16, Y(lp) - lp[1] / ll * 16);
        }
      }
      arrow(ctx, ox, oy, X(z), Y(z), Z_COL, 2.5);
      dot(z, 7, Z_COL, true);
      label(z, 'z', Z_COL, 18);

      var zn = pts[n], dth = deg(th);
      line1 = 'z = ' + r.toFixed(2) + ' at ' + dth.toFixed(1) + '°';
      if (isRoots && Math.abs(r - 1) < 1e-9 && Math.abs(Math.round(th * n / TAU) - th * n / TAU) < 1e-9) {
        line2 = n + ' × ' + dth.toFixed(1) + '° is a whole number of turns';
        line3 = 'z' + sup(n) + ' = 1, so z is ' + rootName(n);
      } else {
        line2 = 'z' + sup(n) + ': length ' + r.toFixed(2) + sup(n) + ' = ' + (len(zn) < 1000 ? len(zn).toFixed(2) : len(zn).toExponential(1));
        line3 = '      angle ' + n + ' × ' + dth.toFixed(1) + '° = ' + deg(arg(zn)).toFixed(1) + '°';
      }
    }
    V.setText(readout, line1 + '\n' + line2 + '\n' + line3);
  }

  stage = V.createStage(canvas, { frame: frame });

  // ---- Dragging z and w ----

  function toPlane(x, y) {
    var s = Math.min(stage.width, stage.height) / 2 / RANGE;
    return [(x - stage.width / 2) / s, (stage.height / 2 - y) / s];
  }

  // Lengths snap to hundredths and angles to whole degrees, so the readout's
  // arithmetic checks out exactly.
  function place(p) {
    var r = Math.min(MAX_LEN, Math.max(0.05, len(p))), t = arg(p);
    if (mode !== 'product' && Math.abs(r - 1) < 0.04) r = 1;
    r = Math.round(r * 100) / 100;
    t = Math.round(t * 180 / Math.PI) * Math.PI / 180;
    if (mode === 'roots') {
      var k = Math.round(t * n / TAU), tk = k * TAU / n;
      if (Math.abs(r - 1) < 0.12 && Math.abs(t - tk) < 0.1) { r = 1; t = tk; }
    }
    return polar(r, t);
  }

  V.drag(canvas, {
    hit: function (x, y) {
      var s = Math.min(stage.width, stage.height) / 2 / RANGE, ox = stage.width / 2, oy = stage.height / 2;
      var dz = Math.hypot(ox + z[0] * s - x, oy - z[1] * s - y);
      var dw = mode === 'product' ? Math.hypot(ox + w[0] * s - x, oy - w[1] * s - y) : Infinity;
      if (Math.min(dz, dw) > 22) return null;
      return dz <= dw ? 'z' : 'w';
    },
    move: function (h, x, y) {
      var p = place(toPlane(x, y));
      if (h === 'z') z = p; else w = p;
      anim = -1;
      stage.dirty = true;
    }
  });

  // ---- Controls ----

  function setMode(v) {
    mode = v;
    nWrap.hidden = mode === 'product';
    if (mode === 'product') { z = polar(1.3, 20 * Math.PI / 180); w = polar(1.1, 45 * Math.PI / 180); }
    if (mode === 'powers') { z = polar(1.05, 30 * Math.PI / 180); setN(12); }
    if (mode === 'roots') { setN(5); z = polar(1, TAU / 5); }
    anim = V.reducedMotion ? -1 : 0;
    stage.dirty = true;
  }

  function setN(v) {
    n = v;
    nInput.value = v;
    nOut.textContent = String(v);
  }

  V.segmented(modeGroup, setMode);
  nInput.addEventListener('input', function () {
    setN(parseInt(nInput.value, 10));
    if (mode === 'roots' && Math.abs(len(z) - 1) < 1e-9) z = polar(1, TAU / n);
    stage.dirty = true;
  });
  playBtn.addEventListener('click', function () {
    anim = 0;
    stage.dirty = true;
  });
  setMode('product');
})();
