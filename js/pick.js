// Pick's theorem: a simple polygon with corners on lattice points has area
// I + B/2 − 1, where I counts lattice points inside and B those on the edges.
// Checked against the shoelace formula, half of |Σ (x_i·y_{i+1} − x_{i+1}·y_i)|.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('pick');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var countBtn = V.ctl(section, 'count');

  var VIOLET = '167,139,250', GREEN = '#7ee0a1', AMBER = '#ffb454';
  var START = [[4, 1], [8, 0], [8, 4], [10, 7], [6, 6], [3, 8], [0, 6], [3, 4]];

  var poly = [];
  var nx = 0, ny = 0, g = 40, ox = 0, oy = 0;
  var info = null;
  var counting = null;      // { list, i, t, total }
  var held = null;
  var dragEnded = 0;
  var W = 0, H = 0;

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = a % b; a = b; b = t; }
    return a;
  }

  function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }

  function onSegment(p, a, b) {
    return cross(a, b, p) === 0 &&
      Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) &&
      Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
  }

  function segmentsMeet(a, b, c, d) {
    var d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b);
  }

  // Edges that cross or touch anywhere except where neighbors share a corner.
  function crossings() {
    var n = poly.length, bad = {}, any = false, i, j;
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        if (poly[i][0] === poly[j][0] && poly[i][1] === poly[j][1]) { bad[i] = bad[j] = true; any = true; }
      }
    }
    for (i = 0; i < n; i++) {
      var a = poly[i], b = poly[(i + 1) % n];
      for (j = i + 1; j < n; j++) {
        var c = poly[j], d = poly[(j + 1) % n];
        var hit;
        if (j === i + 1) {
          // Neighbors may only share b; overlapping means folding back on itself.
          hit = cross(a, b, d) === 0 && (d[0] - b[0]) * (a[0] - b[0]) + (d[1] - b[1]) * (a[1] - b[1]) > 0;
        } else if (i === 0 && j === n - 1) {
          hit = cross(c, d, b) === 0 && (b[0] - a[0]) * (c[0] - a[0]) + (b[1] - a[1]) * (c[1] - a[1]) > 0;
        } else {
          hit = segmentsMeet(a, b, c, d);
        }
        if (hit) { bad[i] = bad[j] = true; any = true; }
      }
    }
    return any ? bad : null;
  }

  function inside(x, y) {
    var c = false, n = poly.length;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }

  function analyze() {
    var n = poly.length, twice = 0, B = 0, i, x, y;
    for (i = 0; i < n; i++) {
      var a = poly[i], b = poly[(i + 1) % n];
      twice += a[0] * b[1] - b[0] * a[1];
      B += gcd(b[0] - a[0], b[1] - a[1]);
    }
    var on = {}, interior = [], boundary = [];
    for (i = 0; i < n; i++) {
      var p = poly[i], q = poly[(i + 1) % n], k = gcd(q[0] - p[0], q[1] - p[1]);
      for (var s = 0; s < k; s++) {
        x = p[0] + (q[0] - p[0]) / k * s;
        y = p[1] + (q[1] - p[1]) / k * s;
        if (!on[x + ',' + y]) { on[x + ',' + y] = true; boundary.push([x, y]); }
      }
    }
    for (y = 0; y < ny; y++) {
      for (x = 0; x < nx; x++) {
        if (!on[x + ',' + y] && inside(x, y)) interior.push([x, y]);
      }
    }
    info = { area: Math.abs(twice) / 2, B: B, I: interior.length, interior: interior, boundary: boundary, bad: crossings() };
  }

  // Pegs hidden under the readout box.
  function blocked(i, j) {
    return X(i) < readout.offsetWidth + 24 && Y(j) < readout.offsetHeight + 24;
  }

  // Center a polygon on the board, nudging it out from under the readout.
  function center(pts) {
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach(function (p) {
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    });
    var dx = Math.floor((nx - 1 - x1 - x0) / 2), dy = Math.floor((ny - 1 - y1 - y0) / 2);
    for (var k = 0; k < 6; k++) {
      var clear = pts.every(function (p) { return !blocked(p[0] + dx, p[1] + dy); });
      if (clear) break;
      if (k % 2 === 0 && x1 + dx < nx - 1) dx++;
      else if (y1 + dy < ny - 1) dy++;
    }
    return pts.map(function (p) {
      return [Math.max(0, Math.min(nx - 1, p[0] + dx)), Math.max(0, Math.min(ny - 1, p[1] + dy))];
    });
  }

  // A random star-shaped polygon: points sorted by angle around a center.
  function randomPoly() {
    var k = 5 + Math.floor(Math.random() * 5), pts = [], used = {}, cx = (nx - 1) / 2, cy = (ny - 1) / 2;
    var rx = (nx - 1) / 2, ry = (ny - 1) / 2, tries = 0;
    while (pts.length < k && tries++ < 400) {
      var a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.7;
      var x = Math.round(cx + Math.cos(a) * r * rx), y = Math.round(cy + Math.sin(a) * r * ry);
      if (x < 0 || y < 0 || x >= nx || y >= ny || used[x + ',' + y] || blocked(x, y)) continue;
      used[x + ',' + y] = true;
      pts.push([x, y, Math.atan2(y - cy, x - cx)]);
    }
    pts.sort(function (p, q) { return p[2] - q[2]; });
    return pts.map(function (p) { return [p[0], p[1]]; });
  }

  function newPoly(pts) {
    counting = null;
    poly = pts;
    analyze();
    if (info.bad || info.area === 0) {
      for (var t = 0; t < 20 && (info.bad || info.area === 0); t++) { poly = randomPoly(); analyze(); }
    }
  }

  function layout(st) {
    W = st.width;
    H = st.height;
    g = Math.max(30, Math.min(W / 14.5, H / 10.5));
    var mx = Math.floor((W - 40) / g) + 1, my = Math.floor((H - 40) / g) + 1;
    ox = (W - (mx - 1) * g) / 2;
    oy = (H - (my - 1) * g) / 2;
    if (mx !== nx || my !== ny) {
      var first = !nx;
      nx = mx;
      ny = my;
      if (first) poly = center(START);
      poly = poly.map(function (p) { return [Math.min(nx - 1, p[0]), Math.min(ny - 1, p[1])]; });
      counting = null;
      analyze();
    }
    ox = (W - (nx - 1) * g) / 2;
    oy = (H - (ny - 1) * g) / 2;
  }

  function X(i) { return ox + i * g; }
  function Y(j) { return oy + j * g; }

  function frame(dt, st) {
    if (counting) {
      counting.t += dt;
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;

    var ctx = st.ctx, i, j, n = poly.length;
    ctx.clearRect(0, 0, W, H);

    // Grid squares, faint, so "area in squares" is visible.
    ctx.strokeStyle = 'rgba(52,58,78,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (i = 0; i < nx; i++) { ctx.moveTo(X(i), Y(0)); ctx.lineTo(X(i), Y(ny - 1)); }
    for (j = 0; j < ny; j++) { ctx.moveTo(X(0), Y(j)); ctx.lineTo(X(nx - 1), Y(j)); }
    ctx.stroke();

    ctx.beginPath();
    for (i = 0; i < n; i++) {
      if (i) ctx.lineTo(X(poly[i][0]), Y(poly[i][1]));
      else ctx.moveTo(X(poly[i][0]), Y(poly[i][1]));
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(' + VIOLET + ',' + (info.bad ? 0.07 : 0.17) + ')';
    ctx.fill('evenodd');
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgb(' + VIOLET + ')';
    ctx.stroke();
    if (info.bad) {
      ctx.strokeStyle = '#ff5fa2';
      ctx.beginPath();
      for (i = 0; i < n; i++) {
        if (!info.bad[i]) continue;
        ctx.moveTo(X(poly[i][0]), Y(poly[i][1]));
        ctx.lineTo(X(poly[(i + 1) % n][0]), Y(poly[(i + 1) % n][1]));
      }
      ctx.stroke();
    }

    // Pegs.
    ctx.fillStyle = '#3a4057';
    for (j = 0; j < ny; j++) {
      for (i = 0; i < nx; i++) {
        ctx.beginPath();
        ctx.arc(X(i), Y(j), 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    var done = -1, cur = null;
    if (counting) {
      done = Math.min(counting.list.length, Math.floor(counting.t / counting.step));
      cur = counting.list[done] || null;
    }
    function peg(p, color, k) {
      var lit = !counting || k < done;
      ctx.beginPath();
      ctx.arc(X(p[0]), Y(p[1]), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = lit ? 1 : 0.35;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (!info.bad) {
      info.interior.forEach(function (p, k) { peg(p, GREEN, k); });
      info.boundary.forEach(function (p, k) { peg(p, AMBER, info.I + k); });
    }

    for (i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(X(poly[i][0]), Y(poly[i][1]), held && held.k === i ? 8 : 6.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = info.bad ? '#0a0b10' : AMBER;
      ctx.stroke();
    }

    var text;
    if (counting) {
      var total = 0;
      for (i = 0; i < Math.min(done, counting.list.length); i++) total += i < info.I ? 1 : 0.5;
      ctx.font = '600 13px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      if (cur) {
        var isIn = done < info.I;
        ctx.beginPath();
        ctx.arc(X(cur[0]), Y(cur[1]), 10, 0, Math.PI * 2);
        ctx.strokeStyle = isIn ? GREEN : AMBER;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#ece8df';
        ctx.fillText(isIn ? '+1' : '+½', X(cur[0]), Y(cur[1]) - 13);
        text = (isIn ? 'inside pegs: +1 each' : 'band pegs: +½ each') + '\nrunning total ' + fmt(total + (isIn ? 1 : 0.5));
      } else {
        text = 'then take away 1\n' + fmt(total) + ' − 1 = ' + fmt(total - 1);
        if (counting.t > counting.step * counting.list.length + 2.2) counting = null;
      }
    } else if (info.bad) {
      text = 'edges cross or touch\nPick needs a simple polygon';
    } else {
      text = 'I = ' + info.I + '   B = ' + info.B + '\nI + B ÷ 2 − 1 = ' + fmt(info.I + info.B / 2 - 1) +
        '\nshoelace area = ' + fmt(info.area);
    }
    countBtn.disabled = !!info.bad;
    V.setText(readout, text);
  }

  function fmt(x) { return x % 1 ? x.toFixed(1) : String(x); }

  var stage = V.createStage(canvas, { frame: frame, resize: layout });

  // ---- Pointer ----

  function nearestPeg(x, y) {
    return [Math.max(0, Math.min(nx - 1, Math.round((x - ox) / g))), Math.max(0, Math.min(ny - 1, Math.round((y - oy) / g)))];
  }

  V.drag(canvas, {
    hit: function (x, y) {
      var best = -1, bd = Math.min(18, g * 0.45);
      for (var k = 0; k < poly.length; k++) {
        var d = Math.hypot(X(poly[k][0]) - x, Y(poly[k][1]) - y);
        if (d < bd) { bd = d; best = k; }
      }
      return best < 0 ? null : { k: best, moved: false, from: poly[best].slice() };
    },
    move: function (h, x, y) {
      held = h;
      var p = nearestPeg(x, y);
      if (p[0] !== poly[h.k][0] || p[1] !== poly[h.k][1]) {
        poly[h.k] = p;
        h.moved = true;
        counting = null;
        analyze();
      }
      stage.dirty = true;
    },
    end: function (h) {
      held = null;
      dragEnded = performance.now();
      if (!h.moved || (poly[h.k][0] === h.from[0] && poly[h.k][1] === h.from[1])) {
        if (!h.moved && poly.length > 3) {
          poly.splice(h.k, 1);
          counting = null;
          analyze();
        }
      }
      stage.dirty = true;
    }
  });

  // Click a free peg: insert it into the edge where it adds the least length.
  canvas.addEventListener('click', function (e) {
    if (performance.now() - dragEnded < 400) return;
    var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    var p = nearestPeg(x, y);
    if (Math.hypot(X(p[0]) - x, Y(p[1]) - y) > g * 0.5) return;
    for (var k = 0; k < poly.length; k++) if (poly[k][0] === p[0] && poly[k][1] === p[1]) return;
    var best = 0, cost = Infinity;
    for (k = 0; k < poly.length; k++) {
      var a = poly[k], b = poly[(k + 1) % poly.length];
      var c = Math.hypot(a[0] - p[0], a[1] - p[1]) + Math.hypot(b[0] - p[0], b[1] - p[1]) - Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (c < cost) { cost = c; best = k; }
    }
    poly.splice(best + 1, 0, p);
    counting = null;
    analyze();
    stage.dirty = true;
  });

  // ---- Controls ----

  countBtn.addEventListener('click', function () {
    if (info.bad) return;
    var list = info.interior.concat(info.boundary);
    counting = { list: list, t: 0, step: Math.max(0.07, Math.min(0.32, 4 / list.length)) };
    if (V.reducedMotion) counting.t = counting.step * list.length;
    stage.dirty = true;
  });

  V.ctl(section, 'random').addEventListener('click', function () {
    newPoly(randomPoly());
    stage.dirty = true;
  });

  V.ctl(section, 'clear').addEventListener('click', function () {
    newPoly(center([[2, 2], [6, 2], [4, 5]]));
    stage.dirty = true;
  });
})();
