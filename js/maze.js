// Perfect mazes: knock down walls between grid cells until every cell is
// reached, never opening a loop (a spanning tree of the grid). Three ways to
// carve one, then two ways to walk out: right hand on the wall, or filling
// dead ends until only the path is left.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('maze');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var N = 1, E = 2, S = 4, W = 8;
  var BIT = [N, E, S, W];
  var BACK = [S, W, N, E];
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  var SIZES = { s: [16, 12], m: [28, 21], l: [44, 33] };
  var GEN_NAMES = { backtracker: 'Backtracker', prim: "Prim's", wilson: "Wilson's" };

  var gen = 'backtracker';
  var solver = 'hand';
  var sizeKey = 'm';
  var rate = 128;
  var playing = !V.reducedMotion;
  var cols, rows, count;
  var open, inMaze, carved;
  var phase = 'gen';
  var acc = 0;
  var start = 0, goal = 0;
  var G = null;
  // Floors and walls are cached in a layer; only changed cells are repainted.
  var layer = document.createElement('canvas');
  var lctx = layer.getContext('2d');
  var layerKey = '';
  var dirty = [];
  var full = true;
  var MARGIN = 3;           // room for the outer walls' half thickness
  // Generator state.
  var stack, frontier, onFrontier, remaining, slot, walk, walkPos;
  // Solver state.
  var hand, trail, filled, queue, degree, fillCount, solution, shortest, deadEnds;

  function idx(x, y) { return y * cols + x; }

  function neighbor(c, d) {
    var x = c % cols + DX[d], y = Math.floor(c / cols) + DY[d];
    return x < 0 || y < 0 || x >= cols || y >= rows ? -1 : idx(x, y);
  }

  function carve(a, d) {
    var b = neighbor(a, d);
    open[a] |= BIT[d];
    open[b] |= BACK[d];
    dirty.push(a, b);
  }

  function addCell(c) {
    if (inMaze[c]) return;
    inMaze[c] = 1;
    carved++;
    dirty.push(c);
    // Swap-remove from the list of cells still outside the maze.
    var last = remaining.pop();
    if (last !== c) { remaining[slot[c]] = last; slot[last] = slot[c]; }
  }

  function newMaze() {
    cols = SIZES[sizeKey][0];
    rows = SIZES[sizeKey][1];
    count = cols * rows;
    open = new Uint8Array(count);
    inMaze = new Uint8Array(count);
    onFrontier = new Uint8Array(count);
    slot = new Int32Array(count);
    walkPos = new Int32Array(count).fill(-1);
    remaining = [];
    for (var i = 0; i < count; i++) { remaining.push(i); slot[i] = i; }
    carved = 0;
    start = 0;
    goal = count - 1;
    stack = [];
    frontier = [];
    walk = null;
    var first = gen === 'backtracker' ? start : Math.floor(Math.random() * count);
    addCell(first);
    if (gen === 'backtracker') stack.push(first);
    if (gen === 'prim') addFrontier(first);
    phase = 'gen';
    trail = null;
    filled = null;
    solution = null;
    acc = 0;
    full = true;
    stage.dirty = true;
  }

  function addFrontier(c) {
    for (var d = 0; d < 4; d++) {
      var b = neighbor(c, d);
      if (b >= 0 && !inMaze[b] && !onFrontier[b]) { onFrontier[b] = 1; frontier.push(b); }
    }
  }

  // ---- One step of each generator ----

  function stepBacktracker() {
    var c = stack[stack.length - 1], opts = [];
    for (var d = 0; d < 4; d++) {
      var b = neighbor(c, d);
      if (b >= 0 && !inMaze[b]) opts.push(d);
    }
    if (!opts.length) { stack.pop(); return; }
    var dd = opts[Math.floor(Math.random() * opts.length)];
    var nb = neighbor(c, dd);
    carve(c, dd);
    addCell(nb);
    stack.push(nb);
  }

  function stepPrim() {
    var k = Math.floor(Math.random() * frontier.length);
    var c = frontier[k];
    frontier[k] = frontier[frontier.length - 1];
    frontier.pop();
    onFrontier[c] = 0;
    var opts = [];
    for (var d = 0; d < 4; d++) {
      var b = neighbor(c, d);
      if (b >= 0 && inMaze[b]) opts.push(d);
    }
    carve(c, opts[Math.floor(Math.random() * opts.length)]);
    addCell(c);
    addFrontier(c);
  }

  // A random walk from a cell outside the maze. Whenever it crosses itself
  // the loop is erased; when it reaches the maze, the walk is carved in.
  function stepWilson() {
    if (!walk) {
      var s = remaining[Math.floor(Math.random() * remaining.length)];
      walk = [s];
      walkPos[s] = 0;
      return;
    }
    var c = walk[walk.length - 1], d, b;
    do { d = Math.floor(Math.random() * 4); b = neighbor(c, d); } while (b < 0);
    if (inMaze[b]) {
      walk.push(b);
      for (var i = 0; i < walk.length - 1; i++) {
        var a = walk[i], z = walk[i + 1];
        for (var dd = 0; dd < 4; dd++) if (neighbor(a, dd) === z) carve(a, dd);
        walkPos[a] = -1;
        addCell(a);
      }
      walk = null;
    } else if (walkPos[b] >= 0) {
      for (var k = walkPos[b] + 1; k < walk.length; k++) walkPos[walk[k]] = -1;
      walk.length = walkPos[b] + 1;
    } else {
      walkPos[b] = walk.length;
      walk.push(b);
    }
  }

  function genDone() {
    return carved >= count;
  }

  function genStep() {
    if (gen === 'backtracker') stepBacktracker();
    else if (gen === 'prim') stepPrim();
    else stepWilson();
    if (genDone()) {
      stack = [];
      walk = null;
      startSolve();
    }
  }

  // ---- Solvers ----

  function startSolve() {
    phase = 'solve';
    full = true;
    solution = null;
    trail = null;
    filled = null;
    // The unique path, found by walking the tree from the start (readout only).
    var parent = new Int32Array(count).fill(-2), q = [start], h = 0;
    parent[start] = -1;
    while (h < q.length) {
      var c = q[h++];
      for (var d = 0; d < 4; d++) {
        if (!(open[c] & BIT[d])) continue;
        var b = neighbor(c, d);
        if (parent[b] === -2) { parent[b] = c; q.push(b); }
      }
    }
    shortest = 0;
    for (var p = goal; p >= 0; p = parent[p]) shortest++;
    degree = new Uint8Array(count);
    deadEnds = 0;
    for (c = 0; c < count; c++) {
      for (d = 0; d < 4; d++) if (open[c] & BIT[d]) degree[c]++;
      if (degree[c] === 1) deadEnds++;
    }
    if (solver === 'hand') {
      hand = { c: start, d: open[start] & E ? 1 : 2 };
      trail = [start];
    } else {
      filled = new Uint8Array(count);
      full = true;
      fillCount = 0;
      queue = [];
      for (c = 0; c < count; c++) if (degree[c] === 1 && c !== start && c !== goal) queue.push(c);
    }
    stage.dirty = true;
  }

  function solveStep() {
    if (solver === 'hand') {
      // Turn right if you can, else straight, else left, else back.
      var turns = [1, 0, 3, 2];
      for (var t = 0; t < 4; t++) {
        var d = (hand.d + turns[t]) % 4;
        if (open[hand.c] & BIT[d]) {
          hand.d = d;
          hand.c = neighbor(hand.c, d);
          trail.push(hand.c);
          break;
        }
      }
      if (hand.c === goal) finishSolve();
      return;
    }
    if (!queue.length) { finishSolve(); return; }
    var c = queue.shift();
    filled[c] = 1;
    fillCount++;
    dirty.push(c);
    for (var dd = 0; dd < 4; dd++) {
      if (!(open[c] & BIT[dd])) continue;
      var b = neighbor(c, dd);
      if (filled[b]) continue;
      degree[b]--;
      if (degree[b] === 1 && b !== start && b !== goal) queue.push(b);
    }
  }

  function finishSolve() {
    phase = 'done';
    // Read the path off the tree: from the start, follow the passages that
    // lead toward the goal.
    var parent = new Int32Array(count).fill(-2), q = [goal], h = 0;
    parent[goal] = -1;
    while (h < q.length) {
      var c = q[h++];
      for (var d = 0; d < 4; d++) {
        if (!(open[c] & BIT[d])) continue;
        var b = neighbor(c, d);
        if (parent[b] === -2) { parent[b] = c; q.push(b); }
      }
    }
    solution = [];
    for (var p = start; p >= 0; p = parent[p]) solution.push(p);
    stage.dirty = true;
  }

  function frame(dt, st) {
    if (!open) newMaze();
    var moved = false;
    if (playing && phase !== 'done') {
      // Wilson's walk steps are cheap to watch, so they run faster.
      var speedUp = phase === 'gen' && gen === 'wilson' ? 4 : 1;
      acc += dt * rate * speedUp;
      var n = Math.floor(acc), t0 = performance.now();
      acc -= n;
      for (var k = 0; k < n && phase !== 'done'; k++) {
        if (phase === 'gen') genStep(); else solveStep();
        if ((k & 63) === 63 && performance.now() - t0 > 5) { acc = 0; break; }
      }
      moved = n > 0;
      if (phase === 'done') setPlaying(false);
    }
    if (!moved && !st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  // ---- Drawing ----

  function draw(st) {
    var ctx = st.ctx, Wd = st.width, H = st.height, c, x, y;
    var top = 62;
    var cell = Math.min((Wd - 24) / cols, (H - top - 12) / rows);
    if (cell >= 8) cell = Math.floor(cell);
    G = { cell: cell, x: Math.round((Wd - cell * cols) / 2), y: Math.round(top + (H - top - 10 - cell * rows) / 2) };
    ctx.clearRect(0, 0, Wd, H);

    var key = cols + 'x' + rows + '@' + cell + '/' + st.dpr;
    if (key !== layerKey) {
      layerKey = key;
      layer.width = Math.ceil((cols * cell + MARGIN * 2) * st.dpr);
      layer.height = Math.ceil((rows * cell + MARGIN * 2) * st.dpr);
      full = true;
    }
    updateLayer(cell, st.dpr);
    ctx.drawImage(layer, G.x - MARGIN, G.y - MARGIN, layer.width / st.dpr, layer.height / st.dpr);

    if (phase === 'gen' && gen === 'prim') {
      ctx.fillStyle = 'rgba(255,180,84,0.35)';
      for (var f = 0; f < frontier.length; f++) {
        c = frontier[f];
        ctx.fillRect(G.x + (c % cols) * cell, G.y + Math.floor(c / cols) * cell, cell, cell);
      }
    }
    if (phase === 'gen' && gen === 'backtracker') {
      ctx.fillStyle = 'rgba(255,95,162,0.22)';
      for (var s = 0; s < stack.length; s++) {
        c = stack[s];
        ctx.fillRect(G.x + (c % cols) * cell, G.y + Math.floor(c / cols) * cell, cell + 0.5, cell + 0.5);
      }
    }

    if (phase === 'gen' && gen === 'backtracker' && stack.length) dot(ctx, stack[stack.length - 1], '#ffffff', 0.3);
    if (walk) {
      polyline(ctx, walk, '#6ee7ff', Math.max(1.5, cell * 0.18), 0.9);
      dot(ctx, walk[walk.length - 1], '#ffffff', 0.25);
    }
    if (trail) polyline(ctx, trail, '#ffb454', Math.max(1.5, cell * 0.16), phase === 'done' ? 0.4 : 0.85);
    if (solution) polyline(ctx, solution, '#ffd166', Math.max(2, cell * 0.24), 1);
    if (phase === 'solve' && solver === 'hand') dot(ctx, hand.c, '#ffffff', 0.3);

    dot(ctx, start, '#7ee0a1', 0.34);
    dot(ctx, goal, '#ff5fa2', 0.34);
    updateReadout();
  }

  // Paint the floor and the walls of cells into the layer. Each carved cell
  // draws its north and west walls, and its south and east walls only where
  // the neighbor there can't draw them. Wall rectangles overlap at corners.
  function updateLayer(cell, dpr) {
    var lw = Math.max(1, Math.min(3, cell * 0.12));
    lctx.setTransform(dpr, 0, 0, dpr, MARGIN * dpr, MARGIN * dpr);
    if (dirty.length > count / 3) full = true;
    if (full) {
      full = false;
      dirty = [];
      lctx.clearRect(-MARGIN, -MARGIN, cols * cell + MARGIN * 2, rows * cell + MARGIN * 2);
      for (var c = 0; c < count; c++) floor(c, cell);
      for (c = 0; c < count; c++) walls(c, cell, lw);
      return;
    }
    for (var i = 0; i < dirty.length; i++) {
      var d = dirty[i], dx0 = d % cols, dy0 = (d - dx0) / cols;
      var x0 = dx0 * cell - lw, y0 = dy0 * cell - lw, w = cell + lw * 2;
      lctx.save();
      lctx.beginPath();
      lctx.rect(x0, y0, w, w);
      lctx.clip();
      lctx.clearRect(x0, y0, w, w);
      var around = [];
      for (var oy = -1; oy <= 1; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
          var x = dx0 + ox, y = dy0 + oy;
          if (x >= 0 && y >= 0 && x < cols && y < rows) around.push(idx(x, y));
        }
      }
      for (var k = 0; k < around.length; k++) floor(around[k], cell);
      for (k = 0; k < around.length; k++) walls(around[k], cell, lw);
      lctx.restore();
    }
    dirty = [];
  }

  function floor(c, cell) {
    if (!inMaze[c]) return;
    var x = c % cols;
    lctx.fillStyle = filled && filled[c] ? '#26182a' : '#171a26';
    lctx.fillRect(x * cell, (c - x) / cols * cell, cell, cell);
  }

  function walls(c, cell, lw) {
    if (!inMaze[c]) return;
    var x = c % cols, y = (c - x) / cols, o = open[c], px = x * cell, py = y * cell, h = lw / 2;
    lctx.fillStyle = '#d6d2c8';
    if (!(o & N)) lctx.fillRect(px - h, py - h, cell + lw, lw);
    if (!(o & W)) lctx.fillRect(px - h, py - h, lw, cell + lw);
    if (!(o & S) && (y === rows - 1 || !inMaze[c + cols])) lctx.fillRect(px - h, py + cell - h, cell + lw, lw);
    if (!(o & E) && (x === cols - 1 || !inMaze[c + 1])) lctx.fillRect(px + cell - h, py - h, lw, cell + lw);
  }

  function center(c) {
    return [G.x + (c % cols + 0.5) * G.cell, G.y + (Math.floor(c / cols) + 0.5) * G.cell];
  }

  function dot(ctx, c, color, r) {
    var p = center(c);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p[0], p[1], Math.max(2.5, G.cell * r), 0, Math.PI * 2);
    ctx.fill();
  }

  function polyline(ctx, list, color, width, alpha) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < list.length; i++) {
      var p = center(list[i]);
      if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function updateReadout() {
    var line1, line2;
    if (phase === 'gen') {
      line1 = GEN_NAMES[gen] + ': ' + carved.toLocaleString() + ' of ' + count.toLocaleString() + ' cells';
      if (gen === 'backtracker') line2 = 'Tunnel stack ' + stack.length;
      else if (gen === 'prim') line2 = 'Frontier ' + frontier.length + ' cells';
      else line2 = walk ? 'Random walk ' + (walk.length - 1) + ' steps long' : 'Starting a new walk';
    } else {
      line1 = 'Dead ends ' + deadEnds + ', path ' + shortest + ' cells';
      if (solver === 'hand') line2 = 'Right hand: ' + (trail.length - 1).toLocaleString() + ' steps' + (phase === 'done' ? ', out!' : '');
      else line2 = 'Filled ' + fillCount.toLocaleString() + ' dead-end cells' + (phase === 'done' ? ', done' : '');
    }
    V.setText(readout, line1 + '\n' + line2);
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);

  playBtn.addEventListener('click', function () {
    if (!open) newMaze();
    if (!playing && phase === 'done') newMaze();
    setPlaying(!playing);
  });

  V.ctl(section, 'new').addEventListener('click', function () {
    newMaze();
    setPlaying(true);
  });

  // Run the current phase to the end at once.
  V.ctl(section, 'finish').addEventListener('click', function () {
    if (!open) newMaze();
    var guard = 0, wasGen = phase === 'gen';
    while (phase === 'gen' && guard++ < 5e6) genStep();
    if (!wasGen) while (phase === 'solve' && guard++ < 5e6) solveStep();
    stage.dirty = true;
  });

  V.segmented(V.ctl(section, 'gen'), function (v) {
    gen = v;
    newMaze();
    setPlaying(true);
  });

  V.segmented(V.ctl(section, 'solver'), function (v) {
    solver = v;
    if (open && phase !== 'gen') { startSolve(); setPlaying(true); }
  });

  V.segmented(V.ctl(section, 'size'), function (v) {
    sizeKey = v;
    newMaze();
    setPlaying(true);
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return Math.round(Math.pow(2, v)).toLocaleString() + ' steps / s'; },
    function (v) { rate = Math.pow(2, v); });

  // Click a cell to move the exit there and solve again.
  canvas.addEventListener('click', function (e) {
    if (!G || !open) return;
    var r = canvas.getBoundingClientRect();
    var x = Math.floor((e.clientX - r.left - G.x) / G.cell), y = Math.floor((e.clientY - r.top - G.y) / G.cell);
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    var c = idx(x, y);
    if (c === start) return;
    goal = c;
    if (phase !== 'gen') { startSolve(); setPlaying(true); }
    stage.dirty = true;
  });
  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'mouse') canvas.style.cursor = 'pointer';
  });
})();
