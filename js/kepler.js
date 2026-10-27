// Kepler orbits in AU and years, where the sun's pull is GM = 4π². From the
// launch position and velocity come the semi-major axis a = −GM ÷ 2E and the
// eccentricity vector; Kepler's equation M = E − e·sin E then places the planet.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('kepler');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var MU = 4 * Math.PI * Math.PI;
  var SLICES = 12, PER = 24;       // equal-time slices, samples per slice
  var ARROW = 0.075;               // arrow length in AU per AU/year of speed
  var PLANETS = [                  // a in AU, T in years
    ['Mercury', 0.387, 0.241], ['Venus', 0.723, 0.615], ['Earth', 1, 1], ['Mars', 1.524, 1.881],
    ['Jupiter', 5.203, 11.86], ['Saturn', 9.537, 29.46], ['Uranus', 19.19, 84.01], ['Neptune', 30.07, 164.8]
  ];
  var PRESETS = {
    circle: [1, 0, 0, -1],
    ellipse: [1, 0, 0, -1.15],
    comet: [-2.3, 0, 0, 0.4 / Math.sqrt(2.3)],
    escape: [1, 0, 0, -1.5]
  };

  var r0 = [1, 0], v0 = [0, -1.15 * 2 * Math.PI];  // y points down the screen
  var orbit = null;
  var t = 0;
  var rate = 0.33;                 // years per second
  var playing = !V.reducedMotion;
  var showSlices = true, showChart = true;
  var held = null;
  var tried = [];                  // semi-major axes of earlier orbits
  var geo = { sx: 0, sy: 0, s: 1, W: 0, H: 0 };

  function solve() {
    var x = r0[0], y = r0[1], vx = v0[0], vy = v0[1];
    var r = Math.hypot(x, y), v2 = vx * vx + vy * vy, rv = x * vx + y * vy;
    var h = x * vy - y * vx;
    var En = v2 / 2 - MU / r;
    var ex = ((v2 - MU / r) * x - rv * vx) / MU, ey = ((v2 - MU / r) * y - rv * vy) / MU;
    // A nearly straight-in launch makes a needle-thin ellipse; keep it just open.
    var e = Math.min(Math.hypot(ex, ey), 0.9995);
    var o = { e: e, h: h, bound: En < 0 };
    if (!o.bound) {
      o.path = escapePath();
      return o;
    }
    var a = -MU / (2 * En);
    o.a = a;
    o.b = a * Math.sqrt(Math.max(0, 1 - e * e));
    o.T = 2 * Math.PI * Math.sqrt(a * a * a / MU);
    // Perifocal axes: p toward the nearest point, q along the motion there.
    var px = e > 1e-6 ? ex / e : x / r, py = e > 1e-6 ? ey / e : y / r;
    var sg = h < 0 ? -1 : 1;
    o.p = [px, py];
    o.q = [-py * sg, px * sg];
    // Where the launch sits on the orbit, as a mean anomaly.
    if (e > 1e-6) {
      var E0 = Math.atan2(rv / (e * Math.sqrt(MU * a)), (1 - r / a) / e);
      o.M0 = E0 - e * Math.sin(E0);
    } else {
      o.M0 = 0;
    }
    o.samples = [];
    for (var i = 0; i <= SLICES * PER; i++) o.samples.push(place(o, 2 * Math.PI * i / (SLICES * PER)));
    return o;
  }

  // Position at mean anomaly M.
  function place(o, M) {
    var e = o.e;
    M = M - 2 * Math.PI * Math.floor(M / (2 * Math.PI));
    // Newton's method; starting at π is safe for long, thin ellipses.
    var E = e > 0.8 ? Math.PI : M;
    for (var i = 0; i < 40; i++) {
      var d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= d;
      if (Math.abs(d) < 1e-12) break;
    }
    var X = o.a * (Math.cos(E) - e), Y = o.b * Math.sin(E);
    return [X * o.p[0] + Y * o.q[0], X * o.p[1] + Y * o.q[1]];
  }

  // An escaping planet, stepped forward until it is far away.
  function escapePath() {
    var x = r0[0], y = r0[1], vx = v0[0], vy = v0[1], time = 0;
    var pts = [[x, y, 0]];
    for (var i = 0; i < 6000; i++) {
      var r = Math.hypot(x, y);
      if (r > 40) break;
      var dt = 0.002 * Math.pow(Math.max(r, 0.05), 1.5);
      var ax = -MU * x / (r * r * r), ay = -MU * y / (r * r * r);
      vx += ax * dt / 2; vy += ay * dt / 2;
      x += vx * dt; y += vy * dt;
      r = Math.hypot(x, y);
      ax = -MU * x / (r * r * r); ay = -MU * y / (r * r * r);
      vx += ax * dt / 2; vy += ay * dt / 2;
      time += dt;
      if (i % 4 === 0) pts.push([x, y, time]);
    }
    return pts;
  }

  function planetAt(time) {
    if (orbit.bound) return place(orbit, orbit.M0 + 2 * Math.PI * time / orbit.T);
    var P = orbit.path, lo = 0, hi = P.length - 1;
    if (time >= P[hi][2]) return null;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (P[m][2] <= time) lo = m; else hi = m; }
    var f = (time - P[lo][2]) / (P[hi][2] - P[lo][2]);
    return [P[lo][0] + (P[hi][0] - P[lo][0]) * f, P[lo][1] + (P[hi][1] - P[lo][1]) * f];
  }

  function SX(p) { return geo.sx + p[0] * geo.s; }
  function SY(p) { return geo.sy + p[1] * geo.s; }

  function frame(dt, st) {
    var W = st.width, H = st.height, ctx = st.ctx;
    geo.W = W; geo.H = H;
    // On phones the chart sits along the bottom, so keep the orbit above it.
    var reserve = showChart && W < 480 ? Math.min(210, W * 0.34) * 0.68 + 16 : 0;
    var top = W < 480 ? 98 : 80;
    geo.s = Math.min(W / 5, (H - top - reserve) / 3.2);
    geo.sx = W * 0.56;
    geo.sy = top + (H - top - reserve) / 2;
    if (!orbit) orbit = solve();
    if (playing && !held) {
      t += dt * rate;
      if (!orbit.bound) {
        // Start an escaping planet over once it has left the picture.
        var q = planetAt(t);
        if (!q || SX(q) < -40 || SX(q) > W + 40 || SY(q) < -40 || SY(q) > H + 40) t = 0;
      }
      if (orbit.bound && t > orbit.T * 1000) t -= orbit.T * 1000;
    } else if (!st.dirty) {
      return;
    }
    st.dirty = false;

    ctx.clearRect(0, 0, W, H);
    var i, k, p;

    // Equal-time slices: twelve twelfths of the period, swept from the sun.
    var where = -1;
    if (orbit.bound) {
      var M = orbit.M0 + 2 * Math.PI * t / orbit.T;
      var frac = (M / (2 * Math.PI)) % 1;
      if (frac < 0) frac += 1;
      where = Math.floor(frac * SLICES);
      if (showSlices) {
        for (k = 0; k < SLICES; k++) {
          ctx.fillStyle = k === where ? 'rgba(110,231,255,0.32)' : k % 2 ? 'rgba(110,231,255,0.06)' : 'rgba(110,231,255,0.14)';
          ctx.beginPath();
          ctx.moveTo(geo.sx, geo.sy);
          for (i = k * PER; i <= (k + 1) * PER; i++) ctx.lineTo(SX(orbit.samples[i]), SY(orbit.samples[i]));
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.strokeStyle = 'rgba(236,232,223,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (i = 0; i <= SLICES * PER; i++) {
        p = orbit.samples[i];
        if (i) ctx.lineTo(SX(p), SY(p)); else ctx.moveTo(SX(p), SY(p));
      }
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,180,84,0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      orbit.path.forEach(function (q, j) { if (j) ctx.lineTo(SX(q), SY(q)); else ctx.moveTo(SX(q), SY(q)); });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // The sun.
    var glow = ctx.createRadialGradient(geo.sx, geo.sy, 0, geo.sx, geo.sy, 26);
    glow.addColorStop(0, 'rgba(255,209,102,0.55)');
    glow.addColorStop(1, 'rgba(255,209,102,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(geo.sx, geo.sy, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(geo.sx, geo.sy, 8, 0, Math.PI * 2);
    ctx.fill();

    // Launch point and velocity arrow.
    var lx = SX(r0), ly = SY(r0);
    var tip = arrowTip();
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(tip[0], tip[1]);
    ctx.stroke();
    var ang = Math.atan2(tip[1] - ly, tip[0] - lx);
    ctx.beginPath();
    ctx.moveTo(tip[0] + Math.cos(ang) * 4, tip[1] + Math.sin(ang) * 4);
    ctx.lineTo(tip[0] - Math.cos(ang - 0.45) * 11, tip[1] - Math.sin(ang - 0.45) * 11);
    ctx.lineTo(tip[0] - Math.cos(ang + 0.45) * 11, tip[1] - Math.sin(ang + 0.45) * 11);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tip[0], tip[1], 13, 0, Math.PI * 2);
    ctx.strokeStyle = held === 'tip' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236,232,223,0.8)';
    ctx.beginPath();
    ctx.arc(lx, ly, 7, 0, Math.PI * 2);
    ctx.stroke();

    // The planet.
    p = held ? r0 : planetAt(t);
    if (p) {
      ctx.fillStyle = '#6ee7ff';
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(SX(p), SY(p), 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    if (showChart) chart(ctx);

    var lines;
    if (orbit.bound) {
      var name = orbit.e < 0.02 ? 'Circle' : 'Ellipse';
      var ratio = orbit.T * orbit.T / (orbit.a * orbit.a * orbit.a);
      lines = [name + ': a = ' + orbit.a.toFixed(2) + ' AU, e = ' + orbit.e.toFixed(2),
        'Period ' + orbit.T.toFixed(2) + ' years',
        'T² ÷ a³ = ' + ratio.toFixed(2) + ', for every orbit'];
      if (showSlices) lines.push('Each slice: 1/12 of the time, same area');
    } else {
      lines = ['Escaped: past √2 × circular speed', 'The path never closes', 'so there is no period'];
    }
    V.setText(readout, lines.join('\n'));
  }

  function arrowTip() {
    return [SX(r0) + v0[0] * ARROW * geo.s, SY(r0) + v0[1] * ARROW * geo.s];
  }

  // Kepler's third law on log-log axes, with the eight planets.
  function chart(ctx) {
    var W = geo.W, H = geo.H;
    var bw = Math.min(210, W * 0.34), bh = bw * 0.68;
    var bx = W - bw - 12, by = W < 480 ? H - bh - 12 : 12;
    ctx.fillStyle = 'rgba(10,11,16,0.82)';
    ctx.strokeStyle = '#222534';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(bx + 0.5, by + 0.5, bw, bh);
    ctx.fill();
    ctx.stroke();
    var pad = 8, top = 22, x0 = bx + pad + 4, x1 = bx + bw - pad, y0 = by + bh - pad - 10, y1 = by + top;
    var A0 = Math.log(0.2), A1 = Math.log(50), T0 = Math.log(0.08), T1 = Math.log(400);
    function cx(a) { return x0 + (Math.log(a) - A0) / (A1 - A0) * (x1 - x0); }
    function cy(T) { return y0 - (Math.log(T) - T0) / (T1 - T0) * (y0 - y1); }
    ctx.strokeStyle = 'rgba(236,232,223,0.18)';
    ctx.beginPath();
    ctx.moveTo(x0, y1); ctx.lineTo(x0, y0); ctx.lineTo(x1, y0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(110,231,255,0.45)';
    ctx.beginPath();
    ctx.moveTo(cx(0.2), cy(Math.pow(0.2, 1.5)));
    ctx.lineTo(cx(50), cy(Math.pow(50, 1.5)));
    ctx.stroke();
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'middle';
    PLANETS.forEach(function (pl) {
      ctx.fillStyle = '#ece8df';
      ctx.beginPath();
      ctx.arc(cx(pl[1]), cy(pl[2]), 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (pl[0] === 'Earth' || pl[0] === 'Jupiter' || pl[0] === 'Neptune') {
        var right = pl[0] === 'Neptune';
        ctx.fillStyle = '#6f7286';
        ctx.textAlign = right ? 'right' : 'left';
        ctx.fillText(pl[0], cx(pl[1]) + (right ? -6 : 6), cy(pl[2]) + (right ? -7 : 6));
      }
    });
    ctx.strokeStyle = 'rgba(110,231,255,0.7)';
    tried.forEach(function (a) {
      ctx.beginPath();
      ctx.arc(cx(a), cy(Math.pow(a, 1.5)), 3.5, 0, Math.PI * 2);
      ctx.stroke();
    });
    if (orbit.bound && orbit.a > 0.2 && orbit.a < 50) {
      ctx.fillStyle = '#6ee7ff';
      ctx.beginPath();
      ctx.arc(cx(orbit.a), cy(orbit.T), 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#9b9daf';
    ctx.textAlign = 'left';
    ctx.fillText('T² ∝ a³', bx + 8, by + 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#6f7286';
    ctx.fillText('a →', x1, y0 + 9);
  }

  function relaunch() {
    if (orbit && orbit.bound) {
      tried.push(orbit.a);
      if (tried.length > 8) tried.shift();
    }
    orbit = solve();
    t = 0;
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Drag the arrow tip (speed and aim) or the launch point ----

  V.drag(canvas, {
    hit: function (x, y) {
      var tip = arrowTip();
      if (Math.hypot(x - tip[0], y - tip[1]) < 20) return 'tip';
      if (Math.hypot(x - SX(r0), y - SY(r0)) < 16) return 'launch';
      return null;
    },
    move: function (h, x, y, first) {
      if (first) relaunch();
      held = h;
      x = Math.max(8, Math.min(geo.W - 8, x));
      y = Math.max(8, Math.min(geo.H - 8, y));
      if (h === 'tip') {
        var vx = (x - SX(r0)) / (ARROW * geo.s), vy = (y - SY(r0)) / (ARROW * geo.s);
        var sp = Math.hypot(vx, vy), lo = 0.6;
        if (sp < lo) { vx = sp ? vx / sp * lo : lo; vy = sp ? vy / sp * lo : 0; }
        v0 = [vx, vy];
      } else {
        var rx = (x - geo.sx) / geo.s, ry = (y - geo.sy) / geo.s, r = Math.hypot(rx, ry);
        if (r < 0.25) { rx = r ? rx / r * 0.25 : 0.25; ry = r ? ry / r * 0.25 : 0; }
        r0 = [rx, ry];
      }
      orbit = solve();
      t = 0;
      stage.dirty = true;
    },
    end: function () { held = null; t = 0; stage.dirty = true; }
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'again').addEventListener('click', function () { t = 0; stage.dirty = true; });

  V.segmented(V.ctl(section, 'preset'), function (v) {
    var p = PRESETS[v];
    r0 = [p[0], p[1]];
    // Speeds are in units of the circular speed 2π AU/year at 1 AU.
    v0 = [p[2] * 2 * Math.PI, p[3] * 2 * Math.PI];
    relaunch();
    stage.dirty = true;
  });

  V.range(V.ctl(section, 'rate'), V.ctl(section, 'rate-out'),
    function (v) { return '1 year in ' + (1 / v).toFixed(1) + ' s'; },
    function (v) { rate = v; });

  V.toggle(V.ctl(section, 'slices'), function (on) { showSlices = on; stage.dirty = true; });
  V.toggle(V.ctl(section, 'chart'), function (on) { showChart = on; stage.dirty = true; });
})();
