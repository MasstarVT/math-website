// Diffusion-limited aggregation: particles wander at random, one at a time,
// until they touch the cluster and stick. Tips catch wanderers before they
// can reach the gaps, so the cluster grows into branching arms.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('dla');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var N = 301;
  var C = (N - 1) / 2;
  var DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];

  var mode = 'point';
  var stick = 1;
  var grid = new Uint8Array(N * N);
  var layer = document.createElement('canvas');
  layer.width = N;
  layer.height = N;
  var lctx = layer.getContext('2d');
  var image = lctx.createImageData(N, N);
  var count = 0;
  var reach = 0;        // point: farthest particle from the center; line: height of the tallest
  var walker = null;
  var done = false;
  var playing = !V.reducedMotion;
  var perFrame = 8;     // particles allowed to stick each frame
  var view = 0;

  function limit() { return mode === 'point' ? C - 12 : N * 0.62; }

  // Color by how far the cluster had grown when the particle arrived.
  function paint(x, y) {
    var c = V.gradient(V.SPECTRUM, Math.min(1, reach / limit())).slice(4, -1).split(',');
    var o = (y * N + x) * 4;
    image.data[o] = +c[0];
    image.data[o + 1] = +c[1];
    image.data[o + 2] = +c[2];
    image.data[o + 3] = 255;
  }

  function occupy(x, y) {
    grid[y * N + x] = 1;
    paint(x, y);
    count++;
    if (mode === 'point') reach = Math.max(reach, Math.hypot(x - C, y - C));
    else reach = Math.max(reach, N - 1 - y);
  }

  function reset() {
    grid.fill(0);
    image.data.fill(0);
    count = 0;
    reach = 0;
    walker = null;
    done = false;
    view = 0;
    if (mode === 'point') occupy(C, C);
    else for (var x = 0; x < N; x++) occupy(x, N - 1);
    count = 0;
  }

  function launch() {
    if (mode === 'point') {
      var a = Math.random() * Math.PI * 2, r = reach + 6;
      walker = { x: Math.round(C + Math.cos(a) * r), y: Math.round(C + Math.sin(a) * r) };
    } else {
      walker = { x: Math.floor(Math.random() * N), y: N - 1 - Math.round(reach) - 6 };
    }
  }

  function touching(x, y) {
    for (var k = 0; k < 4; k++) {
      var nx = x + DX[k], ny = y + DY[k];
      if (nx >= 0 && ny >= 0 && nx < N && ny < N && grid[ny * N + nx]) return true;
    }
    return false;
  }

  // Walk until the time budget runs out. Far from the cluster the walker takes
  // one long jump, which can't land on anything since nothing is that close.
  function run(deadline) {
    var steps = 0, stuck = 0;
    while (!done && stuck < perFrame) {
      if (!walker) launch();
      var w = walker, gap;
      if (mode === 'point') {
        var d = Math.hypot(w.x - C, w.y - C);
        if (d > reach * 2 + 30 || d > C - 2) { walker = null; continue; }
        gap = d - reach - 3;
      } else {
        var h = N - 1 - w.y;
        if (h > reach + 40) { walker = null; continue; }
        gap = h - reach - 3;
      }
      if (gap > 2) {
        var a = Math.random() * Math.PI * 2;
        w.x = Math.round(w.x + Math.cos(a) * gap);
        w.y = Math.round(w.y + Math.sin(a) * gap);
        if (mode === 'line') w.x = (w.x % N + N) % N;
        if (w.y < 0 || w.y >= N || w.x < 0 || w.x >= N) { walker = null; continue; }
      } else {
        var k = Math.floor(Math.random() * 4), nx = w.x + DX[k], ny = w.y + DY[k];
        if (mode === 'line') nx = (nx + N) % N;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) { walker = null; continue; }
        if (!grid[ny * N + nx]) { w.x = nx; w.y = ny; }
        if (touching(w.x, w.y) && Math.random() < stick) {
          occupy(w.x, w.y);
          walker = null;
          stuck++;
          // The forest stops while it still fits a wide canvas.
          if (reach > limit()) done = true;
        }
      }
      if ((++steps & 1023) === 0 && performance.now() > deadline) break;
    }
  }

  function frame(dt, st) {
    if (playing && !done) run(performance.now() + 8);
    lctx.putImageData(image, 0, 0);

    var W = st.width, H = st.height, ctx = st.ctx;
    var S = Math.min(W, H) - 24;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    if (mode === 'point') {
      // Zoom so the cluster fills the view, easing out as it grows.
      var half = Math.max(reach + 4, 14);
      view = view && !V.reducedMotion ? view + (half - view) * Math.min(1, dt * 2) : half;
      var cell = S / (view * 2);
      ctx.drawImage(layer, W / 2 - (C + 0.5) * cell, H / 2 - (C + 0.5) * cell, N * cell, N * cell);
    } else {
      var s = Math.max(W / N, H / N);
      ctx.drawImage(layer, (W - N * s) / 2, H - N * s, N * s, N * s);
    }

    V.setText(readout,
      'Particles ' + count.toLocaleString() + '\n' +
      (mode === 'point' ? 'Radius ' + Math.round(reach) : 'Height ' + Math.round(reach)) +
      (done ? '   full' : ''));
  }

  V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    if (!playing && done) reset();
    setPlaying(!playing);
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    reset();
    setPlaying(true);
  });

  V.segmented(V.ctl(section, 'mode'), function (v) {
    mode = v;
    reset();
    setPlaying(true);
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return Math.pow(2, v) + ' / frame'; },
    function (v) { perFrame = Math.pow(2, v); });

  V.range(V.ctl(section, 'stick'), V.ctl(section, 'stick-out'),
    function (v) { return Math.round(v * 100) + '%'; },
    function (v) { stick = v; });

  reset();
})();
