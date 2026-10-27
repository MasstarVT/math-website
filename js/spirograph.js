// Spirograph: a gear with r teeth rolls around a ring with R teeth, and a pen
// sits in a hole of the gear. The pattern closes after r / gcd(R, r) laps and
// has R / gcd(R, r) points.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('spirograph');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var gearInput = V.ctl(section, 'gear');
  var penInput = V.ctl(section, 'pen');

  var RING = 96;
  var gear = 30;
  var pen = 0.75;          // pen distance from the gear's center, as a fraction of its radius
  var outside = false;
  var speed = 1;
  var playing = !V.reducedMotion;
  var theta = 0;           // how far the gear has travelled around the ring
  var drawnTo = 0;
  var layer = document.createElement('canvas');
  var lctx = layer.getContext('2d');
  var G = null;

  function gcd(a, b) { while (b) { var t = b; b = a % b; a = t; } return a; }
  function laps() { return gear / gcd(RING, gear); }
  function total() { return Math.PI * 2 * laps(); }

  // Positions in teeth units: the gear's center and the pen.
  function at(t) {
    var R = RING, r = gear, d = pen * r, k, cx, cy, a;
    if (outside) {
      k = (R + r) / r;
      cx = (R + r) * Math.cos(t);
      cy = (R + r) * Math.sin(t);
      a = k * t + Math.PI;
    } else {
      k = (R - r) / r;
      cx = (R - r) * Math.cos(t);
      cy = (R - r) * Math.sin(t);
      a = -k * t;
    }
    return { cx: cx, cy: cy, a: a, px: cx + d * Math.cos(a), py: cy + d * Math.sin(a) };
  }

  function restart() {
    theta = 0;
    drawnTo = 0;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, layer.width, layer.height);
  }

  function frame(dt, st) {
    var W = st.width, H = st.height, ctx = st.ctx;
    if (layer.width !== st.canvas.width || layer.height !== st.canvas.height) {
      layer.width = st.canvas.width;
      layer.height = st.canvas.height;
      drawnTo = 0;
    }
    var extent = outside ? RING + gear * (1 + pen) : RING;
    var s = Math.min(W, H) * 0.46 / extent;
    G = { cx: W / 2, cy: H / 2, s: s };

    var end = total();
    if (playing && theta < end) theta = Math.min(end, theta + dt * speed * 2.2);
    if (V.reducedMotion && theta < end) theta = end;

    // Add the new stretch of the pattern to the layer.
    if (drawnTo === 0) {
      lctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      lctx.clearRect(0, 0, W, H);
    }
    if (drawnTo < theta) {
      var stepA = 0.01, t = drawnTo, p = at(t);
      lctx.lineWidth = 1.4;
      lctx.lineJoin = 'round';
      while (t < theta) {
        var t2 = Math.min(theta, t + stepA * 24), q;
        lctx.strokeStyle = V.gradient(V.SPECTRUM, (t + t2) / 2 / end);
        lctx.beginPath();
        lctx.moveTo(G.cx + p.px * s, G.cy + p.py * s);
        for (var u = t + stepA; u <= t2 + 1e-9; u += stepA) {
          q = at(Math.min(u, t2));
          lctx.lineTo(G.cx + q.px * s, G.cy + q.py * s);
        }
        q = at(t2);
        lctx.lineTo(G.cx + q.px * s, G.cy + q.py * s);
        lctx.stroke();
        p = q;
        t = t2;
      }
      drawnTo = theta;
    }

    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(236,232,223,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(G.cx, G.cy, RING * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.drawImage(layer, 0, 0, W, H);

    // The gear, its spokes and the pen.
    if (theta < end || !playing) {
      var g = at(theta), gx = G.cx + g.cx * s, gy = G.cy + g.cy * s;
      ctx.strokeStyle = 'rgba(236,232,223,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(gx, gy, gear * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(236,232,223,0.25)';
      ctx.beginPath();
      for (var k = 0; k < 3; k++) {
        var a = g.a + k * Math.PI * 2 / 3;
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + Math.cos(a) * gear * s, gy + Math.sin(a) * gear * s);
      }
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(G.cx + g.px * s, G.cy + g.py * s, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    var n = laps(), pts = RING / gcd(RING, gear);
    var lap = Math.min(n, Math.floor(theta / (Math.PI * 2)) + 1);
    V.setText(readout,
      'Ring ' + RING + ' teeth, gear ' + gear + ': they share a factor of ' + gcd(RING, gear) + '\n' +
      'Lap ' + lap + ' of ' + n + '   ' + pts + ' points');
  }

  V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    if (!playing && theta >= total()) restart();
    setPlaying(!playing);
  });

  V.ctl(section, 'redraw').addEventListener('click', function () {
    restart();
    setPlaying(true);
  });

  V.ctl(section, 'random').addEventListener('click', function () {
    var choices = [20, 24, 27, 30, 32, 35, 36, 40, 42, 45, 50, 52, 56, 60, 63, 64, 70, 72, 75, 80, 84];
    gearInput.value = choices[Math.floor(Math.random() * choices.length)];
    penInput.value = (0.35 + Math.random() * 0.6).toFixed(2);
    gearInput.dispatchEvent(new Event('input'));
    penInput.dispatchEvent(new Event('input'));
    setPlaying(true);
  });

  V.range(gearInput, V.ctl(section, 'gear-out'),
    function (v) { return v + ' teeth'; },
    function (v) { if (v !== gear) { gear = v; restart(); } });

  V.range(penInput, V.ctl(section, 'pen-out'),
    function (v) { return Math.round(v * 100) + '% out'; },
    function (v) { if (v !== pen) { pen = v; restart(); } });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return '×' + v; },
    function (v) { speed = v; });

  V.segmented(V.ctl(section, 'side'), function (v) {
    outside = v === 'outside';
    restart();
    setPlaying(true);
  });
})();
