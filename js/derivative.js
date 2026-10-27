// The derivative: the slope of the secant through x and x + h is
// (f(x + h) − f(x)) ÷ h. As h shrinks to 0 the secant turns into the tangent,
// and recording that slope at every x draws a new graph, f′.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('derivative');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var hInput = V.ctl(section, 'h');
  var hOut = V.ctl(section, 'h-out');
  var playBtn = V.ctl(section, 'play');
  var truthBtn = V.ctl(section, 'truth');

  var PINK = '#ff5fa2';
  var NB = 360;      // trace resolution across the width
  var H_MIN = 0.001;
  var H_START = 1.5;

  var FUNCS = {
    square: {
      label: 'x²', dlabel: '2x',
      f: function (x) { return x * x; }, d: function (x) { return 2 * x; },
      x: [-1.6, 3.1], y: [-1.2, 9.6], dy: [-4.2, 7.2], focus: 1
    },
    cubic: {
      label: 'x³ − 3x', dlabel: '3x² − 3',
      f: function (x) { return x * x * x - 3 * x; }, d: function (x) { return 3 * x * x - 3; },
      x: [-2.3, 2.3], y: [-6, 6], dy: [-4.5, 13.5], focus: 0.4
    },
    sin: {
      label: 'sin x', dlabel: 'cos x',
      f: Math.sin, d: Math.cos,
      x: [-6.6, 6.6], y: [-1.45, 1.95], dy: [-1.6, 1.6], focus: 0.6
    },
    exp: {
      label: 'eˣ', dlabel: 'eˣ',
      f: Math.exp, d: Math.exp,
      x: [-3, 2.2], y: [-0.9, 9.6], dy: [-0.9, 9.6], focus: 0.5
    }
  };

  var fn = FUNCS.square;
  var x = fn.focus;
  var h = H_START;
  var showTruth = false;
  var playing = !V.reducedMotion;
  var playT = 0;
  var trace = new Float64Array(NB + 1);
  var G = null;

  function slope(at) { return (fn.f(at + h) - fn.f(at)) / h; }

  function clearTrace() {
    for (var k = 0; k <= NB; k++) trace[k] = NaN;
  }
  clearTrace();

  function bucket(v) {
    return Math.max(0, Math.min(NB, Math.round((v - fn.x[0]) / (fn.x[1] - fn.x[0]) * NB)));
  }
  function bucketX(k) { return fn.x[0] + k / NB * (fn.x[1] - fn.x[0]); }

  // Fill in every column the point passed over, so a fast drag leaves no gaps.
  function moveTo(nx) {
    var from = bucket(x), to = bucket(nx), step = to >= from ? 1 : -1;
    for (var k = from; ; k += step) {
      trace[k] = slope(bucketX(k));
      if (k === to) break;
    }
    x = nx;
    stage.dirty = true;
  }

  function clampX(v) {
    var span = fn.x[1] - fn.x[0];
    return Math.max(fn.x[0] + span * 0.01, Math.min(fn.x[1] - span * 0.01, v));
  }

  // The demo: shrink h at one point, then sweep the point both ways.
  var SHRINK = 2.4, REST = 0.6, END = 2.2;
  function demo(dt) {
    var span = fn.x[1] - fn.x[0];
    var lo = fn.x[0] + span * 0.02, hi = fn.x[1] - span * 0.02;
    var speed = span / 3.2;
    var leg1 = (fn.focus - lo) / speed, leg2 = (hi - lo) / speed;
    playT += dt;
    var t = playT;
    if (t < SHRINK) {
      if (t === dt) { x = fn.focus; clearTrace(); }
      setH(H_START * Math.pow(H_MIN / H_START, V.easeInOut(t / SHRINK)), false);
      return;
    }
    if (h !== H_MIN) setH(H_MIN, false);
    t -= SHRINK + REST;
    if (t < 0) return;
    if (t < leg1) { moveTo(fn.focus - t * speed); return; }
    t -= leg1;
    if (t < leg2) { moveTo(lo + t * speed); return; }
    if (x !== hi) moveTo(hi);
    if (t > leg2 + END) {
      playT = 0;
      x = fn.focus;
      setH(H_START, false);
    }
  }

  function frame(dt, st) {
    if (playing && dt > 0) demo(dt);
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    var f = fn.f;
    var split = Math.round(H * 0.56);
    var x0 = fn.x[0], x1 = fn.x[1];
    var T = { t: 12, b: split - 8 };
    var B = { t: split + 22, b: H - 12 };
    var l = 12, r = W - 12;
    function X(v) { return l + (v - x0) / (x1 - x0) * (r - l); }
    // On a phone the readout covers more of the top panel, so add headroom.
    var ytop = fn.y[1] + (W < 520 ? (fn.y[1] - fn.y[0]) * 0.3 : 0);
    function Y(v) { return T.t + (ytop - v) / (ytop - fn.y[0]) * (T.b - T.t); }
    function Y2(v) { return B.t + (fn.dy[1] - v) / (fn.dy[1] - fn.dy[0]) * (B.b - B.t); }
    G = { X: X, Y: Y, inv: function (px) { return x0 + (px - l) / (r - l) * (x1 - x0); } };

    ctx.clearRect(0, 0, W, H);

    // Panel axes and the divider.
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(236,232,223,0.18)';
    ctx.beginPath();
    ctx.moveTo(l, Math.round(Y(0)) + 0.5);
    ctx.lineTo(r, Math.round(Y(0)) + 0.5);
    ctx.moveTo(l, Math.round(Y2(0)) + 0.5);
    ctx.lineTo(r, Math.round(Y2(0)) + 0.5);
    var ax = Math.round(X(0)) + 0.5;
    ctx.moveTo(ax, T.t);
    ctx.lineTo(ax, T.b);
    ctx.moveTo(ax, B.t);
    ctx.lineTo(ax, B.b);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236,232,223,0.1)';
    ctx.beginPath();
    ctx.moveTo(l, split + 7.5);
    ctx.lineTo(r, split + 7.5);
    ctx.stroke();

    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';

    function plot(g, Yf, top, bottom) {
      ctx.beginPath();
      for (var px = l; px <= r; px += 1.5) {
        var py = Math.max(top - 50, Math.min(bottom + 50, Yf(g(G.inv(px)))));
        if (px > l) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(l, T.t, r - l, T.b - T.t);
    ctx.clip();

    var fx = f(x), s = slope(x), d = fn.d(x);

    // The tangent, dashed, for the secant to aim at.
    ctx.strokeStyle = 'rgba(236,232,223,0.4)';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(l, Y(fx + d * (x0 - x)));
    ctx.lineTo(r, Y(fx + d * (x1 - x)));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(236,232,223,0.9)';
    ctx.lineWidth = 2;
    plot(f, Y, T.t, T.b);

    // Rise over run.
    var qx = X(x + h), qy = Y(f(x + h)), px0 = X(x), py0 = Y(fx);
    ctx.strokeStyle = 'rgba(255,95,162,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px0, py0);
    ctx.lineTo(qx, py0);
    ctx.lineTo(qx, qy);
    ctx.stroke();
    if (qx - px0 > 26) {
      ctx.fillStyle = 'rgba(255,95,162,0.85)';
      ctx.textAlign = 'center';
      ctx.textBaseline = s >= 0 ? 'top' : 'bottom';
      ctx.fillText('h', (px0 + qx) / 2, py0 + (s >= 0 ? 4 : -4));
    }

    // The secant through both points.
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(l, Y(fx + s * (x0 - x)));
    ctx.lineTo(r, Y(fx + s * (x1 - x)));
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = PINK;
    ctx.strokeStyle = '#0a0b10';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(qx, qy, 5.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();

    // Link the point to its slope below.
    ctx.strokeStyle = 'rgba(236,232,223,0.22)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(Math.round(px0) + 0.5, py0);
    ctx.lineTo(Math.round(px0) + 0.5, B.b);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.beginPath();
    ctx.rect(l, B.t, r - l, B.b - B.t);
    ctx.clip();
    if (showTruth) {
      ctx.strokeStyle = 'rgba(236,232,223,0.55)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      plot(fn.d, Y2, B.t, B.b);
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    var pen = false;
    for (var k = 0; k <= NB; k++) {
      if (isNaN(trace[k])) { pen = false; continue; }
      var tx = X(bucketX(k)), ty = Y2(trace[k]);
      if (pen) ctx.lineTo(tx, ty); else ctx.moveTo(tx, ty);
      pen = true;
    }
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = PINK;
    ctx.strokeStyle = '#0a0b10';
    ctx.lineWidth = 2.5;
    var my = Math.max(B.t, Math.min(B.b, Y2(s)));
    ctx.beginPath();
    ctx.arc(px0, my, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();

    // The point you drag.
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px0, py0, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();

    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    // Bottom right of each panel: every curve here is high on the right.
    label(ctx, 'f(x) = ' + fn.label, r - 4, T.b - 16);
    label(ctx, showTruth ? 'slope of f, dashed: f′(x) = ' + fn.dlabel : 'slope of f', r - 4, B.b - 16);

    V.setText(readout,
      'x = ' + num(x, 2) + ', h = ' + hText(h) + '\n' +
      'Secant slope  ' + num(s, 3) + '\n' +
      'Tangent slope ' + num(d, 3));
  }

  // Right-aligned text on a dark backing, so curves passing under stay readable.
  function label(ctx, text, rx, ty) {
    var w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(13,15,22,0.82)';
    ctx.fillRect(rx - w - 5, ty - 3, w + 10, 18);
    ctx.fillStyle = '#6f7286';
    ctx.fillText(text, rx, ty);
  }

  function num(v, digits) {
    var t = Math.abs(v).toFixed(digits);
    return (v < 0 && parseFloat(t) !== 0 ? '−' : '') + t;
  }

  function hText(v) {
    return v >= 0.1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(3) : v.toFixed(4).replace(/0$/, '');
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Drag the point, or the second point to set h ----

  V.drag(canvas, {
    cursor: 'grab',
    hit: function (px, py) {
      if (!G) return null;
      if (Math.hypot(px - G.X(x), py - G.Y(fn.f(x))) < 20) return 'p';
      if (Math.hypot(px - G.X(x + h), py - G.Y(fn.f(x + h))) < 16) return 'q';
      return null;
    },
    move: function (which, px) {
      setPlaying(false);
      if (which === 'p') moveTo(clampX(G.inv(px)));
      else {
        var nh = Math.max(H_MIN, Math.min(2, G.inv(px) - x));
        setH(nh, false);
      }
    }
  });

  // ---- Controls ----

  function setH(v, fromInput) {
    if (v !== h) clearTrace();
    h = v;
    if (!fromInput) hInput.value = (Math.log(v) / Math.LN10).toFixed(3);
    hOut.textContent = hText(v);
    stage.dirty = true;
  }
  setH(h, false);

  hInput.addEventListener('input', function () {
    setPlaying(false);
    setH(Math.pow(10, parseFloat(hInput.value)), true);
  });

  function setPlaying(on) {
    if (on && !playing) playT = 0;
    playing = on;
    playBtn.textContent = on ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'clear').addEventListener('click', function () {
    clearTrace();
    stage.dirty = true;
  });

  V.toggle(truthBtn, function (on) {
    showTruth = on;
    stage.dirty = true;
  });

  V.segmented(V.ctl(section, 'func'), function (v) {
    fn = FUNCS[v];
    x = fn.focus;
    clearTrace();
    if (playing) playT = 0;
    stage.dirty = true;
  });
})();
