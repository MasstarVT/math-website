// Elementary cellular automata. Each cell looks at itself and its two
// neighbors: 3 bits make a number 0-7, and bit number (4l + 2c + r) of the
// rule says whether the cell is alive in the next row.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('rule30');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var presetGroup = V.ctl(section, 'preset');
  var startGroup = V.ctl(section, 'start');
  var ruleIn = V.ctl(section, 'rule');
  var densityIn = V.ctl(section, 'density');

  var PRESETS = {
    30: { start: 'one', density: 0.5 },
    110: { start: 'random', density: 0.5 },
    184: { start: 'random', density: 0.55 }
  };
  var HIDDEN = 240; // extra cells beyond each edge, wrapped into a ring
  var LIVE = [167, 139, 250];

  var rule = 30, start = 'one', density = 0.5;
  var rate = 60, acc = 0;
  var playing = !V.reducedMotion;
  var L = null; // layout from the last resize
  var world = null, next = null, rows = null, head = 0, filled = 0, generation = 0;
  var centerBits = '';
  var layer = document.createElement('canvas');
  var lctx = layer.getContext('2d');
  var image = null;

  function layout(st) {
    var W = st.width, H = st.height;
    var c = Math.max(8, Math.min(16, Math.floor((W - 24) / 37)));
    var groupW = 3 * c, gap = (W - 24 - 8 * groupW) / 7;
    gap = Math.min(gap, c * 1.6);
    var keyW = 8 * groupW + 7 * gap;
    var keyH = c * 2 + 34;
    var cell = W >= 560 ? 3 : 2;
    var cols = Math.floor(W / cell), nrows = Math.floor((H - keyH - 6) / cell);
    return {
      W: W, H: H, c: c, groupW: groupW, gap: gap, kx: (W - keyW) / 2, ky: H - keyH + 10, keyH: keyH,
      cell: cell, cols: cols, rows: nrows, gx: (W - cols * cell) / 2
    };
  }

  function restart() {
    if (!L) return;
    var n = L.cols + HIDDEN * 2;
    world = new Uint8Array(n);
    next = new Uint8Array(n);
    if (start === 'one') world[Math.floor(n / 2)] = 1;
    else for (var i = 0; i < n; i++) world[i] = Math.random() < density ? 1 : 0;
    rows = new Uint8Array(L.cols * L.rows);
    head = 0;
    filled = 0;
    generation = 0;
    centerBits = '';
    acc = 0;
    record();
    if (stage) stage.dirty = true;
  }

  // Copy the visible middle of the current row into the history ring.
  function record() {
    var o = head * L.cols;
    for (var i = 0; i < L.cols; i++) rows[o + i] = world[HIDDEN + i];
    head = (head + 1) % L.rows;
    if (filled < L.rows) filled++;
    centerBits = (centerBits + world[Math.floor(world.length / 2)]).slice(-24);
  }

  function step() {
    var n = world.length;
    for (var i = 0; i < n; i++) {
      var l = world[i === 0 ? n - 1 : i - 1], r = world[i === n - 1 ? 0 : i + 1];
      next[i] = (rule >> (l << 2 | world[i] << 1 | r)) & 1;
    }
    var t = world;
    world = next;
    next = t;
    generation++;
    record();
  }

  function frame(dt, st) {
    if (!L) return;
    if (playing) {
      acc += dt * rate;
      var n = 0;
      while (acc >= 1 && n < 8) { step(); acc -= 1; n++; }
      if (acc > 1) acc = 0;
      if (n) st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx;
    ctx.clearRect(0, 0, L.W, L.H);

    // History, oldest row at the top.
    var d = image.data, cols = L.cols;
    d.fill(0);
    for (var r = 0; r < filled; r++) {
      var src = ((head - filled + r) % L.rows + L.rows) % L.rows * cols;
      var o = r * cols * 4;
      // Older rows fade, so the eye follows the growing edge.
      var f = r === filled - 1 ? -1 : 0.35 + 0.65 * Math.pow((r + 1) / filled, 1.5);
      var cr = f < 0 ? 236 : LIVE[0] * f, cg = f < 0 ? 232 : LIVE[1] * f, cb = f < 0 ? 223 : LIVE[2] * f;
      for (var i = 0; i < cols; i++, o += 4) {
        if (!rows[src + i]) continue;
        d[o] = cr;
        d[o + 1] = cg;
        d[o + 2] = cb;
        d[o + 3] = 255;
      }
    }
    lctx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(layer, L.gx, 0, cols * L.cell, L.rows * L.cell);

    // The key: all 8 neighborhoods, each with the cell it makes below.
    ctx.fillStyle = 'rgba(10, 11, 16, 0.92)';
    ctx.fillRect(0, L.H - L.keyH, L.W, L.keyH);
    ctx.fillStyle = '#222534';
    ctx.fillRect(0, L.H - L.keyH, L.W, 1);
    ctx.font = '500 ' + Math.max(10, Math.min(12, L.c * 0.8)) + 'px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var c = L.c;
    for (var g = 0; g < 8; g++) {
      var pattern = 7 - g, x0 = L.kx + g * (L.groupW + L.gap), y0 = L.ky;
      for (var k = 0; k < 3; k++) {
        var on = (pattern >> (2 - k)) & 1;
        cellBox(ctx, x0 + k * c, y0, c, on, false);
      }
      var out = (rule >> pattern) & 1;
      cellBox(ctx, x0 + c, y0 + c + 3, c, out, true);
      ctx.fillStyle = out ? '#a78bfa' : '#6f7286';
      ctx.fillText(String(out), x0 + 1.5 * c, y0 + 2 * c + 7);
    }

    var text = 'Rule ' + rule + ' = ' + binary(rule);
    // The center column only fits beside the triangle on a wide canvas.
    if (start === 'one' && L.W >= 560) text += '\nCenter column ' + centerBits;
    V.setText(readout, text);
  }

  function cellBox(ctx, x, y, s, on, output) {
    ctx.fillStyle = on ? (output ? '#a78bfa' : '#c4c1ba') : '#141621';
    ctx.fillRect(x + 0.5, y + 0.5, s - 1, s - 1);
    ctx.strokeStyle = output ? '#a78bfa' : '#343a4e';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  }

  function binary(n) {
    var s = n.toString(2);
    while (s.length < 8) s = '0' + s;
    return s;
  }

  var stage = null;
  stage = V.createStage(canvas, {
    frame: frame,
    resize: function (st) {
      var old = L;
      L = layout(st);
      if (old && old.cols === L.cols && old.rows === L.rows) return;
      layer.width = L.cols;
      layer.height = L.rows;
      image = lctx.createImageData(L.cols, L.rows);
      restart();
    }
  });

  // ---- Flipping a rule bit in the key ----

  V.drag(canvas, {
    hit: function (x, y) {
      if (!L || y < L.H - L.keyH) return null;
      for (var g = 0; g < 8; g++) {
        var x0 = L.kx + g * (L.groupW + L.gap) - L.gap / 2;
        if (x >= x0 && x < x0 + L.groupW + L.gap) return { g: g };
      }
      return null;
    },
    move: function (h, x, y, first) {
      if (!first) return;
      setRule(rule ^ (1 << (7 - h.g)));
      V.setSegmented(presetGroup, '');
    }
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'reset').addEventListener('click', restart);

  var updateRule = V.range(ruleIn, V.ctl(section, 'rule-out'),
    function (v) { return String(v); },
    function (v) {
      rule = v;
      V.setSegmented(presetGroup, PRESETS[v] ? String(v) : '');
      restart();
    });

  function setRule(r) {
    ruleIn.value = r;
    updateRule();
  }

  var updateDensity = V.range(densityIn, V.ctl(section, 'density-out'),
    function (v) { return Math.round(v * 100) + '%'; },
    function (v) {
      density = v;
      if (start === 'random') restart();
    });

  V.segmented(startGroup, function (s) {
    start = s;
    restart();
  });

  V.segmented(presetGroup, function (v) {
    var p = PRESETS[v];
    start = p.start;
    V.setSegmented(startGroup, start);
    densityIn.value = p.density;
    density = p.density;
    updateDensity();
    setRule(+v);
  });

  V.ctl(section, 'random-rule').addEventListener('click', function () {
    setRule(Math.floor(Math.random() * 256));
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return v + ' rows / second'; },
    function (v) { rate = v; });
})();
