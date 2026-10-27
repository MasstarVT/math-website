// Conway's Game of Life: a live cell with two or three live neighbors survives,
// a dead cell with exactly three comes alive, and every other cell dies.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('life');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var presetGroup = V.ctl(section, 'preset');

  var COLS = 160, ROWS = 120;
  // A hidden border around the visible grid, so gliders fly off the edge
  // instead of piling up against it.
  var PAD = 24;
  var GW = COLS + PAD * 2, GH = ROWS + PAD * 2;
  // Patterns in run-length encoding: b dead, o alive, $ new row.
  var PATTERNS = {
    gun: '24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!',
    rpent: 'b2o$2o$bo!',
    acorn: 'bo$3bo$2o2b3o!'
  };
  var OLD = 80; // generations until a cell reaches the last color

  var grid = new Uint8Array(GW * GH);
  var next = new Uint8Array(GW * GH);
  var age = new Uint16Array(GW * GH);
  var fade = new Float32Array(GW * GH); // glow left where a cell just died
  var generation = 0;
  var playing = !V.reducedMotion;
  var rate = 15;
  var acc = 0;
  var layer = document.createElement('canvas');
  layer.width = COLS;
  layer.height = ROWS;
  var lctx = layer.getContext('2d');
  var image = lctx.createImageData(COLS, ROWS);
  var G = null; // where the grid sits on the canvas, from the last frame

  // Colors by age: newborn cells are white-hot and cool as they last.
  var AGE = [];
  for (var a = 0; a <= OLD; a++) {
    var c = V.gradient([[255, 250, 230], [255, 209, 102], [126, 224, 161], [110, 231, 255], [124, 140, 255]], a / OLD);
    AGE.push(c.slice(4, -1).split(',').map(Number));
  }

  function clear() {
    grid.fill(0);
    age.fill(0);
    fade.fill(0);
    generation = 0;
  }

  function set(x, y, v) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    var i = (y + PAD) * GW + x + PAD;
    if (v && !grid[i]) age[i] = 0;
    if (!v && grid[i]) fade[i] = 1;
    grid[i] = v;
  }

  function place(rle, ox, oy) {
    var x = 0, y = 0, num = '';
    for (var i = 0; i < rle.length; i++) {
      var ch = rle[i];
      if (ch >= '0' && ch <= '9') { num += ch; continue; }
      var k = num ? parseInt(num, 10) : 1;
      num = '';
      if (ch === 'b') x += k;
      else if (ch === 'o') { for (var j = 0; j < k; j++) set(ox + x + j, oy + y, 1); x += k; }
      else if (ch === '$') { y += k; x = 0; }
      else if (ch === '!') break;
    }
  }

  function load(name) {
    clear();
    if (name === 'random') {
      for (var y = 0; y < ROWS; y++) {
        for (var x = 0; x < COLS; x++) if (Math.random() < 0.3) set(x, y, 1);
      }
    } else if (name === 'gun') {
      place(PATTERNS.gun, 6, 18);
    } else if (name === 'rpent') {
      place(PATTERNS.rpent, COLS / 2 - 1, ROWS / 2 - 1);
    } else if (name === 'acorn') {
      place(PATTERNS.acorn, COLS / 2 - 3, ROWS / 2 - 1);
    }
    stage.dirty = true;
  }

  // One generation. The outermost ring of the hidden border always stays dead.
  function step() {
    for (var y = 1; y < GH - 1; y++) {
      for (var x = 1, i = y * GW + 1; x < GW - 1; x++, i++) {
        var n = grid[i - GW - 1] + grid[i - GW] + grid[i - GW + 1] +
          grid[i - 1] + grid[i + 1] +
          grid[i + GW - 1] + grid[i + GW] + grid[i + GW + 1];
        var live = n === 3 || (n === 2 && grid[i] === 1);
        next[i] = live ? 1 : 0;
        if (live) {
          age[i] = grid[i] ? Math.min(age[i] + 1, OLD) : 0;
        } else {
          fade[i] = grid[i] ? 1 : fade[i] * 0.8;
        }
      }
    }
    var t = grid;
    grid = next;
    next = t;
    generation++;
    stage.dirty = true;
  }

  function frame(dt, st) {
    if (playing) {
      acc += dt * rate;
      var steps = 0;
      while (acc >= 1 && steps < 4) { step(); acc -= 1; steps++; }
      if (acc > 1) acc = 0;
    }
    if (!st.dirty) return;
    st.dirty = false;

    var W = st.width, H = st.height;
    var cell = Math.min(W / COLS, H / ROWS);
    G = { cell: cell, x: (W - cell * COLS) / 2, y: (H - cell * ROWS) / 2 };

    var d = image.data, alive = 0;
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        var i = (y + PAD) * GW + x + PAD, o = (y * COLS + x) * 4;
        if (grid[i]) {
          var c = AGE[age[i]];
          d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
          alive++;
        } else if (fade[i] > 0.03) {
          d[o] = 126; d[o + 1] = 224; d[o + 2] = 161; d[o + 3] = Math.round(fade[i] * 70);
        } else {
          d[o + 3] = 0;
        }
      }
    }
    lctx.putImageData(image, 0, 0);

    var ctx = st.ctx;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(layer, G.x, G.y, cell * COLS, cell * ROWS);

    V.setText(readout, 'Generation ' + generation.toLocaleString() + '\nAlive ' + alive.toLocaleString());
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Drawing ----

  function cellAt(px, py) {
    if (!G) return null;
    var x = Math.floor((px - G.x) / G.cell), y = Math.floor((py - G.y) / G.cell);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
    return { x: x, y: y };
  }

  V.drag(canvas, {
    cursor: 'crosshair',
    hit: function (x, y) { return cellAt(x, y) ? {} : null; },
    move: function (h, px, py, first) {
      var c = cellAt(px, py);
      if (!c) return;
      if (first) {
        h.value = grid[(c.y + PAD) * GW + c.x + PAD] ? 0 : 1;
        h.last = c;
        V.setSegmented(presetGroup, '');
      }
      // Fill in the cells between pointer events so fast strokes have no gaps.
      var n = Math.max(Math.abs(c.x - h.last.x), Math.abs(c.y - h.last.y), 1);
      for (var k = 0; k <= n; k++) {
        set(Math.round(h.last.x + (c.x - h.last.x) * k / n), Math.round(h.last.y + (c.y - h.last.y) * k / n), h.value);
      }
      h.last = c;
      stage.dirty = true;
    }
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'one').addEventListener('click', step);
  V.ctl(section, 'reset').addEventListener('click', function () {
    clear();
    V.setSegmented(presetGroup, '');
    stage.dirty = true;
  });

  V.segmented(presetGroup, load);
  load('gun');

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return v + ' / second'; },
    function (v) { rate = v; });
})();
