// Apollonian gasket: fill every gap between three touching circles with the
// circle that touches all three, forever. By Descartes' theorem the new
// curvature is 2(k₁ + k₂ + k₃) − k_old, so whole numbers stay whole.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('apollonian');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');

  var start = [-1, 2, 2, 3];
  var minPx = 0.7;         // smallest circle radius drawn, in pixels
  var circles = [];        // { k, x, y } sorted largest first
  var builtFor = '';
  var shown = 0;
  var hover = null;
  var G = null;

  // Complex helpers on [re, im] pairs.
  function mul(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
  function sqrtC(a) {
    var r = Math.hypot(a[0], a[1]), t = Math.atan2(a[1], a[0]) / 2;
    return [Math.sqrt(r) * Math.cos(t), Math.sqrt(r) * Math.sin(t)];
  }

  // Place the starting four: the outer circle at the origin, then two inside
  // it, then the fourth by the complex Descartes theorem.
  function initial(k) {
    var r1 = 1 / -k[0], r2 = 1 / k[1], r3 = 1 / k[2];
    var c1 = { k: k[0], x: 0, y: 0 };
    var c2 = { k: k[1], x: -(r1 - r2), y: 0 };
    var x3 = (c2.x * c2.x - Math.pow(r2 + r3, 2) + Math.pow(r1 - r3, 2)) / (2 * c2.x);
    var c3 = { k: k[2], x: x3, y: Math.sqrt(Math.max(0, Math.pow(r1 - r3, 2) - x3 * x3)) };
    var k4 = k[3];
    var z2 = [c2.x, c2.y], z3 = [c3.x, c3.y];
    var sum = [k[1] * z2[0] + k[2] * z3[0], k[1] * z2[1] + k[2] * z3[1]];
    var root = sqrtC(mul([k[1] * k[2], 0], mul(z2, z3)));
    var best = null;
    [1, -1].forEach(function (sign) {
      var z = [(sum[0] + 2 * sign * root[0]) / k4, (sum[1] + 2 * sign * root[1]) / k4];
      var err = Math.abs(Math.hypot(z[0] - z2[0], z[1] - z2[1]) - (r2 + 1 / k4)) +
        Math.abs(Math.hypot(z[0] - z3[0], z[1] - z3[1]) - (r3 + 1 / k4)) +
        Math.abs(Math.hypot(z[0], z[1]) - (r1 - 1 / k4));
      if (!best || err < best.err) best = { err: err, z: z };
    });
    return [c1, c2, c3, { k: k4, x: best.z[0], y: best.z[1] }];
  }

  // Swap circle `old` for the other circle touching a, b and c.
  function reflect(a, b, c, old) {
    var k = 2 * (a.k + b.k + c.k) - old.k;
    return {
      k: k,
      x: (2 * (a.k * a.x + b.k * b.x + c.k * c.x) - old.k * old.x) / k,
      y: (2 * (a.k * a.y + b.k * b.y + c.k * c.y) - old.k * old.y) / k
    };
  }

  function build(scale) {
    var q = initial(start);
    var list = q.slice();
    var minR = minPx / scale;
    var queue = [];
    function add(a, b, c, old) {
      var n = reflect(a, b, c, old);
      if (1 / n.k < minR) return;
      list.push(n);
      queue.push([a, b, c, n]);
    }
    add(q[1], q[2], q[3], q[0]);
    add(q[0], q[2], q[3], q[1]);
    add(q[0], q[1], q[3], q[2]);
    add(q[0], q[1], q[2], q[3]);
    while (queue.length && list.length < 60000) {
      var e = queue.pop();
      add(e[0], e[1], e[3], e[2]);
      add(e[0], e[2], e[3], e[1]);
      add(e[1], e[2], e[3], e[0]);
    }
    list.sort(function (p, r) { return Math.abs(p.k) - Math.abs(r.k); });
    return list;
  }

  function frame(dt, st) {
    var W = st.width, H = st.height, ctx = st.ctx;
    var R = Math.min(W, H) / 2 - 10, scale = R * -start[0];
    var key = start.join() + '@' + Math.round(scale);
    if (key !== builtFor) {
      circles = build(scale);
      builtFor = key;
      shown = V.reducedMotion ? circles.length : 1;
    }
    G = { cx: W / 2, cy: H / 2, s: scale };
    var growing = shown < circles.length;
    if (growing) shown = Math.min(circles.length, shown + Math.max(1, shown * dt * 1.6));
    else if (!st.dirty) return;
    st.dirty = false;

    var kmax = Math.abs(circles[circles.length - 1].k);
    ctx.clearRect(0, 0, W, H);
    var n = Math.floor(shown);
    for (var i = 0; i < n; i++) {
      var c = circles[i], r = 1 / Math.abs(c.k) * scale;
      var px = G.cx + c.x * scale, py = G.cy + c.y * scale;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(r - 0.4, 0.3), 0, Math.PI * 2);
      if (c.k < 0) {
        ctx.strokeStyle = 'rgba(236,232,223,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        continue;
      }
      var col = V.gradient(V.SPECTRUM, Math.log(c.k) / Math.log(kmax));
      ctx.fillStyle = col;
      ctx.globalAlpha = c === hover ? 0.6 : 0.22;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c === hover ? '#ffffff' : col;
      ctx.lineWidth = c === hover ? 2 : r > 6 ? 1 : 0.6;
      ctx.stroke();
      if (r > 13) {
        var size = Math.min(26, r * 0.55);
        ctx.font = size.toFixed(1) + 'px "IBM Plex Mono", monospace';
        ctx.fillStyle = 'rgba(236,232,223,' + Math.min(0.9, r / 40) + ')';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.round(c.k)), px, py);
      }
    }

    var whole = circles.every(function (cc) { return Math.abs(cc.k - Math.round(cc.k)) < 1e-6; });
    V.setText(readout,
      (hover ? 'This circle: curvature ' + Math.round(hover.k) + ', radius 1/' + Math.round(hover.k)
        : 'Circles ' + n.toLocaleString() + (whole ? ', every curvature a whole number' : '')) + '\n' +
      'Start: ' + start.map(function (k) { return String(k).replace('-', '−'); }).join(', '));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Hover ----

  function onPoint(e) {
    if (!G) return;
    var b = canvas.getBoundingClientRect();
    var x = (e.clientX - b.left - G.cx) / G.s, y = (e.clientY - b.top - G.cy) / G.s;
    var best = null;
    for (var i = 1; i < shown; i++) {
      var c = circles[i];
      if (c.k > 0 && Math.hypot(x - c.x, y - c.y) < 1 / c.k) best = c;
    }
    hover = best;
    stage.dirty = true;
  }
  canvas.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') onPoint(e); });
  canvas.addEventListener('pointerdown', onPoint);
  canvas.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse') { hover = null; stage.dirty = true; }
  });

  // ---- Controls ----

  V.segmented(V.ctl(section, 'start'), function (v) {
    start = v.split(',').map(Number);
    hover = null;
  });

  V.ctl(section, 'regrow').addEventListener('click', function () {
    shown = 1;
    hover = null;
  });
})();
