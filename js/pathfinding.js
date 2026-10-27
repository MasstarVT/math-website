// Shortest paths on a grid. Breadth-first search counts steps and ignores
// cost; Dijkstra always grows from the cheapest cell reached so far; A* adds
// a guess of the distance left (grid steps, which never overestimates).
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('pathfinding');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var mapGroup = V.ctl(section, 'map');

  var COLS = 38, ROWS = 26, CELLS = COLS * ROWS;
  var EMPTY = 0, WALL = 1, MUD = 2, MUD_COST = 5;
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  var NAMES = ['BFS', 'Dijkstra', 'A*'];

  var grid = new Uint8Array(CELLS);
  var start = 0, goal = 0;
  var tool = WALL;
  var alg = 2;
  var rate = 181;
  var results = null;      // one per algorithm
  var shown = 0;           // cells of the chosen search revealed so far
  var animating = !V.reducedMotion;
  var G = null;
  var colors = [];

  for (var k = 0; k < 64; k++) colors.push(V.gradient(V.SPECTRUM, k / 63));

  function idx(x, y) { return y * COLS + x; }

  function loadMap(name) {
    grid.fill(EMPTY);
    var x, y;
    if (name === 'swamp') {
      start = idx(5, 15);
      goal = idx(32, 11);
      for (y = 6; y < ROWS; y++) grid[idx(13, y)] = WALL;
      for (y = 0; y < 20; y++) grid[idx(24, y)] = WALL;
      for (y = 0; y < ROWS; y++) {
        for (x = 0; x < COLS; x++) {
          var dx = (x - 18.5) / 4.6, dy = (y - 3) / 3.6;
          if (dx * dx + dy * dy < 1 && !grid[idx(x, y)]) grid[idx(x, y)] = MUD;
          dx = (x - 29) / 4; dy = (y - 22) / 3.4;
          if (dx * dx + dy * dy < 1 && !grid[idx(x, y)]) grid[idx(x, y)] = MUD;
        }
      }
    } else if (name === 'random') {
      start = idx(2, Math.floor(ROWS / 2));
      goal = idx(COLS - 3, Math.floor(ROWS / 2));
      for (var b = 0; b < 4; b++) {
        var cx = 6 + Math.random() * (COLS - 12), cy = Math.random() * ROWS, r = 2.5 + Math.random() * 3;
        for (y = 0; y < ROWS; y++) {
          for (x = 0; x < COLS; x++) if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) grid[idx(x, y)] = MUD;
        }
      }
      for (var c = 0; c < CELLS; c++) if (Math.random() < 0.24) grid[c] = WALL;
    } else {
      start = idx(5, Math.floor(ROWS / 2));
      goal = idx(COLS - 6, Math.floor(ROWS / 2));
    }
    grid[start] = grid[goal] = EMPTY;
    recompute(true);
  }

  // ---- The three searches ----

  function cost(c) { return grid[c] === MUD ? MUD_COST : 1; }

  function heuristic(c) {
    return Math.abs(c % COLS - goal % COLS) + Math.abs(Math.floor(c / COLS) - Math.floor(goal / COLS));
  }

  // A small binary heap of cells ordered by key.
  function Heap() { this.k = []; this.v = []; }
  Heap.prototype.push = function (key, val) {
    var k = this.k, v = this.v, i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  };
  Heap.prototype.pop = function () {
    var k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(), n = k.length;
    if (n) {
      var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i, mk = lk;
        if (l < n && k[l] < mk) { m = l; mk = k[l]; }
        if (r < n && k[r] < mk) { m = r; mk = k[r]; }
        if (m === i) break;
        k[i] = k[m]; v[i] = v[m]; i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  };

  function search(kind) {
    var from = new Int32Array(CELLS).fill(-1);
    var disc = new Int32Array(CELLS).fill(-1);  // when each cell joined the frontier
    var done = new Int32Array(CELLS).fill(-1);  // when it was explored
    var g = new Float64Array(CELLS).fill(Infinity);
    var order = [];
    var c, d, x, y, nb;
    g[start] = 0;
    disc[start] = 0;
    var queue = [start], head = 0, heap = new Heap();
    if (kind) heap.push(0, start);
    for (;;) {
      if (kind === 0) {
        if (head >= queue.length) break;
        c = queue[head++];
      } else {
        if (!heap.v.length) break;
        c = heap.pop();
        if (done[c] >= 0) continue;
      }
      done[c] = order.length;
      order.push(c);
      if (c === goal) break;
      x = c % COLS;
      y = (c - x) / COLS;
      for (d = 0; d < 4; d++) {
        var nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        nb = ny * COLS + nx;
        if (grid[nb] === WALL || done[nb] >= 0) continue;
        if (kind === 0) {
          if (disc[nb] < 0) { disc[nb] = order.length; from[nb] = c; queue.push(nb); }
        } else {
          var ng = g[c] + cost(nb);
          if (ng < g[nb]) {
            g[nb] = ng;
            from[nb] = c;
            if (disc[nb] < 0) disc[nb] = order.length;
            // A* breaks ties toward cells that have come further.
            heap.push(kind === 2 ? ng + heuristic(nb) - ng * 1e-6 : ng, nb);
          }
        }
      }
    }
    var path = null, total = 0;
    if (done[goal] >= 0) {
      path = [];
      for (c = goal; c >= 0; c = from[c]) {
        path.push(c);
        if (c !== start) total += cost(c);
      }
      path.reverse();
    }
    return { order: order, disc: disc, done: done, path: path, cost: total };
  }

  function recompute(animate) {
    results = [search(0), search(1), search(2)];
    shown = animate && !V.reducedMotion ? 0 : results[alg].order.length;
    animating = shown < results[alg].order.length;
    stage.dirty = true;
  }

  function frame(dt, st) {
    var moved = false;
    if (animating && results) {
      var total = results[alg].order.length;
      shown = Math.min(total, shown + Math.max(1, dt * rate));
      if (shown >= total) animating = false;
      moved = true;
    }
    if (!moved && !st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  // ---- Drawing ----

  function layout(st) {
    var W = st.width, H = st.height, top = 84;
    var cell = Math.min((W - 20) / COLS, (H - top - 10) / ROWS);
    return { W: W, H: H, cell: cell, x: Math.round((W - cell * COLS) / 2), y: Math.round(top + (H - top - 6 - cell * ROWS) / 2) };
  }

  function draw(st) {
    var ctx = st.ctx, c, x, y;
    G = layout(st);
    var s = G.cell, gap = s > 9 ? 1 : 0.5;
    ctx.clearRect(0, 0, G.W, G.H);
    var R = results[alg], n = Math.floor(shown), total = Math.max(1, R.order.length);

    for (c = 0; c < CELLS; c++) {
      x = G.x + (c % COLS) * s;
      y = G.y + Math.floor(c / COLS) * s;
      var t = grid[c];
      ctx.fillStyle = t === WALL ? '#cfcac0' : t === MUD ? '#3b2c1d' : '#141724';
      ctx.fillRect(x, y, s - gap, s - gap);
      if (t === WALL) continue;
      if (R.done[c] >= 0 && R.done[c] < n) {
        ctx.fillStyle = colors[Math.floor(R.done[c] / total * 63)];
        ctx.globalAlpha = t === MUD ? 0.32 : 0.42;
        ctx.fillRect(x, y, s - gap, s - gap);
        ctx.globalAlpha = 1;
      } else if (R.disc[c] >= 0 && R.disc[c] <= n && n < R.order.length) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(x + s * 0.2, y + s * 0.2, s * 0.6 - gap, s * 0.6 - gap);
      }
      if (t === MUD && s > 7) {
        ctx.fillStyle = 'rgba(255,180,84,0.35)';
        ctx.fillRect(x + s * 0.3, y + s * 0.55, Math.max(1, s * 0.12), Math.max(1, s * 0.12));
        ctx.fillRect(x + s * 0.62, y + s * 0.28, Math.max(1, s * 0.12), Math.max(1, s * 0.12));
      }
    }

    if (R.path && n >= R.order.length) {
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = Math.max(2, s * 0.3);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (var i = 0; i < R.path.length; i++) {
        var p = center(R.path[i]);
        if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
      }
      ctx.stroke();
    }

    marker(ctx, start, '#7ee0a1');
    marker(ctx, goal, '#ff5fa2');
    updateReadout(n);
  }

  function center(c) {
    return [G.x + (c % COLS + 0.5) * G.cell - 0.5, G.y + (Math.floor(c / COLS) + 0.5) * G.cell - 0.5];
  }

  function marker(ctx, c, color) {
    var p = center(c);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#0a0b10';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p[0], p[1], Math.max(4, G.cell * 0.62), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function pad(s, w) { while (s.length < w) s += ' '; return s; }

  function updateReadout(n) {
    var lines = [];
    for (var a = 0; a < 3; a++) {
      var R = results[a], live = a === alg && n < R.order.length;
      var count = live ? n : R.order.length;
      var tail = live ? ' explored…' : ' explored, ' + (R.path ? 'cost ' + R.cost : 'no way');
      lines.push((a === alg ? '• ' : '  ') + pad(NAMES[a], 9) + count + tail);
    }
    V.setText(readout, lines.join('\n'));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Drawing walls and dragging the dots ----

  function cellAt(px, py) {
    if (!G) return -1;
    var x = Math.floor((px - G.x) / G.cell), y = Math.floor((py - G.y) / G.cell);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return -1;
    return idx(x, y);
  }

  function paint(c, v) {
    if (c === start || c === goal) return;
    grid[c] = v;
  }

  V.drag(canvas, {
    cursor: 'crosshair',
    hit: function (x, y) {
      var c = cellAt(x, y);
      if (c < 0) return null;
      if (c === start) return { dot: 'start' };
      if (c === goal) return { dot: 'goal' };
      return { dot: null, last: c, value: grid[c] === tool ? EMPTY : tool };
    },
    move: function (h, px, py, first) {
      var c = cellAt(px, py);
      if (c < 0) return;
      if (first) V.setSegmented(mapGroup, '');
      if (h.dot) {
        if (grid[c] === WALL || c === start || c === goal) return;
        if (h.dot === 'start') start = c; else goal = c;
      } else {
        // Fill the cells between pointer events so quick strokes have no gaps.
        var x0 = h.last % COLS, y0 = Math.floor(h.last / COLS), x1 = c % COLS, y1 = Math.floor(c / COLS);
        var m = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
        for (var k = 0; k <= m; k++) paint(idx(Math.round(x0 + (x1 - x0) * k / m), Math.round(y0 + (y1 - y0) * k / m)), h.value);
        h.last = c;
      }
      recompute(false);
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || canvas.classList.contains('is-grabbing')) return;
    var r = canvas.getBoundingClientRect(), c = cellAt(e.clientX - r.left, e.clientY - r.top);
    canvas.style.cursor = c < 0 ? '' : c === start || c === goal ? 'grab' : 'crosshair';
  });

  // ---- Controls ----

  V.ctl(section, 'run').addEventListener('click', function () { recompute(true); });

  V.ctl(section, 'clear').addEventListener('click', function () {
    for (var c = 0; c < CELLS; c++) grid[c] = EMPTY;
    V.setSegmented(mapGroup, 'empty');
    recompute(true);
  });

  V.segmented(V.ctl(section, 'alg'), function (v) {
    alg = parseInt(v, 10);
    recompute(true);
  });

  V.segmented(V.ctl(section, 'tool'), function (v) { tool = v === 'mud' ? MUD : WALL; });

  V.segmented(mapGroup, loadMap);

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return Math.round(Math.pow(2, v)).toLocaleString() + ' cells / s'; },
    function (v) { rate = Math.pow(2, v); });

  loadMap('swamp');
})();
