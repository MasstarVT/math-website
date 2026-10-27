// Langton's ant and its multi-color cousins (turmites). The rule string has
// one letter per color: on color i the ant turns rule[i] (R = 90° right,
// L = 90° left), bumps the cell to color i+1, then steps forward.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('langton');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var CELL = 3;
  var DX = [0, 1, 0, -1];
  var DY = [-1, 0, 1, 0];

  var rule = 'RL';
  var turns;
  var palette;
  var cols = 0, rows = 0;
  var grid, pixels, image, off, offCtx;
  var ant;
  var steps = 0;
  var perFrame = 25;
  var playing = !V.reducedMotion;

  // Pack a CSS-ish rgb triple into the canvas' little-endian ABGR word.
  function pack(r, g, b) {
    return (255 << 24 | b << 16 | g << 8 | r) >>> 0;
  }

  function buildPalette(n) {
    var p = new Uint32Array(n);
    p[0] = pack(13, 15, 22);
    for (var i = 1; i < n; i++) {
      var t = n === 2 ? 0.92 : (i - 1) / (n - 2);
      var m = V.gradient(V.SPECTRUM, t).match(/\d+/g);
      p[i] = pack(+m[0], +m[1], +m[2]);
    }
    return p;
  }

  function reset(st) {
    turns = Array.prototype.map.call(rule, function (c) { return c === 'R' ? 1 : 3; });
    palette = buildPalette(rule.length);
    cols = Math.max(60, Math.floor(st.width / CELL));
    rows = Math.max(60, Math.floor(st.height / CELL));
    grid = new Uint8Array(cols * rows);
    off = document.createElement('canvas');
    off.width = cols;
    off.height = rows;
    offCtx = off.getContext('2d');
    image = offCtx.createImageData(cols, rows);
    pixels = new Uint32Array(image.data.buffer);
    pixels.fill(palette[0]);
    ant = { x: cols >> 1, y: rows >> 1, dir: 0 };
    steps = 0;
    st.dirty = true;
  }

  function run(n) {
    var x = ant.x, y = ant.y, dir = ant.dir, len = turns.length;
    for (var i = 0; i < n; i++) {
      var k = y * cols + x;
      var c = grid[k];
      dir = (dir + turns[c]) & 3;
      c = c + 1 === len ? 0 : c + 1;
      grid[k] = c;
      pixels[k] = palette[c];
      x += DX[dir];
      y += DY[dir];
      if (x < 0) x += cols; else if (x >= cols) x -= cols;
      if (y < 0) y += rows; else if (y >= rows) y -= rows;
    }
    ant.x = x; ant.y = y; ant.dir = dir;
    steps += n;
  }

  function frame(dt, st) {
    if (!grid) reset(st);
    if (playing) {
      run(perFrame);
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;

    offCtx.putImageData(image, 0, 0);
    var ctx = st.ctx;
    var sx = st.width / cols, sy = st.height / rows;
    ctx.fillStyle = '#0d0f16';
    ctx.fillRect(0, 0, st.width, st.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, cols * sx, rows * sy);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ant.x * sx - 1, ant.y * sy - 1, sx + 2, sy + 2);

    V.setText(readout, 'Step ' + steps.toLocaleString());
  }

  var stage = V.createStage(canvas, {
    frame: frame,
    resize: function (st) {
      // Start over only if the grid no longer fits the new shape.
      if (grid && Math.abs(Math.floor(st.width / CELL) - cols) > 2) grid = null;
    }
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'reset').addEventListener('click', function () { reset(stage); });

  V.ctl(section, 'one').addEventListener('click', function () {
    setPlaying(false);
    if (!grid) reset(stage);
    run(1);
    stage.dirty = true;
  });

  V.segmented(V.ctl(section, 'rule'), function (r) {
    rule = r;
    reset(stage);
  });

  // The slider is logarithmic: 1 to ~20,000 steps per frame.
  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { var n = Math.round(Math.pow(10, v)); return n.toLocaleString() + ' / frame'; },
    function (v) { perFrame = Math.round(Math.pow(10, v)); });
})();
