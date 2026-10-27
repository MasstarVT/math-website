// Taylor series: the polynomial that matches a function's value, slope,
// curvature and every higher derivative at one point a. Some series work
// everywhere; others stop working past a radius set by trouble you can't see.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('taylor');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var degreeInput = V.ctl(section, 'degree');
  var degreeOut = V.ctl(section, 'degree-out');
  var animBtn = V.ctl(section, 'animate');

  var MAX = 40;
  var FUNCS = {
    sin: {
      name: 'sin x', f: Math.sin, x: [-10, 10], y: [-3, 3],
      coef: function (a, k) {
        var d = [Math.sin(a), Math.cos(a), -Math.sin(a), -Math.cos(a)];
        return d[k % 4];
      },
      radius: function () { return Infinity; }
    },
    exp: {
      name: 'eˣ', f: Math.exp, x: [-6, 4], y: [-2, 12],
      coef: function (a) { return Math.exp(a); },
      radius: function () { return Infinity; }
    },
    bump: {
      // 1/(1 + x²) has poles at ±i, which limit the series even on the real line.
      name: '1/(1 + x²)', f: function (x) { return 1 / (1 + x * x); }, x: [-4, 4], y: [-1, 2],
      coef: function (a, k, fact) {
        var m = k + 1, mod = Math.sqrt(1 + a * a), arg = Math.atan2(1, -a);
        return Math.pow(mod, -m) * Math.sin(m * arg) * fact;
      },
      radius: function (a) { return Math.sqrt(1 + a * a); }
    },
    log: {
      name: 'ln(1 + x)', f: function (x) { return x > -1 ? Math.log(1 + x) : NaN; }, x: [-1.5, 5], y: [-3, 3],
      coef: function (a, k, fact) {
        if (k === 0) return Math.log(1 + a);
        return (k % 2 ? 1 : -1) / (k * Math.pow(1 + a, k)) * fact;
      },
      radius: function (a) { return 1 + a; }
    }
  };

  var fn = FUNCS.sin;
  var degree = 1;
  var center = 0;
  var animating = !V.reducedMotion;
  var animT = 0;
  var G = null;

  // Coefficients c_k of (x − a)^k. The callbacks return the k-th derivative,
  // or for the last two, c_k·k! directly (fact cancels the division).
  function coefficients() {
    var c = [], fact = 1;
    for (var k = 0; k <= degree; k++) {
      if (k > 0) fact *= k;
      c.push(fn.coef(center, k, fact) / fact);
    }
    return c;
  }

  function poly(c, x) {
    var u = x - center, s = 0;
    for (var k = c.length - 1; k >= 0; k--) s = s * u + c[k];
    return s;
  }

  // The widest interval around a where the polynomial stays within 0.01.
  function goodRange(c) {
    var span = fn.x[1] - fn.x[0], step = span / 2000, lo = center, hi = center;
    while (lo - step > fn.x[0] && Math.abs(poly(c, lo - step) - fn.f(lo - step)) < 0.01) lo -= step;
    while (hi + step < fn.x[1] && Math.abs(poly(c, hi + step) - fn.f(hi + step)) < 0.01) hi += step;
    return [lo, hi];
  }

  function frame(dt, st) {
    if (animating) {
      animT += dt;
      // Add a term every 0.7 seconds, up to degree 25, then start over.
      setDegree(Math.floor(animT / 0.7) % 26, false);
    }

    var W = st.width, H = st.height, ctx = st.ctx;
    var x0 = fn.x[0], x1 = fn.x[1], y0 = fn.y[0], y1 = fn.y[1];
    var pad = 14;
    G = {
      X: function (x) { return pad + (x - x0) / (x1 - x0) * (W - pad * 2); },
      Y: function (y) { return pad + (y1 - y) / (y1 - y0) * (H - pad * 2); },
      inv: function (px) { return x0 + (px - pad) / (W - pad * 2) * (x1 - x0); }
    };

    ctx.clearRect(0, 0, W, H);

    // Where the series converges.
    var R = fn.radius(center);
    if (isFinite(R)) {
      var a = Math.max(x0, center - R), b = Math.min(x1, center + R);
      ctx.fillStyle = 'rgba(167,139,250,0.08)';
      ctx.fillRect(G.X(a), pad, G.X(b) - G.X(a), H - pad * 2);
      ctx.strokeStyle = 'rgba(167,139,250,0.5)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      [center - R, center + R].forEach(function (x) {
        if (x > x0 && x < x1) { ctx.moveTo(Math.round(G.X(x)) + 0.5, pad); ctx.lineTo(Math.round(G.X(x)) + 0.5, H - pad); }
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Axes.
    ctx.strokeStyle = 'rgba(236,232,223,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, Math.round(G.Y(0)) + 0.5);
    ctx.lineTo(W - pad, Math.round(G.Y(0)) + 0.5);
    ctx.moveTo(Math.round(G.X(0)) + 0.5, pad);
    ctx.lineTo(Math.round(G.X(0)) + 0.5, H - pad);
    ctx.stroke();

    function plot(f) {
      ctx.beginPath();
      var pen = false;
      for (var px = pad; px <= W - pad; px += 1) {
        var v = f(G.inv(px));
        if (!isFinite(v)) { pen = false; continue; }
        var py = Math.max(-4000, Math.min(4000, G.Y(v)));
        if (pen) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        pen = true;
      }
      ctx.stroke();
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad, W - pad * 2, H - pad * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(236,232,223,0.85)';
    ctx.lineWidth = 2;
    plot(fn.f);
    var c = coefficients();
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 3;
    plot(function (x) { return poly(c, x); });
    ctx.restore();

    // The center, which you can drag.
    var cy = G.Y(fn.f(center));
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(G.X(center), pad);
    ctx.lineTo(G.X(center), H - pad);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0a0b10';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(G.X(center), cy, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();

    var r = goodRange(c);
    V.setText(readout,
      'Degree ' + degree + ' around x = ' + num(center) + '\n' +
      'Within 0.01 of ' + fn.name + ' from ' + num(r[0]) + ' to ' + num(r[1]));
  }

  function num(v) { return (v < -0.005 ? '−' : '') + Math.abs(v).toFixed(2); }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Drag the center along the curve ----

  V.drag(canvas, {
    cursor: 'ew-resize',
    hit: function (x, y) {
      if (!G) return null;
      return Math.hypot(x - G.X(center), y - G.Y(fn.f(center))) < 18 ? {} : null;
    },
    move: function (h, x) {
      var lo = fn === FUNCS.log ? -0.8 : fn.x[0] + 0.2;
      center = Math.max(lo, Math.min(fn.x[1] - 0.2, G.inv(x)));
      stage.dirty = true;
    }
  });

  // ---- Controls ----

  function setDegree(k, fromInput) {
    degree = k;
    if (!fromInput) degreeInput.value = k;
    degreeOut.textContent = String(k);
  }

  function setAnimating(on) {
    if (on && !animating) animT = degree * 0.7;
    animating = on;
    animBtn.setAttribute('aria-pressed', String(on));
  }
  V.toggle(animBtn, setAnimating);
  animBtn.setAttribute('aria-pressed', String(animating));

  degreeInput.addEventListener('input', function () {
    setAnimating(false);
    setDegree(parseInt(degreeInput.value, 10), true);
  });
  setDegree(degree, false);

  V.segmented(V.ctl(section, 'func'), function (v) {
    fn = FUNCS[v];
    center = 0;
  });

  V.ctl(section, 'recenter').addEventListener('click', function () { center = 0; });

  degreeInput.max = MAX;
})();
