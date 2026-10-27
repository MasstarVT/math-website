// The abelian sandpile: a square holding 4 or more grains topples, sending one
// grain to each neighbor. Grains pushed past the edge are lost. Toppling order
// never changes the final pile, so we topple in whatever order is fastest.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('sandpile');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var BIG = 301;        // grid for pouring
  var BOX = 161;        // grid for the identity pile
  var COLORS = [[0, 0, 0, 0], [124, 140, 255, 255], [255, 95, 162, 255], [255, 209, 102, 255]];

  var mode = 'pour';
  var N = BIG;
  var h = new Uint32Array(BIG * BIG);
  var queue = new Int32Array(BIG * BIG);
  var queued = new Uint8Array(BIG * BIG);
  var qHead = 0, qLen = 0;
  var grains = 0, topples = 0;
  var box = null;        // extent of the sand, for zooming
  var full = false;
  var phase = 0;         // identity: 1 toppling the 6s, 2 toppling 6 minus that, 3 done
  var playing = !V.reducedMotion;
  var rate = 64;         // grains per pour
  var layer = document.createElement('canvas');
  var lctx = layer.getContext('2d');
  var image = null;
  var view = 0;          // eased half-width of the view, in cells

  function reset() {
    N = mode === 'pour' ? BIG : BOX;
    h.fill(0);
    queued.fill(0);
    qHead = qLen = 0;
    grains = topples = 0;
    full = false;
    var c = (N - 1) / 2;
    box = { x0: c, x1: c, y0: c, y1: c };
    layer.width = N;
    layer.height = N;
    image = lctx.createImageData(N, N);
    view = 0;
    phase = 0;
    if (mode === 'identity') {
      // Step 1: fill every square with 6 grains and topple.
      for (var i = 0; i < N * N; i++) add(i, 6);
      box = { x0: 0, x1: N - 1, y0: 0, y1: N - 1 };
      phase = 1;
    }
  }

  function add(i, k) {
    h[i] += k;
    if (h[i] >= 4 && !queued[i]) {
      queued[i] = 1;
      queue[(qHead + qLen) % queue.length] = i;
      qLen++;
    }
  }

  // Topple until stable, or until the budget of topple events runs out.
  function relax(budget, deadline) {
    var n = 0;
    while (qLen > 0 && n < budget) {
      var i = queue[qHead];
      qHead = (qHead + 1) % queue.length;
      qLen--;
      queued[i] = 0;
      var v = h[i];
      if (v < 4) continue;
      var t = v >> 2;
      h[i] = v & 3;
      topples += t;
      var x = i % N, y = (i - x) / N;
      if (x > 0) add(i - 1, t);
      if (x < N - 1) add(i + 1, t);
      if (y > 0) add(i - N, t);
      if (y < N - 1) add(i + N, t);
      if (x - 1 < box.x0) box.x0 = Math.max(0, x - 1);
      if (x + 1 > box.x1) box.x1 = Math.min(N - 1, x + 1);
      if (y - 1 < box.y0) box.y0 = Math.max(0, y - 1);
      if (y + 1 > box.y1) box.y1 = Math.min(N - 1, y + 1);
      n++;
      if ((n & 4095) === 0 && performance.now() > deadline) break;
    }
  }

  function frame(dt, st) {
    var c = (N - 1) / 2;
    if (playing && !full) {
      var deadline = performance.now() + 9;
      if (mode === 'pour') {
        if (qLen === 0) {
          add(c * N + c, rate);
          grains += rate;
        }
        relax(Infinity, deadline);
        if (box.x0 <= 2 || box.y0 <= 2) { full = true; setPlaying(false); }
      } else if (phase < 3) {
        relax(Infinity, deadline);
        if (qLen === 0 && phase === 1) {
          // Step 2: take what's left away from 6 and topple again.
          for (var j = 0; j < N * N; j++) { h[j] = 6 - h[j]; add(j, 0); }
          phase = 2;
        } else if (qLen === 0 && phase === 2) {
          phase = 3;
        }
      }
    }

    var d = image.data;
    for (var i = 0, o = 0; i < N * N; i++, o += 4) {
      var v = h[i];
      if (v >= 4) { d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 255; continue; }
      var col = COLORS[v];
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = col[3];
    }
    lctx.putImageData(image, 0, 0);

    // Zoom so the pile fills the view, easing as it grows.
    var half = Math.max(c - box.x0, box.x1 - c, c - box.y0, box.y1 - c, 6) + 1.5;
    view = view ? view + (half - view) * Math.min(1, dt * 2) : half;
    if (mode === 'identity') view = half;

    var W = st.width, H = st.height, ctx = st.ctx;
    var S = Math.min(W, H) - 24, cell = S / (view * 2);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(layer, W / 2 - (c + 0.5) * cell, H / 2 - (c + 0.5) * cell, N * cell, N * cell);
    if (mode === 'identity') {
      ctx.strokeStyle = 'rgba(236,232,223,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(W / 2 - N / 2 * cell, H / 2 - N / 2 * cell, N * cell, N * cell);
    }

    var state = full ? 'Reached the edge' : qLen ? 'Toppling…' : 'Stable';
    var line1 = mode === 'pour' ? 'Grains ' + grains.toLocaleString()
      : phase === 1 ? 'Step 1: topple a box of 6s'
      : phase === 2 ? 'Step 2: topple 6 minus that'
      : 'The pile that acts like zero';
    V.setText(readout, line1 + '\nTopples ' + topples.toLocaleString() + '   ' + state);
  }

  V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    if (!playing && full) reset();
    setPlaying(!playing);
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    reset();
    setPlaying(true);
  });

  var rateInput = V.ctl(section, 'rate');
  V.range(rateInput, V.ctl(section, 'rate-out'),
    function (v) { return Math.pow(2, v).toLocaleString() + ' grains at a time'; },
    function (v) { rate = Math.pow(2, v); });

  V.segmented(V.ctl(section, 'mode'), function (v) {
    mode = v;
    rateInput.disabled = mode !== 'pour';
    reset();
    setPlaying(true);
  });

  reset();
})();
