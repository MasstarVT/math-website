// Galton board: each ball bounces left or right at every peg. The pile at
// the bottom follows the binomial distribution, which looks like a bell curve.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('galton');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var MAX_BALLS = 5000;
  var FALL = 7;

  var rows = 12;
  var pRight = 0.5;
  var rate = 10;
  var playing = !V.reducedMotion;
  var balls = [];
  var bins = [];
  var dropped = 0;
  var landed = 0;
  var spawnAcc = 0;
  var queued = 0;

  function reset() {
    balls = [];
    bins = [];
    for (var i = 0; i <= rows; i++) bins.push(0);
    dropped = landed = 0;
    queued = 0;
    spawnAcc = 0;
  }

  function spawn() {
    if (dropped >= MAX_BALLS) return;
    var path = [], rights = 0;
    for (var i = 0; i < rows; i++) {
      var r = Math.random() < pRight;
      path.push(r ? 1 : -1);
      if (r) rights++;
    }
    balls.push({ q: -1, path: path, rights: rights });
    dropped++;
  }

  function layout(st) {
    var W = st.width, H = st.height;
    var top = H * 0.07;
    var pegH = H * 0.5;
    var dx = Math.min(W * 0.9 / (rows + 1), pegH / rows * 1.5);
    var dy = pegH / rows;
    return {
      W: W, H: H, cx: W / 2, top: top, dx: dx, dy: dy,
      binTop: top + pegH + dy * 0.4,
      bottom: H - 22
    };
  }

  function ballPos(b, L) {
    if (b.q < 0) return { x: L.cx, y: L.top + b.q * L.dy };
    var i = Math.min(Math.floor(b.q), rows), f = b.q - i, off = 0;
    for (var k = 0; k < i && k < rows; k++) off += b.path[k];
    var x = L.cx + off * L.dx / 2;
    var floor = L.top + rows * L.dy;
    if (i >= rows) return { x: x, y: floor + f * (L.bottom - floor) };
    return {
      x: x + b.path[i] * f * L.dx / 2,
      y: L.top + (i + f) * L.dy - Math.sin(Math.PI * f) * L.dy * 0.5
    };
  }

  function frame(dt, st) {
    if (playing && dropped < MAX_BALLS) {
      spawnAcc += dt * rate;
      while (spawnAcc >= 1) { spawn(); spawnAcc--; }
    }
    // Queued drops ("Drop 100") come out quickly but not all at once.
    if (queued > 0) {
      var n = Math.min(queued, Math.ceil(dt * 120));
      for (var j = 0; j < n; j++) spawn();
      queued -= n;
    }

    for (var i = balls.length - 1; i >= 0; i--) {
      var b = balls[i];
      b.q += dt * FALL;
      if (b.q >= rows + 1) {
        bins[b.rights]++;
        landed++;
        balls.splice(i, 1);
      }
    }

    if (playing && dropped >= MAX_BALLS && !balls.length) setPlaying(false);
    draw(st);
  }

  function binomial(k) {
    var c = 1;
    for (var i = 0; i < k; i++) c = c * (rows - i) / (i + 1);
    return c * Math.pow(pRight, k) * Math.pow(1 - pRight, rows - k);
  }

  function draw(st) {
    var ctx = st.ctx, L = layout(st);
    ctx.clearRect(0, 0, L.W, L.H);
    var i, k;

    // Pegs.
    ctx.fillStyle = 'rgba(236,232,223,0.55)';
    for (var r = 0; r < rows; r++) {
      for (k = 0; k <= r; k++) {
        ctx.beginPath();
        ctx.arc(L.cx + (k - r / 2) * L.dx, L.top + r * L.dy + 5, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Bars, scaled so the expected peak always fits.
    var expectedPeak = 0;
    for (k = 0; k <= rows; k++) expectedPeak = Math.max(expectedPeak, binomial(k));
    var maxCount = Math.max.apply(null, bins);
    var scale = Math.max(maxCount, expectedPeak * landed, 4) * 1.12;
    var binH = L.bottom - L.binTop;
    var barW = L.dx * 0.78;

    for (k = 0; k <= rows; k++) {
      var x = L.cx + (k - rows / 2) * L.dx;
      var h = bins[k] / scale * binH;
      ctx.fillStyle = V.gradient(V.SPECTRUM, k / rows);
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x - barW / 2, L.bottom - h, barW, h);
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = 'rgba(236,232,223,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L.cx - (rows / 2 + 0.5) * L.dx, L.bottom + 0.5);
    ctx.lineTo(L.cx + (rows / 2 + 0.5) * L.dx, L.bottom + 0.5);
    ctx.stroke();

    // The bell curve these counts should approach (normal approximation).
    if (landed > 0) {
      var mean = rows * pRight, sd = Math.sqrt(rows * pRight * (1 - pRight));
      ctx.strokeStyle = '#ece8df';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (i = 0; i <= 200; i++) {
        var kk = -0.5 + (rows + 1) * i / 200;
        var z = (kk - mean) / sd;
        var expected = landed * Math.exp(-z * z / 2) / (sd * Math.sqrt(2 * Math.PI));
        var px = L.cx + (kk - rows / 2) * L.dx;
        var py = L.bottom - expected / scale * binH;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }

    // Balls in flight, colored by the bin they're headed for.
    for (i = 0; i < balls.length; i++) {
      var p = ballPos(balls[i], L);
      ctx.fillStyle = V.gradient(V.SPECTRUM, balls[i].rights / rows);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2.5, L.dx * 0.13), 0, Math.PI * 2);
      ctx.fill();
    }

    V.setText(readout, 'Balls ' + landed.toLocaleString() + (dropped >= MAX_BALLS ? ' (full)' : ''));
  }

  reset();
  V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'one').addEventListener('click', function () { spawn(); });
  V.ctl(section, 'hundred').addEventListener('click', function () { queued += 100; });
  V.ctl(section, 'reset').addEventListener('click', reset);

  V.range(V.ctl(section, 'bias'), V.ctl(section, 'bias-out'),
    function (v) { return Math.round(v * 100) + '% right'; },
    function (v) {
      if (v === pRight) return;
      pRight = v;
      reset();
    });

  V.range(V.ctl(section, 'rows'), V.ctl(section, 'rows-out'),
    function (v) { return String(v); },
    function (v) {
      if (v === rows) return;
      rows = v;
      reset();
    });

  V.range(V.ctl(section, 'rate'), V.ctl(section, 'rate-out'),
    function (v) { return v + ' / second'; },
    function (v) { rate = v; });

})();
