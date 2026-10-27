// The brachistochrone: which track carries a bead from A down to B fastest
// under gravity, with no friction? At depth y the bead's speed is √(2gy), so
// each track's time is the sum of length ÷ speed along it. The cycloid wins.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('cycloid');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');

  var g = 9.81;
  var SAMPLES = 2000;
  var WORLD = 3.2;          // metres across the canvas
  var A = { x: 0.25, y: 0.6 };
  var TRACKS = [
    { name: 'Cycloid', color: '#ff5fa2' },
    { name: "Galileo's circle", color: '#a78bfa' },
    { name: 'Steep start', color: '#ffb454' },
    { name: 'Straight line', color: '#6ee7ff' }
  ];

  var B = { x: 2.6, y: 1.25 };  // relative to A, metres, y downward
  var slow = 0.5;
  var t = 0;
  var pause = 0;
  var built = null;
  var s = 0;                // pixels per metre

  // The cycloid through A and B: x = r(θ − sin θ), y = r(1 − cos θ).
  function cycloidAngle(X, Y) {
    var lo = 1e-6, hi = 2 * Math.PI - 1e-6;
    for (var i = 0; i < 100; i++) {
      var m = (lo + hi) / 2, ratio = (m - Math.sin(m)) / (1 - Math.cos(m));
      if (ratio < X / Y) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  }

  // Each track as points from A to B, packed tightly near the start where
  // the bead is slowest, plus the time to reach each point.
  function build() {
    var X = B.x, Y = B.y;
    var th = cycloidAngle(X, Y), r = Y / (1 - Math.cos(th));
    var c = (X * X + Y * Y) / (2 * X), phi = Math.atan2(Y, c - X);
    var shapes = [
      function (u) { var a = th * u; return [r * (a - Math.sin(a)), r * (1 - Math.cos(a))]; },
      function (u) { var a = phi * u; return [c - c * Math.cos(a), c * Math.sin(a)]; },
      function (u) { return [X * u, Y * (1 - Math.pow(1 - u, 4))]; },
      function (u) { return [X * u, Y * u]; }
    ];
    built = shapes.map(function (shape, k) {
      var px = new Float64Array(SAMPLES + 1), py = new Float64Array(SAMPLES + 1), time = new Float64Array(SAMPLES + 1);
      for (var i = 0; i <= SAMPLES; i++) {
        var u = i / SAMPLES, p = shape(u * u);
        px[i] = p[0];
        py[i] = p[1];
        if (i) {
          var ds = Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
          var v = Math.sqrt(2 * g * Math.max((py[i] + py[i - 1]) / 2, 1e-12));
          time[i] = time[i - 1] + ds / v;
        }
      }
      return { x: px, y: py, t: time, total: time[SAMPLES], track: TRACKS[k] };
    });
    built.exact = th * Math.sqrt(r / g);
    t = 0;
    pause = 0;
  }

  function at(b, time) {
    if (time >= b.total) return [b.x[SAMPLES], b.y[SAMPLES]];
    var lo = 0, hi = SAMPLES;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (b.t[m] <= time) lo = m; else hi = m; }
    var f = (time - b.t[lo]) / (b.t[hi] - b.t[lo]);
    return [b.x[lo] + (b.x[hi] - b.x[lo]) * f, b.y[lo] + (b.y[hi] - b.y[lo]) * f];
  }

  function frame(dt, st) {
    var W = st.width, H = st.height, ctx = st.ctx;
    s = W / WORLD;
    // Keep A clear of the readout, and B on screen.
    A.y = Math.max(0.6, 112 / s);
    var maxY = H / s - A.y - 0.45;
    if (B.y > maxY) { B.y = Math.max(0.12, maxY); build(); }
    var longest = Math.max.apply(null, built.map(function (b) { return b.total; }));
    if (V.reducedMotion) t = longest;
    else if (t < longest) t = Math.min(longest, t + dt * slow);
    else if ((pause += dt) > 1.8) { t = 0; pause = 0; }

    function X(x) { return (A.x + x) * s; }
    function Y(y) { return (A.y + y) * s; }

    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    for (var k = built.length - 1; k >= 0; k--) {
      var b = built[k];
      ctx.strokeStyle = b.track.color;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      for (var i = 0; i <= SAMPLES; i += 8) {
        if (i) ctx.lineTo(X(b.x[i]), Y(b.y[i])); else ctx.moveTo(X(b.x[i]), Y(b.y[i]));
      }
      ctx.lineTo(X(b.x[SAMPLES]), Y(b.y[SAMPLES]));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    built.forEach(function (b) {
      var p = at(b, t);
      ctx.fillStyle = b.track.color;
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(p[0]), Y(p[1]), 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // The two ends: A, and B, which you can drag.
    ctx.fillStyle = '#ece8df';
    ctx.beginPath();
    ctx.arc(X(0), Y(0), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(X(B.x), Y(B.y), 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = '12px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#9b9daf';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('A', X(0) - 10, Y(0));
    ctx.textAlign = 'left';
    ctx.fillText('B', X(B.x) + 16, Y(B.y));

    // Finishing times, fastest first.
    var order = built.slice().sort(function (p, q) { return p.total - q.total; });
    V.setText(readout, order.map(function (b) {
      var name = (b.track.name + '                 ').slice(0, 17);
      return name + (t >= b.total ? b.total.toFixed(3) + ' s' : '…');
    }).join('\n'));
  }

  build();
  var stage = V.createStage(canvas, { frame: frame });

  // ---- Drag B ----

  V.drag(canvas, {
    hit: function (x, y) {
      return Math.hypot(x - (A.x + B.x) * s, y - (A.y + B.y) * s) < 20 ? B : null;
    },
    move: function (h, x, y) {
      var maxY = stage.height / s - A.y - 0.45;
      B.x = Math.max(0.4, Math.min(WORLD - A.x - 0.35, x / s - A.x));
      B.y = Math.max(0.12, Math.min(maxY, y / s - A.y));
      build();
    }
  });

  // ---- Controls ----

  V.range(V.ctl(section, 'slow'), V.ctl(section, 'slow-out'),
    function (v) { return v === 1 ? 'real time' : '×' + v + ' speed'; },
    function (v) { slow = v; });

  V.ctl(section, 'race').addEventListener('click', function () {
    t = 0;
    pause = 0;
  });

  V.segmented(V.ctl(section, 'preset'), function (v) {
    var p = v.split(',').map(Number);
    B.x = p[0];
    B.y = p[1];
    build();
  });
})();
