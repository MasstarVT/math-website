// Voronoi diagram: each seed's cell is the set of points closer to it than to
// any other seed. A cell is the canvas clipped by the perpendicular bisector
// with every other seed. Seeds whose cells share an edge are Delaunay neighbors.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('voronoi');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var driftBtn = V.ctl(section, 'drift');
  var delaunayBtn = V.ctl(section, 'delaunay');

  var MAX = 80;
  var seeds = [];          // { x, y, vx, vy, hue } with x, y in [0, 1]
  var drift = !V.reducedMotion;
  var delaunay = false;
  var hover = null;
  var dragged = false;
  var W = 0, H = 0;

  function addSeed(x, y) {
    if (seeds.length >= MAX) return;
    var a = Math.random() * Math.PI * 2, sp = 0.012 + Math.random() * 0.02;
    seeds.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, hue: Math.random() });
  }

  function scatter(n) {
    seeds = [];
    for (var i = 0; i < n; i++) addSeed(0.04 + Math.random() * 0.92, 0.04 + Math.random() * 0.92);
  }

  // Clip a polygon to the side of the bisector of p and q nearer p. Each vertex
  // carries the seed whose bisector made the edge leaving it (-1: canvas edge).
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

  function cells() {
    var pts = seeds.map(function (s) { return [s.x * W, s.y * H]; });
    var list = [];
    for (var i = 0; i < pts.length; i++) {
      var poly = [[0, 0, -1], [W, 0, -1], [W, H, -1], [0, H, -1]];
      for (var j = 0; j < pts.length && poly.length; j++) {
        if (j !== i) poly = clip(poly, pts[i], pts[j], j);
      }
      list.push(poly);
    }
    return { pts: pts, polys: list };
  }

  function nearest(x, y) {
    var best = -1, bd = Infinity;
    for (var i = 0; i < seeds.length; i++) {
      var dx = seeds[i].x * W - x, dy = seeds[i].y * H - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return { i: best, d: Math.sqrt(bd) };
  }

  function frame(dt, st) {
    W = st.width;
    H = st.height;
    if (drift) {
      for (var i = 0; i < seeds.length; i++) {
        var s = seeds[i];
        if (s === hover) continue;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.x < 0.01 || s.x > 0.99) { s.vx = -s.vx; s.x = Math.max(0.01, Math.min(0.99, s.x)); }
        if (s.y < 0.01 || s.y > 0.99) { s.vy = -s.vy; s.y = Math.max(0.01, Math.min(0.99, s.y)); }
      }
    } else if (!st.dirty) {
      return;
    }
    st.dirty = false;

    var ctx = st.ctx, C = cells(), edges = 0;
    ctx.clearRect(0, 0, W, H);

    for (i = 0; i < C.polys.length; i++) {
      var poly = C.polys[i];
      if (poly.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(poly[0][0], poly[0][1]);
      for (var k = 1; k < poly.length; k++) ctx.lineTo(poly[k][0], poly[k][1]);
      ctx.closePath();
      ctx.fillStyle = V.gradient(V.SPECTRUM, seeds[i].hue);
      ctx.globalAlpha = seeds[i] === hover ? 0.42 : 0.2;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = delaunay ? 'rgba(236,232,223,0.3)' : 'rgba(236,232,223,0.55)';
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }

    // Delaunay edges: each pair of seeds whose cells share an edge.
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (i = 0; i < C.polys.length; i++) {
      poly = C.polys[i];
      for (k = 0; k < poly.length; k++) {
        var j = poly[k][2];
        if (j > i) {
          edges++;
          if (delaunay) {
            ctx.moveTo(C.pts[i][0], C.pts[i][1]);
            ctx.lineTo(C.pts[j][0], C.pts[j][1]);
          }
        }
      }
    }
    if (delaunay) ctx.stroke();

    for (i = 0; i < C.pts.length; i++) {
      ctx.fillStyle = seeds[i] === hover ? '#ffffff' : V.gradient(V.SPECTRUM, seeds[i].hue);
      ctx.beginPath();
      ctx.arc(C.pts[i][0], C.pts[i][1], seeds[i] === hover ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    V.setText(readout, seeds.length + ' seeds\n' + edges + ' pairs of touching cells');
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Pointer ----

  V.drag(canvas, {
    hit: function (x, y) {
      var n = nearest(x, y);
      return n.i >= 0 && n.d < 18 ? seeds[n.i] : null;
    },
    move: function (s, x, y, first) {
      if (first) dragged = false;
      else dragged = true;
      hover = s;
      s.x = Math.max(0.005, Math.min(0.995, x / W));
      s.y = Math.max(0.005, Math.min(0.995, y / H));
      stage.dirty = true;
    },
    end: function () {
      hover = null;
      stage.dirty = true;
    }
  });

  canvas.addEventListener('click', function (e) {
    if (dragged) { dragged = false; return; }
    var b = canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    if (nearest(x, y).d < 18) return;
    addSeed(x / W, y / H);
    stage.dirty = true;
  });

  // ---- Controls ----

  V.toggle(driftBtn, function (on) { drift = on; stage.dirty = true; });
  driftBtn.setAttribute('aria-pressed', String(drift));
  V.toggle(delaunayBtn, function (on) { delaunay = on; stage.dirty = true; });

  V.ctl(section, 'scatter').addEventListener('click', function () {
    scatter(18);
    stage.dirty = true;
  });
  V.ctl(section, 'clear').addEventListener('click', function () {
    seeds = [];
    addSeed(0.5, 0.5);
    stage.dirty = true;
  });

  scatter(18);
})();
