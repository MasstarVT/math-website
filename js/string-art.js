// Envelopes: a family of straight lines that all touch one curve. Threads
// joining pegs in order wrap a parabola, a sliding ladder wraps an astroid,
// and creases folding a circle's rim (or a straight edge) onto a point wrap a
// conic with that point as a focus.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('string-art');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');

  var mode = 'corner';
  var count = 48;
  var shown = 0;           // lines drawn so far, fractional while one is moving
  var showCurve = false;
  var held = null;
  var ladder = 1.9;        // ladder length, in units
  var rest = 0.75;         // the ladder's angle once every line is drawn
  var grip = [0, 0];       // handle at the ladder's top
  var corner = { a: [-1.15, -0.95], o: [0, 0.95], b: [1.15, -0.95] };
  var focus = { circle: [0.45, 0.15], edge: [0, 0.2] };
  var R = 0.95;            // paper circle radius
  var EDGE = 0.95;         // straight edge height
  var geo = { cx: 0, cy: 0, u: 1, W: 0, H: 0 };

  function totalLines() { return count; }

  // Fraction along the family: folds go all the way round (or along); threads
  // and ladder positions include both ends.
  function along(k) { return mode === 'circle' || mode === 'edge' ? k / count : k / (count - 1); }

  function X(x) { return geo.cx + x * geo.u; }
  function Y(y) { return geo.cy + y * geo.u; }

  // Clip the line p + s·d to the rectangle in units, or return null.
  function clipRect(p, d, x0, y0, x1, y1) {
    var lo = -1e9, hi = 1e9;
    var P = [p[0], p[1]], lim = [[x0, x1], [y0, y1]];
    for (var k = 0; k < 2; k++) {
      if (Math.abs(d[k]) < 1e-12) {
        if (P[k] < lim[k][0] || P[k] > lim[k][1]) return null;
      } else {
        var a = (lim[k][0] - P[k]) / d[k], b = (lim[k][1] - P[k]) / d[k];
        lo = Math.max(lo, Math.min(a, b));
        hi = Math.min(hi, Math.max(a, b));
      }
    }
    return lo < hi ? [[p[0] + d[0] * lo, p[1] + d[1] * lo], [p[0] + d[0] * hi, p[1] + d[1] * hi]] : null;
  }

  // Clip the line p + s·d (d a unit vector) to the circle of radius r about 0.
  function clipDisk(p, d, r) {
    var b = p[0] * d[0] + p[1] * d[1], c = p[0] * p[0] + p[1] * p[1] - r * r, disc = b * b - c;
    if (disc <= 0) return null;
    var q = Math.sqrt(disc);
    return [[p[0] + d[0] * (-b - q), p[1] + d[1] * (-b - q)], [p[0] + d[0] * (-b + q), p[1] + d[1] * (-b + q)]];
  }

  function view() {
    return [(-geo.cx + 2) / geo.u, (-geo.cy + 2) / geo.u, (geo.W - geo.cx - 2) / geo.u, (geo.H - geo.cy - 2) / geo.u];
  }

  // The crease when point P is folded onto F: the perpendicular bisector.
  function crease(P, F, disk, bottom) {
    var dx = F[0] - P[0], dy = F[1] - P[1], len = Math.hypot(dx, dy);
    if (len < 1e-9) return null;
    var m = [(P[0] + F[0]) / 2, (P[1] + F[1]) / 2], d = [-dy / len, dx / len];
    if (disk) return clipDisk(m, d, R);
    var v = view();
    return clipRect(m, d, v[0], v[1], v[2], bottom === undefined ? v[3] : bottom);
  }

  // Line k of the family (k may be fractional), as a segment in units, plus
  // the point being folded when there is one.
  function line(k) {
    var f = along(k);
    if (mode === 'corner') {
      var A = corner.a, O = corner.o, B = corner.b;
      return { seg: [[A[0] + (O[0] - A[0]) * f, A[1] + (O[1] - A[1]) * f], [O[0] + (B[0] - O[0]) * f, O[1] + (B[1] - O[1]) * f]] };
    }
    if (mode === 'ladder') {
      // Foot on the floor, top on the wall; it starts upright and slides flat.
      var th = Math.PI / 2 * (1 - f), base = [-0.95, 0.95];
      return { seg: [[base[0], base[1] - ladder * Math.sin(th)], [base[0] + ladder * Math.cos(th), base[1]]] };
    }
    if (mode === 'circle') {
      var a = -Math.PI / 2 + 2 * Math.PI * f, P = [R * Math.cos(a), R * Math.sin(a)];
      var inside = Math.hypot(focus.circle[0], focus.circle[1]) < R;
      return { seg: crease(P, focus.circle, inside), P: P };
    }
    var v = view(), x = v[0] - 0.6 + (v[2] - v[0] + 1.2) * f, Q = [x, EDGE];
    return { seg: crease(Q, focus.edge, false, EDGE), P: Q };
  }

  // The true envelope, as a list of polylines in units.
  function envelope() {
    var out = [], pts = [], i, t;
    if (mode === 'corner') {
      var A = corner.a, O = corner.o, B = corner.b;
      for (i = 0; i <= 120; i++) {
        t = i / 120;
        pts.push([(1 - t) * (1 - t) * A[0] + 2 * t * (1 - t) * O[0] + t * t * B[0],
          (1 - t) * (1 - t) * A[1] + 2 * t * (1 - t) * O[1] + t * t * B[1]]);
      }
      out.push(pts);
    } else if (mode === 'ladder') {
      for (i = 0; i <= 120; i++) {
        t = Math.PI / 2 * i / 120;
        pts.push([-0.95 + ladder * Math.pow(Math.cos(t), 3), 0.95 - ladder * Math.pow(Math.sin(t), 3)]);
      }
      out.push(pts);
    } else if (mode === 'circle') {
      // Foci at the center and the dot; the distances add (or differ) by R.
      var F = focus.circle, c = Math.hypot(F[0], F[1]) / 2, a = R / 2, ang = Math.atan2(F[1], F[0]);
      var cx = F[0] / 2, cy = F[1] / 2, ca = Math.cos(ang), sa = Math.sin(ang);
      if (Math.abs(c - a) < 0.01) return out;
      if (c < a) {
        var b = Math.sqrt(a * a - c * c);
        for (i = 0; i <= 120; i++) {
          t = 2 * Math.PI * i / 120;
          var ex = a * Math.cos(t), ey = b * Math.sin(t);
          pts.push([cx + ex * ca - ey * sa, cy + ex * sa + ey * ca]);
        }
        out.push(pts);
      } else {
        var hb = Math.sqrt(c * c - a * a);
        [-1, 1].forEach(function (side) {
          var br = [];
          for (var j = -60; j <= 60; j++) {
            var w = 3 * j / 60, hx = side * a * Math.cosh(w), hy = hb * Math.sinh(w);
            br.push([cx + hx * ca - hy * sa, cy + hx * sa + hy * ca]);
          }
          out.push(br);
        });
      }
    } else {
      var G = focus.edge, v = view();
      for (i = 0; i <= 120; i++) {
        var x = v[0] + (v[2] - v[0]) * i / 120;
        pts.push([x, ((x - G[0]) * (x - G[0]) + G[1] * G[1] - EDGE * EDGE) / (2 * (G[1] - EDGE))]);
      }
      out.push(pts);
    }
    return out;
  }

  function seg(ctx, s) {
    ctx.moveTo(X(s[0][0]), Y(s[0][1]));
    ctx.lineTo(X(s[1][0]), Y(s[1][1]));
  }

  function dot(ctx, p, r, fill, ring) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = ring;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(X(p[0]), Y(p[1]), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function frame(dt, st) {
    var W = st.width, H = st.height, ctx = st.ctx;
    var top = 72;
    geo.W = W; geo.H = H;
    geo.u = Math.min((W - 32) / 2, (H - top - 16) / 2);
    geo.cx = W / 2;
    geo.cy = top + (H - top - 16) / 2;

    var total = totalLines();
    if (shown < total && held === null) {
      shown = V.reducedMotion ? total : Math.min(total, shown + dt * Math.max(10, count / 4.5));
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    ctx.clearRect(0, 0, W, H);
    var i, L;

    // The paper, the wall or the pegs.
    ctx.strokeStyle = 'rgba(236,232,223,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (mode === 'corner') {
      ctx.moveTo(X(corner.a[0]), Y(corner.a[1]));
      ctx.lineTo(X(corner.o[0]), Y(corner.o[1]));
      ctx.lineTo(X(corner.b[0]), Y(corner.b[1]));
    } else if (mode === 'ladder') {
      ctx.moveTo(X(-0.95), Y(0.95 - ladder - 0.05));
      ctx.lineTo(X(-0.95), Y(0.95));
      ctx.lineTo(X(-0.95 + ladder + 0.05), Y(0.95));
    } else if (mode === 'circle') {
      ctx.fillStyle = 'rgba(236,232,223,0.035)';
      ctx.arc(X(0), Y(0), R * geo.u, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(236,232,223,0.035)';
      ctx.fillRect(0, 0, W, Y(EDGE));
      ctx.moveTo(0, Y(EDGE));
      ctx.lineTo(W, Y(EDGE));
    }
    ctx.stroke();

    // Every finished thread or crease, brightening where they pile up.
    var done = Math.floor(shown);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1;
    for (i = 0; i < Math.min(done, total); i++) {
      L = line(i);
      if (!L.seg) continue;
      ctx.strokeStyle = V.gradient(V.SPECTRUM, i / Math.max(1, total - 1));
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      seg(ctx, L.seg);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (showCurve) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      envelope().forEach(function (pts) {
        ctx.beginPath();
        pts.forEach(function (p, j) { if (j) ctx.lineTo(X(p[0]), Y(p[1])); else ctx.moveTo(X(p[0]), Y(p[1])); });
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    // The thread, ladder or fold on its way.
    var moving = shown < total;
    var cur = line(moving ? shown : total - 1);
    if (mode === 'ladder') {
      // Once drawn, the ladder rests where you leave it.
      if (!moving) cur = line((count - 1) * (1 - rest / (Math.PI / 2)));
      var s = cur.seg, mid = [(s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2];
      grip[0] = s[0][0];
      grip[1] = s[0][1];
      // The ladder's middle stays on a circle of radius half its length.
      ctx.strokeStyle = 'rgba(167,139,250,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(X(-0.95), Y(0.95), ladder / 2 * geo.u, -Math.PI / 2, 0);
      ctx.stroke();
      drawLadder(ctx, s);
      dot(ctx, mid, 4, '#a78bfa', '#0a0b10');
      if (!moving) dot(ctx, grip, 8, '#0d0f16', '#ffffff');
    } else if (cur.seg && moving) {
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      seg(ctx, cur.seg);
      ctx.stroke();
    }
    if (cur.P && moving) {
      var F = mode === 'circle' ? focus.circle : focus.edge;
      ctx.strokeStyle = 'rgba(236,232,223,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(X(cur.P[0]), Y(cur.P[1]));
      ctx.lineTo(X(F[0]), Y(F[1]));
      ctx.stroke();
      ctx.setLineDash([]);
      dot(ctx, cur.P, 4, '#ece8df', '#0a0b10');
    }

    // Handles.
    if (mode === 'corner') {
      [corner.a, corner.o, corner.b].forEach(function (p) { dot(ctx, p, 8, '#0d0f16', '#ffffff'); });
    } else if (mode === 'circle' || mode === 'edge') {
      dot(ctx, mode === 'circle' ? focus.circle : focus.edge, 8, '#ffffff', '#0a0b10');
      if (mode === 'circle') dot(ctx, [0, 0], 3, 'rgba(236,232,223,0.6)', 'rgba(0,0,0,0)');
    }

    V.setText(readout, describe(Math.min(done, total)));
  }

  function drawLadder(ctx, s) {
    var ax = X(s[0][0]), ay = Y(s[0][1]), bx = X(s[1][0]), by = Y(s[1][1]);
    var len = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / len * 4, ny = (bx - ax) / len * 4;
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax + nx, ay + ny); ctx.lineTo(bx + nx, by + ny);
    ctx.moveTo(ax - nx, ay - ny); ctx.lineTo(bx - nx, by - ny);
    var rungs = Math.max(4, Math.round(len / 18));
    for (var i = 1; i < rungs; i++) {
      var f = i / rungs, x = ax + (bx - ax) * f, y = ay + (by - ay) * f;
      ctx.moveTo(x + nx, y + ny);
      ctx.lineTo(x - nx, y - ny);
    }
    ctx.stroke();
  }

  function describe(n) {
    if (mode === 'corner') return n + ' threads, peg k to peg k\nThey wrap a parabola';
    if (mode === 'ladder') {
      var f = Math.min(1, along(shown)), deg = Math.round(shown < totalLines() ? 90 * (1 - f) : rest * 180 / Math.PI);
      return 'Ladder at ' + deg + '° to the floor\nIts positions wrap an astroid';
    }
    if (mode === 'circle') {
      var d = Math.hypot(focus.circle[0], focus.circle[1]) / R;
      var kind = Math.abs(d - 1) < 0.02 ? 'nothing: every crease passes one point'
        : d < 1 ? 'an ellipse (foci: center and dot)' : 'a hyperbola (foci: center and dot)';
      return n + ' folds of the rim onto the dot\nThe creases wrap ' + kind;
    }
    return n + ' folds of the edge onto the dot\nThe creases wrap a parabola (focus: the dot)';
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Drag the pegs' corner and ends, or the dot ----

  function handles() {
    if (mode === 'corner') return [corner.a, corner.o, corner.b];
    if (mode === 'circle') return [focus.circle];
    if (mode === 'edge') return [focus.edge];
    return shown >= totalLines() ? [grip] : [];
  }

  V.drag(canvas, {
    hit: function (x, y) {
      var list = handles();
      for (var i = 0; i < list.length; i++) {
        if (Math.hypot(x - X(list[i][0]), y - Y(list[i][1])) < 20) return list[i];
      }
      return null;
    },
    move: function (p, x, y) {
      held = p;
      if (p === grip) {
        // Slide the top along the wall; the foot follows along the floor.
        var up = (Y(0.95) - y) / geo.u / ladder;
        rest = Math.asin(Math.max(Math.sin(0.03), Math.min(Math.sin(Math.PI / 2 - 0.03), up)));
        stage.dirty = true;
        return;
      }
      x = Math.max(12, Math.min(geo.W - 12, x));
      y = Math.max(12, Math.min(geo.H - 12, y));
      p[0] = (x - geo.cx) / geo.u;
      p[1] = (y - geo.cy) / geo.u;
      // The dot for a folded edge stays above the edge.
      if (p === focus.edge) p[1] = Math.min(p[1], EDGE - 0.08);
      shown = totalLines();
      stage.dirty = true;
    },
    end: function () { held = null; stage.dirty = true; }
  });

  // ---- Controls ----

  V.segmented(V.ctl(section, 'mode'), function (v) {
    mode = v;
    shown = 0;
    stage.dirty = true;
  });

  V.range(V.ctl(section, 'count'), V.ctl(section, 'count-out'),
    function (v) { return String(v); },
    function (v) {
      count = v;
      shown = Math.min(shown, totalLines());
      stage.dirty = true;
    });

  V.ctl(section, 'again').addEventListener('click', function () {
    shown = 0;
    stage.dirty = true;
  });

  V.toggle(V.ctl(section, 'curve'), function (on) { showCurve = on; stage.dirty = true; });
})();
