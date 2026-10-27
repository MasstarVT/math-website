// Hilbert and Moore curves: a single line through every cell of a 2ⁿ × 2ⁿ
// grid. Every block of 4 consecutive cells at one order is a single cell at
// the order below, so each order is drawn growing out of the last.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('hilbert');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var orderInput = V.ctl(section, 'order');
  var orderOut = V.ctl(section, 'order-out');
  var playBtn = V.ctl(section, 'play');

  var MAX = 8;
  var BANDS = 96;
  var kind = 'hilbert';
  var full = {};          // kind -> { x, y } of the order-8 curve
  var lookup = {};        // kind + order -> cell index -> stop number
  var target = 1;
  var shown = 1;
  var playing = !V.reducedMotion;
  var hold = 0;
  var walk = 0;           // the white dot's position along the line, 0..1
  var hover = null;       // hovered cell { x, y } at the current order
  var L = null;           // layout from the last frame

  // Turtle graphics for the L-systems; the result is a list of grid cells.
  function build(k) {
    var s = k === 'moore' ? 'LFL+F+LFL' : 'A';
    var rules = k === 'moore'
      ? { L: '-RF+LFL+FR-', R: '+LF-RFR-FL+' }
      : { A: '+BF-AFA-FB+', B: '-AF+BFB+FA-' };
    var iters = k === 'moore' ? MAX - 1 : MAX;
    for (var i = 0; i < iters; i++) s = s.replace(/[ABLR]/g, function (ch) { return rules[ch]; });
    var n = Math.pow(4, MAX), xs = new Int32Array(n), ys = new Int32Array(n);
    var x = 0, y = 0, dx = 1, dy = 0, p = 1, t;
    for (i = 0; i < s.length; i++) {
      var ch = s.charCodeAt(i);
      if (ch === 70) { x += dx; y += dy; xs[p] = x; ys[p] = y; p++; }        // F
      else if (ch === 43) { t = dx; dx = -dy; dy = t; }                      // +
      else if (ch === 45) { t = dx; dx = dy; dy = -t; }                      // -
    }
    var mx = Infinity, my = Infinity;
    for (i = 0; i < n; i++) { if (xs[i] < mx) mx = xs[i]; if (ys[i] < my) my = ys[i]; }
    for (i = 0; i < n; i++) { xs[i] -= mx; ys[i] -= my; }
    return { x: xs, y: ys };
  }

  function curve() {
    if (!full[kind]) full[kind] = build(kind);
    return full[kind];
  }

  // Stop j of the order-m curve is cell (x >> s, y >> s) of point j·4^s.
  function cellOf(c, m, j) {
    var s = MAX - m, i = j * Math.pow(4, s);
    return [c.x[i] >> s, c.y[i] >> s];
  }

  function stopAt(m, cx, cy) {
    var key = kind + m;
    if (!lookup[key]) {
      var c = curve(), n = 1 << m, tab = new Int32Array(n * n);
      for (var j = 0; j < n * n; j++) {
        var p = cellOf(c, m, j);
        tab[p[1] * n + p[0]] = j;
      }
      lookup[key] = tab;
    }
    return lookup[key][cy * (1 << m) + cx];
  }

  // Points of order m in the unit square, grown out of order m - 1 by t.
  var settled = null; // points for a whole order, kept between frames

  function points(m, t) {
    if (t >= 1 && settled && settled.m === m && settled.kind === kind) return settled;
    var c = curve(), n = 1 << m, count = n * n;
    var xs = new Float32Array(count), ys = new Float32Array(count);
    var e = V.easeInOut(t);
    for (var j = 0; j < count; j++) {
      var p = cellOf(c, m, j);
      var fx = (p[0] + 0.5) / n, fy = (p[1] + 0.5) / n;
      if (m > 1 && t < 1) {
        var cx = ((p[0] >> 1) + 0.5) / (n / 2), cy = ((p[1] >> 1) + 0.5) / (n / 2);
        fx = cx + (fx - cx) * e;
        fy = cy + (fy - cy) * e;
      }
      xs[j] = fx;
      ys[j] = fy;
    }
    var P = { x: xs, y: ys, n: count, m: m, kind: kind };
    if (t >= 1) settled = P;
    return P;
  }

  function frame(dt, st) {
    if (playing && Math.abs(shown - target) < 0.001) {
      hold += dt;
      if (hold > (target >= 6 ? 3 : 1.4)) {
        hold = 0;
        setTarget(target >= 6 ? 1 : target + 1);
      }
    }
    var speed = target < shown ? 3 : 1;
    if (shown < target) shown = Math.min(target, shown + dt * speed);
    else if (shown > target) shown = Math.max(target, shown - dt * speed);
    if (V.reducedMotion) shown = target;

    var W = st.width, H = st.height, ctx = st.ctx;
    var S = Math.min(W - 32, H - 58);
    L = { x: (W - S) / 2, y: 16, s: S, sy: 16 + S + 16, sh: 10 };

    var m = Math.ceil(shown - 1e-6), t = shown - (m - 1);
    if (m < 1) { m = 1; t = 1; }
    var P = points(m, t);

    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = m >= 7 ? 1 : m >= 5 ? 1.5 : 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    var per = Math.ceil(P.n / BANDS);
    for (var b = 0; b * per < P.n; b++) {
      var from = Math.max(0, b * per - 1), to = Math.min(P.n, (b + 1) * per);
      ctx.strokeStyle = V.gradient(V.SPECTRUM, (b + 0.5) * per / P.n);
      ctx.beginPath();
      ctx.moveTo(L.x + P.x[from] * S, L.y + P.y[from] * S);
      for (var j = from + 1; j < to; j++) ctx.lineTo(L.x + P.x[j] * S, L.y + P.y[j] * S);
      ctx.stroke();
    }

    // The strip: the same line, pulled straight.
    for (b = 0; b < BANDS; b++) {
      ctx.fillStyle = V.gradient(V.SPECTRUM, (b + 0.5) / BANDS);
      ctx.fillRect(L.x + b / BANDS * S, L.sy, S / BANDS + 0.6, L.sh);
    }

    var n = 1 << target, cells = n * n;
    var stop, mark;
    if (hover && Math.abs(shown - target) < 0.001) {
      stop = stopAt(target, Math.min(n - 1, hover.x), Math.min(n - 1, hover.y));
      var cs = S / n, hx = Math.min(n - 1, hover.x), hy = Math.min(n - 1, hover.y);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(L.x + hx * cs, L.y + hy * cs, cs, cs);
      mark = (stop + 0.5) / cells;
    } else {
      walk = (walk + dt / 14) % 1;
      var k = Math.min(P.n - 1, walk * (P.n - 1)), k0 = Math.floor(k), f = k - k0, k1 = Math.min(P.n - 1, k0 + 1);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(L.x + (P.x[k0] + (P.x[k1] - P.x[k0]) * f) * S, L.y + (P.y[k0] + (P.y[k1] - P.y[k0]) * f) * S, 5, 0, Math.PI * 2);
      ctx.fill();
      mark = walk;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(L.x + mark * S - 1.5, L.sy - 5, 3, L.sh + 10);

    var len = (cells - 1) / n;
    V.setText(readout,
      'Order ' + target + '   ' + cells.toLocaleString() + ' cells\n' +
      (stop !== undefined
        ? 'This cell is stop ' + (stop + 1).toLocaleString() + ' of ' + cells.toLocaleString()
        : 'Line length ' + len.toFixed(2) + ' × the side'));
  }

  V.createStage(canvas, { frame: frame });

  // ---- Hover ----

  function onPoint(e) {
    if (!L) return;
    var b = canvas.getBoundingClientRect(), n = 1 << target;
    var x = (e.clientX - b.left - L.x) / L.s, y = (e.clientY - b.top - L.y) / L.s;
    hover = x >= 0 && x < 1 && y >= 0 && y < 1 ? { x: Math.floor(x * n), y: Math.floor(y * n) } : null;
  }
  canvas.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') onPoint(e); });
  canvas.addEventListener('pointerdown', onPoint);
  canvas.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hover = null; });

  // ---- Controls ----

  function setTarget(k) {
    target = k;
    orderInput.value = k;
    orderOut.textContent = String(k);
    hover = null;
  }

  function setPlaying(p) {
    playing = p;
    hold = 0;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  orderInput.addEventListener('input', function () {
    setPlaying(false);
    setTarget(parseInt(orderInput.value, 10));
  });
  setTarget(V.reducedMotion ? 5 : 1);

  V.segmented(V.ctl(section, 'kind'), function (v) {
    kind = v;
    hover = null;
  });
})();
