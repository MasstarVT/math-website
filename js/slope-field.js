// Slope fields: a differential equation y′ = F(x, y) gives a slope at every
// point. A solution is a curve that follows those slopes, traced here with
// RK4 forward and backward from a seed, stepping by equal lengths on screen.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('slope-field');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var flowBtn = V.ctl(section, 'flow');

  var MAX_SEEDS = 10;
  var PARTICLES = 240;
  var GROW = 0.8;   // seconds for a new solution to trace out

  var EQS = {
    exp: {
      label: 'y′ = y', F: function (x, y) { return y; },
      x: [-3, 3], y: [-3, 3], seeds: [[-2.5, 0.25], [-1, -0.4], [0, 1]],
      note: 'Solutions are y = C·eˣ'
    },
    logistic: {
      label: 'y′ = y(1 − y)', F: function (x, y) { return y * (1 - y); },
      x: [-4, 6], y: [-0.6, 1.6], seeds: [[-3.5, 0.04], [3.4, 1.5], [1, -0.05]],
      lines: [0, 1], note: 'Above 0, everything settles at 1'
    },
    linear: {
      label: 'y′ = x − y', F: function (x, y) { return x - y; },
      x: [-3, 4], y: [-3, 4], seeds: [[-3, 3.5], [-3, -1], [0, -2.5]],
      note: 'All solutions close in on y = x − 1'
    },
    circle: {
      label: 'y′ = −x ÷ y', F: function (x, y) { return -x / y; },
      x: [-3.2, 3.2], y: [-2.6, 2.6], seeds: [[0, 1], [0, 2], [0, -1.5]],
      note: 'Half circles that end at y = 0'
    }
  };
  var COLORS = ['#ffb454', '#6ee7ff', '#ff5fa2', '#7ee0a1', '#a78bfa'];

  var eq = EQS.logistic;
  var seeds = [];
  var nextColor = 0;
  var flow = !V.reducedMotion;
  var particles = [];
  var cache = document.createElement('canvas');
  var cacheOk = false;
  var G = null;
  var dragged = false;
  var focus = null;

  function layout(st) {
    var W = st.width, H = st.height;
    var sx = W / (eq.x[1] - eq.x[0]), sy = H / (eq.y[1] - eq.y[0]);
    G = {
      W: W, H: H, sx: sx, sy: sy,
      X: function (x) { return (x - eq.x[0]) * sx; },
      Y: function (y) { return (eq.y[1] - y) * sy; },
      ix: function (px) { return eq.x[0] + px / sx; },
      iy: function (py) { return eq.y[1] - py / sy; }
    };
  }

  // Unit speed on screen along (1, F), so steep and flat parts get the same detail.
  function dir(x, y, out) {
    var F = eq.F(x, y);
    if (!isFinite(F) || Math.abs(F) > 1e4) return false;
    var len = Math.sqrt(G.sx * G.sx + G.sy * G.sy * F * F);
    out[0] = 1 / len;
    out[1] = F / len;
    return true;
  }

  function trace(seed) {
    var pts = [[], []], k1 = [0, 0], k2 = [0, 0], k3 = [0, 0], k4 = [0, 0];
    var mx = (eq.x[1] - eq.x[0]) * 0.1, my = (eq.y[1] - eq.y[0]) * 0.1;
    for (var side = 0; side < 2; side++) {
      var s = side ? -2 : 2, x = seed.x, y = seed.y, list = pts[side];
      list.push(x, y);
      for (var n = 0; n < 1600; n++) {
        if (!dir(x, y, k1)) break;
        if (!dir(x + k1[0] * s / 2, y + k1[1] * s / 2, k2)) break;
        if (!dir(x + k2[0] * s / 2, y + k2[1] * s / 2, k3)) break;
        if (!dir(x + k3[0] * s, y + k3[1] * s, k4)) break;
        var nx = x + s / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
        var ny = y + s / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
        // y′ = −x ÷ y turns vertical at y = 0, where the solution ends.
        if (eq === EQS.circle && (ny * y <= 0 || Math.abs(ny) < 0.006)) break;
        x = nx;
        y = ny;
        list.push(x, y);
        if (x < eq.x[0] - mx || x > eq.x[1] + mx || y < eq.y[0] - my || y > eq.y[1] + my) break;
      }
    }
    seed.fwd = pts[0];
    seed.back = pts[1];
  }

  function addSeed(x, y, instant) {
    var s = { x: x, y: y, color: COLORS[nextColor++ % COLORS.length], grow: instant ? 1 : 0 };
    seeds.push(s);
    if (seeds.length > MAX_SEEDS) seeds.shift();
    if (G) trace(s);
    focus = s;
    stage.dirty = true;
  }

  function resetSeeds() {
    seeds = [];
    nextColor = 0;
    eq.seeds.forEach(function (p) { addSeed(p[0], p[1], V.reducedMotion); });
    focus = null;
  }

  function buildCache(st) {
    var dpr = st.dpr;
    cache.width = Math.round(G.W * dpr);
    cache.height = Math.round(G.H * dpr);
    var c = cache.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, G.W, G.H);

    // Axes and resting lines.
    c.strokeStyle = 'rgba(236,232,223,0.16)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, Math.round(G.Y(0)) + 0.5);
    c.lineTo(G.W, Math.round(G.Y(0)) + 0.5);
    c.moveTo(Math.round(G.X(0)) + 0.5, 0);
    c.lineTo(Math.round(G.X(0)) + 0.5, G.H);
    c.stroke();
    if (eq.lines) {
      c.strokeStyle = 'rgba(255,180,84,0.35)';
      c.setLineDash([5, 6]);
      c.beginPath();
      eq.lines.forEach(function (v) {
        c.moveTo(0, Math.round(G.Y(v)) + 0.5);
        c.lineTo(G.W, Math.round(G.Y(v)) + 0.5);
      });
      c.stroke();
      c.setLineDash([]);
    }

    // The slope marks.
    var step = Math.max(20, Math.min(G.W, G.H) / 20), half = step * 0.34;
    var cols = Math.floor(G.W / step), rows = Math.floor(G.H / step);
    var ox = (G.W - (cols - 1) * step) / 2, oy = (G.H - (rows - 1) * step) / 2;
    var d = [0, 0];
    c.strokeStyle = 'rgba(236,232,223,0.42)';
    c.lineWidth = 1.4;
    c.lineCap = 'round';
    c.beginPath();
    for (var i = 0; i < cols; i++) {
      for (var j = 0; j < rows; j++) {
        var px = ox + i * step, py = oy + j * step;
        var x = G.ix(px), y = G.iy(py);
        var F = eq.F(x, y), ux, uy;
        if (!isFinite(F) || Math.abs(F) > 1e4) { ux = 0; uy = 1; } else {
          dir(x, y, d);
          ux = d[0] * G.sx;
          uy = -d[1] * G.sy;
        }
        c.moveTo(px - ux * half, py - uy * half);
        c.lineTo(px + ux * half, py + uy * half);
      }
    }
    c.stroke();
    cacheOk = true;
  }

  function spawn(p) {
    p.x = eq.x[0] + Math.random() * (eq.x[1] - eq.x[0]);
    p.y = eq.y[0] + Math.random() * (eq.y[1] - eq.y[0]);
    p.life = 1.5 + Math.random() * 3;
    p.age = 0;
  }

  function frame(dt, st) {
    var growing = false;
    seeds.forEach(function (s) {
      if (s.grow < 1) {
        s.grow = Math.min(1, s.grow + dt / GROW);
        growing = true;
      }
    });
    if (!growing && !flow && !st.dirty) return;
    st.dirty = false;

    if (!G || G.W !== st.width || G.H !== st.height) {
      layout(st);
      cacheOk = false;
      seeds.forEach(trace);
    }
    if (!cacheOk) buildCache(st);

    var ctx = st.ctx;
    ctx.clearRect(0, 0, G.W, G.H);
    ctx.drawImage(cache, 0, 0, G.W, G.H);

    // Drifting specks that follow the field.
    if (flow) {
      var d = [0, 0], speed = 46;
      ctx.strokeStyle = 'rgba(255,180,84,0.6)';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      while (particles.length < PARTICLES) {
        var np = {};
        spawn(np);
        np.age = Math.random() * np.life;
        particles.push(np);
      }
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.age += dt;
        if (p.age > p.life || !dir(p.x, p.y, d)) { spawn(p); continue; }
        p.x += d[0] * speed * dt;
        var ny = p.y + d[1] * speed * dt;
        if (eq === EQS.circle && ny * p.y <= 0) { spawn(p); continue; }
        p.y = ny;
        if (p.x > eq.x[1] || p.y < eq.y[0] || p.y > eq.y[1]) { spawn(p); continue; }
        var px = G.X(p.x), py = G.Y(p.y);
        ctx.moveTo(px - d[0] * G.sx * 7, py + d[1] * G.sy * 7);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Solutions, tracing out from their seeds.
    ctx.lineJoin = 'round';
    seeds.forEach(function (s) {
      var e = V.easeInOut(s.grow);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.6;
      [s.fwd, s.back].forEach(function (list) {
        var n = Math.max(1, Math.floor(list.length / 2 * e));
        ctx.beginPath();
        ctx.moveTo(G.X(list[0]), G.Y(list[1]));
        for (var k = 1; k < n; k++) ctx.lineTo(G.X(list[2 * k]), G.Y(list[2 * k + 1]));
        ctx.stroke();
      });
      ctx.fillStyle = s.color;
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(G.X(s.x), G.Y(s.y), s === focus ? 7 : 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
    });

    // The equation, on a dark backing in the bottom right.
    ctx.font = '500 13px "IBM Plex Mono", monospace';
    var w = ctx.measureText(eq.label).width;
    ctx.fillStyle = 'rgba(10,11,16,0.8)';
    ctx.fillRect(G.W - w - 26, G.H - 36, w + 16, 26);
    ctx.fillStyle = '#ffb454';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(eq.label, G.W - 18, G.H - 22.5);

    V.setText(readout,
      (focus ? 'Seed at (' + num(focus.x) + ', ' + num(focus.y) + ')' : 'Tap anywhere to drop a seed') + '\n' +
      eq.note);
  }

  function num(v) {
    var t = Math.abs(v).toFixed(2);
    return (v < 0 && parseFloat(t) !== 0 ? '−' : '') + t;
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Seeds: tap to drop one, drag one to move it ----

  function seedAt(px, py) {
    if (!G) return null;
    for (var i = seeds.length - 1; i >= 0; i--) {
      if (Math.hypot(px - G.X(seeds[i].x), py - G.Y(seeds[i].y)) < 16) return seeds[i];
    }
    return null;
  }

  V.drag(canvas, {
    cursor: 'move',
    hit: function (x, y) { return seedAt(x, y); },
    move: function (s, x, y, first) {
      if (first) { dragged = false; return; }
      dragged = true;
      s.x = Math.max(eq.x[0], Math.min(eq.x[1], G.ix(x)));
      s.y = Math.max(eq.y[0], Math.min(eq.y[1], G.iy(y)));
      if (eq === EQS.circle && Math.abs(s.y) < 0.02) s.y = s.y < 0 ? -0.02 : 0.02;
      s.grow = 1;
      trace(s);
      focus = s;
      stage.dirty = true;
    }
  });

  canvas.addEventListener('click', function (e) {
    if (dragged) { dragged = false; return; }
    if (!G) return;
    var r = canvas.getBoundingClientRect();
    var px = e.clientX - r.left, py = e.clientY - r.top;
    if (seedAt(px, py)) return;
    var y = G.iy(py);
    if (eq === EQS.circle && Math.abs(y) < 0.02) return;
    addSeed(G.ix(px), y, false);
  });

  // ---- Controls ----

  V.segmented(V.ctl(section, 'eq'), function (v) {
    eq = EQS[v];
    G = null;
    particles.length = 0;
    resetSeeds();
    stage.dirty = true;
  });

  V.toggle(flowBtn, function (on) {
    flow = on;
    stage.dirty = true;
  });
  flowBtn.setAttribute('aria-pressed', String(flow));

  V.ctl(section, 'clear').addEventListener('click', function () {
    seeds = [];
    focus = null;
    stage.dirty = true;
  });

  resetSeeds();
})();
