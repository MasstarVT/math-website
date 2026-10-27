// Four color theorem: any flat map can be colored with four colors so that
// countries sharing a border differ. Countries are clumps of small Voronoi
// cells grown at random; the solver is backtracking search (DSATUR order).
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('four-color');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var paintGroup = V.ctl(section, 'paint');
  var kGroup = V.ctl(section, 'k');

  var TAU = Math.PI * 2;
  var COLORS = ['#ffb454', '#ff5fa2', '#6ee7ff', '#7ee0a1'];
  var BLANK = '#1c202d';
  var M = null;          // the current map, built lazily at the canvas's size
  var want = 28;
  var color = [];
  var brush = 0;
  var k = 4;
  var solver = null;
  var hover = -1;
  var wheel = null;      // { center, ring } when an odd ring explains a failure
  var regen = true, autoSolve = true;
  var W = 0, H = 0;

  // Keep the side of the bisector of p and q nearer p. Each vertex carries the
  // seed whose bisector made the edge leaving it (-1: canvas edge).
  function clip(poly, p, q, qi) {
    var mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, dx = q[0] - p[0], dy = q[1] - p[1];
    var out = [], n = poly.length;
    for (var i = 0; i < n; i++) {
      var a = poly[i], b = poly[(i + 1) % n];
      var da = (a[0] - mx) * dx + (a[1] - my) * dy, db = (b[0] - mx) * dx + (b[1] - my) * dy;
      if (da <= 0) {
        out.push(a);
        if (db > 0) {
          var t = da / (da - db);
          out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, qi]);
        }
      } else if (db <= 0) {
        var s = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2]]);
      }
    }
    return out;
  }

  // ---- Building a map ----

  function generate() {
    var W0 = W, H0 = H;
    var size = Math.sqrt(W0 * H0 / 620);
    var cols = Math.max(10, Math.round(W0 / size)), rows = Math.max(10, Math.round(H0 / size));
    var cw = W0 / cols, ch = H0 / rows, n = cols * rows;
    var pts = [], i, j, a;
    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        pts.push([(i + 0.5 + (Math.random() - 0.5) * 0.9) * cw, (j + 0.5 + (Math.random() - 0.5) * 0.9) * ch]);
      }
    }

    var polys = [], nb = [];
    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        a = j * cols + i;
        var poly = [[0, 0, -1], [W0, 0, -1], [W0, H0, -1], [0, H0, -1]];
        for (var dj = -2; dj <= 2; dj++) {
          for (var di = -2; di <= 2; di++) {
            var ii = i + di, jj = j + dj;
            if ((di || dj) && ii >= 0 && jj >= 0 && ii < cols && jj < rows) poly = clip(poly, pts[a], pts[jj * cols + ii], jj * cols + ii);
          }
        }
        polys.push(poly);
        var list = [];
        poly.forEach(function (p) { if (p[2] >= 0 && list.indexOf(p[2]) < 0) list.push(p[2]); });
        nb.push(list);
      }
    }

    // A wobbly island, kept clear of the canvas edges and the readout corner.
    var ph = [0, 1, 2, 3].map(function () { return Math.random() * TAU; });
    var cx = W0 * 0.53, cy = H0 * 0.55, rx = W0 * 0.42, ry = H0 * 0.39;
    var land = new Uint8Array(n);
    for (a = 0; a < n; a++) {
      var x = pts[a][0], y = pts[a][1];
      var u = (x - cx) / rx, v = (y - cy) / ry, r = Math.hypot(u, v), t = Math.atan2(v, u);
      var R = 1 + 0.11 * Math.sin(2 * t + ph[0]) + 0.08 * Math.sin(3 * t + ph[1]) +
        0.06 * Math.sin(5 * t + ph[2]) + 0.04 * Math.sin(8 * t + ph[3]);
      land[a] = r < R && x > cw * 1.6 && x < W0 - cw * 1.6 && y > ch * 1.6 && y < H0 - ch * 1.6 ? 1 : 0;
    }
    fillLakes(land, nb, cols, rows);
    keepLargest(land, nb);

    // Grow countries from scattered capitals, favoring the smaller ones.
    var landList = [];
    for (a = 0; a < n; a++) if (land[a]) landList.push(a);
    var owner = new Int16Array(n).fill(-1);
    var count = Math.min(want, landList.length);
    var gap = Math.sqrt(landList.length / count) * size * 0.75;
    var caps = [];
    for (var tries = 0; caps.length < count && tries < count * 60; tries++) {
      var c = landList[Math.floor(Math.random() * landList.length)];
      if (owner[c] >= 0) continue;
      var near = tries < count * 40 && caps.some(function (o) {
        return Math.hypot(pts[o][0] - pts[c][0], pts[o][1] - pts[c][1]) < gap;
      });
      if (near) continue;
      owner[c] = caps.length;
      caps.push(c);
    }
    count = caps.length;
    var frontier = caps.map(function (c) { return nb[c].slice(); });
    var sizes = caps.map(function () { return 1; });
    var live = caps.map(function (c, q) { return q; });
    while (live.length) {
      var p1 = live[Math.floor(Math.random() * live.length)], p2 = live[Math.floor(Math.random() * live.length)];
      var q = sizes[p1] <= sizes[p2] ? p1 : p2;
      var f = frontier[q];
      if (!f.length) { live.splice(live.indexOf(q), 1); continue; }
      var pick = f.splice(Math.floor(Math.random() * f.length), 1)[0];
      if (!land[pick] || owner[pick] >= 0) continue;
      owner[pick] = q;
      sizes[q]++;
      nb[pick].forEach(function (m) { if (land[m] && owner[m] < 0) f.push(m); });
    }

    // Fill paths, borders and coastline, all in this map's own pixel space.
    var fills = [], edgesOf = [], adj = [], pairs = {};
    for (q = 0; q < count; q++) { fills.push(new Path2D()); edgesOf.push(new Path2D()); adj.push([]); }
    var borders = new Path2D(), coast = new Path2D();
    for (a = 0; a < n; a++) {
      if (owner[a] < 0) continue;
      var pl = polys[a], o = owner[a], path = fills[o];
      path.moveTo(pl[0][0], pl[0][1]);
      for (var m = 1; m < pl.length; m++) path.lineTo(pl[m][0], pl[m][1]);
      path.closePath();
      for (m = 0; m < pl.length; m++) {
        var s0 = pl[m], s1 = pl[(m + 1) % pl.length], other = s0[2] >= 0 ? owner[s0[2]] : -1;
        if (other === o) continue;
        edgesOf[o].moveTo(s0[0], s0[1]);
        edgesOf[o].lineTo(s1[0], s1[1]);
        if (other < 0) {
          coast.moveTo(s0[0], s0[1]);
          coast.lineTo(s1[0], s1[1]);
        } else if (o < other) {
          borders.moveTo(s0[0], s0[1]);
          borders.lineTo(s1[0], s1[1]);
          var key = o + ',' + other;
          if (!pairs[key]) { pairs[key] = []; adj[o].push(other); adj[other].push(o); }
          pairs[key].push(s0[0], s0[1], s1[0], s1[1]);
        }
      }
    }

    var coastal = new Uint8Array(count);
    for (a = 0; a < n; a++) {
      if (owner[a] < 0) continue;
      for (m = 0; m < polys[a].length; m++) {
        var w = polys[a][m][2];
        if (w < 0 || owner[w] < 0) coastal[owner[a]] = 1;
      }
    }

    M = {
      W: W0, H: H0, cols: cols, rows: rows, cw: cw, ch: ch, pts: pts, owner: owner, n: count,
      fills: fills, edges: edgesOf, adj: adj, pairs: pairs, borders: borders, coast: coast, coastal: coastal
    };
    color = [];
    for (q = 0; q < count; q++) color.push(-1);
    solver = null;
    wheel = null;
    hover = -1;
  }

  // Sea that can't reach the open ocean becomes land, so there are no lakes.
  function fillLakes(land, nb, cols, rows) {
    var n = land.length, seen = new Uint8Array(n), queue = [];
    for (var a = 0; a < n; a++) {
      var i = a % cols, j = Math.floor(a / cols);
      if (!land[a] && (i === 0 || j === 0 || i === cols - 1 || j === rows - 1)) { seen[a] = 1; queue.push(a); }
    }
    while (queue.length) {
      var c = queue.pop();
      nb[c].forEach(function (m) { if (!land[m] && !seen[m]) { seen[m] = 1; queue.push(m); } });
    }
    for (a = 0; a < n; a++) if (!land[a] && !seen[a]) land[a] = 1;
  }

  function keepLargest(land, nb) {
    var n = land.length, comp = new Int32Array(n).fill(-1), best = -1, bestSize = 0, id = 0;
    for (var a = 0; a < n; a++) {
      if (!land[a] || comp[a] >= 0) continue;
      var queue = [a], size = 0;
      comp[a] = id;
      while (queue.length) {
        var c = queue.pop();
        size++;
        nb[c].forEach(function (m) { if (land[m] && comp[m] < 0) { comp[m] = id; queue.push(m); } });
      }
      if (size > bestSize) { bestSize = size; best = id; }
      id++;
    }
    for (a = 0; a < n; a++) if (land[a] && comp[a] !== best) land[a] = 0;
  }

  // ---- Coloring ----

  function free(c) {
    var mask = (1 << k) - 1;
    M.adj[c].forEach(function (o) { if (color[o] >= 0) mask &= ~(1 << color[o]); });
    return mask;
  }

  function bits(m) {
    var b = 0;
    while (m) { b += m & 1; m >>= 1; }
    return b;
  }

  function startSolve() {
    for (var c = 0; c < M.n; c++) color[c] = -1;
    wheel = null;
    solver = {
      stack: [], mode: 'choose', steps: 0, back: 0, done: false, ok: false,
      t: 0, acc: 0, focus: -1, flash: -1, fade: 0, depth: 0, best: null
    };
  }

  // One move of the search: pick the most hemmed-in country, or try its next
  // color, or back up a level when it has none left.
  function solveStep() {
    var S = solver, c, full = (1 << k) - 1;
    S.steps++;
    if (S.mode === 'choose') {
      var best = -1, bs = -1, bd = -1;
      for (c = 0; c < M.n; c++) {
        if (color[c] >= 0) continue;
        var sat = bits(full & ~free(c)), deg = 0;
        M.adj[c].forEach(function (o) { if (color[o] < 0) deg++; });
        if (sat > bs || (sat === bs && deg > bd)) { best = c; bs = sat; bd = deg; }
      }
      if (best < 0) { S.done = true; S.ok = true; S.focus = -1; return; }
      S.stack.push({ c: best, tried: 0 });
    }
    var top = S.stack[S.stack.length - 1];
    color[top.c] = -1;
    var maxUsed = -1;
    for (c = 0; c < M.n; c++) if (color[c] > maxUsed) maxUsed = color[c];
    var options = free(top.c) & ~top.tried, limit = Math.min(k, maxUsed + 2), pick = -1;
    for (c = 0; c < limit; c++) if (options & (1 << c)) { pick = c; break; }
    if (pick < 0) {
      S.stack.pop();
      S.back++;
      S.flash = top.c;
      S.fade = 1;
      S.mode = 'try';
      if (!S.stack.length) { S.done = true; S.ok = false; S.focus = -1; findWheel(); }
      return;
    }
    top.tried |= 1 << pick;
    color[top.c] = pick;
    S.focus = top.c;
    if (S.stack.length > S.depth) { S.depth = S.stack.length; S.best = color.slice(); }
    var dead = M.adj[top.c].some(function (o) { return color[o] < 0 && !free(o); });
    S.mode = dead ? 'try' : 'choose';
  }

  // An inland country whose neighbors form a ring of odd length: the ring alone
  // needs three colors, and the middle touches all of them.
  // Paint the ring around it in two colors, then a third where they meet,
  // which leaves no color for the middle.
  function findWheel() {
    for (var c = 0; c < M.n; c++) {
      var ring = M.adj[c];
      if (M.coastal[c] || ring.length % 2 === 0) continue;
      var cycle = ring.every(function (a) {
        var inRing = 0;
        M.adj[a].forEach(function (b) { if (ring.indexOf(b) >= 0) inRing++; });
        return inRing === 2;
      });
      if (!cycle || !connected(ring)) continue;
      wheel = { center: c, ring: ring };
      var prev = -1, at = ring[0];
      for (var i = 0; i < ring.length; i++) {
        color[at] = i === ring.length - 1 ? 2 : i % 2;
        var next = -1;
        M.adj[at].forEach(function (b) { if (next < 0 && b !== prev && ring.indexOf(b) >= 0) next = b; });
        prev = at;
        at = next;
      }
      return;
    }
    if (solver.best) color = solver.best.slice();
  }

  function connected(set) {
    var seen = [set[0]], queue = [set[0]];
    while (queue.length) {
      var a = queue.pop();
      M.adj[a].forEach(function (b) {
        if (set.indexOf(b) >= 0 && seen.indexOf(b) < 0) { seen.push(b); queue.push(b); }
      });
    }
    return seen.length === set.length;
  }

  function clashes() {
    var list = [];
    for (var key in M.pairs) {
      var ab = key.split(','), a = +ab[0], b = +ab[1];
      if (color[a] >= 0 && color[a] === color[b]) list.push(key);
    }
    return list;
  }

  // ---- Drawing ----

  function draw(st) {
    var ctx = st.ctx, i;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.scale(W / M.W, H / M.H);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.strokeStyle = 'rgba(110,231,255,0.05)';
    ctx.lineWidth = 22;
    ctx.stroke(M.coast);
    ctx.strokeStyle = 'rgba(110,231,255,0.07)';
    ctx.lineWidth = 9;
    ctx.stroke(M.coast);

    for (i = 0; i < M.n; i++) {
      var on = color[i] >= 0;
      ctx.fillStyle = on ? COLORS[color[i]] : BLANK;
      ctx.globalAlpha = on ? 0.8 : 1;
      ctx.fill(M.fills[i]);
    }
    ctx.globalAlpha = 1;
    if (hover >= 0 && !solver) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill(M.fills[hover]);
    }

    ctx.strokeStyle = '#0a0b10';
    ctx.lineWidth = 2.2;
    ctx.stroke(M.borders);
    ctx.strokeStyle = 'rgba(236,232,223,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke(M.coast);

    var bad = clashes();
    if (bad.length) {
      var clash = new Path2D();
      bad.forEach(function (key) {
        var s = M.pairs[key];
        for (var j = 0; j < s.length; j += 4) { clash.moveTo(s[j], s[j + 1]); clash.lineTo(s[j + 2], s[j + 3]); }
      });
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#ff5fa2';
      ctx.shadowBlur = 10;
      ctx.setLineDash([6, 5]);
      ctx.stroke(clash);
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    }

    if (solver && solver.flash >= 0 && solver.fade > 0) {
      ctx.strokeStyle = 'rgba(255,95,162,' + solver.fade + ')';
      ctx.lineWidth = 3;
      ctx.stroke(M.edges[solver.flash]);
    }
    if (solver && solver.focus >= 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke(M.edges[solver.focus]);
    }
    if (hover >= 0 && !solver) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke(M.edges[hover]);
    }
    if (wheel) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      wheel.ring.forEach(function (r) { ctx.stroke(M.edges[r]); });
      ctx.setLineDash([]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 12;
      ctx.stroke(M.edges[wheel.center]);
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    if (wheel) {
      ctx.font = '500 12px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      var lines = ['A ring of ' + wheel.ring.length + ' needs 3 colors by itself,',
        'so the country in the middle needs a 4th.'];
      var tw = Math.max(ctx.measureText(lines[0]).width, ctx.measureText(lines[1]).width) + 20;
      ctx.fillStyle = 'rgba(10,11,16,0.82)';
      ctx.beginPath();
      ctx.roundRect(W / 2 - tw / 2, H - 52, tw, 42, 8);
      ctx.fill();
      ctx.fillStyle = '#ece8df';
      ctx.fillText(lines[0], W / 2, H - 35);
      ctx.fillText(lines[1], W / 2, H - 18);
    }

    var done = 0;
    color.forEach(function (c) { if (c >= 0) done++; });
    var line2;
    if (solver && !solver.done) line2 = 'Solving: ' + solver.steps + ' steps, ' + solver.back + ' back';
    else if (solver && solver.ok) line2 = k + ' colors: done in ' + solver.steps + ' steps';
    else if (solver) line2 = k + ' colors: impossible here';
    else if (bad.length) line2 = bad.length + (bad.length > 1 ? ' clashes' : ' clash');
    else if (done === M.n) line2 = 'Done, no clashes!';
    else line2 = 'No clashes yet';
    V.setText(readout, M.n + ' countries, ' + done + ' colored\n' + line2);
  }

  function frame(dt, st) {
    W = st.width;
    H = st.height;
    if (regen) {
      regen = false;
      generate();
      if (autoSolve && !V.reducedMotion) startSolve();
      autoSolve = false;
      st.dirty = true;
    }
    if (solver && !solver.done) {
      solver.t += dt;
      solver.acc += dt * (10 + 30 * solver.t);
      var budget = V.reducedMotion ? 5000 : 400;
      while (solver.acc >= 1 && !solver.done && budget-- > 0) {
        solveStep();
        solver.acc -= 1;
        if (solver.steps > 60000) { solver.done = true; solver.ok = false; }
      }
      st.dirty = true;
    }
    if (solver && solver.fade > 0) {
      solver.fade = Math.max(0, solver.fade - dt * 3);
      st.dirty = true;
    }
    if (!st.dirty || !M) return;
    st.dirty = false;
    draw(st);
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Pointer ----

  function countryAt(px, py) {
    if (!M) return -1;
    var x = px * M.W / W, y = py * M.H / H;
    var i = Math.floor(x / M.cw), j = Math.floor(y / M.ch), best = -1, bd = Infinity;
    for (var dj = -2; dj <= 2; dj++) {
      for (var di = -2; di <= 2; di++) {
        var ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= M.cols || jj >= M.rows) continue;
        var a = jj * M.cols + ii, p = M.pts[a], d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
        if (d < bd) { bd = d; best = a; }
      }
    }
    return best >= 0 ? M.owner[best] : -1;
  }

  canvas.addEventListener('click', function (e) {
    var r = canvas.getBoundingClientRect(), c = countryAt(e.clientX - r.left, e.clientY - r.top);
    if (c < 0) return;
    if (solver) { solver = null; wheel = null; }
    color[c] = color[c] === brush ? -1 : brush;
    stage.dirty = true;
  });

  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    var r = canvas.getBoundingClientRect(), c = countryAt(e.clientX - r.left, e.clientY - r.top);
    canvas.style.cursor = c >= 0 ? 'pointer' : '';
    if (c !== hover) { hover = c; stage.dirty = true; }
  });
  canvas.addEventListener('pointerleave', function () {
    if (hover >= 0) { hover = -1; stage.dirty = true; }
  });

  // ---- Controls ----

  paintGroup.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    brush = +btn.dataset.color;
    paintGroup.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b === btn));
    });
  });

  V.segmented(kGroup, function (v) { k = +v; if (solver) solver = null; wheel = null; stage.dirty = true; });

  V.ctl(section, 'solve').addEventListener('click', function () {
    if (!M) return;
    startSolve();
    stage.dirty = true;
  });
  V.ctl(section, 'clear').addEventListener('click', function () {
    if (!M) return;
    solver = null;
    wheel = null;
    for (var c = 0; c < M.n; c++) color[c] = -1;
    stage.dirty = true;
  });
  V.ctl(section, 'new').addEventListener('click', function () { regen = true; stage.dirty = true; });

  // A new map is drawn when the slider is let go, not on every step of a drag.
  var countInput = V.ctl(section, 'count');
  V.range(countInput, V.ctl(section, 'count-out'),
    function (v) { return String(v); },
    function (v) { want = v; });
  countInput.addEventListener('change', function () { regen = true; stage.dirty = true; });
})();
