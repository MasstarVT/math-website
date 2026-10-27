// The Lorenz system, integrated with RK4. Several paths start almost on top
// of each other so you can watch them separate.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('lorenz');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var SIGMA = 10;
  var BETA = 8 / 3;
  var H = 0.005;
  var TWO_COLORS = ['#6ee7ff', '#ff5fa2'];

  var rho = 28;
  var mode = 'two';
  var particles = [];
  var time = 0;
  var speed = 1;
  var playing = !V.reducedMotion;
  var yaw = 0.7, pitch = 0.18, vyaw = 0.12, drag = null;

  function reset() {
    var count = mode === 'one' ? 1 : mode === 'two' ? 2 : 150;
    var len = count > 2 ? 140 : 2600;
    particles = [];
    for (var i = 0; i < count; i++) {
      // Two paths differ by 0.00001; the cloud starts inside a 0.001 box.
      var off = count === 2 ? i * 1e-5 : count > 2 ? (Math.random() - 0.5) * 1e-3 : 0;
      particles.push({
        x: 1 + off, y: 1, z: 1,
        trail: new Float32Array(len * 3), head: 0, size: 0
      });
    }
    time = 0;
    if (stage) stage.dirty = true;
  }

  function step(p) {
    var x = p.x, y = p.y, z = p.z;
    var k1x = SIGMA * (y - x), k1y = x * (rho - z) - y, k1z = x * y - BETA * z;
    var x2 = x + k1x * H / 2, y2 = y + k1y * H / 2, z2 = z + k1z * H / 2;
    var k2x = SIGMA * (y2 - x2), k2y = x2 * (rho - z2) - y2, k2z = x2 * y2 - BETA * z2;
    var x3 = x + k2x * H / 2, y3 = y + k2y * H / 2, z3 = z + k2z * H / 2;
    var k3x = SIGMA * (y3 - x3), k3y = x3 * (rho - z3) - y3, k3z = x3 * y3 - BETA * z3;
    var x4 = x + k3x * H, y4 = y + k3y * H, z4 = z + k3z * H;
    var k4x = SIGMA * (y4 - x4), k4y = x4 * (rho - z4) - y4, k4z = x4 * y4 - BETA * z4;
    p.x = x + H / 6 * (k1x + 2 * k2x + 2 * k3x + k4x);
    p.y = y + H / 6 * (k1y + 2 * k2y + 2 * k3y + k4y);
    p.z = z + H / 6 * (k1z + 2 * k2z + 2 * k3z + k4z);

    var cap = p.trail.length / 3;
    p.trail[p.head * 3] = p.x;
    p.trail[p.head * 3 + 1] = p.y;
    p.trail[p.head * 3 + 2] = p.z;
    p.head = (p.head + 1) % cap;
    if (p.size < cap) p.size++;
  }

  function frame(dt, st) {
    if (playing) {
      var n = Math.max(1, Math.round(6 * speed));
      for (var i = 0; i < n; i++) {
        for (var j = 0; j < particles.length; j++) step(particles[j]);
      }
      time += n * H;
    }
    if (!drag) yaw += vyaw * dt;
    draw(st);
    updateReadout();
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, Hh = st.height;
    ctx.clearRect(0, 0, W, Hh);
    var s = Math.min(W / 50, Hh / 54);
    var cx = W / 2, cy = Hh / 2;
    var cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);

    function px(x, y) { return cx + (x * cyaw - y * syaw) * s; }
    // The attractor's wings sit around z = rho - 1; center a bit below that.
    var zc = rho - 4;
    function py(x, y, z) { return cy - ((z - zc) * cp + (x * syaw + y * cyaw) * sp) * s; }

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    var many = particles.length > 2;
    var bands = many ? 4 : 30;

    particles.forEach(function (p, idx) {
      var cap = p.trail.length / 3, size = p.size;
      if (size < 2) return;
      ctx.strokeStyle = many ? V.gradient(V.SPECTRUM, idx / (particles.length - 1)) : TWO_COLORS[idx];
      ctx.lineWidth = many ? 1.2 : 1.5;
      var per = Math.ceil(size / bands);
      for (var b = 0; b < bands; b++) {
        var from = b * per, to = Math.min((b + 1) * per, size - 1);
        if (from >= to) continue;
        ctx.globalAlpha = Math.pow((b + 1) / bands, 1.4) * (many ? 0.9 : 1);
        ctx.beginPath();
        for (var i = from; i <= to; i++) {
          var k = ((p.head - size + i) % cap + cap) % cap * 3;
          var X = px(p.trail[k], p.trail[k + 1]), Y = py(p.trail[k], p.trail[k + 1], p.trail[k + 2]);
          if (i === from) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(px(p.x, p.y), py(p.x, p.y, p.z), many ? 1.8 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function updateReadout() {
    var text = 't = ' + time.toFixed(1);
    if (particles.length === 2) {
      var a = particles[0], b = particles[1];
      var gap = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      text += '   gap between paths ' + (gap < 0.01 ? gap.toExponential(1) : gap.toFixed(2));
    }
    V.setText(readout, text);
  }

  var stage = null;
  reset();
  stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'reset').addEventListener('click', reset);

  V.segmented(V.ctl(section, 'mode'), function (m) {
    mode = m;
    reset();
  });

  V.range(V.ctl(section, 'rho'), V.ctl(section, 'rho-out'),
    function (v) { return v.toFixed(1); },
    function (v) { rho = v; });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return v.toFixed(2) + '×'; },
    function (v) { speed = v; });

  // ---- Drag to orbit ----

  canvas.addEventListener('pointerdown', function (e) {
    drag = { x: e.clientX, y: e.clientY };
    vyaw = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-grabbing');
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    yaw += (e.clientX - drag.x) * 0.008;
    pitch = Math.max(-1.3, Math.min(1.3, pitch - (e.clientY - drag.y) * 0.006));
    drag = { x: e.clientX, y: e.clientY };
  });

  function endDrag() {
    drag = null;
    canvas.classList.remove('is-grabbing');
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
})();
