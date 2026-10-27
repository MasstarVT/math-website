// Shapes of constant width: the support function h satisfies h(θ) + h(θ + π) = w.
// Rolling on the ground, the center's height is h(down) and it moves forward
// by h per radian, so a board on top sits at height w. Inside a square of side
// w the Reuleaux triangle touches all four sides: its center is (w/2 − h(0), w/2 − h(90°)).
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('reuleaux');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var shapeControl = V.ctl(section, 'shape-control');
  var playBtn = V.ctl(section, 'play');

  var TAU = Math.PI * 2;
  var PINK = '255,95,162';
  var M = 1440;               // support-function samples per turn
  var NAMES = { r3: 'Reuleaux triangle', r5: 'Reuleaux pentagon', circle: 'circle', square: 'square' };

  var scene = 'roll';
  var shapeName = 'r3';
  var cache = {};
  var speed = 1;
  var playing = !V.reducedMotion;
  var psi = 0;                // rolling angle (clockwise)
  var phi = 0;                // drill angle
  var trails = [[], []];
  var hole = null, holeCtx = null, grid = null, covered = 0;
  var GRID = 200;

  // Boundary points (math coordinates, y up) for a shape of width 1 centered at 0.
  function reuleaux(n) {
    var rho = 1 / (2 * Math.cos(Math.PI / (2 * n))), v = [], pts = [], arcs = [], k, i;
    for (k = 0; k < n; k++) {
      var a = Math.PI / 2 + TAU * k / n;
      v.push([rho * Math.cos(a), rho * Math.sin(a)]);
    }
    var per = Math.round(360 / n);
    for (k = 0; k < n; k++) {
      var p = v[k], q = v[(k + 1) % n], c = v[(k + (n + 1) / 2) % n];
      var a0 = Math.atan2(p[1] - c[1], p[0] - c[0]), a1 = Math.atan2(q[1] - c[1], q[0] - c[0]);
      var d = a1 - a0;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      arcs.push({ c: c, r: 1, a0: a0, d: d });
      for (i = 0; i < per; i++) {
        var t = a0 + d * i / per;
        pts.push([c[0] + Math.cos(t), c[1] + Math.sin(t)]);
      }
    }
    return { pts: pts, corners: v, arcs: arcs };
  }

  function buildShape(name) {
    var s, i;
    if (name === 'r3') s = reuleaux(3);
    else if (name === 'r5') s = reuleaux(5);
    else if (name === 'circle') {
      s = { pts: [], corners: [[0, 0.5]], arcs: [{ c: [0, 0], r: 0.5, a0: Math.PI / 2, d: TAU }] };
      for (i = 0; i < 360; i++) s.pts.push([0.5 * Math.cos(Math.PI / 2 + TAU * i / 360), 0.5 * Math.sin(Math.PI / 2 + TAU * i / 360)]);
    } else {
      var c = [[0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]];
      s = { pts: c, corners: c };
    }
    // Support function h(θ) for θ = −90° + 360°·i/M, exact from the corners and
    // arcs (an arc reaches c·u + r for directions u inside its span), and the
    // distance rolled, its running integral.
    var h = new Float64Array(M + 1), X = new Float64Array(M + 1), arcs = s.arcs || [];
    for (i = 0; i <= M; i++) {
      var th = -Math.PI / 2 + TAU * i / M, ux = Math.cos(th), uy = Math.sin(th), best = -Infinity, j;
      for (j = 0; j < s.corners.length; j++) best = Math.max(best, s.corners[j][0] * ux + s.corners[j][1] * uy);
      for (j = 0; j < arcs.length; j++) {
        var a = arcs[j], lo = Math.min(a.a0, a.a0 + a.d), rel = ((th - lo) % TAU + TAU) % TAU;
        if (rel <= Math.abs(a.d)) best = Math.max(best, a.c[0] * ux + a.c[1] * uy + a.r);
      }
      h[i] = best;
      if (i) X[i] = X[i - 1] + (h[i] + h[i - 1]) / 2 * TAU / M;
    }
    s.h = h;
    s.X = X;
    s.per = X[M];
    return s;
  }

  function shapeOf(name) {
    if (!cache[name]) cache[name] = buildShape(name);
    return cache[name];
  }

  // h at angle −90° + a, interpolated from the table.
  function hAt(s, a) {
    var f = ((a % TAU) + TAU) % TAU / TAU * M, i = Math.floor(f), r = f - i;
    return s.h[i] + (s.h[Math.min(M, i + 1)] - s.h[i]) * r;
  }

  function rolled(s, a) {
    var turns = Math.floor(a / TAU), f = (a - turns * TAU) / TAU * M, i = Math.floor(f), r = f - i;
    return turns * s.per + s.X[i] + (s.X[Math.min(M, i + 1)] - s.X[i]) * r;
  }

  // Arcs for the round shapes, corners for the square. Screen y points down,
  // so math angles flip sign.
  function shapePath(ctx, s, ox, oy, rot, U) {
    var c = Math.cos(rot), sn = Math.sin(rot), i;
    ctx.beginPath();
    if (s.arcs) {
      for (i = 0; i < s.arcs.length; i++) {
        var a = s.arcs[i], x = a.c[0] * c - a.c[1] * sn, y = a.c[0] * sn + a.c[1] * c;
        ctx.arc(ox + x * U, oy - y * U, a.r * U, -(a.a0 + rot), -(a.a0 + a.d + rot), a.d > 0);
      }
    } else {
      for (i = 0; i < 4; i++) {
        var p = s.corners[i], px = p[0] * c - p[1] * sn, py = p[0] * sn + p[1] * c;
        if (i) ctx.lineTo(ox + px * U, oy - py * U);
        else ctx.moveTo(ox + px * U, oy - py * U);
      }
    }
    ctx.closePath();
  }

  function drawShape(ctx, s, ox, oy, rot, U, faint) {
    shapePath(ctx, s, ox, oy, rot, U);
    ctx.fillStyle = 'rgba(' + PINK + ',' + (faint ? 0.1 : 0.2) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgb(' + PINK + ')';
    ctx.lineWidth = 2;
    ctx.stroke();
    var c = Math.cos(rot), sn = Math.sin(rot), k;
    // Faint inner polygon and a spoke, so the turning shows.
    ctx.strokeStyle = 'rgba(236,232,223,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    var cs = s.corners;
    if (cs.length > 2) {
      for (k = 0; k <= cs.length; k++) {
        var p = cs[k % cs.length], x = p[0] * c - p[1] * sn, y = p[0] * sn + p[1] * c;
        if (k) ctx.lineTo(ox + x * U, oy - y * U);
        else ctx.moveTo(ox + x * U, oy - y * U);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236,232,223,0.6)';
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + (cs[0][0] * c - cs[0][1] * sn) * U, oy - (cs[0][0] * sn + cs[0][1] * c) * U);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ox, oy, 3.5, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  // ---- Rollers ----

  var PHASE = [0, 0.9];

  function drawRoll(ctx, W, H) {
    var s = shapeOf(shapeName), U = Math.min(W * 0.22, H * 0.36), gy = H * 0.5 + U * 0.8;
    var avg = s.per / TAU, baseX = [W * 0.3, W * 0.7];
    var rings = [], heights = [], k, i;

    // Ground, with marks that slide back as the rollers move on.
    ctx.strokeStyle = '#343a4e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, gy + 1);
    ctx.lineTo(W, gy + 1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(52,58,78,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    var shift = avg * psi, gap = 0.25;
    for (i = Math.floor((shift - baseX[0] / U) / gap) - 1; i * gap - shift < (W - baseX[0]) / U + gap; i++) {
      var gx = baseX[0] + (i * gap - shift) * U;
      ctx.moveTo(gx, gy + 2);
      ctx.lineTo(gx - 8, gy + 12);
    }
    ctx.stroke();

    for (k = 0; k < 2; k++) {
      var a = psi + PHASE[k];
      var hx = rolled(s, a) - avg * a, hy = hAt(s, a);
      var ox = baseX[k] + hx * U, oy = gy - hy * U;
      // Trail of the center, fixed to the ground.
      var tr = trails[k];
      if (playing) {
        tr.push([rolled(s, a) - avg * PHASE[k], hy]);
        if (tr.length > 420) tr.shift();
      }
      ctx.fillStyle = 'rgba(' + PINK + ',0.55)';
      ctx.beginPath();
      for (i = tr.length - 1; i >= 0; i -= 4) {
        var tx = baseX[k] + (tr[i][0] - avg * psi) * U;
        ctx.rect(tx - 1, gy - tr[i][1] * U - 1, 2, 2);
      }
      ctx.fill();
      drawShape(ctx, s, ox, oy, -a, U, false);
      // Boundary in "y up" pixels, for finding where the board rests.
      var c = Math.cos(-a), sn = Math.sin(-a), top = -Infinity, ring = [];
      for (i = 0; i < s.pts.length; i++) {
        var bx = s.pts[i][0] * c - s.pts[i][1] * sn, by = s.pts[i][0] * sn + s.pts[i][1] * c;
        ring.push(ox + bx * U, -oy + by * U);
        if (by > top) top = by;
      }
      rings.push(ring);
      heights.push(hy + top);
    }

    // The board is the line touching both rollers from above. Its tilt b
    // makes both rollers reach equally far along the normal (−sin b, cos b).
    function reach(ring, b) {
      var nx = -Math.sin(b), ny = Math.cos(b), m = -Infinity;
      for (var j = 0; j < ring.length; j += 2) m = Math.max(m, ring[j] * nx + ring[j + 1] * ny);
      return m;
    }
    var b0 = 0, b1 = 0.02, f0 = reach(rings[0], b0) - reach(rings[1], b0), f1 = reach(rings[0], b1) - reach(rings[1], b1);
    for (i = 0; i < 8 && Math.abs(f1) > 1e-6 && f1 !== f0; i++) {
      var b2 = b1 - f1 * (b1 - b0) / (f1 - f0);
      b0 = b1; f0 = f1;
      b1 = Math.max(-0.7, Math.min(0.7, b2));
      f1 = reach(rings[0], b1) - reach(rings[1], b1);
    }
    var tilt = b1, rest = reach(rings[0], tilt);
    var x0 = baseX[0] - U * 0.9, x1 = baseX[1] + U * 0.9, th = Math.max(8, U * 0.07);
    var boardY = function (x) { return -(rest + x * Math.sin(tilt)) / Math.cos(tilt); };
    var slope = -Math.tan(tilt), y0 = boardY(x0), y1 = boardY(x1), p = [x0, y0];
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1, y1 - th);
    ctx.lineTo(x0, y0 - th);
    ctx.closePath();
    ctx.fillStyle = '#2a2d3d';
    ctx.fill();
    ctx.strokeStyle = '#ece8df';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Grain marks riding with the board.
    ctx.strokeStyle = 'rgba(236,232,223,0.25)';
    ctx.beginPath();
    var drift = (avg * psi) % 0.3;
    for (i = 0; x0 + (i * 0.3 + drift) * U + 10 < x1; i++) {
      var bxm = x0 + 2 + (i * 0.3 + drift) * U, ym = p[1] + (bxm - p[0]) * slope;
      ctx.moveTo(bxm, ym - th * 0.2);
      ctx.lineTo(bxm + 6, ym - th * 0.8);
    }
    ctx.stroke();

    var text = NAMES[shapeName] + '\nheights ' + heights[0].toFixed(3) + '  ' + heights[1].toFixed(3);
    text += shapeName === 'square' ? '\nthe board rocks' : '\nperimeter ÷ width ' + s.per.toFixed(4);
    V.setText(readout, text);
  }

  // ---- Drill ----

  function resetHole(st) {
    hole = document.createElement('canvas');
    hole.width = st.canvas.width;
    hole.height = st.canvas.height;
    holeCtx = hole.getContext('2d');
    holeCtx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    grid = new Uint8Array(GRID * GRID);
    covered = 0;
    phi = 0;
    trails = [[], []];
  }

  function drawDrill(ctx, W, H, st) {
    var s = shapeOf('r3'), U = Math.min(W, H) * 0.64, cx = W / 2, cy = H / 2 + 6;
    if (!hole || hole.width !== st.canvas.width || hole.height !== st.canvas.height) resetHole(st);
    // Center so the triangle touches the right and top sides (and so the left and bottom too).
    var ox = 0.5 - hAt(s, Math.PI / 2 - phi), oy = 0.5 - hAt(s, Math.PI - phi);
    var c = Math.cos(phi), sn = Math.sin(phi), k, i;

    shapePath(holeCtx, s, cx + ox * U, cy - oy * U, phi, U);
    holeCtx.fillStyle = '#4a2340';
    holeCtx.fill();

    // Measure the hole on a grid: a point is inside a Reuleaux triangle when
    // it is within one width of all three corners.
    var cor = s.corners.map(function (p) { return [ox + p[0] * c - p[1] * sn, oy + p[0] * sn + p[1] * c]; });
    for (i = 0; i < GRID * GRID; i++) {
      if (grid[i]) continue;
      var x = ((i % GRID) + 0.5) / GRID - 0.5, y = (Math.floor(i / GRID) + 0.5) / GRID - 0.5, ok = true;
      for (k = 0; k < 3 && ok; k++) {
        var dx = x - cor[k][0], dy = y - cor[k][1];
        if (dx * dx + dy * dy > 1) ok = false;
      }
      if (ok) { grid[i] = 1; covered++; }
    }

    ctx.fillStyle = 'rgba(236,232,223,0.03)';
    ctx.fillRect(cx - U / 2, cy - U / 2, U, U);
    ctx.drawImage(hole, 0, 0, W, H);
    ctx.strokeStyle = '#ece8df';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - U / 2, cy - U / 2, U, U);

    var tr = trails[0];
    if (playing || !tr.length) {
      tr.push([ox, oy]);
      if (tr.length > 900) tr.shift();
    }
    ctx.strokeStyle = 'rgba(236,232,223,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (i = 0; i < tr.length; i++) {
      if (i) ctx.lineTo(cx + tr[i][0] * U, cy - tr[i][1] * U);
      else ctx.moveTo(cx + tr[i][0] * U, cy - tr[i][1] * U);
    }
    ctx.stroke();

    drawShape(ctx, s, cx + ox * U, cy - oy * U, phi, U, true);
    for (k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(cx + cor[k][0] * U, cy - cor[k][1] * U, 3, 0, TAU);
      ctx.fillStyle = 'rgb(' + PINK + ')';
      ctx.fill();
    }

    var deg = Math.min(120, phi * 180 / Math.PI);
    var text = 'turned ' + Math.round(phi * 180 / Math.PI) + '°\n' +
      (deg < 120 ? 'hole so far ' : 'hole ') + (covered / (GRID * GRID) * 100).toFixed(1) + '% of the square';
    if (deg >= 120) text += '\ncomplete after 120°';
    V.setText(readout, text);
  }

  function frame(dt, st) {
    if (!playing && !st.dirty) return;
    st.dirty = false;
    if (playing) {
      if (scene === 'roll') psi += dt * 0.8 * speed;
      else phi += dt * 0.55 * speed;
    }
    var ctx = st.ctx, W = st.width, H = st.height;
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round';
    if (scene === 'roll') drawRoll(ctx, W, H);
    else drawDrill(ctx, W, H, st);
  }

  var stage = V.createStage(canvas, {
    frame: frame,
    resize: function () { hole = null; }
  });

  // ---- Controls ----

  V.segmented(V.ctl(section, 'scene'), function (v) {
    scene = v;
    shapeControl.hidden = v !== 'roll';
    hole = null;
    trails = [[], []];
    stage.dirty = true;
  });

  V.segmented(V.ctl(section, 'shape'), function (v) {
    shapeName = v;
    trails = [[], []];
    stage.dirty = true;
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return v.toFixed(2) + '×'; },
    function (v) { speed = v; });

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
    stage.dirty = true;
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });
})();
