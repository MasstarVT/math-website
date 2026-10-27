// Lotka-Volterra predator-prey model, integrated with RK4:
//   rabbits' = a·R − b·R·F,   foxes' = d·R·F − g·F
// The quantity d·R − g·ln R + b·F − a·ln F never changes, so every path is a closed loop.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('lotka');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var B = 0.04, D = 0.01; // how often a fox catches a rabbit, and how well foxes turn food into kits
  var H = 0.01;
  var RATE = 2; // model years per second
  var WINDOW = 32; // years shown in the time chart
  var RABBIT = '#ffb454', FOX = '#ff5fa2', LOOP = '#6ee7ff';

  var a = 0.8, g = 0.6;
  var start = { x: 110, y: 20 };
  var x = start.x, y = start.y, t = 0;
  var hist = []; // [t, x, y] every 0.05 years
  var orbit = null, guides = [], period = 0, bounds = null;
  var playing = !V.reducedMotion;
  var P = null; // panel layout
  var bg = document.createElement('canvas'), bgKey = '';

  function f(px, py, out) {
    out[0] = a * px - B * px * py;
    out[1] = D * px * py - g * py;
  }
  var k1 = [0, 0], k2 = [0, 0], k3 = [0, 0], k4 = [0, 0];
  function rk4(s, h) {
    f(s[0], s[1], k1);
    f(s[0] + h / 2 * k1[0], s[1] + h / 2 * k1[1], k2);
    f(s[0] + h / 2 * k2[0], s[1] + h / 2 * k2[1], k3);
    f(s[0] + h * k3[0], s[1] + h * k3[1], k4);
    s[0] += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    s[1] += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  }

  // Follow a start once around its loop, by counting how far it has turned
  // around the balance point. One full turn and it's back where it began.
  function loop(x0, y0) {
    var ex = g / D, ey = a / B, s = [x0, y0], pts = [x0, y0], turned = 0, time = 0;
    var px = x0 - ex, py = y0 - ey;
    if (Math.hypot(px / ex, py / ey) < 1e-3) return { pts: pts, period: 2 * Math.PI / Math.sqrt(a * g) };
    for (var i = 0; i < 40000 && turned < Math.PI * 2; i++) {
      rk4(s, H);
      time += H;
      var qx = s[0] - ex, qy = s[1] - ey;
      turned += Math.atan2(px * qy - py * qx, px * qx + py * qy);
      px = qx;
      py = qy;
      if (i % 4 === 0) pts.push(s[0], s[1]);
    }
    pts.push(x0, y0);
    return { pts: pts, period: time };
  }

  function rebuild() {
    var o = loop(start.x, start.y);
    orbit = o.pts;
    period = o.period;
    // A few neighboring loops, for context.
    guides = [];
    var ex = g / D, ey = a / B;
    [1.25, 1.7, 2.4, 3.4].forEach(function (k) {
      guides.push(loop(ex, ey * k).pts);
    });
    var mx = 0, my = 0;
    for (var i = 0; i < orbit.length; i += 2) { mx = Math.max(mx, orbit[i]); my = Math.max(my, orbit[i + 1]); }
    bounds = { x: niceMax(Math.max(mx, ex * 1.6) * 1.08), y: niceMax(Math.max(my, ey * 1.6) * 1.08) };
    if (stage) stage.dirty = true;
  }

  function niceMax(v) {
    var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    var steps = [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < steps.length; i++) if (m <= steps[i] + 1e-9) return steps[i] * p;
    return 10 * p;
  }

  function restart() {
    x = start.x;
    y = start.y;
    t = 0;
    hist = [[0, x, y]];
    rebuild();
  }

  // Two panels below a band that leaves room for the readout.
  function layout(st) {
    var W = st.width, Hh = st.height, pad = 14, lab = 34, top = 82, bottom = 24;
    if (W / Hh > 1.15) {
      var pw = Math.min(Hh, W * 0.5);
      return {
        phase: { x: pad + lab, y: top, w: pw - pad - lab - 6, h: Hh - top - pad - bottom },
        time: { x: pw + lab + 6, y: top, w: W - pw - lab - pad - 6, h: Hh - top - pad - bottom }
      };
    }
    var th = Math.round((Hh - top) * 0.36);
    return {
      time: { x: pad + lab, y: top, w: W - pad * 2 - lab, h: th },
      phase: { x: pad + lab, y: top + th + bottom + 30, w: W - pad * 2 - lab, h: Hh - top - th - bottom * 2 - 30 - pad }
    };
  }

  function frame(dt, st) {
    if (!P) P = layout(st);
    if (playing && !dragging) {
      var n = Math.round(dt * RATE / H), s = [x, y];
      for (var i = 0; i < n; i++) {
        rk4(s, H);
        t += H;
        if (t - hist[hist.length - 1][0] >= 0.05) hist.push([t, s[0], s[1]]);
      }
      x = s[0];
      y = s[1];
      while (hist.length > 2 && hist[1][0] < t - WINDOW) hist.shift();
      if (n) st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function axes(ctx, r, xmax, ymax, xlabel, ylabel, xfmt) {
    ctx.strokeStyle = '#222534';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#6f7286';
    ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (var i = 0; i <= 4; i++) {
      var yy = r.y + r.h - r.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(r.x, Math.round(yy) + 0.5);
      ctx.lineTo(r.x + r.w, Math.round(yy) + 0.5);
      ctx.stroke();
      ctx.fillText(String(Math.round(ymax * i / 4)), r.x - 6, yy);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (i = 0; xfmt && i <= 4; i++) {
      ctx.fillText(xfmt(xmax * i / 4), r.x + r.w * i / 4, r.y + r.h + 6);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#9b9daf';
    ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
    if (ylabel) ctx.fillText(ylabel, r.x - 30, r.y - 10);
    if (xlabel) {
      ctx.textAlign = 'right';
      ctx.fillText(xlabel, r.x + r.w, r.y - 10);
    }
  }

  // Axes, the faint loops and the full orbit only change with the settings,
  // so they're drawn once into a layer.
  function background(st) {
    var key = [st.width, st.height, st.dpr, bounds.x, bounds.y, a, g, start.x, start.y].join();
    if (key === bgKey) return;
    bgKey = key;
    bg.width = Math.round(st.width * st.dpr);
    bg.height = Math.round(st.height * st.dpr);
    var ctx = bg.getContext('2d');
    ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    var ph = P.phase, tm = P.time, xmax = bounds.x, ymax = bounds.y;
    function PX(v) { return ph.x + v / xmax * ph.w; }
    function PY(v) { return ph.y + ph.h - v / ymax * ph.h; }

    axes(ctx, ph, xmax, ymax, 'rabbits →', '↑ foxes', function (v) { return String(Math.round(v)); });
    ctx.save();
    ctx.beginPath();
    ctx.rect(ph.x, ph.y, ph.w, ph.h);
    ctx.clip();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(110, 231, 255, 0.14)';
    guides.forEach(function (pts) { polyline(ctx, pts, PX, PY); });

    // Where each population stops changing.
    var ex = g / D, ey = a / B;
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = '#343a4e';
    ctx.beginPath();
    ctx.moveTo(PX(ex), ph.y);
    ctx.lineTo(PX(ex), ph.y + ph.h);
    ctx.moveTo(ph.x, PY(ey));
    ctx.lineTo(ph.x + ph.w, PY(ey));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#9b9daf';
    ctx.beginPath();
    ctx.arc(PX(ex), PY(ey), 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(110, 231, 255, 0.35)';
    ctx.lineWidth = 1.5;
    polyline(ctx, orbit, PX, PY);
    ctx.restore();

    axes(ctx, tm, WINDOW, Math.max(xmax, ymax), 'years →', '', null);
    ctx.font = '500 11px "IBM Plex Sans", system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillStyle = RABBIT;
    ctx.fillText('● rabbits', tm.x, tm.y - 10);
    ctx.fillStyle = FOX;
    ctx.fillText('● foxes', tm.x + 78, tm.y - 10);
  }

  function draw(st) {
    var ctx = st.ctx;
    background(st);
    ctx.clearRect(0, 0, st.width, st.height);
    ctx.drawImage(bg, 0, 0, st.width, st.height);
    var ph = P.phase, tm = P.time;
    var xmax = bounds.x, ymax = bounds.y, ymaxT = Math.max(xmax, ymax);
    function PX(v) { return ph.x + v / xmax * ph.w; }
    function PY(v) { return ph.y + ph.h - v / ymax * ph.h; }

    // The recent path, bright.
    ctx.save();
    ctx.beginPath();
    ctx.rect(ph.x, ph.y, ph.w, ph.h);
    ctx.clip();
    ctx.strokeStyle = LOOP;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    var from = Math.max(0, hist.length - Math.round(period / 0.05 * 0.35));
    for (var i = from; i < hist.length; i++) {
      var hx = PX(hist[i][1]), hy = PY(hist[i][2]);
      if (i === from) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
    }
    ctx.lineTo(PX(x), PY(y));
    ctx.stroke();
    ctx.restore();

    // The start ring (drag it) and the moving point.
    ctx.strokeStyle = '#ece8df';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(PX(start.x), PY(start.y), 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = LOOP;
    ctx.beginPath();
    ctx.arc(PX(x), PY(y), 4.5, 0, Math.PI * 2);
    ctx.fill();

    // ---- Time chart: both populations over the last WINDOW years ----
    var t0 = Math.max(0, t - WINDOW);
    function TY(v) { return tm.y + tm.h - v / ymaxT * tm.h; }
    // While the run is younger than the window, it fills the chart from the left.
    function tx(v) { return tm.x + (v - t0) / WINDOW * tm.w; }
    [[1, RABBIT], [2, FOX]].forEach(function (c) {
      ctx.strokeStyle = c[1];
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var j = 0; j < hist.length; j++) {
        var X = tx(hist[j][0]), Y = TY(hist[j][c[0]]);
        if (j === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      ctx.lineTo(tx(t), TY(c[0] === 1 ? x : y));
      ctx.stroke();
    });
    // Year labels slide along with the chart.
    ctx.fillStyle = '#6f7286';
    ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var first = Math.ceil(t0 / 8) * 8;
    for (var yr = first; yr <= t0 + WINDOW + 1e-9; yr += 8) ctx.fillText(String(yr), tx(yr), tm.y + tm.h + 6);

    V.setText(readout, 'Rabbits ' + Math.round(x) + '   Foxes ' + Math.round(y) +
      '\nOne cycle: ' + period.toFixed(1) + ' years');
  }

  function polyline(ctx, pts, PX, PY) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i += 2) {
      if (i === 0) ctx.moveTo(PX(pts[i]), PY(pts[i + 1]));
      else ctx.lineTo(PX(pts[i]), PY(pts[i + 1]));
    }
    ctx.stroke();
  }

  var stage = null;
  restart();
  stage = V.createStage(canvas, {
    frame: frame,
    resize: function (st) { P = layout(st); }
  });

  // ---- Drag the start ring ----

  var dragging = null;
  V.drag(canvas, {
    hit: function (px, py) {
      if (!P) return null;
      var ph = P.phase;
      var sx = ph.x + start.x / bounds.x * ph.w, sy = ph.y + ph.h - start.y / bounds.y * ph.h;
      return Math.hypot(px - sx, py - sy) < 22 ? {} : null;
    },
    move: function (h, px, py) {
      var ph = P.phase;
      dragging = h;
      // Keep the scale fixed while dragging so the ring stays under the finger.
      start.x = Math.max(1, Math.min(bounds.x, (px - ph.x) / ph.w * bounds.x));
      start.y = Math.max(0.5, Math.min(bounds.y, (ph.y + ph.h - py) / ph.h * bounds.y));
      var keep = bounds;
      restart();
      bounds = keep;
    },
    end: function () {
      dragging = null;
      rebuild();
    }
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'reset').addEventListener('click', function () {
    start = { x: 110, y: 20 };
    restart();
  });

  V.range(V.ctl(section, 'a'), V.ctl(section, 'a-out'),
    function (v) { return v.toFixed(2); },
    function (v) { a = v; restart(); });

  V.range(V.ctl(section, 'g'), V.ctl(section, 'g-out'),
    function (v) { return v.toFixed(2); },
    function (v) { g = v; restart(); });
})();
