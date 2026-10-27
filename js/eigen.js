// Eigenvectors: directions v with Av = λv, where the matrix only stretches.
// For a 2×2 matrix, λ solves λ² − (a + d)λ + (ad − bc) = 0. Repeatedly
// multiplying by A and rescaling (power iteration) drifts toward the largest |λ|.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('eigen');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var presetGroup = V.ctl(section, 'preset');
  var sweepBtn = V.ctl(section, 'sweep');
  var stepBtn = V.ctl(section, 'step');
  var resetBtn = V.ctl(section, 'reset');

  // Row by row: [[a, b], [c, d]].
  var C30 = Math.cos(Math.PI / 6), S30 = Math.sin(Math.PI / 6);
  var PRESETS = {
    stretch: [2, 1, 1, 2],
    shear: [1, 1, 0, 1],
    rotate: [C30, -S30, S30, C30],
    flip: [1, 2, 2, -2]
  };
  var PINK = '#ff5fa2';
  var TAU = Math.PI * 2;

  var A = PRESETS.stretch;
  var eig = [];            // { lam, ang } with ang in [0, π)
  var found = [];
  var phi = 0.35;          // angle of the test vector v
  var sweeping = !V.reducedMotion;
  var dwell = 0;
  var trail = [];          // power iteration: angles of each step
  var tween = null;        // { from, to, t }
  var view = 0;
  var stage;

  function apply(x, y) { return [A[0] * x + A[1] * y, A[2] * x + A[3] * y]; }

  function eigen() {
    var T = A[0] + A[3], D = A[0] * A[3] - A[1] * A[2], disc = T * T - 4 * D;
    var out = [];
    function dir(lam) {
      // A null vector of A − λI, from whichever row is larger.
      var p = A[0] - lam, q = A[1], r = A[2], s = A[3] - lam;
      var v = Math.hypot(p, q) > Math.hypot(r, s) ? [-q, p] : [-s, r];
      var ang = Math.atan2(v[1], v[0]);
      if (ang < 0) ang += Math.PI;
      if (ang >= Math.PI - 1e-9) ang -= Math.PI;
      return ang;
    }
    if (disc < -1e-9) return out;
    if (Math.abs(disc) <= 1e-9) {
      out.push({ lam: T / 2, ang: dir(T / 2) });
      return out;
    }
    var r = Math.sqrt(disc);
    out.push({ lam: (T + r) / 2, ang: dir((T + r) / 2) });
    out.push({ lam: (T - r) / 2, ang: dir((T - r) / 2) });
    return out;
  }

  function maxStretch() {
    var t = A[0] * A[0] + A[1] * A[1] + A[2] * A[2] + A[3] * A[3];
    var d = A[0] * A[3] - A[1] * A[2];
    return Math.sqrt((t + Math.sqrt(Math.max(0, t * t - 4 * d * d))) / 2);
  }

  // Distance from angle a to the line at angle b, both taken mod π.
  function lineGap(a, b) {
    var g = ((a - b) % Math.PI + Math.PI) % Math.PI;
    return Math.min(g, Math.PI - g);
  }

  function setPreset(name) {
    A = PRESETS[name];
    eig = eigen();
    found = eig.map(function () { return false; });
    trail = [];
    tween = null;
    stage.dirty = true;
  }

  function modPi(a) {
    var f = (a % Math.PI + Math.PI) % Math.PI;
    return f > Math.PI - 1e-7 ? 0 : f;
  }

  // Mark eigen-directions that v passed or landed on while turning from a to b.
  function passed(a, b) {
    var d = ((b - a) % TAU + TAU + Math.PI) % TAU - Math.PI;
    eig.forEach(function (e, k) {
      var f = modPi(a - e.ang);
      if (lineGap(b, e.ang) < 0.012 || (d > 0 && f + d >= Math.PI) || (d < 0 && f + d <= 0)) found[k] = true;
    });
  }

  function fmtAng(a) {
    var d = (a * 180 / Math.PI) % 360;
    if (d < 0) d += 360;
    if (d > 359.95) d = 0;
    return d.toFixed(1) + '°';
  }

  function num(v) { return (v < -0.0005 ? '−' : '') + Math.abs(v).toFixed(2); }

  function arrow(ctx, x0, y0, x1, y1, color, width) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    if (len < 1) return;
    var ux = dx / len, uy = dy / len, head = Math.min(12, len * 0.45);
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
    var moving = false;
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 0.6);
      phi = tween.from + (tween.to - tween.from) * V.easeInOut(tween.t);
      if (tween.t >= 1) tween = null;
      moving = true;
    } else if (sweeping) {
      if (dwell > 0) {
        dwell -= dt;
      } else {
        // Turn on, but stop for a moment on each eigenvector it reaches.
        var step = dt * 0.42, best = -1, gap = Infinity;
        eig.forEach(function (e, k) {
          var f = modPi(phi - e.ang), g = f ? Math.PI - f : Math.PI;
          if (g <= step && g < gap) { gap = g; best = k; }
        });
        if (best >= 0) {
          phi += gap;
          found[best] = true;
          dwell = 0.9;
        } else {
          phi += step;
        }
        if (phi > TAU) phi -= TAU;
      }
      moving = true;
    }
    var want = Math.max(1.5, maxStretch() * 1.18);
    if (Math.abs(view - want) > 0.002) {
      view = view && !V.reducedMotion ? view + (want - view) * Math.min(1, dt * 5) : want;
      moving = true;
    }
    if (!moving && !st.dirty) return;
    st.dirty = false;

    var W = st.width, H = st.height, ctx = st.ctx;
    var s = Math.min(W, H) / 2 / view * 0.94;
    var ox = W / 2, oy = H / 2;
    function X(x) { return ox + x * s; }
    function Y(y) { return oy - y * s; }

    ctx.clearRect(0, 0, W, H);

    // Grid and axes.
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(236,232,223,0.06)';
    ctx.beginPath();
    var n = Math.ceil(Math.max(W, H) / 2 / s);
    for (var i = -n; i <= n; i++) {
      if (!i) continue;
      ctx.moveTo(X(i), 0);
      ctx.lineTo(X(i), H);
      ctx.moveTo(0, Y(i));
      ctx.lineTo(W, Y(i));
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236,232,223,0.18)';
    ctx.beginPath();
    ctx.moveTo(0, oy);
    ctx.lineTo(W, oy);
    ctx.moveTo(ox, 0);
    ctx.lineTo(ox, H);
    ctx.stroke();

    // Eigenvector lines found so far.
    var far = Math.hypot(W, H);
    ctx.font = '500 12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    eig.forEach(function (e, k) {
      if (!found[k]) return;
      var c = Math.cos(e.ang), sn = Math.sin(e.ang);
      ctx.strokeStyle = 'rgba(255,95,162,0.55)';
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ox - c * far, oy + sn * far);
      ctx.lineTo(ox + c * far, oy - sn * far);
      ctx.stroke();
      ctx.setLineDash([]);
      var r = Math.max(Math.abs(e.lam), 1) * s + 26;
      var sign = e.lam < 0 ? -1 : 1;
      // Beyond the ellipse, nudged off the line so it clears the arrows.
      var lx = ox + c * r * sign + sn * 16, ly = oy - sn * r * sign + c * 16;
      var text = 'λ = ' + num(e.lam).replace(/\.00$/, '');
      var tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(10,11,16,0.8)';
      ctx.fillRect(lx - tw / 2 - 5, ly - 9, tw + 10, 18);
      ctx.fillStyle = PINK;
      ctx.fillText(text, lx, ly);
    });

    // The unit circle and where A sends it: an ellipse.
    ctx.strokeStyle = 'rgba(236,232,223,0.35)';
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ox, oy, s, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,95,162,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (i = 0; i <= 160; i++) {
      var t = i / 160 * TAU, p = apply(Math.cos(t), Math.sin(t));
      if (i) ctx.lineTo(X(p[0]), Y(p[1])); else ctx.moveTo(X(p[0]), Y(p[1]));
    }
    ctx.stroke();

    // Power iteration so far.
    trail.forEach(function (a, k) {
      var f = trail.length > 1 ? k / (trail.length - 1) : 1;
      ctx.strokeStyle = 'rgba(236,232,223,' + (0.08 + 0.25 * f) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(X(Math.cos(a)), Y(Math.sin(a)));
      ctx.stroke();
      ctx.fillStyle = V.gradient(V.SPECTRUM, 0.15 + 0.6 * f);
      ctx.beginPath();
      ctx.arc(X(Math.cos(a)), Y(Math.sin(a)), 3.5, 0, TAU);
      ctx.fill();
    });

    var vx = Math.cos(phi), vy = Math.sin(phi), Av = apply(vx, vy);
    var lenAv = Math.hypot(Av[0], Av[1]);
    var angAv = Math.atan2(Av[1], Av[0]);
    var aligned = -1;
    eig.forEach(function (e, k) { if (lineGap(phi, e.ang) < 0.012) aligned = k; });

    // The angle between v and Av.
    if (lenAv > 1e-9 && aligned < 0) {
      var turn = Math.atan2(vx * Av[1] - vy * Av[0], vx * Av[0] + vy * Av[1]);
      ctx.fillStyle = 'rgba(236,232,223,0.12)';
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.arc(ox, oy, Math.min(34, s * 0.6), -phi, -(phi + turn), turn > 0);
      ctx.closePath();
      ctx.fill();
    }

    if (aligned >= 0) {
      ctx.strokeStyle = 'rgba(255,95,162,0.45)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(X(Av[0]), Y(Av[1]));
      ctx.stroke();
    }
    arrow(ctx, ox, oy, X(Av[0]), Y(Av[1]), PINK, 2.5);
    arrow(ctx, ox, oy, X(vx), Y(vy), '#ece8df', 2.5);
    ctx.fillStyle = '#ece8df';
    ctx.strokeStyle = '#0a0b10';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(X(vx), Y(vy), 6.5, 0, TAU);
    ctx.fill();
    ctx.stroke();

    ctx.font = '600 14px "IBM Plex Sans", sans-serif';
    ctx.fillStyle = '#ece8df';
    ctx.fillText('v', X(vx) - vy * 16, Y(vy) - vx * 16);
    if (lenAv > 0.05) {
      ctx.fillStyle = PINK;
      ctx.fillText('Av', X(Av[0]) + Av[0] / lenAv * 20, Y(Av[1]) - Av[1] / lenAv * 20);
    }

    // Readout.
    var line1, line2, line3;
    if (trail.length > 1) {
      line1 = 'After ' + (trail.length - 1) + ' × A: v at ' + fmtAng(phi);
    } else {
      line1 = 'v at ' + fmtAng(phi) + ', Av at ' + fmtAng(angAv);
    }
    if (aligned >= 0) {
      line2 = 'Lined up! Av = ' + num(eig[aligned].lam).replace(/\.00$/, '') + 'v';
    } else {
      var off = Math.abs(Math.atan2(vx * Av[1] - vy * Av[0], vx * Av[0] + vy * Av[1])) * 180 / Math.PI;
      line2 = off > 90
        ? 'Av: ' + lenAv.toFixed(2) + '× as long, backward, ' + (180 - off).toFixed(0) + '° off'
        : 'Av is ' + lenAv.toFixed(2) + '× as long, ' + off.toFixed(0) + '° off';
    }
    if (!eig.length) line3 = 'No real eigenvalues';
    else if (eig.length === 1) line3 = 'Only one eigenvalue: ' + num(eig[0].lam).replace(/\.00$/, '');
    else line3 = 'Eigenvalues ' + num(eig[0].lam).replace(/\.00$/, '') + ' and ' + num(eig[1].lam).replace(/\.00$/, '');
    line3 += ' (' + found.filter(Boolean).length + '/' + eig.length + ' found)';
    V.setText(readout, line1 + '\n' + line2 + '\n' + line3);
  }

  stage = V.createStage(canvas, { frame: frame });
  setPreset('stretch');

  // ---- Drag the test vector ----

  V.drag(canvas, {
    hit: function (x, y) {
      var s = Math.min(stage.width, stage.height) / 2 / (view || 1) * 0.94;
      var px = stage.width / 2 + Math.cos(phi) * s, py = stage.height / 2 - Math.sin(phi) * s;
      return Math.hypot(px - x, py - y) < 24 ? 'v' : null;
    },
    move: function (h, x, y) {
      var a = Math.atan2(stage.height / 2 - y, x - stage.width / 2);
      if (a < 0) a += TAU;
      eig.forEach(function (e) {
        // Click into place near an eigenvector.
        if (lineGap(a, e.ang) < 0.05) {
          var g = ((e.ang - a) % Math.PI + Math.PI) % Math.PI;
          a += g > Math.PI / 2 ? g - Math.PI : g;
        }
      });
      passed(phi, a);
      phi = a;
      tween = null;
      setSweeping(false);
      stage.dirty = true;
    }
  });

  // ---- Controls ----

  function setSweeping(on) {
    sweeping = on;
    dwell = 0;
    sweepBtn.setAttribute('aria-pressed', String(on));
  }
  V.toggle(sweepBtn, function (on) {
    setSweeping(on);
    if (on) trail = [];
    stage.dirty = true;
  });
  sweepBtn.setAttribute('aria-pressed', String(sweeping));

  V.segmented(presetGroup, function (v) { setPreset(v); });

  stepBtn.addEventListener('click', function () {
    setSweeping(false);
    if (tween) phi = tween.to;
    if (!trail.length) trail.push(phi);
    var Av = apply(Math.cos(phi), Math.sin(phi));
    if (Math.hypot(Av[0], Av[1]) < 1e-12) return;
    var a = Math.atan2(Av[1], Av[0]);
    // Turn the short way to the new direction.
    var d = ((a - phi) % TAU + TAU + Math.PI) % TAU - Math.PI;
    tween = { from: phi, to: phi + d, t: 0 };
    trail.push(phi + d);
    if (trail.length > 40) trail.shift();
    stage.dirty = true;
  });

  resetBtn.addEventListener('click', function () {
    found = eig.map(function () { return false; });
    trail = [];
    tween = null;
    phi = 0.35;
    setSweeping(!V.reducedMotion);
    stage.dirty = true;
  });
})();
