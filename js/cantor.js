// Cantor set: remove the open middle third of every piece, forever. The
// devil's staircase c(x) is flat on every removed third and climbs only on
// the Cantor set: read x in base 3, change 2s to 1s, stop at the first 1,
// and read the result in base 2.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('cantor');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var roundInput = V.ctl(section, 'round');
  var roundOut = V.ctl(section, 'round-out');

  var MAX_ROUND = 7;
  var round = V.reducedMotion ? 4 : 0;
  var trans = 1;            // 0 → 1 while the newest middle thirds vanish
  var playing = !V.reducedMotion;
  var wait = 0;
  var hoverX = null;        // in [0, 1]
  var NICE = [[1, 4], [3, 4], [1, 3], [2, 3], [1, 9], [2, 9], [7, 9], [8, 9], [1, 10], [9, 10], [1, 2]];

  // The staircase after n rounds: linear on the pieces left, flat on the gaps.
  function stair(x, n) {
    if (n === 0) return x;
    if (x < 1 / 3) return stair(3 * x, n - 1) / 2;
    if (x > 2 / 3) return 0.5 + stair(3 * x - 2, n - 1) / 2;
    return 0.5;
  }

  // The round (1, 2, …) in which x is removed, or 0 if it never is.
  function removedIn(x, depth) {
    for (var k = 1; k <= depth; k++) {
      x *= 3;
      var d = Math.floor(x + 1e-12);
      x -= d;
      if (d === 1 && x > 1e-9) return k;
      if (d === 1) return 0;
    }
    return 0;
  }

  function ternary(x, n) {
    var s = '0.';
    for (var k = 0; k < n; k++) {
      x *= 3;
      var d = Math.min(2, Math.floor(x + 1e-12));
      s += d;
      x = Math.max(0, x - d);
    }
    return s + '…';
  }

  // Base 3 to base 2: 2s become 1s, and the first 1 ends it.
  function binaryHeight(x, n) {
    var s = '0.', v = 0, w = 0.5;
    for (var k = 0; k < 40; k++) {
      x *= 3;
      var d = Math.min(2, Math.floor(x + 1e-12));
      x = Math.max(0, x - d);
      var b = d === 0 ? 0 : 1;
      if (k < n) s += b;
      v += b * w;
      w /= 2;
      if (d === 1) break;
    }
    return { text: s + (k < n - 1 ? '' : '…'), value: v };
  }

  function layout(W, H) {
    var left = 34, right = 34;
    var rows = MAX_ROUND + 1, rowH = H < 420 ? 11 : 14;
    var barsTop = H - 18 - rows * rowH;
    return {
      x: left, w: W - left - right,
      gy: 18, gh: barsTop - 34 - 18,
      by: barsTop, rowH: rowH
    };
  }

  function frame(dt, st) {
    var animating = false;
    if (trans < 1) {
      trans = Math.min(1, trans + dt / 0.9);
      animating = true;
    } else if (playing) {
      wait += dt;
      if (wait > 0.5) {
        wait = 0;
        if (round < MAX_ROUND) setRound(round + 1, true);
        else setPlaying(false);
      }
    }
    if (!animating && !st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height, L = layout(W, H);
    ctx.clearRect(0, 0, W, H);
    var e = V.easeInOut(trans);
    var X = function (x) { return L.x + x * L.w; };
    var Y = function (y) { return L.gy + (1 - y) * L.gh; };

    // Faint bands under every gap removed so far, down through the graph.
    ctx.fillStyle = 'rgba(167,139,250,0.07)';
    gaps(Math.min(round, 4), function (a, b, k) {
      var alpha = k === round ? e : 1;
      if (alpha < 1) ctx.globalAlpha = alpha;
      ctx.fillRect(X(a), L.gy, X(b) - X(a), L.gh);
      ctx.globalAlpha = 1;
    });

    // Axes.
    ctx.strokeStyle = 'rgba(111,114,134,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(1)); ctx.lineTo(X(0), Y(0)); ctx.lineTo(X(1), Y(0));
    ctx.stroke();
    ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = '#6f7286';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    [[0, '0'], [1 / 3, '1/3'], [2 / 3, '2/3'], [1, '1']].forEach(function (t) { ctx.fillText(t[1], X(t[0]), Y(0) + 6); });
    // Heights go on the right, clear of the readout.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    [[0.5, '1/2'], [1, '1']].forEach(function (t) {
      ctx.fillText(t[1], X(1) + 7, Y(t[0]));
      ctx.strokeStyle = 'rgba(111,114,134,0.25)';
      ctx.beginPath(); ctx.moveTo(X(0), Y(t[0])); ctx.lineTo(X(1), Y(t[0])); ctx.stroke();
    });

    // The staircase, morphing from the last round to this one. Flat steps
    // are violet, the rising parts white.
    var cols = Math.round(L.w), prevRound = Math.max(0, round - 1);
    var flat = new Path2D(), rise = new Path2D(), px = 0, py = 0;
    for (var i = 0; i <= cols; i++) {
      var x = i / cols;
      var y = round === 0 || e >= 1 ? stair(x, round) : stair(x, prevRound) + (stair(x, round) - stair(x, prevRound)) * e;
      var sx = X(x), sy = Y(y);
      if (i) {
        var isFlat = removedIn(x, round) > 0;
        var path = isFlat ? flat : rise;
        path.moveTo(px, py);
        path.lineTo(sx, sy);
      }
      px = sx;
      py = sy;
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#a78bfa';
    ctx.stroke(flat);
    ctx.strokeStyle = '#ece8df';
    ctx.stroke(rise);

    // The bars: round k shows the 2^k pieces left after k cuts.
    ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'right';
    for (var k = 0; k <= MAX_ROUND; k++) {
      var y0 = L.by + k * L.rowH, bh = L.rowH * 0.55;
      ctx.fillStyle = k <= round ? '#6f7286' : 'rgba(111,114,134,0.35)';
      ctx.fillText(String(k), X(0) - 7, y0 + bh / 2);
      if (k > round) continue;
      var fresh = k === round && trans < 1;
      pieces(k, function (a, b) {
        ctx.fillStyle = V.gradient([[167, 139, 250], [196, 107, 255], [255, 95, 162]], k / MAX_ROUND);
        if (fresh) ctx.globalAlpha = 0.35 + 0.65 * e;
        ctx.fillRect(X(a), y0, Math.max(X(b) - X(a), 1 / st.dpr), bh);
        ctx.globalAlpha = 1;
      });
      if (fresh) {
        // The middle thirds of the round before, fading out.
        ctx.fillStyle = 'rgba(255,95,162,' + (0.8 * (1 - e)).toFixed(3) + ')';
        gaps(k, function (a, b, kk) {
          if (kk !== k) return;
          var m = (a + b) / 2, half = (b - a) / 2 * (1 - e);
          ctx.fillRect(X(m - half), y0 + bh * e / 2, X(m + half) - X(m - half), bh * (1 - e));
        });
      }
    }

    // The probe.
    var lines;
    if (hoverX !== null) {
      var hx = hoverX.v, sxp = X(hx);
      ctx.strokeStyle = 'rgba(236,232,223,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(sxp, L.gy); ctx.lineTo(sxp, L.by + (MAX_ROUND + 1) * L.rowH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sxp, Y(stair(hx, round)), 4.5, 0, Math.PI * 2);
      ctx.fill();
      var r = removedIn(hx, 40), bin = binaryHeight(hx, 8);
      lines = [
        'x = ' + (hoverX.name || hx.toFixed(4)) + ', base 3: ' + ternary(hx, 8),
        r ? 'Removed in round ' + r + ': on a flat step' : 'Never removed: in the Cantor set',
        'Height, base 2: ' + bin.text + ' = ' + bin.value.toFixed(4)
      ];
    } else {
      var len = Math.pow(2 / 3, round);
      lines = [
        'Round ' + round + ': ' + Math.pow(2, round) + (round ? ' pieces' : ' piece') + ', length ' + len.toFixed(3),
        'The staircase is flat on ' + (100 * (1 - len)).toFixed(1) + '% of it'
      ];
    }
    V.setText(readout, lines.join('\n'));
  }

  // Visit the 2^k intervals left after k rounds.
  function pieces(k, fn) {
    var n = Math.pow(2, k), w = Math.pow(3, -k);
    for (var i = 0; i < n; i++) {
      var a = 0, j = i, p = 1 / 3;
      for (var d = 0; d < k; d++) {
        if ((j >> (k - 1 - d)) & 1) a += 2 * p;
        p /= 3;
      }
      fn(a, a + w);
    }
  }

  // Visit every removed middle third of rounds 1 to k: fn(start, end, round).
  function gaps(k, fn) {
    for (var r = 1; r <= k; r++) {
      var w = Math.pow(3, -r);
      pieces(r - 1, function (a) { fn(a + w, a + 2 * w, r); });
    }
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Pointer ----

  function point(e) {
    var b = canvas.getBoundingClientRect(), L = layout(stage.width, stage.height);
    var x = (e.clientX - b.left - L.x) / L.w;
    if (x < -0.02 || x > 1.02) { hoverX = null; stage.dirty = true; return; }
    x = Math.max(0, Math.min(1, x));
    // Snap to a few interesting fractions.
    var snap = null;
    NICE.forEach(function (f) {
      if (Math.abs(x - f[0] / f[1]) * L.w < 4) snap = f;
    });
    hoverX = snap ? { v: snap[0] / snap[1], name: snap[0] + '/' + snap[1] } : { v: x, name: '' };
    stage.dirty = true;
  }
  canvas.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') point(e); });
  canvas.addEventListener('pointerdown', point);
  canvas.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse') { hoverX = null; stage.dirty = true; }
  });

  // ---- Controls ----

  function setRound(n, animate) {
    trans = animate && n === round + 1 ? 0 : 1;
    round = n;
    roundInput.value = String(n);
    roundOut.textContent = String(n);
    stage.dirty = true;
  }

  roundInput.addEventListener('input', function () {
    setPlaying(false);
    setRound(parseInt(roundInput.value, 10), true);
  });

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = p ? 'Pause' : round >= MAX_ROUND ? 'Play again' : 'Play';
  }
  playBtn.addEventListener('click', function () {
    if (!playing && round >= MAX_ROUND) setRound(0, false);
    setPlaying(!playing);
    wait = 0;
  });

  setRound(round, false);
  setPlaying(playing);
})();
