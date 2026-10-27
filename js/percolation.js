// Site percolation: each square is open with chance p and water flows down
// through open neighbors. On a big grid it switches from stuck to through near p = 0.5927.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('percolation');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');

  var SIZES = [40, 80, 160];   // columns; every grid is twice as wide as it is tall
  var SAMPLES = 400;           // random grids per size for the chart
  var BUDGET = 3;              // ms per frame spent on the chart
  var PC = 0.5927;             // the threshold for an endless square grid
  var BLOCKED = [17, 19, 28];
  var DRY = [52, 58, 78];
  var WET = [255, 180, 84];
  var FRONT = [255, 232, 186];
  var GOLD = '#ffb454';

  var cols = 80, rows = 40;
  var p = 0.6;
  var view = 'water';
  var u = null;                // each square's random number: open when u < p
  var dist = null;             // water's distance from the top, or −1
  var label = null;            // cluster root per open square
  var queue = null;
  var maxDist = 0, through = false;
  var front = 0;               // how far the water has spread so far
  var needFlow = true;
  var img = null, off = null, offCtx = null;
  var openCount = 0, biggest = 0, bigRoot = -1;
  var tint = null;             // per square: its cluster's color, for the cluster view
  var changed = true;

  // Per grid size: spanning thresholds of random grids, kept sorted.
  var samples = {};
  SIZES.forEach(function (c) { samples[c] = { list: [], work: null }; });

  function newGrid() {
    var n = cols * rows;
    u = new Float32Array(n);
    for (var i = 0; i < n; i++) u[i] = Math.random();
    dist = new Int32Array(n);
    label = new Int32Array(n);
    queue = new Int32Array(n);
    img = null;
    front = 0;
    needFlow = true;
  }

  // Breadth-first flood from the open squares in the top row.
  function flow() {
    var n = cols * rows, head = 0, tail = 0, i;
    openCount = 0;
    for (i = 0; i < n; i++) {
      dist[i] = -1;
      if (u[i] < p) openCount++;
    }
    for (i = 0; i < cols; i++) {
      if (u[i] < p) {
        dist[i] = 0;
        queue[tail++] = i;
      }
    }
    maxDist = 0;
    through = false;
    while (head < tail) {
      var s = queue[head++], d = dist[s] + 1, x = s % cols;
      if (s >= n - cols) through = true;
      if (d - 1 > maxDist) maxDist = d - 1;
      if (x > 0) visit(s - 1, d);
      if (x < cols - 1) visit(s + 1, d);
      if (s >= cols) visit(s - cols, d);
      if (s < n - cols) visit(s + cols, d);
    }
    function visit(j, d) {
      if (dist[j] < 0 && u[j] < p) {
        dist[j] = d;
        queue[tail++] = j;
      }
    }
    labelClusters();
    needFlow = false;
  }

  function find(par, a) {
    while (par[a] !== a) {
      par[a] = par[par[a]];
      a = par[a];
    }
    return a;
  }

  function labelClusters() {
    var n = cols * rows, i;
    for (i = 0; i < n; i++) label[i] = u[i] < p ? i : -1;
    for (i = 0; i < n; i++) {
      if (label[i] < 0) continue;
      if (i % cols < cols - 1 && label[i + 1] >= 0) join(i, i + 1);
      if (i < n - cols && label[i + cols] >= 0) join(i, i + cols);
    }
    function join(a, b) {
      a = find(label, a);
      b = find(label, b);
      if (a !== b) label[a] = b;
    }
    var size = new Int32Array(n);
    biggest = 0;
    bigRoot = -1;
    for (i = 0; i < n; i++) {
      if (label[i] < 0) continue;
      label[i] = find(label, i);
      if (++size[label[i]] > biggest) {
        biggest = size[label[i]];
        bigRoot = label[i];
      }
    }
    // The biggest cluster at full strength, the rest dimmed.
    if (!tint || tint.length !== n * 3) tint = new Uint8ClampedArray(n * 3);
    for (i = 0; i < n; i++) {
      if (label[i] < 0) continue;
      var c = clusterColor(label[i]), dim = label[i] !== bigRoot;
      tint[i * 3] = dim ? c[0] * 0.55 + 20 : c[0];
      tint[i * 3 + 1] = dim ? c[1] * 0.55 + 20 : c[1];
      tint[i * 3 + 2] = dim ? c[2] * 0.55 + 28 : c[2];
    }
  }

  // One random grid of this size: open squares in order of their random
  // numbers until top and bottom join. That number is where this grid
  // starts letting water through.
  function sample(c) {
    var r = c / 2, n = c * r, S = samples[c];
    if (!S.work) S.work = { keys: new Float64Array(n), par: new Int32Array(n + 2), size: new Int32Array(n + 2) };
    var keys = S.work.keys, par = S.work.par, size = S.work.size, i;
    for (i = 0; i < n; i++) keys[i] = Math.floor(Math.random() * 1073741824) * 32768 + i;
    keys.sort();
    for (i = 0; i < n; i++) par[i] = -1;
    var T = n, B = n + 1;
    par[T] = T;
    par[B] = B;
    size[T] = size[B] = 1;
    function join(a, b) {
      a = find(par, a);
      b = find(par, b);
      if (a === b) return;
      if (size[a] < size[b]) {
        var t = a;
        a = b;
        b = t;
      }
      par[b] = a;
      size[a] += size[b];
    }
    for (var k = 0; k < n; k++) {
      var key = keys[k], s = key % 32768, x = s % c;
      par[s] = s;
      size[s] = 1;
      if (x > 0 && par[s - 1] >= 0) join(s, s - 1);
      if (x < c - 1 && par[s + 1] >= 0) join(s, s + 1);
      if (s >= c && par[s - c] >= 0) join(s, s - c);
      if (s < n - c && par[s + c] >= 0) join(s, s + c);
      if (s < c) join(s, T);
      if (s >= n - c) join(s, B);
      if (find(par, T) === find(par, B)) return Math.floor(key / 32768) / 1073741824;
    }
    return 1;
  }

  function addSamples() {
    var t0 = performance.now(), added = false;
    var order = [cols].concat(SIZES.filter(function (c) { return c !== cols; }));
    for (var o = 0; o < order.length; o++) {
      var S = samples[order[o]];
      while (S.list.length < SAMPLES && performance.now() - t0 < BUDGET) {
        insertSorted(S.list, sample(order[o]));
        added = true;
      }
    }
    return added;
  }

  function insertSorted(list, v) {
    var lo = 0, hi = list.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (list[mid] < v) lo = mid + 1; else hi = mid;
    }
    list.splice(lo, 0, v);
  }

  // Share of sampled grids that let water through at p.
  function spanShare(list, q) {
    var lo = 0, hi = list.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (list[mid] <= q) lo = mid + 1; else hi = mid;
    }
    return list.length ? lo / list.length : 0;
  }

  function frame(dt, st) {
    if (!u) newGrid();
    if (needFlow) {
      flow();
      changed = true;
    }
    if (front < maxDist + 1) {
      front = V.reducedMotion ? Infinity : front + dt * Math.max(24, maxDist / 2.2);
      changed = true;
    }
    if (addSamples()) changed = true;
    if (!changed && !st.dirty) return;
    changed = false;
    st.dirty = false;
    draw(st);
  }

  function layout(st) {
    var W = st.width, H = st.height;
    var narrow = W < 480;
    var top = narrow ? 66 : 78;
    var chartH = narrow ? 92 : 118;
    var gw = Math.min(W - 32, (H - top - chartH - 30) * 2);
    var cell = gw / cols;
    gw = cell * cols;
    var gh = cell * rows;
    return {
      W: W, H: H, gx: Math.round((W - gw) / 2), gy: top, gw: gw, gh: gh, cell: cell,
      left: 16, right: W - 46, ctop: top + gh + 34, cbottom: H - 24
    };
  }

  // A cluster's color, picked from the shared palette by its root.
  function clusterColor(root) {
    var t = ((root * 2654435761) >>> 0) / 4294967296;
    var stops = V.SPECTRUM, f = t * (stops.length - 1), i = Math.min(Math.floor(f), stops.length - 2);
    var a = stops[i], b = stops[i + 1], w = f - i;
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
  }

  function paintGrid() {
    if (!img) {
      off = document.createElement('canvas');
      off.width = cols;
      off.height = rows;
      offCtx = off.getContext('2d');
      img = offCtx.createImageData(cols, rows);
    }
    var data = img.data, n = cols * rows;
    for (var i = 0; i < n; i++) {
      var o = i * 4, c;
      if (u[i] >= p) c = BLOCKED;
      else if (view === 'water') {
        var d = dist[i];
        c = d >= 0 && d <= front ? (front - d < 3 && front <= maxDist ? FRONT : WET) : DRY;
      } else {
        data[o] = tint[i * 3];
        data[o + 1] = tint[i * 3 + 1];
        data[o + 2] = tint[i * 3 + 2];
        data[o + 3] = 255;
        continue;
      }
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = 255;
    }
    offCtx.putImageData(img, 0, 0);
  }

  function draw(st) {
    var ctx = st.ctx, L = layout(st), i;
    ctx.clearRect(0, 0, L.W, L.H);

    paintGrid();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, L.gx, L.gy, L.gw, L.gh);
    ctx.imageSmoothingEnabled = true;
    if (L.cell >= 6) {
      ctx.strokeStyle = '#0d0f16';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (i = 1; i < cols; i++) {
        var x = Math.round(L.gx + i * L.cell) + 0.5;
        ctx.moveTo(x, L.gy);
        ctx.lineTo(x, L.gy + L.gh);
      }
      for (i = 1; i < rows; i++) {
        var y = Math.round(L.gy + i * L.cell) + 0.5;
        ctx.moveTo(L.gx, y);
        ctx.lineTo(L.gx + L.gw, y);
      }
      ctx.stroke();
    }
    // Water comes in along the top edge.
    ctx.fillStyle = GOLD;
    ctx.fillRect(L.gx, L.gy - 5, L.gw, 3);

    drawChart(ctx, L);

    var poured = front > maxDist;
    var depth = 0;
    if (poured) {
      for (i = 0; i < cols * rows; i++) if (dist[i] >= 0) depth = Math.max(depth, Math.floor(i / cols) + 1);
    }
    V.setText(readout, 'Open squares ' + (openCount / (cols * rows) * 100).toFixed(1) + '%\n' +
      (!poured ? 'Pouring…' : through ? 'Water got through' :
        depth ? 'Water stuck ' + depth + ' of ' + rows + ' rows down' : 'No open square on top'));
  }

  function drawChart(ctx, L) {
    var plotW = L.right - L.left, plotH = L.cbottom - L.ctop;
    function px(q) { return L.left + q * plotW; }
    function py(s) { return L.cbottom - s * plotH; }
    var i;

    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.lineWidth = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    [[0, '0%'], [0.5, '50%'], [1, '100%']].forEach(function (t) {
      var y = Math.round(py(t[0])) + 0.5;
      ctx.strokeStyle = 'rgba(236,232,223,0.07)';
      ctx.beginPath();
      ctx.moveTo(L.left, y);
      ctx.lineTo(L.right, y);
      ctx.stroke();
      ctx.fillStyle = '#6f7286';
      ctx.fillText(t[1], L.right + 8, y);
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (i = 0; i <= 10; i += 2) {
      ctx.fillStyle = '#6f7286';
      ctx.fillText(i === 0 ? 'p = 0' : String(i / 10), px(i / 10) + (i === 0 ? 14 : 0), L.cbottom + 6);
    }
    ctx.fillStyle = '#9b9daf';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Chance water gets through', L.left, L.ctop - 6);

    // The threshold for an endless grid.
    var cx = Math.round(px(PC)) + 0.5;
    ctx.strokeStyle = 'rgba(236,232,223,0.4)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, L.ctop);
    ctx.lineTo(cx, L.cbottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ece8df';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('0.593', cx + 4, L.ctop - 6);

    // Other sizes first, then this one on top.
    SIZES.forEach(function (c) { if (c !== cols) curve(c, 'rgba(236,232,223,0.28)', 1.2); });
    curve(cols, GOLD, 2);
    function curve(c, color, width) {
      var list = samples[c].list;
      if (list.length < 8) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (var k = 0; k <= 200; k++) {
        var q = k / 200, y = py(spanShare(list, q));
        if (k) ctx.lineTo(px(q), y); else ctx.moveTo(px(q), y);
      }
      ctx.stroke();
    }

    // Where this grid's p sits.
    var mx = Math.round(px(p)) + 0.5;
    ctx.strokeStyle = 'rgba(255,180,84,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx, L.ctop);
    ctx.lineTo(mx, L.cbottom);
    ctx.stroke();
    var list = samples[cols].list;
    if (list.length >= 8) {
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(px(p), py(spanShare(list, p)), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  V.range(V.ctl(section, 'p'), V.ctl(section, 'p-out'),
    function (v) { return v.toFixed(3); },
    function (v) {
      if (v === p) return;
      p = v;
      needFlow = true;
    });

  V.ctl(section, 'pour').addEventListener('click', function () {
    front = 0;
    changed = true;
  });

  V.ctl(section, 'new').addEventListener('click', function () {
    if (u) newGrid();
  });

  V.segmented(V.ctl(section, 'size'), function (v) {
    cols = parseInt(v, 10);
    rows = cols / 2;
    if (u) newGrid();
  });

  V.segmented(V.ctl(section, 'view'), function (v) {
    view = v;
    changed = true;
  });

})();
