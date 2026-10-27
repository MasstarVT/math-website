// Fibonacci word fractal: S₀ = 0, S₁ = 01, Sₙ = Sₙ₋₁ Sₙ₋₂. For the letter
// at position k (from 1), step forward; if it's a 0, turn left when k is
// even and right when k is odd. Every three steps of n, the curve is
// 1 + √2 times bigger.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('fibword');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var nInput = V.ctl(section, 'n');
  var nOut = V.ctl(section, 'n-out');
  var growBtn = V.ctl(section, 'grow');
  var colorGroup = V.ctl(section, 'color');
  var angleGroup = V.ctl(section, 'angle');

  var PHI = (1 + Math.sqrt(5)) / 2;
  var GROW_SECONDS = 5;
  var TAPE_H = 30;
  var n = 20;
  var angle = 90;
  var colorBy = 'path';
  var word = '';
  var pts = null;           // x, y of every corner, Float64Array
  var dirty = true;
  var growing = !V.reducedMotion;
  var drawn = 0;
  var fit = null, lastKey = '';

  function build() {
    var a = '0', b = '01';
    if (n === 0) word = a;
    else {
      for (var i = 1; i < n; i++) { var c = b + a; a = b; b = c; }
      word = b;
    }
    var len = word.length, x = 0, y = 0, h = 0, turn = angle * Math.PI / 180;
    pts = new Float64Array((len + 1) * 2);
    var minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (var k = 1; k <= len; k++) {
      x += Math.cos(h);
      y += Math.sin(h);
      // Rounding keeps right-angle paths exactly on the grid.
      if (angle === 90) { x = Math.round(x); y = Math.round(y); }
      pts[k * 2] = x;
      pts[k * 2 + 1] = y;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (word[k - 1] === '0') h += k % 2 === 0 ? turn : -turn;
    }
    pts.box = [minX, minY, maxX, maxY];
    dirty = false;
    drawn = growing ? 0 : len;
    lastKey = '';
  }

  function layoutFit(W, H) {
    var b = pts.box, bw = Math.max(b[2] - b[0], 1), bh = Math.max(b[3] - b[1], 1);
    var top = 84, bottom = TAPE_H + 18, side = 18;
    var s = Math.min((W - 2 * side) / bw, (H - top - bottom) / bh);
    // Screen y points down, so flip to keep left turns counterclockwise.
    return { s: s, ox: W / 2 - (b[0] + b[2]) / 2 * s, oy: top + (H - top - bottom) / 2 + (b[1] + b[3]) / 2 * s };
  }

  // Draw steps i0 to i1 in batches, each with one color.
  function strokeRange(ctx, i0, i1) {
    var len = word.length, f = fit;
    ctx.lineWidth = Math.max(0.9, Math.min(2.2, f.s * 0.3));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (colorBy === 'letter') {
      [['0', '#ffb454'], ['1', '#6ee7ff']].forEach(function (c) {
        ctx.strokeStyle = c[1];
        ctx.beginPath();
        for (var k = i0; k < i1; k++) {
          if (word[k] !== c[0]) continue;
          ctx.moveTo(f.ox + pts[k * 2] * f.s, f.oy - pts[k * 2 + 1] * f.s);
          ctx.lineTo(f.ox + pts[k * 2 + 2] * f.s, f.oy - pts[k * 2 + 3] * f.s);
        }
        ctx.stroke();
      });
      return;
    }
    var chunk = Math.max(16, Math.ceil(len / 240));
    for (var a = i0; a < i1; a = b) {
      var b = Math.min(i1, (Math.floor(a / chunk) + 1) * chunk);
      ctx.strokeStyle = V.gradient(V.SPECTRUM, (a + b) / 2 / len);
      ctx.beginPath();
      ctx.moveTo(f.ox + pts[a * 2] * f.s, f.oy - pts[a * 2 + 1] * f.s);
      for (var k = a + 1; k <= b; k++) ctx.lineTo(f.ox + pts[k * 2] * f.s, f.oy - pts[k * 2 + 1] * f.s);
      ctx.stroke();
    }
  }

  function frame(dt, st) {
    if (dirty) build();
    var ctx = st.ctx, W = st.width, H = st.height, len = word.length;
    var key = W + 'x' + H;
    var full = key !== lastKey;
    if (full) {
      lastKey = key;
      fit = layoutFit(W, H);
      ctx.clearRect(0, 0, W, H);
      strokeRange(ctx, 0, drawn);
    }
    var before = drawn;
    if (growing && drawn < len) {
      drawn = Math.min(len, drawn + Math.max(1, Math.ceil(len * dt / GROW_SECONDS)));
      strokeRange(ctx, before, drawn);
      if (drawn >= len) setGrowing(false);
    }
    if (!full && before === drawn && !st.dirty) return;
    st.dirty = false;
    drawTape(ctx, W, H);
    updateReadout();
  }

  // The word itself on a tape, with the letter being drawn lit up.
  function drawTape(ctx, W, H) {
    var y = H - TAPE_H - 6, cell = 9, m = Math.floor((W - 24) / cell);
    ctx.clearRect(0, y - 4, W, TAPE_H + 10);
    ctx.fillStyle = 'rgba(20,22,33,0.9)';
    ctx.strokeStyle = '#222534';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(10, y, W - 20, TAPE_H, 8); else ctx.rect(10, y, W - 20, TAPE_H);
    ctx.fill();
    ctx.stroke();
    var cur = drawn < word.length ? drawn : -1;
    var start = cur < 0 ? 0 : Math.max(0, Math.min(cur - (m >> 1), word.length - m));
    var x0 = 12 + (W - 24 - m * cell) / 2;
    ctx.font = '500 12px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < m && start + i < word.length; i++) {
      var cx = x0 + i * cell + cell / 2;
      if (start + i === cur) {
        ctx.fillStyle = '#ffb454';
        ctx.fillRect(cx - cell / 2, y + 4, cell, TAPE_H - 8);
        ctx.fillStyle = '#0a0b10';
      } else {
        ctx.fillStyle = word[start + i] === '0' ? '#ece8df' : '#6f7286';
      }
      ctx.fillText(word[start + i], cx, y + TAPE_H / 2);
    }
  }

  function fmt(v) { return v.toLocaleString('en-US'); }

  function updateReadout() {
    var len = word.length, zeros = 0;
    for (var i = 0; i < len; i++) if (word[i] === '0') zeros++;
    var b = pts.box;
    V.setText(readout, fmt(len) + ' letters · ' + fmt(zeros) + ' 0s · ' + fmt(len - zeros) + ' 1s\n' +
      '0s ÷ 1s = ' + (zeros / Math.max(1, len - zeros)).toFixed(6) + ', φ = ' + PHI.toFixed(6) +
      (angle === 90 ? '\nFits in a box ' + fmt(b[2] - b[0]) + ' × ' + fmt(b[3] - b[1]) : ''));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function refresh() {
    dirty = true;
    lastKey = '';
    stage.dirty = true;
  }

  function setGrowing(g) {
    growing = g;
    growBtn.textContent = g ? 'Skip to the end' : 'Draw it again';
  }

  function fib(k) { var a = 1, b = 2; for (var i = 0; i < k; i++) { var c = a + b; a = b; b = c; } return a; }

  V.range(nInput, nOut, function (v) { return fmt(fib(v)) + ' letters'; }, function (v) {
    if (v === n && pts) return;
    n = v;
    if (pts) setGrowing(false);
    refresh();
  });

  growBtn.addEventListener('click', function () {
    setGrowing(!growing);
    drawn = growing ? 0 : word.length;
    lastKey = '';
    stage.dirty = true;
  });

  V.segmented(colorGroup, function (v) { colorBy = v; lastKey = ''; stage.dirty = true; });

  V.segmented(angleGroup, function (v) {
    angle = parseFloat(v);
    refresh();
  });

  setGrowing(growing);
})();
