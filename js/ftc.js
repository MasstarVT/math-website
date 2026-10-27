// The fundamental theorem of calculus: A(x), the area under f from a to x,
// grows at rate f(x). Nudge x by Δx and the new sliver is about f(x)·Δx, so
// the slope of A is f. Areas below the axis count as negative.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('ftc');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var sliverBtn = V.ctl(section, 'sliver');

  var N = 1600;
  var SWEEP = 7;
  var HOLD = 1.6;

  var FUNCS = {
    sin: {
      label: 'sin x', f: Math.sin,
      x: [-0.35, 7.1], a: 0, y: [-1.3, 1.95], ay: [-0.35, 2.45]
    },
    line: {
      label: 'x − 1', f: function (t) { return t - 1; },
      x: [-0.2, 3.5], a: 0, y: [-1.45, 2.7], ay: [-0.8, 2.6]
    },
    bell: {
      // No formula for this area exists; the table below still finds it.
      label: 'e^(−x²)', f: function (t) { return Math.exp(-t * t); },
      x: [-3.25, 3.25], a: -3, y: [-0.25, 1.3], ay: [-0.25, 2.1]
    },
    wave: {
      label: '0.6 + sin 1.5x', f: function (t) { return 0.6 + Math.sin(1.5 * t); },
      x: [-0.25, 8], a: 0, y: [-0.7, 2.4], ay: [-0.5, 5.4]
    }
  };

  var fn = FUNCS.sin;
  var x = 2.2;
  var table = null; // A at N + 1 evenly spaced points from a to the right edge
  var playing = !V.reducedMotion;
  var playT = 0;
  var showSliver = true;
  var G = null;

  // Running area by Simpson's rule on each pair of half steps.
  function build() {
    var a = fn.a, b = fn.x[1], dt = (b - a) / N, f = fn.f;
    table = new Float64Array(N + 1);
    for (var k = 1; k <= N; k++) {
      var t = a + (k - 1) * dt;
      table[k] = table[k - 1] + dt / 6 * (f(t) + 4 * f(t + dt / 2) + f(t + dt));
    }
  }

  function A(v) {
    var u = (v - fn.a) / (fn.x[1] - fn.a) * N;
    var k = Math.max(0, Math.min(N - 1, Math.floor(u)));
    return table[k] + (table[k + 1] - table[k]) * (u - k);
  }

  function frame(dt, st) {
    if (playing) {
      playT += dt;
      if (playT > SWEEP + HOLD) playT = 0;
      var e = V.easeInOut(Math.min(1, playT / SWEEP));
      x = fn.a + 0.001 + e * (fn.x[1] - fn.a - 0.002);
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height, f = fn.f;
    if (!table) build();
    var split = Math.round(H * 0.52);
    var l = 12, r = W - 12;
    var T = { t: 12, b: split - 8 };
    var B = { t: split + 20, b: H - 12 };
    var x0 = fn.x[0], x1 = fn.x[1];
    function X(v) { return l + (v - x0) / (x1 - x0) * (r - l); }
    // On a phone the readout covers more of the top panel, so add headroom.
    var ytop = fn.y[1] + (W < 520 ? (fn.y[1] - fn.y[0]) * 0.3 : 0);
    function Y(v) { return T.t + (ytop - v) / (ytop - fn.y[0]) * (T.b - T.t); }
    function Y2(v) { return B.t + (fn.ay[1] - v) / (fn.ay[1] - fn.ay[0]) * (B.b - B.t); }
    function inv(px) { return x0 + (px - l) / (r - l) * (x1 - x0); }
    G = { X: X, inv: inv, top: T.t, bottom: B.b };

    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(236,232,223,0.18)';
    ctx.beginPath();
    ctx.moveTo(l, Math.round(Y(0)) + 0.5);
    ctx.lineTo(r, Math.round(Y(0)) + 0.5);
    ctx.moveTo(l, Math.round(Y2(0)) + 0.5);
    ctx.lineTo(r, Math.round(Y2(0)) + 0.5);
    if (x0 < 0) {
      var ax = Math.round(X(0)) + 0.5;
      ctx.moveTo(ax, T.t);
      ctx.lineTo(ax, T.b);
      ctx.moveTo(ax, B.t);
      ctx.lineTo(ax, B.b);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236,232,223,0.1)';
    ctx.beginPath();
    ctx.moveTo(l, split + 6.5);
    ctx.lineTo(r, split + 6.5);
    ctx.stroke();

    var xa = X(fn.a), xp = X(x), zero = Y(0), px, v;

    // The area so far: above the axis it adds, below it subtracts.
    var region = new Path2D();
    region.moveTo(xa, zero);
    for (px = xa; px < xp; px += 1.5) region.lineTo(px, Y(f(inv(px))));
    region.lineTo(xp, Y(f(x)));
    region.lineTo(xp, zero);
    region.closePath();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, zero);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,180,84,0.32)';
    ctx.fill(region);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, zero, W, T.b - zero);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,95,162,0.3)';
    ctx.fill(region);
    ctx.restore();

    // A sliver Δx wide: about f(x) tall, so it adds about f(x)·Δx.
    var dx = (x1 - x0) * 0.035;
    var drawSliver = showSliver && x + dx < x1;
    if (drawSliver) {
      ctx.fillStyle = f(x) >= 0 ? 'rgba(255,180,84,0.75)' : 'rgba(255,95,162,0.7)';
      ctx.beginPath();
      ctx.moveTo(xp, zero);
      for (px = xp; px < X(x + dx); px += 1) ctx.lineTo(px, Y(f(inv(px))));
      ctx.lineTo(X(x + dx), Y(f(x + dx)));
      ctx.lineTo(X(x + dx), zero);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(236,232,223,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (px = l; px <= r; px += 1.5) {
      v = Y(f(inv(px)));
      if (px > l) ctx.lineTo(px, v); else ctx.moveTo(px, v);
    }
    ctx.stroke();

    // A(x): faint ahead of the line, bright behind it.
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,180,84,0.28)';
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(xp, Y2(A(x)));
    for (px = xp; px <= r; px += 2) ctx.lineTo(px, Y2(A(inv(px))));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ffb454';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(xa, Y2(0));
    for (px = xa; px < xp; px += 1.5) ctx.lineTo(px, Y2(A(inv(px))));
    ctx.lineTo(xp, Y2(A(x)));
    ctx.stroke();

    // A's tangent has slope f(x).
    var Ax = A(x), fx = f(x), half = (x1 - x0) * 0.11;
    ctx.save();
    ctx.beginPath();
    ctx.rect(l, B.t, r - l, B.b - B.t);
    ctx.clip();
    ctx.strokeStyle = 'rgba(236,232,223,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(X(x - half), Y2(Ax - fx * half));
    ctx.lineTo(X(x + half), Y2(Ax + fx * half));
    ctx.stroke();
    if (drawSliver) {
      // The rise that sliver causes.
      ctx.strokeStyle = fx >= 0 ? 'rgba(255,180,84,0.9)' : 'rgba(255,95,162,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(X(x + dx), Y2(Ax));
      ctx.lineTo(X(x + dx), Y2(A(x + dx)));
      ctx.stroke();
      ctx.strokeStyle = 'rgba(236,232,223,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xp, Y2(Ax));
      ctx.lineTo(X(x + dx), Y2(Ax));
      ctx.stroke();
    }
    ctx.restore();

    // The line you drag, through both panels.
    ctx.strokeStyle = 'rgba(236,232,223,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(xp) + 0.5, T.t);
    ctx.lineTo(Math.round(xp) + 0.5, B.b);
    ctx.stroke();
    ctx.fillStyle = '#ffb454';
    ctx.strokeStyle = '#0a0b10';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(xp, Y2(Ax), 5.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(xp, Y(fx), 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();

    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    label(ctx, 'f(x) = ' + fn.label, r - 4, T.t + 2);
    label(ctx, 'A(x) = area from ' + num(fn.a, 0) + ' to x', r - 4, B.t + 2);
    ctx.fillStyle = '#6f7286';
    ctx.textAlign = 'center';
    ctx.fillText('x', xp > r - 24 ? xp - 9 : xp + 9, zero + 20 < T.b ? zero + 5 : zero - 17);

    // The slope of A measured from the area table, next to f(x) itself.
    var e = 1e-3;
    var measured = (A(Math.min(x + e, x1 - 1e-6)) - A(Math.max(x - e, fn.a))) /
      (Math.min(x + e, x1 - 1e-6) - Math.max(x - e, fn.a));
    V.setText(readout,
      'x = ' + num(x, 2) + '   A(x) = ' + num(Ax, 3) + '\n' +
      'Slope of A  ' + num(measured, 3) + '\n' +
      'Height f(x) ' + num(fx, 3));
  }

  // Right-aligned text on a dark backing, so curves passing under stay readable.
  function label(ctx, text, rx, ty) {
    var w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(13,15,22,0.82)';
    ctx.fillRect(rx - w - 5, ty - 3, w + 10, 18);
    ctx.fillStyle = '#6f7286';
    ctx.fillText(text, rx, ty);
  }

  function num(v, d) {
    var t = Math.abs(v).toFixed(d);
    return (v < 0 && parseFloat(t) !== 0 ? '−' : '') + t;
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Drag the line ----

  V.drag(canvas, {
    cursor: 'ew-resize',
    hit: function (px, py) {
      if (!G) return null;
      return Math.abs(px - G.X(x)) < 16 && py > G.top - 6 && py < G.bottom + 6 ? {} : null;
    },
    move: function (hd, px) {
      setPlaying(false);
      x = Math.max(fn.a + 0.001, Math.min(fn.x[1] - 0.001, G.inv(px)));
      stage.dirty = true;
    }
  });

  // ---- Controls ----

  function setPlaying(on) {
    if (on && !playing) {
      // Pick up the sweep from the current x.
      var u = (x - fn.a) / (fn.x[1] - fn.a), lo = 0, hi = 1;
      for (var i = 0; i < 30; i++) {
        var mid = (lo + hi) / 2;
        if (V.easeInOut(mid) < u) lo = mid; else hi = mid;
      }
      playT = u > 0.995 ? 0 : lo * SWEEP;
    }
    playing = on;
    playBtn.textContent = on ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.toggle(sliverBtn, function (on) {
    showSliver = on;
    stage.dirty = true;
  });

  V.segmented(V.ctl(section, 'func'), function (v) {
    fn = FUNCS[v];
    table = null;
    x = fn.a + (fn.x[1] - fn.a) * 0.3;
    playT = 0;
    stage.dirty = true;
  });
})();
