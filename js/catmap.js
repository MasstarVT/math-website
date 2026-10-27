// Arnold's cat map on an N×N grid of pixels: (x, y) → (x + y, x + 2y) mod N.
// It's a slide sideways, (x + y, y), then a slide down, (x, x + y), each
// wrapping around. It only shuffles pixels, so it must repeat eventually.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('catmap');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var sizeGroup = V.ctl(section, 'size');

  var CHART_MAX = 240;
  var SHEAR_TIME = 0.55; // seconds per slide when showing the stretch

  var N = 0, pic = null, cur = null, mid = null, tmp = null, perm = null;
  var step = 0, period = 0, flip = -1, hold = 0, wantSize = 124;
  var playing = !V.reducedMotion;
  var rate = 4, acc = 0;
  var stretch = false, phase = 0; // 0..2 while a step is being shown as two slides
  var periods = null;
  var layer = document.createElement('canvas');
  var lctx = layer.getContext('2d');
  var image = null, out32 = null;
  var dirtyImage = true;

  // The smallest k with M^k = I (mod n), and the k (if any) with M^k = −I,
  // when the cat comes back upside down.
  function periodOf(n) {
    var a = 1, b = 0, c = 0, d = 1, half = -1;
    for (var k = 1; k <= 3 * n + 3; k++) {
      var na = (a + b) % n, nb = (a + 2 * b) % n, nc = (c + d) % n, nd = (c + 2 * d) % n;
      a = na; b = nb; c = nc; d = nd;
      if (half < 0 && n > 2 && a === n - 1 && b === 0 && c === 0 && d === n - 1) half = k;
      if (a === 1 % n && b === 0 && c === 0 && d === 1 % n) return { p: k, half: half };
    }
    return { p: 0, half: -1 };
  }

  // A cat face, drawn at the grid's own resolution.
  function drawCat(n) {
    var c = document.createElement('canvas');
    c.width = c.height = n;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.scale(n, n);
    var sky = x.createLinearGradient(0, 0, 1, 1);
    sky.addColorStop(0, '#1d5c58');
    sky.addColorStop(0.5, '#2c3f7a');
    sky.addColorStop(1, '#5b2f78');
    x.fillStyle = sky;
    x.fillRect(0, 0, 1, 1);
    // Stars, so the background has texture to scramble too.
    x.fillStyle = '#7ee0a1';
    [[0.1, 0.12], [0.86, 0.1], [0.08, 0.8], [0.9, 0.84], [0.5, 0.06], [0.16, 0.48], [0.86, 0.5]].forEach(function (s) {
      x.beginPath();
      x.arc(s[0], s[1], 0.022, 0, Math.PI * 2);
      x.fill();
    });
    function tri(a, b, cc, color) {
      x.fillStyle = color;
      x.beginPath();
      x.moveTo(a[0], a[1]);
      x.lineTo(b[0], b[1]);
      x.lineTo(cc[0], cc[1]);
      x.closePath();
      x.fill();
    }
    tri([0.2, 0.5], [0.24, 0.12], [0.47, 0.36], '#ffb454');
    tri([0.8, 0.5], [0.76, 0.12], [0.53, 0.36], '#ffb454');
    tri([0.26, 0.4], [0.27, 0.2], [0.41, 0.34], '#ff5fa2');
    tri([0.74, 0.4], [0.73, 0.2], [0.59, 0.34], '#ff5fa2');
    x.fillStyle = '#ffb454';
    x.beginPath();
    x.ellipse(0.5, 0.58, 0.32, 0.27, 0, 0, Math.PI * 2);
    x.fill();
    // Forehead stripes.
    x.strokeStyle = '#d9822b';
    x.lineWidth = 0.03;
    x.lineCap = 'round';
    [-0.07, 0, 0.07].forEach(function (o) {
      x.beginPath();
      x.moveTo(0.5 + o, 0.33);
      x.lineTo(0.5 + o * 0.8, 0.43);
      x.stroke();
    });
    // Eyes with slit pupils.
    [0.38, 0.62].forEach(function (ex) {
      x.fillStyle = '#ece8df';
      x.beginPath();
      x.ellipse(ex, 0.54, 0.075, 0.065, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#7ee0a1';
      x.beginPath();
      x.ellipse(ex, 0.54, 0.055, 0.058, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#0a0b10';
      x.beginPath();
      x.ellipse(ex, 0.54, 0.018, 0.05, 0, 0, Math.PI * 2);
      x.fill();
    });
    tri([0.46, 0.64], [0.54, 0.64], [0.5, 0.69], '#ff5fa2');
    x.strokeStyle = '#0a0b10';
    x.lineWidth = 0.018;
    x.beginPath();
    x.moveTo(0.5, 0.69);
    x.quadraticCurveTo(0.47, 0.75, 0.42, 0.73);
    x.moveTo(0.5, 0.69);
    x.quadraticCurveTo(0.53, 0.75, 0.58, 0.73);
    x.stroke();
    x.strokeStyle = '#ece8df';
    x.lineWidth = 0.012;
    [[-1, 0.66], [-1, 0.71], [1, 0.66], [1, 0.71]].forEach(function (w) {
      x.beginPath();
      x.moveTo(0.5 + w[0] * 0.1, 0.68);
      x.lineTo(0.5 + w[0] * 0.42, w[1] + (w[1] - 0.68) * 1.5);
      x.stroke();
    });
    return new Uint32Array(x.getImageData(0, 0, n, n).data.buffer);
  }

  function setSize(n) {
    N = n;
    pic = drawCat(n);
    cur = new Uint32Array(pic);
    mid = new Uint32Array(n * n);
    tmp = new Uint32Array(n * n);
    perm = new Int32Array(n * n);
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) perm[y * n + x] = ((x + 2 * y) % n) * n + (x + y) % n;
    }
    var info = periodOf(n);
    period = info.p;
    flip = info.half;
    layer.width = layer.height = n;
    image = lctx.createImageData(n, n);
    out32 = new Uint32Array(image.data.buffer);
    restart();
  }

  function restart() {
    cur.set(pic);
    step = 0;
    phase = 0;
    acc = 0;
    hold = 0;
    dirtyImage = true;
    if (stage) stage.dirty = true;
  }

  function stepOnce() {
    for (var i = 0; i < cur.length; i++) tmp[perm[i]] = cur[i];
    var t = cur;
    cur = tmp;
    tmp = t;
    step = period ? step % period + 1 : step + 1;
    if (step === period) { cur.set(pic); step = period; }
    dirtyImage = true;
  }

  // Draw the current image part-way through a slide: s from 0 to 1.
  function sheared(src, s, horizontal) {
    var n = N;
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var sx = x, sy = y;
        if (horizontal) sx = ((x - Math.floor(s * y + 0.5)) % n + n) % n;
        else sy = ((y - Math.floor(s * x + 0.5)) % n + n) % n;
        out32[y * n + x] = src[sy * n + sx];
      }
    }
  }

  function slideFull(src, dst, horizontal) {
    var n = N;
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (horizontal) dst[y * n + (x + y) % n] = src[y * n + x];
        else dst[((x + y) % n) * n + x] = src[y * n + x];
      }
    }
  }

  // Linger a moment when the cat is whole again, or upside down.
  function pauseIfSpecial() {
    if (step === period) hold = 1.6;
    else if (step === flip) hold = 1;
    return hold > 0;
  }

  function advance(dt) {
    if (hold > 0) { hold -= dt; return; }
    if (!stretch) {
      acc += dt * rate;
      var k = 0;
      while (acc >= 1 && k < 6) {
        stepOnce();
        acc -= 1;
        k++;
        if (pauseIfSpecial()) { acc = 0; break; }
      }
      if (acc > 1) acc = 0;
      return;
    }
    var before = phase;
    phase += dt / SHEAR_TIME;
    if (before < 1 && phase >= 1) slideFull(cur, mid, true);
    if (phase >= 2) {
      phase = 0;
      stepOnce();
      pauseIfSpecial();
      acc = 0;
    }
    dirtyImage = true;
  }

  function frame(dt, st) {
    if (!periods) {
      periods = [];
      for (var n = 2; n <= CHART_MAX; n++) periods[n] = periodOf(n).p;
    }
    if (!N) setSize(wantSize);
    if (playing) advance(dt);
    if (dirtyImage) st.dirty = true;
    if (!st.dirty) return;
    st.dirty = false;

    if (dirtyImage) {
      if (stretch && phase > 0 && phase < 1) sheared(cur, V.easeInOut(phase), true);
      else if (stretch && phase >= 1) sheared(mid, V.easeInOut(phase - 1), false);
      else out32.set(cur);
      lctx.putImageData(image, 0, 0);
      dirtyImage = false;
    }
    draw(st);
  }

  function layout(st) {
    var W = st.width, H = st.height, pad = 16;
    if (W / H > 1.15) {
      var size = Math.min(H - pad * 2, W * 0.6);
      return { size: size, ix: pad, iy: (H - size) / 2, chart: { x: size + pad * 3, y: pad + 50, w: W - size - pad * 4, h: H - pad * 2 - 62, across: false } };
    }
    // Narrow: the picture below the readout, the chart under it.
    var top = 52, csize = Math.min(W - pad * 2, H - top - 76);
    var cy = top + csize + 24;
    return { size: csize, ix: (W - csize) / 2, iy: top, chart: { x: pad, y: cy, w: W - pad * 2, h: H - cy - 20, across: true } };
  }

  function draw(st) {
    var ctx = st.ctx, L = layout(st);
    ctx.clearRect(0, 0, st.width, st.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(layer, L.ix, L.iy, L.size, L.size);
    ctx.strokeStyle = '#343a4e';
    ctx.lineWidth = 1;
    ctx.strokeRect(L.ix - 0.5, L.iy - 0.5, L.size + 1, L.size + 1);
    chart(ctx, L.chart);

    var text = 'Step ' + step + ' of ' + period;
    if (step === period && period) text = 'Back to the start\nafter ' + period + ' steps';
    else if (step === flip) text += '\nUpside down';
    V.setText(readout, text);
  }

  // Steps to return for every grid size, as bars. The chosen size is lit.
  function chart(ctx, r) {
    if (r.w < 60 || r.h < 30) return;
    var maxP = 0, n;
    for (n = 2; n <= CHART_MAX; n++) maxP = Math.max(maxP, periods[n]);
    var count = CHART_MAX - 1, gutter = r.across ? 0 : 28;
    var bx0 = r.x + gutter, bw0 = r.w - gutter;
    ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#9b9daf';
    ctx.fillText('Steps to come back', r.x, r.y - (r.across ? 6 : 22));
    if (!r.across) {
      ctx.fillStyle = '#6f7286';
      ctx.fillText('for grids 2 to ' + CHART_MAX, r.x, r.y - 8);
    }
    for (n = 2; n <= CHART_MAX; n++) {
      var f = periods[n] / maxP, on = n === N;
      ctx.fillStyle = on ? '#7ee0a1' : 'rgba(126, 224, 161, 0.3)';
      if (r.across) {
        var bw = r.w / count;
        ctx.fillRect(r.x + (n - 2) * bw, r.y + r.h - f * r.h, Math.max(1, bw - 0.4) + (on ? 1 : 0), f * r.h);
      } else {
        var bh = r.h / count;
        ctx.fillRect(bx0, r.y + (n - 2) * bh, f * bw0, Math.max(1, bh - 0.4) + (on ? 1 : 0));
      }
    }
    // Grid sizes along the side, and the chosen one's count.
    ctx.fillStyle = '#6f7286';
    if (!r.across) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      [50, 100, 150, 200].forEach(function (t) { ctx.fillText(String(t), r.x + gutter - 6, r.y + (t - 2) * r.h / count); });
    }
    ctx.fillStyle = '#ece8df';
    var label = N + '×' + N + ': ' + periods[N];
    if (r.across) {
      ctx.textAlign = N > CHART_MAX * 0.6 ? 'right' : 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(label, r.x + (N - 2) * r.w / count, r.y + r.h + 4);
    } else {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      var ly = r.y + (N - 2) * r.h / count, lx = bx0 + periods[N] / maxP * bw0 + 6;
      if (lx + 84 > r.x + r.w) { ctx.textAlign = 'right'; lx = r.x + r.w; ly -= 10; }
      ctx.fillText(label, lx, ly);
    }
  }

  var stage = null;
  stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'one').addEventListener('click', function () {
    if (!N) return;
    phase = 0;
    stepOnce();
    stage.dirty = true;
  });
  V.ctl(section, 'reset').addEventListener('click', function () { if (N) restart(); });

  V.segmented(sizeGroup, function (v) {
    wantSize = +v;
    if (N) setSize(wantSize);
  });

  V.toggle(V.ctl(section, 'stretch'), function (on) {
    stretch = on;
    phase = 0;
    dirtyImage = true;
    stage.dirty = true;
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return v + ' / second'; },
    function (v) { rate = v; });
})();
