// Travelling salesperson: the shortest round trip through every city. With n
// cities there are (n − 1)!/2 different trips, so we settle for good ones:
// nearest neighbor, 2-opt swaps and simulated annealing. Up to 12 cities the
// true shortest trip is found exactly by Held–Karp dynamic programming.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('tsp');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var countGroup = V.ctl(section, 'count');

  var BW = 400, BH = 300;   // the map, in the units tour lengths are given in
  var MAX = 100;
  var EXACT = 12;
  var SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

  var cities = [];
  var method = '2opt';
  var rate = 32;
  var playing = !V.reducedMotion;
  var dist = null;
  var tour = [];
  var phase = 'done';
  var visited = null;
  var swaps = 0;
  var flash = null;         // the two new edges after a swap: { i, j, t }
  var temp = 0, temp0 = 0, iter = 0, iters = 0;
  var best = null;          // exact shortest length, for small maps
  var bestTour = null;
  var showBest = false;
  var acc = 0;
  var M = null;
  var held = null;
  var dragged = false;
  var started = false;

  function scatter(n) {
    cities = [];
    for (var i = 0; i < n; i++) cities.push({ x: 16 + Math.random() * (BW - 32), y: 16 + Math.random() * (BH - 32) });
    changed();
  }

  function changed() {
    var n = cities.length;
    started = true;
    dist = new Float64Array(n * n);
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        var dx = cities[i].x - cities[j].x, dy = cities[i].y - cities[j].y;
        dist[i * n + j] = Math.sqrt(dx * dx + dy * dy);
      }
    }
    best = bestTour = null;
    if (n >= 3 && n <= EXACT) heldKarp();
    restart();
  }

  function d(a, b) { return dist[a * cities.length + b]; }

  function length(t) {
    var s = 0;
    for (var i = 0; i < t.length; i++) s += d(t[i], t[(i + 1) % t.length]);
    return t.length > 1 ? s : 0;
  }

  function shuffled() {
    var t = [];
    for (var i = 0; i < cities.length; i++) t.push(i);
    for (i = t.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), s = t[i];
      t[i] = t[j];
      t[j] = s;
    }
    return t;
  }

  function restart() {
    var n = cities.length;
    swaps = 0;
    flash = null;
    acc = 0;
    if (n < 3) {
      tour = shuffled();
      phase = 'done';
    } else if (method === 'nn') {
      tour = [0];
      visited = new Uint8Array(n);
      visited[0] = 1;
      phase = 'run';
    } else {
      // Both improvers start from a random, badly tangled tour.
      tour = shuffled();
      phase = 'run';
      if (method === 'anneal') {
        temp0 = temp = length(tour) / n * 0.6;
        iter = 0;
        iters = 2500 * n;
      }
    }
    stage.dirty = true;
  }

  // Exact shortest tour length by Held–Karp: best[set][j] is the shortest path
  // from city 0 through every city in the set, ending at j.
  function heldKarp() {
    var n = cities.length, full = 1 << (n - 1);
    var dp = new Float64Array(full * n).fill(Infinity);
    var from = new Int8Array(full * n);
    var j, k, s;
    for (j = 1; j < n; j++) dp[(1 << (j - 1)) * n + j] = d(0, j);
    for (s = 1; s < full; s++) {
      for (j = 1; j < n; j++) {
        if (!(s & (1 << (j - 1)))) continue;
        var here = dp[s * n + j];
        if (here === Infinity) continue;
        for (k = 1; k < n; k++) {
          var bit = 1 << (k - 1);
          if (s & bit) continue;
          var v = here + d(j, k), at = (s | bit) * n + k;
          if (v < dp[at]) { dp[at] = v; from[at] = j; }
        }
      }
    }
    var out = Infinity, end = 1;
    for (j = 1; j < n; j++) {
      var v2 = dp[(full - 1) * n + j] + d(j, 0);
      if (v2 < out) { out = v2; end = j; }
    }
    // Walk the choices backwards to recover the trip itself.
    bestTour = [];
    for (s = full - 1, j = end; s; ) {
      bestTour.push(j);
      var prev = (s & (s - 1)) ? from[s * n + j] : 0;
      s &= ~(1 << (j - 1));
      j = prev;
    }
    bestTour.push(0);
    best = out;
  }

  // ---- One step of each method ----

  function stepNN() {
    var last = tour[tour.length - 1], pick = -1, bd = Infinity;
    for (var i = 0; i < cities.length; i++) {
      if (!visited[i] && d(last, i) < bd) { bd = d(last, i); pick = i; }
    }
    if (pick < 0) { phase = 'done'; return; }
    visited[pick] = 1;
    tour.push(pick);
    if (tour.length === cities.length) phase = 'done';
  }

  function reverse(i, j) {
    while (i < j) {
      var s = tour[i];
      tour[i] = tour[j];
      tour[j] = s;
      i++;
      j--;
    }
  }

  // Replace edges (a, b) and (c, e) with (a, c) and (b, e), the best such
  // swap available, by reversing the stretch between them.
  function step2opt() {
    var n = tour.length, bi = -1, bj = -1, bg = -1e-9;
    for (var i = 0; i < n - 2; i++) {
      var a = tour[i], b = tour[i + 1];
      for (var j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        var c = tour[j], e = tour[(j + 1) % n];
        var gain = d(a, c) + d(b, e) - d(a, b) - d(c, e);
        if (gain < bg) { bg = gain; bi = i; bj = j; }
      }
    }
    if (bi < 0) { phase = 'done'; flash = null; return; }
    reverse(bi + 1, bj);
    swaps++;
    flash = { i: bi, j: bj, t: 1 };
  }

  function stepAnneal(count) {
    var n = tour.length;
    for (var k = 0; k < count && iter < iters; k++, iter++) {
      temp = temp0 * Math.pow(0.0005, iter / iters);
      var i = Math.floor(Math.random() * n), j = Math.floor(Math.random() * n);
      if (i > j) { var s = i; i = j; j = s; }
      if (j - i < 2 || (i === 0 && j === n - 1)) continue;
      var a = tour[i], b = tour[i + 1], c = tour[j], e = tour[(j + 1) % n];
      var delta = d(a, c) + d(b, e) - d(a, b) - d(c, e);
      if (delta < 0 || Math.random() < Math.exp(-delta / temp)) {
        reverse(i + 1, j);
        if (delta < 0) swaps++;
      }
    }
    if (iter >= iters) phase = 'done';
  }

  function frame(dt, st) {
    if (!started) { started = true; scatter(12); }
    var moved = false;
    if (flash) {
      flash.t -= dt * 2.5;
      if (flash.t <= 0) flash = null;
      moved = true;
    }
    if (playing && phase === 'run' && !held) {
      var t0 = performance.now();
      if (method === 'anneal') {
        var want = Math.max(1, Math.round(dt * rate * 400));
        while (want > 0 && phase === 'run' && performance.now() - t0 < 4) {
          stepAnneal(Math.min(want, 500));
          want -= 500;
        }
      } else {
        acc += dt * rate;
        var m = Math.floor(acc);
        acc -= m;
        for (var k = 0; k < m && phase === 'run'; k++) {
          if (method === 'nn') stepNN(); else step2opt();
          if (performance.now() - t0 > 4) { acc = 0; break; }
        }
      }
      moved = true;
      if (phase === 'done') setPlaying(false);
    }
    if (!moved && !st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  // ---- Drawing ----

  function layout(st) {
    var W = st.width, H = st.height, top = 76, pad = 14;
    var s = Math.min((W - pad * 2) / BW, (H - top - pad) / BH);
    return { W: W, H: H, s: s, x: (W - BW * s) / 2, y: top + (H - top - pad - BH * s) / 2 };
  }

  function px(c) { return [M.x + cities[c].x * M.s, M.y + cities[c].y * M.s]; }

  function draw(st) {
    var ctx = st.ctx, i;
    M = layout(st);
    ctx.clearRect(0, 0, M.W, M.H);
    var n = tour.length, closed = phase === 'done' || method !== 'nn';

    if (showBest && bestTour) {
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = 'rgba(236,232,223,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (i = 0; i <= bestTour.length; i++) {
        var b = px(bestTour[i % bestTour.length]);
        if (i) ctx.lineTo(b[0], b[1]); else ctx.moveTo(b[0], b[1]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.lineWidth = n > 60 ? 1.8 : 2.6;
    ctx.lineCap = 'round';
    ctx.globalAlpha = method === 'anneal' && phase === 'run' ? 0.75 : 0.95;
    var edges = closed && n > 2 ? n : n - 1;
    for (i = 0; i < edges; i++) {
      var p = px(tour[i]), q = px(tour[(i + 1) % n]);
      ctx.strokeStyle = V.gradient(V.SPECTRUM, i / Math.max(1, n - 1));
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(q[0], q[1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // The two roads a 2-opt swap just built.
    if (flash && method === '2opt') {
      ctx.strokeStyle = 'rgba(255,255,255,' + Math.max(0, flash.t) + ')';
      ctx.lineWidth = 4;
      var e1 = [tour[flash.i], tour[flash.i + 1]], e2 = [tour[flash.j], tour[(flash.j + 1) % n]];
      [e1, e2].forEach(function (e) {
        var a = px(e[0]), b = px(e[1]);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      });
    }

    // Nearest neighbor: a dashed line home once every city is visited.
    if (method === 'nn' && phase === 'run' && n > 1) {
      var h = px(tour[n - 1]), z = px(tour[0]);
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(236,232,223,0.25)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(h[0], h[1]);
      ctx.lineTo(z[0], z[1]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (i = 0; i < cities.length; i++) {
      var c = px(i);
      var on = method !== 'nn' || !visited || visited[i] || phase === 'done';
      ctx.fillStyle = held && cities[i] === held ? '#ffffff' : on ? '#ece8df' : '#6f7286';
      ctx.beginPath();
      ctx.arc(c[0], c[1], held && cities[i] === held ? 7 : cities.length > 60 ? 3.5 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (method === 'nn' && phase === 'run' && n) {
      var cur = px(tour[n - 1]);
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cur[0], cur[1], 9, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Status in the corner: what the method is doing.
    var status = method === 'nn' ? 'Nearest neighbor' + (phase === 'run' ? ': ' + n + ' of ' + cities.length : ', done')
      : method === '2opt' ? '2-opt: ' + swaps + ' swaps' + (phase === 'done' ? ', no more help' : '')
      : 'Annealing: ' + (phase === 'run' ? 'temperature ' + temp.toFixed(temp < 1 ? 2 : 1) : 'frozen');
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#6f7286';
    ctx.fillText(status, M.W - 12, M.H - 8);
    if (method === 'anneal' && phase === 'run') {
      ctx.fillStyle = 'rgba(236,232,223,0.12)';
      ctx.fillRect(M.W - 112, M.H - 30, 100, 3);
      ctx.fillStyle = '#ff8a5c';
      ctx.fillRect(M.W - 112, M.H - 30, 100 * Math.log(temp / temp0 / 0.0005) / Math.log(1 / 0.0005), 3);
    }

    updateReadout();
  }

  function sup(k) {
    return String(k).replace(/\d/g, function (x) { return SUP.charAt(+x); });
  }

  // (n − 1)!/2, exactly while it fits, otherwise as a power of ten.
  function tourCount(n) {
    if (n < 3) return { text: '1', log: 0 };
    var lg = 0, v = 1;
    for (var k = 2; k <= n - 1; k++) { lg += Math.log(k) / Math.LN10; v *= k; }
    v /= 2;
    lg -= Math.log(2) / Math.LN10;
    if (v < 1e15) return { text: Math.round(v).toLocaleString(), log: lg };
    var e = Math.floor(lg), m = Math.pow(10, lg - e);
    if (m >= 9.95) { m = 1; e++; }
    return { text: m.toFixed(1) + ' × 10' + sup(e), log: lg };
  }

  function duration(lgSeconds) {
    var s = Math.pow(10, lgSeconds);
    if (s < 1) return 'under a second';
    if (s < 120) return Math.round(s) + ' seconds';
    if (s < 7200) return Math.round(s / 60) + ' minutes';
    if (s < 172800) return Math.round(s / 3600) + ' hours';
    if (s < 5184000) return Math.round(s / 86400) + ' days';
    var lgYears = lgSeconds - Math.log(3.156e7) / Math.LN10, y = Math.pow(10, lgYears);
    if (y < 10) return y.toFixed(1) + ' years';
    if (y < 1e6) return Math.round(y).toLocaleString() + ' years';
    return 'about 10' + sup(Math.floor(lgYears)) + ' years';
  }

  function updateReadout() {
    var n = cities.length, L = length(tour);
    var line1 = (n < 2 ? 'Add some cities' : 'Tour length ' + Math.round(L).toLocaleString()) +
      (best !== null && n >= 3 ? ' (best ' + Math.round(best).toLocaleString() + ')' : '');
    if (n < 3) { V.setText(readout, line1); return; }
    var tc = tourCount(n);
    var line2 = n + ' cities: ' + tc.text + (tc.text === '1' ? ' tour' : ' tours');
    var line3 = 'Checking 10⁹ a second: ' + duration(tc.log - 9);
    V.setText(readout, line1 + '\n' + line2 + '\n' + line3);
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Pointer: drag a city, click empty space to add one ----

  function nearest(x, y) {
    var bi = -1, bd = Infinity;
    for (var i = 0; i < cities.length; i++) {
      var c = px(i), dd = (c[0] - x) * (c[0] - x) + (c[1] - y) * (c[1] - y);
      if (dd < bd) { bd = dd; bi = i; }
    }
    return { i: bi, d: Math.sqrt(bd) };
  }

  function toWorld(x, y) {
    return {
      x: Math.max(4, Math.min(BW - 4, (x - M.x) / M.s)),
      y: Math.max(4, Math.min(BH - 4, (y - M.y) / M.s))
    };
  }

  V.drag(canvas, {
    hit: function (x, y) {
      if (!M) return null;
      var hit = nearest(x, y);
      return hit.i >= 0 && hit.d < 16 ? cities[hit.i] : null;
    },
    move: function (c, x, y, first) {
      dragged = !first;
      held = c;
      var w = toWorld(x, y);
      c.x = w.x;
      c.y = w.y;
      // Keep the tour while dragging; only the distances change.
      var n = cities.length, i = cities.indexOf(c);
      for (var j = 0; j < n; j++) {
        var dx = cities[i].x - cities[j].x, dy = cities[i].y - cities[j].y;
        dist[i * n + j] = dist[j * n + i] = Math.sqrt(dx * dx + dy * dy);
      }
      stage.dirty = true;
    },
    end: function () {
      held = null;
      V.setSegmented(countGroup, '');
      changed();
      setPlaying(true);
    }
  });

  canvas.addEventListener('click', function (e) {
    if (dragged) { dragged = false; return; }
    if (!M || cities.length >= MAX) return;
    var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (x < M.x || y < M.y || x > M.x + BW * M.s || y > M.y + BH * M.s) return;
    if (nearest(x, y).d < 16) return;
    var w = toWorld(x, y);
    cities.push({ x: w.x, y: w.y });
    V.setSegmented(countGroup, '');
    changed();
    setPlaying(true);
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);

  playBtn.addEventListener('click', function () {
    if (!playing && phase === 'done') restart();
    setPlaying(!playing);
  });

  V.ctl(section, 'again').addEventListener('click', function () {
    restart();
    setPlaying(true);
  });

  V.toggle(V.ctl(section, 'showbest'), function (on) {
    showBest = on;
    stage.dirty = true;
  });

  V.ctl(section, 'clear').addEventListener('click', function () {
    cities = [];
    V.setSegmented(countGroup, '');
    changed();
  });

  V.segmented(V.ctl(section, 'method'), function (v) {
    method = v;
    speedText();
    restart();
    setPlaying(true);
  });

  V.segmented(countGroup, function (v) {
    scatter(parseInt(v, 10));
    setPlaying(true);
  });

  var speedText = V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) {
      var r = Math.pow(2, v);
      return method === 'anneal' ? Math.round(r * 400).toLocaleString() + ' tries / s' : Math.round(r) + ' steps / s';
    },
    function (v) { rate = Math.pow(2, v); });
})();
