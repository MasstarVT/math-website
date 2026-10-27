// Gradient descent: step against the gradient, x ← x − rate·∇f(x). Too big a
// rate overshoots (past 2 ÷ the steepest curvature it diverges); momentum
// keeps a share of the last step, v ← βv − rate·∇f, and can roll over ridges.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('gradient-descent');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var rateInput = V.ctl(section, 'rate');
  var rateOut = V.ctl(section, 'rate-out');
  var momInput = V.ctl(section, 'mom');
  var momOut = V.ctl(section, 'mom-out');

  var MAX_STEPS = 600;
  var LEVELS = 18;
  var STOPS = [[16, 18, 34], [44, 36, 96], [104, 70, 170], [176, 96, 150], [236, 140, 110], [255, 196, 120]];

  var LANDS = {
    bowl: {
      f: function (x, y) { return 0.1 * x * x + 2 * y * y; },
      g: function (x, y) { return [0.2 * x, 4 * y]; },
      box: [-3, 3, -2, 2], start: [2.6, 1.5], rate: 0.42
    },
    valleys: {
      f: function (x, y) { return Math.pow(x * x - 4, 2) / 16 + 0.35 * x + y * y / 2; },
      g: function (x, y) { return [x * (x * x - 4) / 4 + 0.35, y]; },
      box: [-3.6, 3.6, -2.4, 2.4], start: [2.9, 1.9], rate: 0.3
    },
    banana: {
      f: function (x, y) { return (1 - x) * (1 - x) + 5 * Math.pow(y - x * x, 2); },
      g: function (x, y) { return [-2 * (1 - x) - 20 * x * (y - x * x), 10 * (y - x * x)]; },
      box: [-2, 2, -0.9, 2.9], start: [-1.5, 0.2], rate: 0.03
    },
    bumpy: {
      f: function (x, y) { return 0.08 * (x * x + y * y) - 0.5 * Math.cos(2.2 * x) * Math.cos(2.2 * y); },
      g: function (x, y) {
        return [0.16 * x + 1.1 * Math.sin(2.2 * x) * Math.cos(2.2 * y),
          0.16 * y + 1.1 * Math.cos(2.2 * x) * Math.sin(2.2 * y)];
      },
      box: [-3.2, 3.2, -2.4, 2.4], start: [2.6, 2.0], rate: 0.25
    }
  };

  var land = LANDS.bowl;
  var rate = land.rate;
  var mom = 0;
  var start = land.start.slice();
  var path = [];
  var vx = 0, vy = 0;
  var status = 'running';
  var acc = 0;
  var cache = document.createElement('canvas');
  var cacheOk = false;
  var fmin = 0, fmax = 1;
  var G = null;
  var dragged = false;

  function layout(st) {
    var W = st.width, H = st.height, b = land.box;
    var cx = (b[0] + b[1]) / 2, cy = (b[2] + b[3]) / 2;
    var hw = (b[1] - b[0]) / 2, hh = (b[3] - b[2]) / 2;
    if (hw / hh < W / H) hw = hh * W / H; else hh = hw * H / W;
    var s = W / (2 * hw);
    G = {
      W: W, H: H,
      X: function (x) { return (x - cx + hw) * s; },
      Y: function (y) { return (cy + hh - y) * s; },
      ix: function (px) { return cx - hw + px / s; },
      iy: function (py) { return cy + hh - py / s; },
      far: 40 * Math.max(hw, hh)
    };
  }

  function reset(animate) {
    path = [start[0], start[1]];
    vx = vy = 0;
    status = 'running';
    acc = 0;
    if (!animate) while (status === 'running') step();
    stage.dirty = true;
  }

  function step() {
    var n = path.length, x = path[n - 2], y = path[n - 1];
    var g = land.g(x, y);
    vx = mom * vx - rate * g[0];
    vy = mom * vy - rate * g[1];
    x += vx;
    y += vy;
    path.push(x, y);
    var steps = path.length / 2 - 1;
    if (!isFinite(x) || !isFinite(y) || Math.abs(x) > G.far || Math.abs(y) > G.far) status = 'blown';
    else if (Math.hypot(vx, vy) < 1e-5 && Math.hypot(g[0], g[1]) < 2e-3) status = 'settled';
    else if (steps >= MAX_STEPS) status = 'tired';
  }

  function heightColor(t) { return V.gradient(STOPS, t); }

  // The landscape: a low-res height map smoothed up, plus contour lines by
  // marching squares, cached until the landscape or size changes.
  function buildCache(st) {
    var gw = 128, gh = Math.max(16, Math.round(128 * G.H / G.W));
    var vals = new Float64Array(gw * gh), i, j, k;
    fmin = Infinity;
    fmax = -Infinity;
    for (j = 0; j < gh; j++) {
      for (i = 0; i < gw; i++) {
        var v = land.f(G.ix(i / (gw - 1) * G.W), G.iy(j / (gh - 1) * G.H));
        vals[j * gw + i] = v;
        if (v < fmin) fmin = v;
        if (v > fmax) fmax = v;
      }
    }
    // Square root spreads out the low ground, where the action is.
    for (k = 0; k < vals.length; k++) vals[k] = Math.sqrt(Math.max(0, (vals[k] - fmin) / (fmax - fmin)));

    var small = document.createElement('canvas');
    small.width = gw;
    small.height = gh;
    var sc = small.getContext('2d'), img = sc.createImageData(gw, gh);
    for (k = 0; k < vals.length; k++) {
      var t = vals[k] * (STOPS.length - 1), a = Math.min(STOPS.length - 2, Math.floor(t)), f = t - a;
      img.data[k * 4] = STOPS[a][0] + (STOPS[a + 1][0] - STOPS[a][0]) * f;
      img.data[k * 4 + 1] = STOPS[a][1] + (STOPS[a + 1][1] - STOPS[a][1]) * f;
      img.data[k * 4 + 2] = STOPS[a][2] + (STOPS[a + 1][2] - STOPS[a][2]) * f;
      img.data[k * 4 + 3] = 255;
    }
    sc.putImageData(img, 0, 0);

    cache.width = Math.round(G.W * st.dpr);
    cache.height = Math.round(G.H * st.dpr);
    var c = cache.getContext('2d');
    c.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    c.imageSmoothingEnabled = true;
    c.globalAlpha = 0.72;
    c.drawImage(small, 0, 0, G.W, G.H);
    c.globalAlpha = 1;

    var sx = G.W / (gw - 1), sy = G.H / (gh - 1);
    var SEG = [null, 'LB', 'BR', 'LR', 'TR', 'LTBR', 'TB', 'LT', 'LT', 'TB', 'TRLB', 'TR', 'LR', 'BR', 'LB'];
    c.strokeStyle = 'rgba(236,232,223,0.16)';
    c.lineWidth = 1;
    c.beginPath();
    // Each cell only crosses the levels between its lowest and highest corner.
    for (j = 0; j < gh - 1; j++) {
      for (i = 0; i < gw - 1; i++) {
        var tl = vals[j * gw + i], tr = vals[j * gw + i + 1];
        var bl = vals[(j + 1) * gw + i], br = vals[(j + 1) * gw + i + 1];
        var lo = Math.min(tl, tr, bl, br), hi = Math.max(tl, tr, bl, br);
        for (var lv = Math.max(1, Math.ceil(lo * LEVELS)); lv < LEVELS && lv / LEVELS < hi; lv++) {
          var L = lv / LEVELS;
          var idx = (tl > L ? 8 : 0) | (tr > L ? 4 : 0) | (br > L ? 2 : 0) | (bl > L ? 1 : 0);
          if (idx === 0 || idx === 15) continue;
          var seg = SEG[idx];
          for (var q = 0; q < seg.length; q += 2) {
            for (var e = 0; e < 2; e++) {
              var ch = seg.charAt(q + e), px, py;
              if (ch === 'T') { px = i + (L - tl) / (tr - tl); py = j; }
              else if (ch === 'R') { px = i + 1; py = j + (L - tr) / (br - tr); }
              else if (ch === 'B') { px = i + (L - bl) / (br - bl); py = j + 1; }
              else { px = i; py = j + (L - tl) / (bl - tl); }
              if (e) c.lineTo(px * sx, py * sy); else c.moveTo(px * sx, py * sy);
            }
          }
        }
      }
    }
    c.stroke();
    cacheOk = true;
  }

  function frame(dt, st) {
    if (!G || G.W !== st.width || G.H !== st.height) {
      layout(st);
      cacheOk = false;
      if (!path.length) reset(!V.reducedMotion);
    }
    if (status === 'running' && path.length) {
      // Start slow so the first steps can be followed, then speed up.
      var steps = path.length / 2 - 1;
      acc += dt * Math.min(120, 8 + steps * 1.1);
      while (acc >= 1 && status === 'running') {
        step();
        acc -= 1;
      }
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    if (!cacheOk) buildCache(st);
    draw(st.ctx);
  }

  function draw(ctx) {
    ctx.clearRect(0, 0, G.W, G.H);
    ctx.drawImage(cache, 0, 0, G.W, G.H);

    var n = path.length / 2, i;
    ctx.strokeStyle = 'rgba(236,232,223,0.85)';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (i = 0; i < n; i++) {
      var px = G.X(path[2 * i]), py = G.Y(path[2 * i + 1]);
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
    if (n < 160) {
      ctx.fillStyle = 'rgba(236,232,223,0.9)';
      ctx.beginPath();
      for (i = 1; i < n; i++) {
        var dx = G.X(path[2 * i]), dy = G.Y(path[2 * i + 1]);
        ctx.moveTo(dx + 2.2, dy);
        ctx.arc(dx, dy, 2.2, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // The start, which you can drag.
    ctx.strokeStyle = '#ece8df';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(G.X(start[0]), G.Y(start[1]), 7, 0, Math.PI * 2);
    ctx.stroke();

    // The ball, and the step it's about to take.
    var x = path[path.length - 2], y = path[path.length - 1];
    var bx = G.X(x), by = G.Y(y);
    if (status === 'running') {
      var g = land.g(x, y), nx = mom * vx - rate * g[0], ny = mom * vy - rate * g[1];
      var ex = G.X(x + nx), ey = G.Y(y + ny), len = Math.hypot(ex - bx, ey - by);
      if (len > 6) {
        var ux = (ex - bx) / len, uy = (ey - by) / len;
        ctx.strokeStyle = '#a78bfa';
        ctx.fillStyle = '#a78bfa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(ex - ux * 6, ey - uy * 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - ux * 9 - uy * 5, ey - uy * 9 + ux * 5);
        ctx.lineTo(ex - ux * 9 + uy * 5, ey - uy * 9 - ux * 5);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (isFinite(bx) && isFinite(by)) {
      ctx.fillStyle = '#a78bfa';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(bx, by, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    var h = land.f(x, y), msg;
    if (status === 'running') msg = 'Rolling downhill…';
    else if (status === 'blown') msg = 'Blew up: the steps are too big';
    else if (status === 'tired') msg = h - fmin < 0.002 * (fmax - fmin) ? 'Nearly at the bottom, still creeping' : 'Still crawling after ' + MAX_STEPS + ' steps';
    else msg = h - fmin < 0.02 * (fmax - fmin) ? 'Settled at the lowest point' : 'Stuck in a dip that isn\'t the lowest';
    V.setText(readout,
      'Step ' + (n - 1) + (isFinite(h) && Math.abs(h) < 1e6 ? ', height ' + num(h) : '') + '\n' +
      'Rate ' + rate.toFixed(3) + ', momentum ' + mom.toFixed(2) + '\n' + msg);
  }

  function num(v) {
    var t = Math.abs(v).toFixed(4);
    return (v < 0 && parseFloat(t) !== 0 ? '−' : '') + t;
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Tap to drop the ball, or drag the start ring ----

  V.drag(canvas, {
    cursor: 'move',
    hit: function (px, py) {
      if (!G) return null;
      return Math.hypot(px - G.X(start[0]), py - G.Y(start[1])) < 16 ? {} : null;
    },
    move: function (h, px, py, first) {
      if (first) { dragged = false; return; }
      dragged = true;
      start = [G.ix(Math.max(0, Math.min(G.W, px))), G.iy(Math.max(0, Math.min(G.H, py)))];
      reset(false);
    }
  });

  canvas.addEventListener('click', function (e) {
    if (dragged) { dragged = false; return; }
    if (!G) return;
    var r = canvas.getBoundingClientRect();
    start = [G.ix(e.clientX - r.left), G.iy(e.clientY - r.top)];
    reset(true);
  });

  // ---- Controls ----

  function setRate(v, fromInput) {
    rate = v;
    if (!fromInput) rateInput.value = (Math.log(v) / Math.LN10).toFixed(3);
    rateOut.textContent = v.toFixed(3);
  }

  rateInput.addEventListener('input', function () {
    setRate(Math.pow(10, parseFloat(rateInput.value)), true);
    if (G) reset(true);
  });

  V.range(momInput, momOut, function (v) { return v.toFixed(2); }, function (v) {
    mom = v;
    if (G) reset(true);
  });

  V.segmented(V.ctl(section, 'land'), function (v) {
    land = LANDS[v];
    start = land.start.slice();
    setRate(land.rate, false);
    G = null;
    path = [];
    stage.dirty = true;
  });

  V.ctl(section, 'again').addEventListener('click', function () {
    if (G) reset(true);
  });

  V.ctl(section, 'random').addEventListener('click', function () {
    if (!G) return;
    start = [G.ix((0.08 + Math.random() * 0.84) * G.W), G.iy((0.08 + Math.random() * 0.84) * G.H)];
    reset(true);
  });

  setRate(rate, false);
})();
