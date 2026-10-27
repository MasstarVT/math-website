// Riemann sums: chop [a, b] into n strips, give each strip one height and add
// up the rectangles. Left and right sums miss by about 1/n; midpoint and
// trapezoid sums by about 1/n², so they close in far faster.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('riemann');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var nInput = V.ctl(section, 'n');
  var nOut = V.ctl(section, 'n-out');
  var playBtn = V.ctl(section, 'play');

  var NMAX = 200;
  var STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 32, 40, 50, 64, 80, 100, 128, 160, 200];
  var HOLD = 0.55;
  var ORDER = ['left', 'right', 'mid', 'trap'];
  var METHODS = {
    left: { name: 'Left edge', short: 'Left', tiny: 'Left', rgb: '110,231,255' },
    right: { name: 'Right edge', short: 'Right', tiny: 'Right', rgb: '255,95,162' },
    mid: { name: 'Midpoint', short: 'Midpoint', tiny: 'Mid', rgb: '255,180,84' },
    trap: { name: 'Trapezoid', short: 'Trapezoid', tiny: 'Trap', rgb: '167,139,250' }
  };

  // Each curve comes with an antiderivative F, so the exact area is F(b) − F(a).
  var FUNCS = {
    square: {
      f: function (x) { return x * x; },
      F: function (x) { return x * x * x / 3; },
      x: [-0.5, 2.6], y: [-0.75, 6.4], a: 0, b: 2
    },
    sin: {
      f: Math.sin,
      F: function (x) { return -Math.cos(x); },
      x: [-0.4, 3.6], y: [-0.38, 1.3], a: 0, b: Math.PI / 2
    },
    recip: {
      f: function (x) { return 1 / x; },
      F: Math.log,
      x: [0.3, 4.4], y: [-0.4, 3.4], a: 1, b: Math.E, min: 0.35
    },
    wave: {
      f: function (x) { return 1 + 0.6 * Math.sin(2 * x) + 0.3 * Math.sin(5 * x); },
      F: function (x) { return x - 0.3 * Math.cos(2 * x) - 0.06 * Math.cos(5 * x); },
      x: [-0.4, 4.4], y: [-0.42, 2.25], a: 0, b: 4
    }
  };

  var fn = FUNCS.square;
  var a = fn.a, b = fn.b;
  var method = 'left';
  var n = 4;
  var playing = !V.reducedMotion;
  var playT = 0;
  var stepIdx = -1;
  var errs = null; // errs[method][k] = |sum with k strips − exact|
  var G = null;

  function sum(k, m) {
    var f = fn.f, dx = (b - a) / k, s = 0, i;
    if (m === 'left') for (i = 0; i < k; i++) s += f(a + i * dx);
    else if (m === 'right') for (i = 1; i <= k; i++) s += f(a + i * dx);
    else if (m === 'mid') for (i = 0; i < k; i++) s += f(a + (i + 0.5) * dx);
    else {
      s = (f(a) + f(b)) / 2;
      for (i = 1; i < k; i++) s += f(a + i * dx);
    }
    return s * dx;
  }

  function exact() { return fn.F(b) - fn.F(a); }

  function buildErrors() {
    var A = exact();
    errs = {};
    ORDER.forEach(function (m) {
      var e = new Float64Array(NMAX + 1);
      for (var k = 1; k <= NMAX; k++) e[k] = Math.abs(sum(k, m) - A);
      errs[m] = e;
    });
  }

  function frame(dt, st) {
    if (playing) {
      playT += dt;
      // Hold a little longer on the last step before starting over.
      var i = Math.floor(playT / HOLD);
      if (i >= STEPS.length + 3) { playT = 0; i = 0; }
      i = Math.min(i, STEPS.length - 1);
      if (i !== stepIdx) {
        stepIdx = i;
        setN(STEPS[i], false);
      }
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    var f = fn.f;
    if (!errs) buildErrors();

    var split = Math.round(H * (W / H < 1.1 ? 0.6 : 0.64));
    var x0 = fn.x[0], x1 = fn.x[1], y0 = fn.y[0], y1 = fn.y[1];
    var P = { l: 14, r: W - 14, t: 14, b: split };
    function X(x) { return P.l + (x - x0) / (x1 - x0) * (P.r - P.l); }
    function Y(y) { return P.t + (y1 - y) / (y1 - y0) * (P.b - P.t); }
    G = { X: X, axis: Y(0), inv: function (px) { return x0 + (px - P.l) / (P.r - P.l) * (x1 - x0); } };

    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(236,232,223,0.18)';
    ctx.beginPath();
    ctx.moveTo(P.l, Math.round(Y(0)) + 0.5);
    ctx.lineTo(P.r, Math.round(Y(0)) + 0.5);
    if (x0 < 0) {
      ctx.moveTo(Math.round(X(0)) + 0.5, P.t);
      ctx.lineTo(Math.round(X(0)) + 0.5, P.b);
    }
    ctx.stroke();

    // The strips.
    var M = METHODS[method], dx = (b - a) / n, base = Y(0), i, xl, xr, h;
    ctx.beginPath();
    for (i = 0; i < n; i++) {
      xl = a + i * dx;
      xr = xl + dx;
      if (method === 'trap') {
        ctx.moveTo(X(xl), base);
        ctx.lineTo(X(xl), Y(f(xl)));
        ctx.lineTo(X(xr), Y(f(xr)));
        ctx.lineTo(X(xr), base);
        ctx.closePath();
      } else {
        h = f(method === 'left' ? xl : method === 'right' ? xr : xl + dx / 2);
        ctx.rect(X(xl), Y(h), X(xr) - X(xl), base - Y(h));
      }
    }
    ctx.fillStyle = 'rgba(' + M.rgb + ',0.2)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(' + M.rgb + ',' + (n > 60 ? 0.3 : n > 24 ? 0.55 : 0.85) + ')';
    ctx.stroke();

    // The curve, clipped to the plot.
    ctx.save();
    ctx.beginPath();
    ctx.rect(P.l, P.t, P.r - P.l, P.b - P.t);
    ctx.clip();
    ctx.strokeStyle = 'rgba(236,232,223,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    var pen = false;
    for (var px = P.l; px <= P.r; px += 1.5) {
      var xv = G.inv(px), yv = f(xv);
      if (!isFinite(yv) || (fn.min && xv < fn.min * 0.5)) { pen = false; continue; }
      if (pen) ctx.lineTo(px, Y(yv)); else ctx.moveTo(px, Y(yv));
      pen = true;
    }
    ctx.stroke();
    ctx.restore();

    // Where each strip takes its height.
    if (n <= 24) {
      ctx.fillStyle = 'rgb(' + M.rgb + ')';
      ctx.beginPath();
      for (i = 0; i <= n; i++) {
        if (method !== 'trap' && i === n) break;
        var xs = method === 'left' ? a + i * dx : method === 'right' ? a + (i + 1) * dx
          : method === 'mid' ? a + (i + 0.5) * dx : a + i * dx;
        ctx.moveTo(X(xs) + 3, Y(f(xs)));
        ctx.arc(X(xs), Y(f(xs)), 3, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // Handles for a and b.
    ctx.font = '500 12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    [['a', a], ['b', b]].forEach(function (p) {
      var hx = X(p[1]);
      ctx.fillStyle = '#ece8df';
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(hx, base, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
      ctx.fillStyle = '#9b9daf';
      ctx.fillText(p[0], hx, base + 12);
    });

    drawChart(ctx, W, H, split);
    updateReadout();
  }

  var SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  function pow10(k) {
    if (k === 0) return '1';
    if (k === 1) return '10';
    return '10' + String(k).split('').map(function (c) { return SUP[c]; }).join('');
  }

  // Error against n, both on log scales: a 1/n error falls one decade per
  // decade of n, a 1/n² error two.
  function drawChart(ctx, W, H, split) {
    var C = { l: 14, r: W - 46, t: split + 46, b: H - 24 };
    var hi = -Infinity, lo = Infinity;
    ORDER.forEach(function (m) {
      for (var k = 1; k <= 3; k++) if (errs[m][k] > 0) hi = Math.max(hi, Math.log(errs[m][k]) / Math.LN10);
      if (errs[m][NMAX] > 0) lo = Math.min(lo, Math.log(errs[m][NMAX]) / Math.LN10);
    });
    if (!isFinite(hi)) hi = 0;
    hi = Math.ceil(hi);
    lo = Math.max(hi - 9, Math.min(hi - 2, Math.floor(isFinite(lo) ? lo : hi - 4)));

    function cx(k) { return C.l + Math.log(k) / Math.log(NMAX) * (C.r - C.l); }
    function cy(e) {
      var d = e > 0 ? Math.log(e) / Math.LN10 : lo;
      d = Math.max(lo, Math.min(hi, d));
      return C.t + (hi - d) / (hi - lo) * (C.b - C.t);
    }

    ctx.strokeStyle = 'rgba(236,232,223,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(14, split + 14.5);
    ctx.lineTo(W - 14, split + 14.5);
    ctx.stroke();

    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    var every = hi - lo > 5 ? 2 : 1;
    for (var d = lo; d <= hi; d++) {
      if (d % every) continue;
      var gy = Math.round(cy(Math.pow(10, d))) + 0.5;
      ctx.strokeStyle = 'rgba(236,232,223,0.07)';
      ctx.beginPath();
      ctx.moveTo(C.l, gy);
      ctx.lineTo(C.r, gy);
      ctx.stroke();
      ctx.fillStyle = '#6f7286';
      ctx.fillText(pow10(d), C.r + 8, gy);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    [1, 10, 100].forEach(function (k) {
      var gx = Math.round(cx(k)) + 0.5;
      ctx.strokeStyle = 'rgba(236,232,223,0.07)';
      ctx.beginPath();
      ctx.moveTo(gx, C.t);
      ctx.lineTo(gx, C.b);
      ctx.stroke();
      ctx.fillStyle = '#6f7286';
      ctx.fillText(k === 1 ? 'n = 1' : String(k), Math.max(C.l + 18, gx), C.b + 7);
    });

    // The chosen method on top, the others faint for comparison.
    var list = ORDER.filter(function (m) { return m !== method; }).concat([method]);
    ctx.lineJoin = 'round';
    list.forEach(function (m) {
      var e = errs[m];
      ctx.strokeStyle = 'rgba(' + METHODS[m].rgb + ',' + (m === method ? 1 : 0.38) + ')';
      ctx.lineWidth = m === method ? 2 : 1.2;
      ctx.beginPath();
      for (var k = 1; k <= NMAX; k++) {
        if (k > 1) ctx.lineTo(cx(k), cy(e[k])); else ctx.moveTo(cx(k), cy(e[k]));
      }
      ctx.stroke();
    });

    var mx = cx(n);
    ctx.strokeStyle = 'rgba(236,232,223,0.35)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(Math.round(mx) + 0.5, C.t);
    ctx.lineTo(Math.round(mx) + 0.5, C.b);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgb(' + METHODS[method].rgb + ')';
    ctx.strokeStyle = '#0d0f16';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, cy(errs[method][n]), 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();

    // Title and legend in the strip above the chart.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    var narrow = W < 520, lx = C.l, ly = split + 33;
    ctx.fillStyle = '#6f7286';
    ctx.fillText('Error', lx, ly);
    lx += ctx.measureText('Error').width + (narrow ? 12 : 20);
    ORDER.forEach(function (m) {
      ctx.fillStyle = 'rgba(' + METHODS[m].rgb + ',' + (m === method ? 1 : 0.6) + ')';
      ctx.fillRect(lx, ly - 4, 10, 2);
      var label = narrow ? METHODS[m].tiny : METHODS[m].short;
      ctx.fillText(label, lx + 14, ly);
      lx += (narrow ? 20 : 24) + ctx.measureText(label).width;
    });
  }

  function num(v) {
    return (v < -0.00005 ? '−' : '') + Math.abs(v).toFixed(4);
  }

  function sci(v) {
    if (v >= 0.001) return v.toFixed(4);
    if (v === 0) return '0';
    var k = Math.floor(Math.log(v) / Math.LN10);
    var m = v / Math.pow(10, k);
    if (m >= 9.95) { m /= 10; k += 1; }
    return m.toFixed(1) + ' × ' + pow10(k);
  }

  function updateReadout() {
    var s = sum(n, method), A = exact(), e = s - A;
    V.setText(readout,
      METHODS[method].name + ', n = ' + n + '\n' +
      'Sum ' + num(s) + ', exact ' + num(A) + '\n' +
      (Math.abs(e) < 1e-13 ? 'Spot on' : 'Off by ' + sci(Math.abs(e)) + (e < 0 ? ', too low' : ', too high')));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Drag a and b along the axis ----

  V.drag(canvas, {
    cursor: 'ew-resize',
    hit: function (x, y) {
      if (!G) return null;
      var da = Math.hypot(x - G.X(a), y - G.axis);
      var db = Math.hypot(x - G.X(b), y - G.axis);
      if (Math.min(da, db) > 22) return null;
      return da <= db ? 'a' : 'b';
    },
    move: function (h, x) {
      var v = G.inv(x), gap = (fn.x[1] - fn.x[0]) * 0.04;
      var lo = fn.min !== undefined ? fn.min : fn.x[0] + gap * 0.5;
      if (h === 'a') a = Math.max(lo, Math.min(b - gap, v));
      else b = Math.max(a + gap, Math.min(fn.x[1] - gap * 0.5, v));
      errs = null;
      stage.dirty = true;
    }
  });

  // ---- Controls ----

  function setN(k, fromInput) {
    n = k;
    if (!fromInput) nInput.value = (Math.log(k) / Math.log(NMAX)).toFixed(3);
    nOut.textContent = String(k);
    stage.dirty = true;
  }

  function setPlaying(on) {
    if (on && !playing) {
      // Carry on from the current n.
      var i = 0;
      while (i < STEPS.length - 1 && STEPS[i] < n) i++;
      playT = i * HOLD;
      stepIdx = -1;
    }
    playing = on;
    playBtn.textContent = on ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  nInput.addEventListener('input', function () {
    setPlaying(false);
    setN(Math.max(1, Math.round(Math.exp(parseFloat(nInput.value) * Math.log(NMAX)))), true);
  });
  setN(playing ? 1 : n, false);

  V.segmented(V.ctl(section, 'method'), function (v) {
    method = v;
    stage.dirty = true;
  });

  V.segmented(V.ctl(section, 'func'), function (v) {
    fn = FUNCS[v];
    a = fn.a;
    b = fn.b;
    errs = null;
    stage.dirty = true;
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    a = fn.a;
    b = fn.b;
    errs = null;
    stage.dirty = true;
  });
})();
