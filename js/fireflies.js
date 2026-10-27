// The Kuramoto model: each firefly's phase θ runs at its own natural speed ω
// and is pulled toward the crowd's average phase ψ:  θ' = ω + K·r·sin(ψ − θ),
// where r (0 to 1) measures how bunched the phases are. A firefly flashes as θ wraps.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('fireflies');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var N = 150;
  var OMEGA = 2 * Math.PI * 0.75; // a flash about every 1.3 s
  var SIGMA = 0.45; // spread of natural speeds, rad/s
  var KC = SIGMA * Math.sqrt(8 / Math.PI); // critical coupling for a bell-curve spread
  var TWO_PI = Math.PI * 2;

  var flies = [];
  var coupling = 2; // in multiples of KC
  var r = 0, psi = 0, time = 0;
  var playing = !V.reducedMotion;
  var sprite = null, meadow = null, meadowKey = '';
  var history = new Float32Array(240), histHead = 0, histSize = 0, histClock = 0;

  // Standard normal by Box-Muller.
  function normal() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO_PI * v);
  }

  function populate() {
    flies = [];
    for (var i = 0; i < N; i++) {
      var x, y, tries = 0, ok;
      do {
        x = 0.04 + Math.random() * 0.92;
        y = 0.06 + Math.pow(Math.random(), 0.8) * 0.8;
        ok = true;
        for (var j = 0; j < flies.length && ok; j++) {
          if (Math.abs(flies[j].x - x) < 0.035 && Math.abs(flies[j].y - y) < 0.035) ok = false;
        }
      } while (!ok && ++tries < 30);
      flies.push({
        x: x, y: y, w: OMEGA + SIGMA * normal(), th: Math.random() * TWO_PI,
        wander: Math.random() * TWO_PI, size: 0.75 + Math.random() * 0.5
      });
    }
  }

  function scramble() {
    for (var i = 0; i < flies.length; i++) flies[i].th = Math.random() * TWO_PI;
    histSize = 0;
  }

  function order() {
    var c = 0, s = 0;
    for (var i = 0; i < flies.length; i++) { c += Math.cos(flies[i].th); s += Math.sin(flies[i].th); }
    r = Math.sqrt(c * c + s * s) / flies.length;
    psi = Math.atan2(s, c);
  }

  function step(h) {
    order();
    var K = coupling * KC;
    for (var i = 0; i < flies.length; i++) {
      var f = flies[i];
      f.th += h * (f.w + K * r * Math.sin(psi - f.th));
      if (f.th >= TWO_PI) f.th -= TWO_PI;
      else if (f.th < 0) f.th += TWO_PI;
    }
    time += h;
  }

  // Bright just after the phase wraps through zero, then a quick fade.
  function glow(th) {
    return th < 0.3 ? th / 0.3 : Math.exp(-(th - 0.3) / 0.8);
  }

  function makeSprite() {
    var c = document.createElement('canvas'), s = 64;
    c.width = c.height = s;
    var x = c.getContext('2d'), g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255, 244, 200, 1)');
    g.addColorStop(0.12, 'rgba(255, 220, 120, 0.9)');
    g.addColorStop(0.4, 'rgba(255, 180, 84, 0.25)');
    g.addColorStop(1, 'rgba(255, 180, 84, 0)');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    return c;
  }

  // Grass along the bottom, drawn once per size.
  function makeMeadow(st) {
    var c = document.createElement('canvas'), W = st.width, H = st.height;
    c.width = Math.round(W * st.dpr);
    c.height = Math.round(H * st.dpr);
    var x = c.getContext('2d');
    x.scale(st.dpr, st.dpr);
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var layer = 0; layer < 2; layer++) {
      x.fillStyle = layer ? '#0c1611' : '#101d17';
      x.beginPath();
      var count = Math.round(W / 5);
      for (var i = 0; i < count; i++) {
        var bx = rnd() * W, bh = H * (0.05 + rnd() * (layer ? 0.08 : 0.12)), lean = (rnd() - 0.5) * 18;
        x.moveTo(bx - 2.5, H);
        x.quadraticCurveTo(bx + lean * 0.3, H - bh * 0.6, bx + lean, H - bh);
        x.quadraticCurveTo(bx + lean * 0.3 + 1.5, H - bh * 0.5, bx + 2.5, H);
      }
      x.fill();
    }
    return c;
  }

  function frame(dt, st) {
    if (!sprite) { sprite = makeSprite(); populate(); order(); }
    var key = st.width + 'x' + st.height;
    if (key !== meadowKey) { meadow = makeMeadow(st); meadowKey = key; }

    if (playing) {
      var n = Math.max(1, Math.ceil(dt / 0.005));
      for (var i = 0; i < n; i++) step(dt / n);
      order();
      histClock += dt;
      if (histClock > 0.1) {
        histClock = 0;
        history[histHead] = r;
        histHead = (histHead + 1) % history.length;
        if (histSize < history.length) histSize++;
      }
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(meadow, 0, 0, W, H);

    var unit = Math.min(W, H) / 510;
    for (var i = 0; i < flies.length; i++) {
      var f = flies[i], b = glow(f.th);
      var x = (f.x + Math.sin(time * 0.31 + f.wander) * 0.006) * W;
      var y = (f.y + Math.cos(time * 0.23 + f.wander * 1.7) * 0.008) * H;
      // Every firefly keeps a dim ember, so the swarm is visible between flashes.
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#c9d98f';
      ctx.fillRect(x - 1, y - 1, 2, 2);
      if (b > 0.02) {
        var s = (20 + 36 * b) * f.size * unit;
        ctx.globalAlpha = b;
        ctx.drawImage(sprite, x - s / 2, y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    wheel(ctx, W, H);

    V.setText(readout, 'r = ' + r.toFixed(2) + '  (1 is all in step)\nCoupling ' + coupling.toFixed(2) + '× critical');
  }

  // Each firefly's place in its cycle on a circle, the average as an arrow,
  // and r over the last 24 seconds underneath.
  function wheel(ctx, W, H) {
    var R = Math.max(30, Math.min(52, Math.min(W, H) * 0.1));
    var cx = W - R - 18, cy = R + 18;
    ctx.fillStyle = 'rgba(10, 11, 16, 0.7)';
    ctx.strokeStyle = '#343a4e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TWO_PI);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffb454';
    for (var i = 0; i < flies.length; i++) {
      var th = flies[i].th, b = glow(th);
      ctx.globalAlpha = 0.35 + 0.65 * b;
      ctx.beginPath();
      // Phase zero (the flash) at the top, running clockwise.
      ctx.arc(cx + Math.sin(th) * R, cy - Math.cos(th) * R, 2.2, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    var ax = cx + Math.sin(psi) * R * r, ay = cy - Math.cos(psi) * R * r;
    ctx.strokeStyle = '#ece8df';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.fillStyle = '#ece8df';
    ctx.beginPath();
    ctx.arc(ax, ay, 3, 0, TWO_PI);
    ctx.fill();

    // r over time.
    var gw = R * 2, gh = 26, gx = cx - R, gy = cy + R + 12;
    ctx.strokeStyle = '#222534';
    ctx.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);
    if (histSize > 1) {
      ctx.strokeStyle = '#ffb454';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var k = 0; k < histSize; k++) {
        var v = history[(histHead - histSize + k + history.length) % history.length];
        var px = gx + gw * k / (history.length - 1), py = gy + gh - 2 - v * (gh - 4);
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'scramble').addEventListener('click', function () {
    if (!flies.length) return;
    scramble();
    order();
    stage.dirty = true;
  });

  V.range(V.ctl(section, 'k'), V.ctl(section, 'k-out'),
    function (v) { return v.toFixed(2) + '× critical'; },
    function (v) { coupling = v; if (stage) stage.dirty = true; });
})();
