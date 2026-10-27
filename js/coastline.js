// Coastline paradox: walk a pair of dividers around a fractal island and
// count the steps. Halving the ruler multiplies the length by about 2^(D − 1),
// so the slope of log(length) against log(1/ruler) gives the dimension D.
// The island is the zero contour of a diamond-square height field.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('coastline');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var rulerInput = V.ctl(section, 'ruler');
  var rulerOut = V.ctl(section, 'ruler-out');

  var LEVELS = 9;               // a 513 × 513 height field
  var S = (1 << LEVELS) + 1;
  var RULERS = 6;
  var KM = 200;                 // the island is about this wide
  var ROUGH = [0.95, 0.8, 0.65, 0.5, 0.35];
  var ROUGH_NAMES = ['Smooth', 'Gentle', 'Rocky', 'Ragged', 'Fjords'];

  var seed = 3;
  var roughness = 3;
  var builder = null;
  var island = null;            // { loops, box, width, walks }
  var land = null;              // the island drawn once, reused every frame
  var shown = RULERS - 1;       // which ruler is on the map
  var measured = [];            // rulers whose walk is finished
  var walking = -1, walkT = 0, hold = 0;
  var playing = !V.reducedMotion;

  function mulberry(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The island is built a slice at a time across frames: each diamond-square
  // round, the normalizing passes and bands of contour rows are separate steps.
  function startBuild() {
    return { R: mulberry(seed * 7919 + 1), h: new Float32Array(S * S), rough: Math.pow(2, -ROUGH[roughness]),
      amp: 1, step: S - 1, phase: 0, row: 0 };
  }

  // Returns the finished loops, or null while there's more to do.
  function buildStep(b) {
    var h = b.h, R = b.R, half = b.step >> 1, x, y, i, n = S * S;
    if (b.phase === 0) {
      for (y = half; y < S; y += b.step) {
        for (x = half; x < S; x += b.step) {
          h[y * S + x] = (h[(y - half) * S + x - half] + h[(y - half) * S + x + half] +
            h[(y + half) * S + x - half] + h[(y + half) * S + x + half]) / 4 + (R() * 2 - 1) * b.amp;
        }
      }
      b.phase = 1;
    } else if (b.phase === 1) {
      for (y = 0; y < S; y += half) {
        for (x = (y / half) % 2 ? 0 : half; x < S; x += b.step) {
          var sum = 0, c = 0;
          if (y >= half) { sum += h[(y - half) * S + x]; c++; }
          if (y + half < S) { sum += h[(y + half) * S + x]; c++; }
          if (x >= half) { sum += h[y * S + x - half]; c++; }
          if (x + half < S) { sum += h[y * S + x + half]; c++; }
          h[y * S + x] = sum / c + (R() * 2 - 1) * b.amp;
        }
      }
      b.amp *= b.rough;
      b.step = half;
      b.phase = b.step > 1 ? 0 : 2;
    } else if (b.phase === 2) {
      // Normalize, then pull the edges down so one big island sits in the middle.
      var mean = 0, sd = 0;
      for (i = 0; i < n; i++) mean += h[i];
      mean /= n;
      for (i = 0; i < n; i++) sd += (h[i] - mean) * (h[i] - mean);
      sd = Math.sqrt(sd / n) || 1;
      b.lo = Infinity;
      b.hi = -Infinity;
      for (y = 0; y < S; y++) {
        var dy = y / (S - 1) * 2 - 1;
        for (x = 0; x < S; x++) {
          var dx = x / (S - 1) * 2 - 1;
          var v = (h[y * S + x] - mean) / sd * 0.32 + 1 - 1.9 * (dx * dx + dy * dy);
          h[y * S + x] = v;
          if (v < b.lo) b.lo = v;
          if (v > b.hi) b.hi = v;
        }
      }
      b.phase = 3;
    } else if (b.phase === 3) {
      // Sea level from a histogram: 72% of the map below it.
      var bins = new Uint32Array(1024), k, span = b.hi - b.lo;
      for (i = 0; i < n; i++) bins[Math.min(1023, Math.floor((h[i] - b.lo) / span * 1024))]++;
      var target = n * 0.72, acc = 0;
      for (k = 0; k < 1024 && acc + bins[k] < target; k++) acc += bins[k];
      var sea = b.lo + (k + 0.5) / 1024 * span;
      for (i = 0; i < n; i++) h[i] -= sea;
      b.mc = { id: new Int32Array(2 * S * S).fill(-1), px: [], py: [], adj: [] };
      b.phase = 4;
    } else if (b.phase === 4) {
      var end = Math.min(S - 1, b.row + 64);
      contourRows(h, b.mc, b.row, end);
      b.row = end;
      if (end >= S - 1) b.phase = 5;
    } else {
      return chain(b.mc);
    }
    return null;
  }

  // Marching squares for the zero contour, a band of rows at a time.
  function contourRows(h, m, y0, y1) {
    var id = m.id, px = m.px, py = m.py, adj = m.adj;
    function point(e, x, y) {
      if (id[e] < 0) { id[e] = px.length; px.push(x); py.push(y); adj.push(-1, -1); }
      return id[e];
    }
    function top(x, y) { var a = h[y * S + x], b = h[y * S + x + 1]; return point(y * S + x, x + a / (a - b), y); }
    function left(x, y) { var a = h[y * S + x], b = h[(y + 1) * S + x]; return point(S * S + y * S + x, x, y + a / (a - b)); }
    function link(a, b) {
      adj[a * 2 + (adj[a * 2] < 0 ? 0 : 1)] = b;
      adj[b * 2 + (adj[b * 2] < 0 ? 0 : 1)] = a;
    }
    for (var y = y0; y < y1; y++) {
      for (var x = 0; x < S - 1; x++) {
        var code = (h[y * S + x] > 0 ? 1 : 0) | (h[y * S + x + 1] > 0 ? 2 : 0) |
          (h[(y + 1) * S + x + 1] > 0 ? 4 : 0) | (h[(y + 1) * S + x] > 0 ? 8 : 0);
        if (code === 0 || code === 15) continue;
        switch (code) {
          case 1: case 14: link(top(x, y), left(x, y)); break;
          case 2: case 13: link(top(x, y), left(x + 1, y)); break;
          case 4: case 11: link(left(x + 1, y), top(x, y + 1)); break;
          case 8: case 7: link(top(x, y + 1), left(x, y)); break;
          case 3: case 12: link(left(x, y), left(x + 1, y)); break;
          case 6: case 9: link(top(x, y), top(x, y + 1)); break;
          default: {
            // Saddle: decide by the average of the four corners.
            var mid = h[y * S + x] + h[y * S + x + 1] + h[(y + 1) * S + x + 1] + h[(y + 1) * S + x] > 0;
            if ((code === 5) === mid) { link(top(x, y), left(x + 1, y)); link(top(x, y + 1), left(x, y)); }
            else { link(top(x, y), left(x, y)); link(left(x + 1, y), top(x, y + 1)); }
          }
        }
      }
    }
  }

  // Follow the links into closed loops, biggest first.
  function chain(m) {
    var px = m.px, py = m.py, adj = m.adj;
    var used = new Uint8Array(px.length), loops = [];
    for (var s = 0; s < px.length; s++) {
      if (used[s] || adj[s * 2 + 1] < 0) continue;
      var loop = [], prev = -1, cur = s, ok = true;
      while (true) {
        used[cur] = 1;
        loop.push(px[cur], py[cur]);
        var next = adj[cur * 2] !== prev ? adj[cur * 2] : adj[cur * 2 + 1];
        if (next === s) break;
        if (next < 0 || used[next]) { ok = false; break; }
        prev = cur;
        cur = next;
      }
      if (ok && loop.length >= 48) loops.push(loop);
    }
    loops.sort(function (a, b) { return b.length - a.length; });
    return loops;
  }

  // Dividers: from each point, the next point along the coast exactly one
  // ruler away in a straight line. Returns the pivots and the length.
  function walk(pts, eps) {
    var n = pts.length / 2, x = pts[0], y = pts[1], idx = 0, out = [x, y], steps = 0;
    var e2 = eps * eps;
    while (true) {
      var found = false;
      for (var j = idx; j < n; j++) {
        var bx = pts[((j + 1) % n) * 2], by = pts[((j + 1) % n) * 2 + 1];
        if ((bx - x) * (bx - x) + (by - y) * (by - y) >= e2) {
          var ax = j === idx ? x : pts[j * 2], ay = j === idx ? y : pts[j * 2 + 1];
          if (j !== idx && (ax - x) * (ax - x) + (ay - y) * (ay - y) >= e2) { ax = x; ay = y; }
          var dx = bx - ax, dy = by - ay, fx = ax - x, fy = ay - y;
          var A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - e2;
          var t = (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A);
          x = ax + t * dx;
          y = ay + t * dy;
          out.push(x, y);
          idx = j;
          steps++;
          found = true;
          break;
        }
      }
      if (!found) {
        var rest = Math.hypot(pts[0] - x, pts[1] - y);
        return { pivots: out, steps: steps, length: steps * eps + rest };
      }
    }
  }

  function measure() {
    var main = island.loops[0], minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    island.loops.forEach(function (l) {
      for (var i = 0; i < l.length; i += 2) {
        minX = Math.min(minX, l[i]); maxX = Math.max(maxX, l[i]);
        minY = Math.min(minY, l[i + 1]); maxY = Math.max(maxY, l[i + 1]);
      }
    });
    var mx = Infinity, Mx = -Infinity;
    for (var i = 0; i < main.length; i += 2) { mx = Math.min(mx, main[i]); Mx = Math.max(Mx, main[i]); }
    island.box = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    island.width = Mx - mx;
    island.walks = [];
    for (var k = 0; k < RULERS; k++) {
      var eps = island.width / 4 / Math.pow(2, k);
      var w = walk(main, eps);
      w.eps = eps;
      island.walks.push(w);
    }
  }

  function km(units) { return units / island.width * KM; }

  function fmtKm(v) { return (v >= 10 ? v.toFixed(v >= 100 ? 0 : 1) : v.toFixed(2)) + ' km'; }

  function frame(dt, st) {
    if (builder) {
      var t0 = performance.now(), loops = null;
      do { loops = buildStep(builder); } while (!loops && performance.now() - t0 < 5);
      if (!loops) return;
      builder = null;
      island = { loops: loops };
      land = null;
      measure();
      st.dirty = true;
      if (playing) startWalk(0);
      else {
        measured = [0, 1, 2, 3, 4, 5].slice(0, RULERS);
        shown = Math.min(shown, RULERS - 1);
        syncRuler();
      }
    }
    if (!island) return;

    if (walking >= 0) {
      var w = island.walks[walking], total = w.pivots.length / 2;
      if (walkT < total) {
        walkT += dt * Math.max(14, total / 2.2);
        st.dirty = true;
      } else {
        if (measured.indexOf(walking) < 0) measured.push(walking);
        hold += dt;
        st.dirty = true;
        if (hold > 0.7) {
          hold = 0;
          if (playing && walking < RULERS - 1) startWalk(walking + 1);
          else { walking = -1; setPlaying(false); }
        }
      }
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function startWalk(k) {
    walking = k;
    walkT = 0;
    hold = 0;
    shown = k;
    rulerInput.value = String(k);
    syncRuler();
  }

  function regions(W, H) {
    if (W > H * 1.15) {
      var cw = Math.min(250, W * 0.36);
      return { map: { x: 8, y: 70, w: W - cw - 24, h: H - 78 }, chart: { x: W - cw - 12, y: H - 200 - 12, w: cw, h: 200 } };
    }
    var ch = Math.min(130, H * 0.3);
    return { map: { x: 8, y: 66, w: W - 16, h: H - ch - 84 }, chart: { x: 12, y: H - ch - 12, w: W - 24, h: ch } };
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    ctx.clearRect(0, 0, W, H);
    var R = regions(W, H), b = island.box;
    var s = Math.min(R.map.w / b.w, R.map.h / b.h) * 0.94;
    var ox = R.map.x + R.map.w / 2 - (b.x + b.w / 2) * s, oy = R.map.y + R.map.h / 2 - (b.y + b.h / 2) * s;

    // Land, with lakes left out by the even-odd rule, drawn once per size.
    var key = W + 'x' + H + '@' + st.dpr;
    if (!land || land.key !== key) {
      var lc = land ? land.ctx : document.createElement('canvas').getContext('2d');
      lc.canvas.width = st.canvas.width;
      lc.canvas.height = st.canvas.height;
      lc.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      lc.beginPath();
      island.loops.forEach(function (l) {
        lc.moveTo(ox + l[0] * s, oy + l[1] * s);
        for (var i = 2; i < l.length; i += 2) lc.lineTo(ox + l[i] * s, oy + l[i + 1] * s);
        lc.closePath();
      });
      lc.fillStyle = 'rgba(126,224,161,0.13)';
      lc.fill('evenodd');
      lc.strokeStyle = 'rgba(126,224,161,0.85)';
      lc.lineWidth = 1;
      lc.lineJoin = 'round';
      lc.stroke();
      land = { ctx: lc, key: key };
    }
    ctx.drawImage(land.ctx.canvas, 0, 0, W, H);

    // The ruler's path so far.
    var w = island.walks[shown], n = w.pivots.length / 2;
    var upto = walking === shown ? Math.min(n, Math.floor(walkT) + 1) : n;
    var dot = Math.max(1.2, Math.min(3, w.eps * s * 0.12));
    ctx.strokeStyle = '#ffb454';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (var i = 0; i < upto; i++) {
      var x = ox + w.pivots[i * 2] * s, y = oy + w.pivots[i * 2 + 1] * s;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    if (upto === n) ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#ffb454';
    ctx.beginPath();
    for (i = 0; i < upto; i++) {
      ctx.moveTo(ox + w.pivots[i * 2] * s + dot, oy + w.pivots[i * 2 + 1] * s);
      ctx.arc(ox + w.pivots[i * 2] * s, oy + w.pivots[i * 2 + 1] * s, dot, 0, Math.PI * 2);
    }
    ctx.fill();
    if (upto < n) {
      // The dividers themselves: the last step, drawn bright.
      var ax = ox + w.pivots[(upto - 1) * 2] * s, ay = oy + w.pivots[(upto - 1) * 2 + 1] * s;
      var bx = ox + w.pivots[upto * 2] * s, by = oy + w.pivots[upto * 2 + 1] * s;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, Math.PI * 2); ctx.fill();
    }

    drawChart(ctx, R.chart);

    var done = upto === n;
    var steps = done ? w.steps : upto - 1;
    var lines = ['Ruler ' + fmtKm(km(w.eps)) + ': ' + steps + (steps === 1 ? ' step' : ' steps'),
      done ? 'Coast ≈ ' + fmtKm(km(w.length)) : 'Walking around the coast…'];
    var f = fitLine();
    if (f) lines.push('Dimension ≈ ' + (1 + f.slope).toFixed(2));
    V.setText(readout, lines.join('\n'));
  }

  // Least squares through the measured points: log length against log(1/ruler).
  function fitLine() {
    if (measured.length < 2) return null;
    var xs = [], ys = [];
    measured.forEach(function (k) {
      xs.push(-Math.log(island.walks[k].eps));
      ys.push(Math.log(island.walks[k].length));
    });
    var n = xs.length, mx = 0, my = 0, sxy = 0, sxx = 0, i;
    for (i = 0; i < n; i++) { mx += xs[i] / n; my += ys[i] / n; }
    for (i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); }
    return sxx > 0 ? { slope: sxy / sxx, mx: mx, my: my } : null;
  }

  function drawChart(ctx, c) {
    ctx.fillStyle = 'rgba(10,11,16,0.82)';
    ctx.strokeStyle = '#222534';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(c.x, c.y, c.w, c.h, 10); else ctx.rect(c.x, c.y, c.w, c.h);
    ctx.fill();
    ctx.stroke();

    var pad = { l: 40, r: 14, t: 26, b: 30 };
    var x0 = c.x + pad.l, x1 = c.x + c.w - pad.r, y0 = c.y + pad.t, y1 = c.y + c.h - pad.b;
    var walks = island.walks;
    var lx0 = -Math.log(walks[0].eps), lx1 = -Math.log(walks[RULERS - 1].eps);
    var ly0 = Math.log(walks[0].length), ly1 = Math.log(walks[RULERS - 1].length);
    var span = Math.max(ly1 - ly0, (lx1 - lx0) * 0.45);
    ly0 -= span * 0.12; ly1 = ly0 + span * 1.24;
    var X = function (v) { return x0 + (v - lx0) / (lx1 - lx0) * (x1 - x0); };
    var Y = function (v) { return y1 - (v - ly0) / (ly1 - ly0) * (y1 - y0); };

    ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = '#9b9daf';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Log-log: length vs ruler', c.x + 12, c.y + 9);
    ctx.fillStyle = '#6f7286';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(111,114,134,0.5)';
    for (var k = 0; k < RULERS; k++) {
      var tx = X(-Math.log(walks[k].eps));
      ctx.beginPath(); ctx.moveTo(tx, y1); ctx.lineTo(tx, y1 + 4); ctx.stroke();
      if (k % 2 === 0 || c.w > 300) ctx.fillText(fmtKm(km(walks[k].eps)).replace(' km', ''), tx, y1 + 7);
    }
    ctx.textAlign = 'right';
    ctx.fillText('ruler, km', x1, y1 + 18);
    ctx.textBaseline = 'middle';
    [ly0 + span * 0.12, ly1 - span * 0.12].forEach(function (v) {
      ctx.fillText(String(Math.round(km(Math.exp(v)))), x0 - 6, Y(v));
    });
    ctx.strokeStyle = 'rgba(111,114,134,0.5)';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();

    var f = fitLine();
    if (f) {
      ctx.strokeStyle = 'rgba(126,224,161,0.8)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(X(lx0), Y(f.my + f.slope * (lx0 - f.mx)));
      ctx.lineTo(X(lx1), Y(f.my + f.slope * (lx1 - f.mx)));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#7ee0a1';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('slope ' + f.slope.toFixed(2) + ' → D ≈ ' + (1 + f.slope).toFixed(2), x0 + 6, y0 - 2);
    }
    measured.forEach(function (k) {
      ctx.fillStyle = k === shown ? '#ffffff' : '#ffb454';
      ctx.beginPath();
      ctx.arc(X(-Math.log(walks[k].eps)), Y(Math.log(walks[k].length)), k === shown ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function syncRuler() {
    if (island) rulerOut.textContent = fmtKm(km(island.walks[shown].eps));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function rebuild() {
    island = null;
    measured = [];
    walking = -1;
    builder = startBuild();
    stage.dirty = true;
  }

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = p ? 'Pause' : 'Measure again';
  }

  playBtn.addEventListener('click', function () {
    if (playing) { setPlaying(false); return; }
    setPlaying(true);
    if (!island) return;
    if (walking < 0) { measured = []; startWalk(0); }
  });

  rulerInput.addEventListener('input', function () {
    if (!island) return;
    setPlaying(false);
    walking = -1;
    shown = parseInt(rulerInput.value, 10);
    if (measured.indexOf(shown) < 0) measured.push(shown);
    syncRuler();
    stage.dirty = true;
  });

  V.range(V.ctl(section, 'rough'), V.ctl(section, 'rough-out'),
    function (v) { return ROUGH_NAMES[v - 1]; },
    function (v) {
      if (v - 1 === roughness && (island || builder)) return;
      roughness = v - 1;
      rebuild();
    });

  V.ctl(section, 'new').addEventListener('click', function () {
    seed = (seed * 48271 + 7) % 2147483647;
    rebuild();
    setPlaying(!V.reducedMotion);
  });

  setPlaying(playing);
})();
