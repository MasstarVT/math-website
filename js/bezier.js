// Bézier curves by de Casteljau's algorithm: walk the same fraction t along
// every side of the control polygon, join those points, and repeat until one
// point is left. That last point is on the curve; sweeping t draws it.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('bezier');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var tInput = V.ctl(section, 'tval');
  var tOut = V.ctl(section, 'tval-out');

  // Control points in a unit box (x across, y down), one set per degree.
  var SHAPES = {
    2: [[0.12, 0.78], [0.5, 0.12], [0.88, 0.78]],
    3: [[0.1, 0.8], [0.24, 0.18], [0.78, 0.2], [0.9, 0.78]],
    4: [[0.08, 0.72], [0.2, 0.14], [0.5, 0.92], [0.8, 0.14], [0.92, 0.72]]
  };
  var NAMES = { 2: 'Quadratic', 3: 'Cubic', 4: 'Quartic' };

  var degree = 3;
  var pts = copy(SHAPES[3]);
  var t = 0.35;
  var dir = 1;
  var playing = !V.reducedMotion;
  var showLevels = true;
  var showFull = true;
  var held = -1;
  var box = { x: 0, y: 0, w: 1, h: 1 };

  function copy(list) { return list.map(function (p) { return [p[0], p[1]]; }); }

  // Every level of in-between points for one value of t.
  function levels(u) {
    var out = [pts], cur = pts;
    while (cur.length > 1) {
      var next = [];
      for (var i = 0; i < cur.length - 1; i++) {
        next.push([cur[i][0] + (cur[i + 1][0] - cur[i][0]) * u, cur[i][1] + (cur[i + 1][1] - cur[i][1]) * u]);
      }
      out.push(next);
      cur = next;
    }
    return out;
  }

  // The same recipe in place, without building every level, for drawing.
  var bx = new Float64Array(5), by = new Float64Array(5);
  function onCurve(u) {
    var n = pts.length, i, k;
    for (i = 0; i < n; i++) { bx[i] = pts[i][0]; by[i] = pts[i][1]; }
    for (k = n - 1; k > 0; k--) {
      for (i = 0; i < k; i++) {
        bx[i] += (bx[i + 1] - bx[i]) * u;
        by[i] += (by[i + 1] - by[i]) * u;
      }
    }
    return [bx[0], by[0]];
  }

  function sx(p) { return box.x + p[0] * box.w; }
  function sy(p) { return box.y + p[1] * box.h; }

  function polyline(ctx, list) {
    ctx.beginPath();
    for (var i = 0; i < list.length; i++) {
      if (i) ctx.lineTo(sx(list[i]), sy(list[i])); else ctx.moveTo(sx(list[i]), sy(list[i]));
    }
    ctx.stroke();
  }

  function curvePath(ctx, from, to) {
    var steps = Math.max(2, Math.ceil((to - from) * 160));
    ctx.beginPath();
    for (var i = 0; i <= steps; i++) {
      var p = onCurve(from + (to - from) * i / steps);
      if (i) ctx.lineTo(sx(p), sy(p)); else ctx.moveTo(sx(p), sy(p));
    }
    ctx.stroke();
  }

  function frame(dt, st) {
    if (playing && held < 0) {
      t += dir * dt * 0.22;
      if (t > 1) { t = 1; dir = -1; }
      if (t < 0) { t = 0; dir = 1; }
      tInput.value = t.toFixed(3);
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;

    var W = st.width, H = st.height, ctx = st.ctx;
    // Keep the shape clear of the readout in the top-left corner.
    var top = 70, pad = 26;
    box = { x: pad, y: top, w: W - pad * 2, h: H - top - pad };
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'round';

    // The whole curve, faint, and the part drawn so far, bright.
    if (showFull) {
      ctx.strokeStyle = 'rgba(236,232,223,0.16)';
      ctx.lineWidth = 3;
      curvePath(ctx, 0, 1);
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    curvePath(ctx, 0, t);

    var L = levels(t), i, k;
    // The control polygon.
    ctx.strokeStyle = 'rgba(236,232,223,0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    polyline(ctx, pts);
    ctx.setLineDash([]);

    // The nested in-betweens, one color per level.
    if (showLevels) {
      for (k = 1; k < L.length - 1; k++) {
        var col = V.gradient(V.SPECTRUM, 0.22 + 0.7 * (k - 1) / Math.max(1, degree - 2));
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.75;
        polyline(ctx, L[k]);
        ctx.fillStyle = col;
        for (i = 0; i < L[k].length; i++) {
          ctx.beginPath();
          ctx.arc(sx(L[k][i]), sy(L[k][i]), 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Control points, numbered.
    ctx.font = '12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (i = 0; i < pts.length; i++) {
      var x = sx(pts[i]), y = sy(pts[i]);
      ctx.fillStyle = '#0d0f16';
      ctx.strokeStyle = i === held ? '#ffffff' : 'rgba(236,232,223,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ece8df';
      ctx.fillText('P' + i, x, y + (pts[i][1] < 0.5 ? -22 : 22));
    }

    // The point on the curve.
    var P = L[L.length - 1][0];
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#6ee7ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx(P), sy(P), 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    var counts = L.map(function (l) { return l.length; }).join(' → ');
    V.setText(readout, NAMES[degree] + ': ' + (degree + 1) + ' control points\n' +
      't = ' + t.toFixed(2) + '   points per level: ' + counts);
    V.setText(tOut, t.toFixed(2));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Drag control points ----

  V.drag(canvas, {
    hit: function (x, y) {
      var best = -1, bd = 22;
      for (var i = 0; i < pts.length; i++) {
        var d = Math.hypot(x - sx(pts[i]), y - sy(pts[i]));
        if (d < bd) { bd = d; best = i; }
      }
      return best >= 0 ? { i: best } : null;
    },
    move: function (h, x, y) {
      held = h.i;
      // Points may leave the box but not the canvas.
      x = Math.max(12, Math.min(stage.width - 12, x));
      y = Math.max(12, Math.min(stage.height - 12, y));
      pts[h.i][0] = (x - box.x) / box.w;
      pts[h.i][1] = (y - box.y) / box.h;
      stage.dirty = true;
    },
    end: function () { held = -1; stage.dirty = true; }
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  tInput.addEventListener('input', function () {
    setPlaying(false);
    t = parseFloat(tInput.value);
    stage.dirty = true;
  });

  V.segmented(V.ctl(section, 'degree'), function (v) {
    degree = parseInt(v, 10);
    pts = copy(SHAPES[degree]);
    stage.dirty = true;
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    pts = copy(SHAPES[degree]);
    stage.dirty = true;
  });

  V.toggle(V.ctl(section, 'levels'), function (on) { showLevels = on; stage.dirty = true; });
  V.toggle(V.ctl(section, 'full'), function (on) { showFull = on; stage.dirty = true; });
})();
