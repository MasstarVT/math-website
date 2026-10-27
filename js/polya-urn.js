// Pólya's urn: draw a ball, put it back with another of its color. Each urn's
// share of red settles on a random limit; from a red and b blue that limit has the Beta(a, b) spread.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('polya-urn');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var URNS = 1000;
  var PATHS = 40;            // urns drawn as lines
  var MAX_DRAWS = 10000;
  var DECADES = 4;
  var MIN_RATE = 2;          // draws per second at the very start
  var BINS = 20;
  var RED = [255, 95, 162];
  var BLUE = [110, 231, 255];
  var MIX = [BLUE, [196, 107, 255], RED];

  var a0 = 1, b0 = 1;
  var tenfold = 2.5;
  var playing = !V.reducedMotion;
  var n = 0, acc = 0;
  var red = new Int32Array(URNS);
  var checkN = [], checkS = [], nextCheck = 1;
  var lastColor = -1, lastAt = -9, clock = 0;
  var changed = true;

  function reset() {
    n = 0;
    acc = 0;
    red.fill(a0);
    checkN = [0];
    checkS = [];
    for (var u = 0; u < PATHS; u++) checkS.push([a0 / (a0 + b0)]);
    nextCheck = 1;
    lastColor = -1;
    changed = true;
  }

  // m more draws in every urn, saving line points about every 2.5%.
  function draw(m) {
    m = Math.min(m, MAX_DRAWS - n);
    while (m > 0) {
      var chunk = Math.min(m, nextCheck - n);
      for (var u = 0; u < URNS; u++) {
        var r = red[u], total = a0 + b0 + n;
        for (var i = 0; i < chunk; i++) {
          if (Math.random() * (total + i) < r) r++;
        }
        red[u] = r;
      }
      n += chunk;
      m -= chunk;
      if (n >= nextCheck || n === MAX_DRAWS) {
        checkN.push(n);
        for (u = 0; u < PATHS; u++) checkS[u].push(red[u] / (a0 + b0 + n));
        nextCheck = Math.max(n + 1, Math.ceil(n * 1.025));
      }
    }
    lastAt = clock;
    changed = true;
  }

  function grow(dt) {
    return Math.max(MIN_RATE * dt, n * (Math.pow(10, dt / tenfold) - 1));
  }

  function frame(dt, st) {
    clock += dt;
    if (playing) {
      acc = Math.min(acc + grow(dt), 3000);
      var m = Math.floor(acc);
      acc -= m;
      if (m > 0) {
        var before = red[0];
        draw(m);
        lastColor = m === 1 ? (red[0] > before ? 1 : 0) : -1;
      }
      if (n >= MAX_DRAWS) setPlaying(false);
    }
    if (clock - lastAt < 0.7) changed = true;
    if (!changed && !st.dirty) return;
    changed = false;
    st.dirty = false;
    paint(st);
  }

  function layout(st) {
    var W = st.width, H = st.height, narrow = W < 480;
    var top = narrow ? 86 : 84, bottom = H - (narrow ? 44 : 50);
    var jarW = narrow ? 44 : 84;
    var histW = narrow ? 58 : 100;
    return {
      W: W, H: H, narrow: narrow, top: top, bottom: bottom,
      jarX: 14, jarW: jarW,
      left: 14 + jarW + (narrow ? 12 : 22), right: W - 16 - histW - (narrow ? 36 : 44),
      histX: W - 16 - histW, histW: histW
    };
  }

  function mixColor(s, alpha) {
    var c = V.gradient(MIX, s);
    return alpha === undefined ? c : c.replace('rgb', 'rgba').replace(')', ',' + alpha + ')');
  }

  function xOf(L, k) {
    return L.left + Math.log(Math.max(1, k)) / Math.LN10 / DECADES * (L.right - L.left);
  }

  function paint(st) {
    var ctx = st.ctx, L = layout(st), i, u;
    var plotH = L.bottom - L.top;
    function yOf(s) { return L.bottom - s * plotH; }
    ctx.clearRect(0, 0, L.W, L.H);
    ctx.font = '500 11px "IBM Plex Mono", monospace';

    // Grid: share of red up the side, draws (log scale) along the bottom.
    ctx.lineWidth = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
      var y = Math.round(yOf(t)) + 0.5;
      ctx.strokeStyle = t === 0.5 ? 'rgba(236,232,223,0.16)' : 'rgba(236,232,223,0.07)';
      ctx.beginPath();
      ctx.moveTo(L.left, y);
      ctx.lineTo(L.right, y);
      ctx.stroke();
      ctx.fillStyle = '#6f7286';
      ctx.fillText(Math.round(t * 100) + '%', L.right + 7, y);
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (var d = 0; d <= DECADES; d++) {
      var gx = Math.round(xOf(L, Math.pow(10, d))) + 0.5;
      ctx.strokeStyle = 'rgba(236,232,223,0.07)';
      ctx.beginPath();
      ctx.moveTo(gx, L.top);
      ctx.lineTo(gx, L.bottom);
      ctx.stroke();
      ctx.fillStyle = '#6f7286';
      var k = Math.pow(10, d);
      ctx.fillText(k >= 1000 ? k / 1000 + 'k' : String(k), gx, L.bottom + 8);
    }
    ctx.textAlign = 'right';
    ctx.fillText('draws', L.right, L.bottom + 24);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9b9daf';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Share of red, urn by urn', L.left, L.top - 10);

    // One line per urn, colored by where it is now; urn 1 on top in white.
    ctx.lineJoin = 'round';
    for (u = PATHS - 1; u >= 0; u--) {
      var s = checkS[u];
      var now = red[u] / (a0 + b0 + n);
      ctx.strokeStyle = u === 0 ? '#ffffff' : mixColor(now);
      ctx.globalAlpha = u === 0 ? 1 : 0.55;
      ctx.lineWidth = u === 0 ? 2 : 1.1;
      ctx.beginPath();
      ctx.moveTo(xOf(L, 1), yOf(s[0]));
      for (i = 1; i < checkN.length; i++) ctx.lineTo(xOf(L, checkN[i]), yOf(s[i]));
      ctx.lineTo(xOf(L, n), yOf(now));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    drawHistogram(ctx, L, yOf);
    drawJar(ctx, L);

    var share = red[0] / (a0 + b0 + n);
    V.setText(readout, 'Draws ' + n.toLocaleString() + (n >= MAX_DRAWS ? ' (done)' : '') + '\n' +
      'Urn 1: ' + Math.round(share * 100) + '% red');
  }

  // Where all 1,000 urns are now, against the Beta(a, b) curve they end on.
  function drawHistogram(ctx, L, yOf) {
    var counts = new Array(BINS).fill(0), i, total = a0 + b0 + n;
    for (var u = 0; u < URNS; u++) {
      counts[Math.min(BINS - 1, Math.floor(red[u] / total * BINS))]++;
    }
    var betaNorm = fact(a0 + b0 - 1) / (fact(a0 - 1) * fact(b0 - 1));
    function density(x) { return betaNorm * Math.pow(x, a0 - 1) * Math.pow(1 - x, b0 - 1); }
    var peak = 0;
    for (i = 0; i <= 100; i++) peak = Math.max(peak, density(i / 100) * URNS / BINS);
    for (i = 0; i < BINS; i++) peak = Math.max(peak, counts[i]);
    peak *= 1.08;
    var binH = (L.bottom - L.top) / BINS;
    for (i = 0; i < BINS; i++) {
      var w = counts[i] / peak * L.histW;
      ctx.fillStyle = mixColor((i + 0.5) / BINS);
      ctx.globalAlpha = 0.8;
      ctx.fillRect(L.histX, L.bottom - (i + 1) * binH + 1, w, binH - 2);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(236,232,223,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (i = 0; i <= 100; i++) {
      var x = i / 100, px = L.histX + Math.min(1.2, density(Math.min(0.999, Math.max(0.001, x))) * URNS / BINS / peak) * L.histW;
      if (i) ctx.lineTo(px, yOf(x)); else ctx.moveTo(px, yOf(x));
    }
    ctx.stroke();
    ctx.fillStyle = '#9b9daf';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(L.narrow ? '1,000 urns' : 'All 1,000 urns', L.histX, L.top - 10);
  }

  function fact(k) {
    var f = 1;
    for (var i = 2; i <= k; i++) f *= i;
    return f;
  }

  // Urn 1's balls, red settling at the bottom and blue on top. When there
  // are too many to draw, each ball stands for several.
  function drawJar(ctx, L) {
    var total = a0 + b0 + n, r0 = red[0];
    var x0 = L.jarX, w = L.jarW, top = L.top, bottom = L.bottom;
    var cols = L.narrow ? 3 : 5, ball = w / cols;
    var rowsN = Math.floor((bottom - top - 6) / ball), cap = cols * rowsN;
    var shown = Math.min(total, cap);
    var reds = Math.round(shown * r0 / total);
    ctx.strokeStyle = 'rgba(236,232,223,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0 - 3, top - 4);
    ctx.lineTo(x0 - 3, bottom - 6);
    ctx.quadraticCurveTo(x0 - 3, bottom + 3, x0 + 6, bottom + 3);
    ctx.lineTo(x0 + w - 6, bottom + 3);
    ctx.quadraticCurveTo(x0 + w + 3, bottom + 3, x0 + w + 3, bottom - 6);
    ctx.lineTo(x0 + w + 3, top - 4);
    ctx.stroke();
    var glow = Math.max(0, 1 - (clock - lastAt) / 0.7);
    var newest = lastColor === 1 ? reds - 1 : lastColor === 0 ? shown - 1 : -1;
    for (var i = 0; i < shown; i++) {
      var cx = x0 + (i % cols + 0.5) * ball, cy = bottom - (Math.floor(i / cols) + 0.5) * ball;
      var c = i < reds ? RED : BLUE;
      ctx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
      ctx.beginPath();
      ctx.arc(cx, cy, ball * 0.4, 0, Math.PI * 2);
      ctx.fill();
      if (i === newest && glow > 0 && total <= cap) {
        ctx.strokeStyle = 'rgba(255,255,255,' + glow.toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, ball * 0.4 + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgb(255,95,162)';
    ctx.fillText(short(r0) + ' red', x0, bottom + 10);
    ctx.fillStyle = 'rgb(110,231,255)';
    ctx.fillText(short(total - r0) + ' blue', x0, bottom + 24);
    ctx.fillStyle = '#9b9daf';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Urn 1', x0, top - 10);
  }

  function short(k) {
    return k >= 10000 ? Math.round(k / 1000) + 'k' : k.toLocaleString();
  }

  reset();
  V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    if (!playing && n >= MAX_DRAWS) reset();
    setPlaying(!playing);
  });

  V.ctl(section, 'one').addEventListener('click', function () {
    setPlaying(false);
    if (n >= MAX_DRAWS) return;
    var before = red[0];
    draw(1);
    lastColor = red[0] > before ? 1 : 0;
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    reset();
    if (!V.reducedMotion) setPlaying(true);
  });

  V.segmented(V.ctl(section, 'start'), function (v) {
    var parts = v.split(',');
    a0 = parseInt(parts[0], 10);
    b0 = parseInt(parts[1], 10);
    reset();
    if (!V.reducedMotion) setPlaying(true);
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return '10× more every ' + (10 / v).toFixed(1) + ' s'; },
    function (v) { tenfold = 10 / v; });

})();
