// Heighway dragon: copy the curve, rotate the copy 90° about the last point,
// and append it in reverse so the path stays continuous. Each round only
// appends points, so round g is just the first 2^g + 1 points of the full
// curve. That makes stepping backward or jumping to any round free.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('dragon');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var backBtn = V.ctl(section, 'back');
  var nextBtn = V.ctl(section, 'step');
  var roundInput = V.ctl(section, 'round');
  var roundOut = V.ctl(section, 'round-out');

  var MAX_GEN = 15;
  var TURN_TIME = 1.25;
  var HOLD_TIME = 0.6;
  var DRAGON_COLORS = ['#6ee7ff', '#ff5fa2', '#ffb454', '#a78bfa'];

  // Every round, built once with exact integer coordinates.
  var xs = new Int32Array((1 << MAX_GEN) + 1);
  var ys = new Int32Array(xs.length);
  xs[1] = 1;
  for (var g0 = 0; g0 < MAX_GEN; g0++) {
    var end = 1 << g0, px0 = xs[end], py0 = ys[end];
    for (var i0 = end - 1; i0 >= 0; i0--) {
      xs[2 * end - i0] = px0 - (ys[i0] - py0);
      ys[2 * end - i0] = py0 + (xs[i0] - px0);
    }
  }

  // gen rounds are on screen. While phase is 'turn', a copy of them is
  // swinging around the end point: outward (dir +1, finishing at gen + 1)
  // or back in (dir -1, finishing at gen).
  var gen = 0;
  var phase = 'hold';
  var dir = 1;
  var progress = 0;
  var theta = 0;
  var hold = HOLD_TIME;
  var playing = !V.reducedMotion;
  var speed = 1;
  var colorMode = 'gen';
  var four = false;
  var view = null;

  // Screen-space buffers: shown curve (a) and the swinging copy (b).
  var ax = new Float32Array(xs.length), ay = new Float32Array(xs.length);
  var bx = new Float32Array(xs.length), by = new Float32Array(xs.length);

  function startTurn(d) {
    phase = 'turn';
    dir = d;
    if (d < 0) gen--;
    progress = d > 0 ? 0 : 1;
  }

  function endTurn() {
    if (dir > 0) gen++;
    phase = 'hold';
    progress = 0;
    hold = HOLD_TIME;
    if (gen >= MAX_GEN) setPlaying(false);
  }

  function goTo(g) {
    gen = g;
    phase = 'hold';
    progress = 0;
    hold = HOLD_TIME;
    stage.dirty = true;
  }

  function next() {
    setPlaying(false);
    if (phase === 'turn' && dir < 0) {
      dir = 1;
      return;
    }
    if (phase === 'turn') endTurn();
    if (gen < MAX_GEN) startTurn(1);
    stage.dirty = true;
  }

  function back() {
    setPlaying(false);
    if (phase === 'turn' && dir > 0) {
      dir = -1;
      return;
    }
    if (phase === 'turn') endTurn();
    if (gen > 0) startTurn(-1);
    stage.dirty = true;
  }

  function frame(dt, st) {
    var wasTurning = phase === 'turn';

    if (phase === 'turn') {
      progress += dir * dt * speed / TURN_TIME;
      if (dir > 0 ? progress >= 1 : progress <= 0) endTurn();
    } else if (playing) {
      hold -= dt * speed;
      if (hold <= 0 && gen < MAX_GEN) startTurn(1);
    }
    theta = phase === 'turn' ? V.easeInOut(progress) * Math.PI / 2 : 0;

    var moved = updateView(dt, st);
    if (st.dirty || wasTurning || phase === 'turn' || moved) {
      draw(st);
      st.dirty = false;
    }
    syncControls();
  }

  // Fit the shown curve plus the copy at its current angle.
  function targetView(st) {
    var last = 1 << gen, px = xs[last], py = ys[last];
    var turning = phase === 'turn';
    var c = Math.cos(theta), s = Math.sin(theta);
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var i = 0; i <= last; i++) {
      var x = xs[i], y = ys[i];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (turning) {
        var dx = x - px, dy = y - py;
        var rx = px + dx * c - dy * s, ry = py + dx * s + dy * c;
        if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
        if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
      }
    }
    if (four) {
      var m = Math.max(-minX, maxX, -minY, maxY);
      minX = minY = -m;
      maxX = maxY = m;
    }
    var pad = Math.min(st.width, st.height) * 0.08 + 6;
    var w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
    return {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      scale: Math.min((st.width - pad * 2) / w, (st.height - pad * 2) / h)
    };
  }

  function updateView(dt, st) {
    var t = targetView(st);
    if (!view || st.dirty) {
      view = t;
      return true;
    }
    var k = 1 - Math.exp(-dt * 5);
    var moved = Math.abs(view.cx - t.cx) * view.scale > 0.05 ||
      Math.abs(view.cy - t.cy) * view.scale > 0.05 ||
      Math.abs(view.scale / t.scale - 1) > 0.0005;
    if (moved) {
      view.cx += (t.cx - view.cx) * k;
      view.cy += (t.cy - view.cy) * k;
      view.scale *= Math.pow(t.scale / view.scale, k);
    }
    return moved;
  }

  // Stroke points from..to (inclusive) of a buffer as one path.
  function polyline(ctx, X, Y, from, to, style) {
    if (to <= from) return;
    ctx.strokeStyle = style;
    ctx.beginPath();
    ctx.moveTo(X[from], Y[from]);
    for (var i = from + 1; i <= to; i++) ctx.lineTo(X[i], Y[i]);
    ctx.stroke();
  }

  function genColor(g) {
    return V.gradient(V.SPECTRUM, g / MAX_GEN);
  }

  function draw(st) {
    var ctx = st.ctx;
    var W = st.width, H = st.height;
    ctx.clearRect(0, 0, W, H);

    var last = 1 << gen;
    var s = view.scale;
    var ox = W / 2 - view.cx * s, oy = H / 2 + view.cy * s;
    var i;

    for (i = 0; i <= last; i++) {
      ax[i] = ox + xs[i] * s;
      ay[i] = oy - ys[i] * s;
    }

    var turning = phase === 'turn';
    if (turning) {
      var c = Math.cos(theta), sn = Math.sin(theta), px = xs[last], py = ys[last];
      for (i = 0; i <= last; i++) {
        var dx = xs[i] - px, dy = ys[i] - py;
        bx[i] = ox + (px + dx * c - dy * sn) * s;
        by[i] = oy - (py + dx * sn + dy * c) * s;
      }
    }

    ctx.lineWidth = Math.max(0.6, Math.min(4, s * 0.32));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    var copies = four ? 4 : 1;
    for (var q = 0; q < copies; q++) {
      ctx.save();
      if (q) {
        ctx.translate(ox, oy);
        ctx.rotate(-q * Math.PI / 2);
        ctx.translate(-ox, -oy);
      }
      if (four) {
        ctx.globalAlpha = 0.9;
        polyline(ctx, ax, ay, 0, last, DRAGON_COLORS[q]);
        ctx.globalAlpha = 1;
        if (turning) polyline(ctx, bx, by, 0, last, '#ffffff');
      } else if (colorMode === 'gen') {
        // Round g added segments [2^(g-1), 2^g), i.e. points 2^(g-1)..2^g.
        polyline(ctx, ax, ay, 0, 1, genColor(0));
        for (var g = 1; g <= gen; g++) polyline(ctx, ax, ay, 1 << (g - 1), 1 << g, genColor(g));
        if (turning) polyline(ctx, bx, by, 0, last, genColor(gen + 1));
      } else {
        drawAlongPath(ctx, last, turning);
      }
      ctx.restore();
    }

    // Mark the pivot the next copy swings around.
    if (!four && gen < MAX_GEN) {
      ctx.fillStyle = '#ece8df';
      ctx.beginPath();
      ctx.arc(ax[last], ay[last], Math.max(2.5, ctx.lineWidth * 1.3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Color by position along the finished path, in ~120 bands. Copy point i
  // ends up at index 2·last − i once it is committed.
  function drawAlongPath(ctx, last, turning) {
    var total = turning ? 2 * last : last;
    var chunk = Math.max(1, Math.ceil(total / 120));
    var a, b;
    for (a = 0; a < last; a += chunk) {
      b = Math.min(a + chunk, last);
      polyline(ctx, ax, ay, a, b, V.gradient(V.SPECTRUM, (a + b) / 2 / total));
    }
    if (!turning) return;
    for (a = 0; a < last; a += chunk) {
      b = Math.min(a + chunk, last);
      polyline(ctx, bx, by, a, b, V.gradient(V.SPECTRUM, (2 * last - (a + b) / 2) / total));
    }
  }

  function syncControls() {
    var text = 'Round ' + gen + ' of ' + MAX_GEN + '   ' + (1 << gen).toLocaleString() + (gen ? ' segments' : ' segment');
    if (phase === 'turn') text += '   turning ' + Math.round(theta * 180 / Math.PI) + '°';
    V.setText(readout, text);
    V.setText(roundOut, gen + ' of ' + MAX_GEN);
    if (+roundInput.value !== gen && document.activeElement !== roundInput) roundInput.value = gen;
    backBtn.disabled = gen === 0 && phase !== 'turn';
    nextBtn.disabled = gen >= MAX_GEN;
    if (!playing) V.setText(playBtn, gen >= MAX_GEN ? 'Replay' : 'Play');
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);

  playBtn.addEventListener('click', function () {
    if (!playing && gen >= MAX_GEN) goTo(0);
    setPlaying(!playing);
  });

  nextBtn.addEventListener('click', next);
  backBtn.addEventListener('click', back);

  V.ctl(section, 'reset').addEventListener('click', function () { goTo(0); });

  roundInput.addEventListener('input', function () {
    setPlaying(false);
    goTo(parseInt(roundInput.value, 10));
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return v.toFixed(2) + '×'; },
    function (v) { speed = v; });

  V.segmented(V.ctl(section, 'color'), function (mode) {
    colorMode = mode;
    stage.dirty = true;
  });

  V.toggle(V.ctl(section, 'four'), function (on) {
    four = on;
    stage.dirty = true;
  });
})();
