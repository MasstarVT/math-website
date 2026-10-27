// A double pendulum: two equal rods and bobs, no friction, integrated with
// RK4 in small steps. Angles are measured from straight down. Copies start
// a ten-thousandth of a degree apart to show how fast tiny gaps grow.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('double-pendulum');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var countGroup = V.ctl(section, 'count');

  var G = 9.81; // rods 1 m long, so time is in seconds
  var H = 0.001;
  var OFFSET = 0.0001 * Math.PI / 180;
  var TRAIL = 700; // samples, 8 ms apart
  var THREE = ['#6ee7ff', '#ff5fa2', '#ffb454'];

  var start = { a: 2.0, b: 2.6 };
  var count = 3;
  var pens = [];
  var t = 0, tick = 0, speed = 1;
  var playing = !V.reducedMotion;
  var dragging = null;

  function reset() {
    pens = [];
    for (var i = 0; i < count; i++) {
      pens.push({
        s: [start.a, start.b + i * OFFSET, 0, 0],
        trail: new Float32Array(TRAIL * 2), head: 0, size: 0,
        color: count === 1 ? THREE[0] : count === 3 ? THREE[i] : V.gradient(V.SPECTRUM, i / (count - 1))
      });
    }
    t = 0;
    tick = 0;
    if (stage) stage.dirty = true;
  }

  // Equations of motion for equal masses and equal lengths.
  function deriv(s, out) {
    var t1 = s[0], t2 = s[1], w1 = s[2], w2 = s[3], d = t1 - t2;
    var den = 3 - Math.cos(2 * d), sd = Math.sin(d), cd = Math.cos(d);
    out[0] = w1;
    out[1] = w2;
    out[2] = (-3 * G * Math.sin(t1) - G * Math.sin(t1 - 2 * t2) - 2 * sd * (w2 * w2 + w1 * w1 * cd)) / den;
    out[3] = 2 * sd * (2 * w1 * w1 + 2 * G * Math.cos(t1) + w2 * w2 * cd) / den;
  }

  var k1 = [0, 0, 0, 0], k2 = [0, 0, 0, 0], k3 = [0, 0, 0, 0], k4 = [0, 0, 0, 0], tmp = [0, 0, 0, 0];
  function rk4(s) {
    var i;
    deriv(s, k1);
    for (i = 0; i < 4; i++) tmp[i] = s[i] + H / 2 * k1[i];
    deriv(tmp, k2);
    for (i = 0; i < 4; i++) tmp[i] = s[i] + H / 2 * k2[i];
    deriv(tmp, k3);
    for (i = 0; i < 4; i++) tmp[i] = s[i] + H * k3[i];
    deriv(tmp, k4);
    for (i = 0; i < 4; i++) s[i] += H / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }

  function frame(dt, st) {
    if (playing && !dragging) {
      var n = Math.round(Math.min(dt, 0.05) * speed / H);
      for (var j = 0; j < pens.length; j++) {
        var p = pens[j];
        for (var i = 0; i < n; i++) {
          rk4(p.s);
          // Every 8 ms, remember where the lower bob is, in rod lengths from the pivot.
          if ((tick + i) % 8 === 0) {
            p.trail[p.head * 2] = Math.sin(p.s[0]) + Math.sin(p.s[1]);
            p.trail[p.head * 2 + 1] = Math.cos(p.s[0]) + Math.cos(p.s[1]);
            p.head = (p.head + 1) % TRAIL;
            if (p.size < TRAIL) p.size++;
          }
        }
      }
      tick += n;
      t += n * H;
      if (n) st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function geometry(st) {
    var L = Math.min(st.width, st.height) * 0.235;
    return { L: L, ox: st.width / 2, oy: st.height / 2 };
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, Hh = st.height, geo = geometry(st), L = geo.L, ox = geo.ox, oy = geo.oy;
    ctx.clearRect(0, 0, W, Hh);
    var many = pens.length > 3;

    // Trails of the lower bobs, fading toward their tails.
    var keep = many ? 90 : pens.length === 1 ? TRAIL : 300, bands = many ? 4 : 8;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Last first, so the first pendulum's trail ends up on top.
    pens.slice().reverse().forEach(function (p) {
      var size = Math.min(p.size, keep);
      if (size < 2) return;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = many ? 1 : 1.6;
      var per = Math.ceil(size / bands);
      for (var b = 0; b < bands; b++) {
        var from = b * per, to = Math.min((b + 1) * per, size - 1);
        if (from >= to) continue;
        ctx.globalAlpha = Math.pow((b + 1) / bands, 1.5) * (many ? 0.5 : 0.8);
        ctx.beginPath();
        for (var q = from; q <= to; q++) {
          var k = ((p.head - size + q) % TRAIL + TRAIL) % TRAIL * 2;
          var x = ox + p.trail[k] * L, y = oy + p.trail[k + 1] * L;
          if (q === from) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;

    // Rods and bobs, the first pendulum on top.
    for (var i = pens.length - 1; i >= 0; i--) {
      var s = pens[i].s;
      var x1 = ox + Math.sin(s[0]) * L, y1 = oy + Math.cos(s[0]) * L;
      var x2 = x1 + Math.sin(s[1]) * L, y2 = y1 + Math.cos(s[1]) * L;
      ctx.globalAlpha = many ? 0.6 : 1;
      ctx.strokeStyle = many ? pens[i].color : '#c4c1ba';
      ctx.lineWidth = many ? 1.5 : 2.5;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = pens[i].color;
      ctx.beginPath();
      ctx.arc(x1, y1, many ? 4 : 7, 0, Math.PI * 2);
      ctx.arc(x2, y2, many ? 4 : 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ece8df';
    ctx.beginPath();
    ctx.arc(ox, oy, 3.5, 0, Math.PI * 2);
    ctx.fill();

    var text = 't = ' + t.toFixed(1) + ' s';
    if (pens.length > 1) text += '\nWidest gap ' + formatDeg(spread());
    V.setText(readout, text);
  }

  // The biggest difference in the lower rod's angle from the first pendulum.
  function spread() {
    var a = pens[0].s[1], worst = 0;
    for (var i = 1; i < pens.length; i++) {
      var d = Math.abs(Math.atan2(Math.sin(pens[i].s[1] - a), Math.cos(pens[i].s[1] - a)));
      if (d > worst) worst = d;
    }
    return worst * 180 / Math.PI;
  }

  function formatDeg(d) {
    if (d < 0.01) return d.toFixed(5) + '°';
    if (d < 1) return d.toFixed(3) + '°';
    return Math.round(d) + '°';
  }

  var stage = null;
  reset();
  stage = V.createStage(canvas, { frame: frame });

  // ---- Drag a bob to set the start ----

  V.drag(canvas, {
    hit: function (x, y) {
      var geo = geometry(stage), s = pens[0].s, L = geo.L;
      var x1 = geo.ox + Math.sin(s[0]) * L, y1 = geo.oy + Math.cos(s[0]) * L;
      var x2 = x1 + Math.sin(s[1]) * L, y2 = y1 + Math.cos(s[1]) * L;
      if (Math.hypot(x - x2, y - y2) < 24) return { bob: 2 };
      if (Math.hypot(x - x1, y - y1) < 24) return { bob: 1 };
      return null;
    },
    move: function (h, x, y) {
      var geo = geometry(stage);
      dragging = h;
      if (h.bob === 1) {
        start.a = Math.atan2(x - geo.ox, y - geo.oy);
        start.b = pens[0].s[1];
      } else {
        start.a = pens[0].s[0];
        var x1 = geo.ox + Math.sin(start.a) * geo.L, y1 = geo.oy + Math.cos(start.a) * geo.L;
        start.b = Math.atan2(x - x1, y - y1);
      }
      reset();
    },
    end: function () { dragging = null; }
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'reset').addEventListener('click', reset);

  V.segmented(countGroup, function (v) {
    count = +v;
    reset();
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return v.toFixed(2) + '×'; },
    function (v) { speed = v; });
})();
