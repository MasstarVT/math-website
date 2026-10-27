// Three bodies pulling on each other by Newton's law of gravity (G = 1),
// integrated with RK4. The step shrinks during close passes, where the
// forces change fastest, so near misses stay accurate.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('three-body');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var startGroup = V.ctl(section, 'start');

  var COLORS = ['#6ee7ff', '#ff5fa2', '#ffb454'];
  var NAMES = ['cyan', 'pink', 'amber'];
  var ETA = 0.003; // step size as a fraction of the fastest pair's orbit time
  var MAX_DT = 0.01;
  var SAMPLE = 0.02; // sim time between trail points
  var TRAIL = 600;

  var STARTS = {
    // Chenciner and Montgomery's figure eight, period about 6.326.
    eight: {
      m: [1, 1, 1], view: 1.2, rate: 1, labels: false,
      s: [-0.97000436, 0.24308753, 0, 0, 0.97000436, -0.24308753,
        0.46620368, 0.43236573, -0.93240737, -0.86473146, 0.46620368, 0.43236573]
    },
    // Burrau's problem: each mass sits opposite the side of the same length.
    pythagorean: {
      m: [3, 4, 5], view: 4.6, rate: 2.5, labels: true,
      s: [1, 3, -2, -1, 1, -1, 0, 0, 0, 0, 0, 0]
    }
  };

  var m = [1, 1, 1];
  var s = new Float64Array(12); // x0 y0 x1 y1 x2 y2, then the velocities
  var k1 = new Float64Array(12), k2 = new Float64Array(12), k3 = new Float64Array(12),
    k4 = new Float64Array(12), tmp = new Float64Array(12);
  var t = 0, nextSample = 0, energy0 = 0;
  var trails = [new Float32Array(TRAIL * 2), new Float32Array(TRAIL * 2), new Float32Array(TRAIL * 2)];
  var trailHead = 0, trailSize = 0;
  var current = 'eight', labels = false, baseView = 1.25, rate = 1, speed = 1;
  var view = 1.25, cx = 0, cy = 0;
  var playing = !V.reducedMotion;
  var dragging = null;
  var escaped = -1;

  function deriv(a, out) {
    for (var i = 0; i < 3; i++) {
      out[2 * i] = a[6 + 2 * i];
      out[2 * i + 1] = a[7 + 2 * i];
      out[6 + 2 * i] = 0;
      out[7 + 2 * i] = 0;
    }
    for (i = 0; i < 3; i++) {
      for (var j = i + 1; j < 3; j++) {
        var dx = a[2 * j] - a[2 * i], dy = a[2 * j + 1] - a[2 * i + 1];
        var r2 = dx * dx + dy * dy, r3 = r2 * Math.sqrt(r2);
        out[6 + 2 * i] += m[j] * dx / r3;
        out[7 + 2 * i] += m[j] * dy / r3;
        out[6 + 2 * j] -= m[i] * dx / r3;
        out[7 + 2 * j] -= m[i] * dy / r3;
      }
    }
  }

  function rk4(h) {
    var i;
    deriv(s, k1);
    for (i = 0; i < 12; i++) tmp[i] = s[i] + h / 2 * k1[i];
    deriv(tmp, k2);
    for (i = 0; i < 12; i++) tmp[i] = s[i] + h / 2 * k2[i];
    deriv(tmp, k3);
    for (i = 0; i < 12; i++) tmp[i] = s[i] + h * k3[i];
    deriv(tmp, k4);
    for (i = 0; i < 12; i++) s[i] += h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }

  // A step small next to the time any pair needs to swing around each other.
  function stepSize() {
    var d = Infinity;
    for (var i = 0; i < 3; i++) {
      for (var j = i + 1; j < 3; j++) {
        var r = Math.hypot(s[2 * j] - s[2 * i], s[2 * j + 1] - s[2 * i + 1]);
        var v = Math.hypot(s[6 + 2 * j] - s[6 + 2 * i], s[7 + 2 * j] - s[7 + 2 * i]);
        d = Math.min(d, Math.pow(r, 1.5) / Math.sqrt(m[i] + m[j]), r / (v + 1e-9));
      }
    }
    return Math.min(ETA * d, MAX_DT);
  }

  function energy() {
    var e = 0;
    for (var i = 0; i < 3; i++) {
      e += 0.5 * m[i] * (s[6 + 2 * i] * s[6 + 2 * i] + s[7 + 2 * i] * s[7 + 2 * i]);
      for (var j = i + 1; j < 3; j++) e -= m[i] * m[j] / Math.hypot(s[2 * j] - s[2 * i], s[2 * j + 1] - s[2 * i + 1]);
    }
    return e;
  }

  // Of all three, or of the two that are left when skip is a body's index.
  function centerOfMass(skip) {
    var M = 0, x = 0, y = 0;
    for (var i = 0; i < 3; i++) {
      if (i === skip) continue;
      M += m[i];
      x += m[i] * s[2 * i];
      y += m[i] * s[2 * i + 1];
    }
    return { x: x / M, y: y / M };
  }

  function clearTrails() {
    trailHead = 0;
    trailSize = 0;
    nextSample = t;
  }

  function sample() {
    for (var i = 0; i < 3; i++) {
      trails[i][trailHead * 2] = s[2 * i];
      trails[i][trailHead * 2 + 1] = s[2 * i + 1];
    }
    trailHead = (trailHead + 1) % TRAIL;
    if (trailSize < TRAIL) trailSize++;
  }

  // Random bodies with no net drift, bound together: kinetic energy is set
  // to a quarter of the pull holding them, so the total energy is negative.
  function randomStart() {
    var i, tries = 0;
    do {
      for (i = 0; i < 3; i++) {
        var a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 0.9;
        s[2 * i] = r * Math.cos(a);
        s[2 * i + 1] = r * Math.sin(a);
      }
      var ok = true;
      for (i = 0; i < 3; i++) {
        for (var j = i + 1; j < 3; j++) if (Math.hypot(s[2 * j] - s[2 * i], s[2 * j + 1] - s[2 * i + 1]) < 0.6) ok = false;
      }
    } while (!ok && ++tries < 50);
    for (i = 0; i < 3; i++) {
      s[6 + 2 * i] = Math.random() - 0.5;
      s[7 + 2 * i] = Math.random() - 0.5;
    }
    zeroDrift();
    var ke = 0, pe = 0;
    for (i = 0; i < 3; i++) {
      ke += 0.5 * m[i] * (s[6 + 2 * i] * s[6 + 2 * i] + s[7 + 2 * i] * s[7 + 2 * i]);
      for (j = i + 1; j < 3; j++) pe += m[i] * m[j] / Math.hypot(s[2 * j] - s[2 * i], s[2 * j + 1] - s[2 * i + 1]);
    }
    var f = Math.sqrt(0.25 * pe / Math.max(ke, 1e-9));
    for (i = 6; i < 12; i++) s[i] *= f;
  }

  function zeroDrift() {
    var M = m[0] + m[1] + m[2], px = 0, py = 0, c = centerOfMass();
    for (var i = 0; i < 3; i++) { px += m[i] * s[6 + 2 * i]; py += m[i] * s[7 + 2 * i]; }
    for (i = 0; i < 3; i++) {
      s[6 + 2 * i] -= px / M;
      s[7 + 2 * i] -= py / M;
      s[2 * i] -= c.x;
      s[2 * i + 1] -= c.y;
    }
  }

  function load(name) {
    current = name;
    var p = STARTS[name];
    if (p) {
      m = p.m.slice();
      for (var i = 0; i < 12; i++) s[i] = p.s[i];
      baseView = p.view;
      rate = p.rate;
      labels = p.labels;
    } else {
      m = [1, 1, 1];
      randomStart();
      baseView = 2;
      rate = 1.5;
      labels = false;
    }
    t = 0;
    view = baseView;
    cx = 0;
    cy = 0;
    escaped = -1;
    energy0 = energy();
    clearTrails();
    sample();
    if (stage) stage.dirty = true;
  }

  // A body has left for good once it is far out and moving faster than the
  // escape speed of the other two.
  function checkEscape() {
    for (var i = 0; i < 3; i++) {
      var a = (i + 1) % 3, b = (i + 2) % 3, M = m[a] + m[b];
      var px = (m[a] * s[2 * a] + m[b] * s[2 * b]) / M, py = (m[a] * s[2 * a + 1] + m[b] * s[2 * b + 1]) / M;
      var vx = (m[a] * s[6 + 2 * a] + m[b] * s[6 + 2 * b]) / M, vy = (m[a] * s[7 + 2 * a] + m[b] * s[7 + 2 * b]) / M;
      var dx = s[2 * i] - px, dy = s[2 * i + 1] - py, dvx = s[6 + 2 * i] - vx, dvy = s[7 + 2 * i] - vy;
      var r = Math.hypot(dx, dy);
      if (r > baseView * 1.6 && dx * dvx + dy * dvy > 0 && 0.5 * (dvx * dvx + dvy * dvy) > (M + m[i]) / r) return i;
    }
    return -1;
  }

  function frame(dt, st) {
    if (playing && !dragging) {
      var target = t + dt * rate * speed, t0 = performance.now();
      while (t < target) {
        var h = stepSize();
        rk4(h);
        t += h;
        if (t >= nextSample) { sample(); nextSample = t + SAMPLE; }
        if (performance.now() - t0 > 6) break;
      }
      if (escaped < 0) escaped = checkEscape();
      st.dirty = true;
    }

    // Follow the center of mass, and zoom out (up to 4×) to keep bodies in
    // view. Once one body escapes, follow the pair it left behind.
    var c = centerOfMass(escaped), far = 0;
    for (var i = 0; i < 3; i++) {
      if (i !== escaped) far = Math.max(far, Math.hypot(s[2 * i] - c.x, s[2 * i + 1] - c.y));
    }
    var W = st.width, H = st.height, fit = Math.min(W, H) / Math.min(W, H / 0.75);
    var want = Math.min(baseView * 4, Math.max(baseView, far * 1.1 / fit));
    var k = 1 - Math.exp(-dt * 1.5);
    if (!dragging && (Math.abs(want - view) > 1e-4 * baseView || Math.abs(c.x - cx) + Math.abs(c.y - cy) > 1e-4)) {
      view += (want - view) * k;
      cx += (c.x - cx) * k;
      cy += (c.y - cy) * k;
      st.dirty = true;
    }

    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    var sc = scale(W, H);
    function X(x) { return W / 2 + (x - cx) * sc; }
    function Y(y) { return H / 2 - (y - cy) * sc; }
    ctx.clearRect(0, 0, W, H);

    // Trails, fading toward their tails.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    var bands = 24, per = Math.ceil(trailSize / bands);
    for (var i = 0; i < 3; i++) {
      var tr = trails[i];
      ctx.strokeStyle = COLORS[i];
      ctx.lineWidth = 1.6;
      for (var b = 0; b < bands; b++) {
        var from = b * per, to = Math.min((b + 1) * per, trailSize - 1);
        if (from >= to) continue;
        ctx.globalAlpha = Math.pow((b + 1) / bands, 1.6) * 0.85;
        ctx.beginPath();
        for (var q = from; q <= to; q++) {
          var kk = ((trailHead - trailSize + q) % TRAIL + TRAIL) % TRAIL * 2;
          if (q === from) ctx.moveTo(X(tr[kk]), Y(tr[kk + 1]));
          else ctx.lineTo(X(tr[kk]), Y(tr[kk + 1]));
        }
        if (b === bands - 1) ctx.lineTo(X(s[2 * i]), Y(s[2 * i + 1]));
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Bodies, or an arrow at the edge for one that has left the picture.
    ctx.font = '600 11px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (i = 0; i < 3; i++) {
      var x = X(s[2 * i]), y = Y(s[2 * i + 1]);
      var rad = 2.5 + 3 * Math.sqrt(m[i]);
      if (x < -rad || y < -rad || x > W + rad || y > H + rad) {
        edgeArrow(ctx, W, H, x, y, COLORS[i]);
        continue;
      }
      var g = ctx.createRadialGradient(x, y, 0, x, y, rad * 3.2);
      g.addColorStop(0, COLORS[i]);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS[i];
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
      if (labels) {
        ctx.fillStyle = '#0a0b10';
        ctx.fillText(String(m[i]), x, y + 0.5);
      }
    }

    var text = 't = ' + t.toFixed(1);
    if (escaped >= 0) text += '\n' + (labels ? 'Mass ' + m[escaped] : 'The ' + NAMES[escaped] + ' body') + ' has escaped';
    else text += '   energy error ' + Math.abs((energy() - energy0) / energy0).toExponential(0);
    V.setText(readout, text);
  }

  // view is the half-width on a 4:3 canvas; a squarer canvas shows as much
  // in both directions.
  function scale(W, H) {
    return Math.min(W, H / 0.75) / (2 * view);
  }

  function edgeArrow(ctx, W, H, x, y, color) {
    var mx = W / 2, my = H / 2, dx = x - mx, dy = y - my, pad = 16;
    var f = Math.min((W / 2 - pad) / Math.abs(dx || 1e-9), (H / 2 - pad) / Math.abs(dy || 1e-9));
    var ax = mx + dx * f, ay = my + dy * f, a = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  var stage = null;
  load('eight');
  stage = V.createStage(canvas, { frame: frame });

  // ---- Dragging bodies ----

  function screenPos(i) {
    var sc = scale(stage.width, stage.height);
    return { x: stage.width / 2 + (s[2 * i] - cx) * sc, y: stage.height / 2 - (s[2 * i + 1] - cy) * sc, sc: sc };
  }

  V.drag(canvas, {
    hit: function (x, y) {
      var best = null, bd = 24;
      for (var i = 0; i < 3; i++) {
        var p = screenPos(i), d = Math.hypot(p.x - x, p.y - y);
        if (d < bd) { bd = d; best = { i: i }; }
      }
      return best;
    },
    move: function (h, x, y, first) {
      var p = screenPos(h.i);
      if (first) { dragging = h; h.dx = p.x - x; h.dy = p.y - y; }
      s[2 * h.i] = cx + (x + h.dx - stage.width / 2) / p.sc;
      s[2 * h.i + 1] = cy - (y + h.dy - stage.height / 2) / p.sc;
      clearTrails();
      sample();
      stage.dirty = true;
    },
    end: function () {
      dragging = null;
      V.setSegmented(startGroup, '');
      t = 0;
      escaped = -1;
      energy0 = energy();
      clearTrails();
      sample();
    }
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'reset').addEventListener('click', function () {
    load(current);
    V.setSegmented(startGroup, current);
  });

  V.segmented(startGroup, load);

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return v.toFixed(2) + '×'; },
    function (v) { speed = v; });
})();
