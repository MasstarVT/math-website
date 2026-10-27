// Craig Reynolds' boids. Each bird only sees neighbors within a short radius
// and steers by three rules: keep apart (separation), match their heading
// (alignment) and head for their middle (cohesion). The pointer is a hawk.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('boids');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  // Heading colors, going once around the wheel.
  var WHEEL = [[126, 224, 161], [110, 231, 255], [124, 140, 255], [196, 107, 255], [255, 95, 162], [255, 180, 84], [126, 224, 161]];
  var HUES = [];
  for (var h = 0; h < 48; h++) HUES.push(V.gradient(WHEEL, h / 48));

  var weights = { sep: 1.5, ali: 1, coh: 1 };
  var playing = !V.reducedMotion;
  var boids = [];
  var W = 0, H = 0, unit = 1;
  var hawk = null; // pointer position while it's over the canvas

  function scatter() {
    var n = Math.round(Math.max(90, Math.min(240, W * H / 1500)));
    boids = [];
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = (0.6 + Math.random() * 0.4) * 0.2;
      boids.push({ x: Math.random(), y: Math.random() * H / W, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
    }
  }

  // Positions are in canvas widths, so the flock looks the same at any size.
  function step(dt) {
    var ar = H / W, R = 0.07, R2 = R * R, S = R * 0.4, S2 = S * S;
    var maxSpeed = 0.24, minSpeed = 0.1, maxTurn = 0.9;
    var hx = hawk ? hawk.x / W : 0, hy = hawk ? hawk.y / W : 0, HR = 0.16;
    var n = boids.length, i, j;
    // Bucket the birds into cells one sight-radius wide, so each bird only
    // checks the 9 cells around it.
    var gw = Math.ceil(1 / R) + 1, gh = Math.ceil(ar / R) + 1, grid = [];
    for (i = 0; i < n; i++) {
      var key = Math.floor(boids[i].y / R) * gw + Math.floor(boids[i].x / R);
      (grid[key] || (grid[key] = [])).push(boids[i]);
    }
    for (i = 0; i < n; i++) {
      var b = boids[i], ax = 0, ay = 0;
      var cx = 0, cy = 0, avx = 0, avy = 0, sx = 0, sy = 0, count = 0;
      var gx = Math.floor(b.x / R), gy = Math.floor(b.y / R);
      for (var qy = Math.max(0, gy - 1); qy <= Math.min(gh - 1, gy + 1); qy++) {
        for (var qx = Math.max(0, gx - 1); qx <= Math.min(gw - 1, gx + 1); qx++) {
          var cell = grid[qy * gw + qx];
          if (!cell) continue;
          for (j = 0; j < cell.length; j++) {
            var o = cell[j];
            if (o === b) continue;
            var dx = o.x - b.x, dy = o.y - b.y, d2 = dx * dx + dy * dy;
            if (d2 > R2) continue;
            count++;
            cx += dx;
            cy += dy;
            avx += o.vx;
            avy += o.vy;
            if (d2 < S2 && d2 > 1e-10) {
              var d = Math.sqrt(d2);
              sx -= dx / d * (S - d) / S;
              sy -= dy / d * (S - d) / S;
            }
          }
        }
      }
      if (count) {
        ax += (cx / count) * 3 * weights.coh;
        ay += (cy / count) * 3 * weights.coh;
        ax += (avx / count - b.vx) * 2.4 * weights.ali;
        ay += (avy / count - b.vy) * 2.4 * weights.ali;
        ax += sx * 0.9 * weights.sep;
        ay += sy * 0.9 * weights.sep;
      }
      var al = Math.sqrt(ax * ax + ay * ay);
      if (al > maxTurn) { ax *= maxTurn / al; ay *= maxTurn / al; }
      // The hawk: flee hard, more the closer it is.
      if (hawk) {
        var px = b.x - hx, py = b.y - hy, pd = Math.sqrt(px * px + py * py);
        if (pd < HR && pd > 1e-6) {
          var push = (HR - pd) / HR;
          ax += px / pd * push * 3;
          ay += py / pd * push * 3;
        }
      }
      // Soft walls.
      var m = 0.06;
      if (b.x < m) ax += (m - b.x) * 14;
      if (b.x > 1 - m) ax -= (b.x - 1 + m) * 14;
      if (b.y < m) ay += (m - b.y) * 14;
      if (b.y > ar - m) ay -= (b.y - ar + m) * 14;
      b.ax = ax;
      b.ay = ay;
    }
    for (i = 0; i < n; i++) {
      b = boids[i];
      b.vx += b.ax * dt;
      b.vy += b.ay * dt;
      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      var lim = hawk ? maxSpeed * 1.5 : maxSpeed;
      if (sp > lim) { b.vx *= lim / sp; b.vy *= lim / sp; }
      else if (sp < minSpeed) { b.vx *= minSpeed / (sp || 1); b.vy *= minSpeed / (sp || 1); }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.x = Math.max(0.002, Math.min(0.998, b.x));
      b.y = Math.max(0.002, Math.min(ar - 0.002, b.y));
    }
  }

  function frame(dt, st) {
    if (W !== st.width || H !== st.height) {
      var first = !W;
      W = st.width;
      H = st.height;
      unit = Math.max(0.8, Math.min(1.2, Math.sqrt(W * H) / 560));
      if (first) {
        scatter();
        // Let the flocks form before the first picture.
        for (var w = 0; w < 120; w++) step(1 / 60);
      }
    }
    if (playing) {
      var sub = Math.max(1, Math.ceil(dt / 0.02));
      for (var s = 0; s < sub; s++) step(Math.min(dt, 0.05) / sub);
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx;
    ctx.clearRect(0, 0, W, H);

    if (hawk) {
      var g = ctx.createRadialGradient(hawk.x, hawk.y, 0, hawk.x, hawk.y, W * 0.16);
      g.addColorStop(0, 'rgba(255, 95, 162, 0.16)');
      g.addColorStop(1, 'rgba(255, 95, 162, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(hawk.x, hawk.y, W * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff5fa2';
      ctx.beginPath();
      ctx.arc(hawk.x, hawk.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bucket the birds by heading color so each color is one path.
    var len = 7.5 * unit, wid = 3.3 * unit, sumx = 0, sumy = 0, buckets = [];
    for (var i = 0; i < boids.length; i++) {
      var b = boids[i];
      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
      b.ux = b.vx / sp;
      b.uy = b.vy / sp;
      sumx += b.ux;
      sumy += b.uy;
      var hue = Math.floor((Math.atan2(b.uy, b.ux) / (Math.PI * 2) + 1) * 48) % 48;
      (buckets[hue] || (buckets[hue] = [])).push(b);
    }
    ctx.lineWidth = 1.2;
    for (var k = 0; k < 48; k++) {
      var list = buckets[k];
      if (!list) continue;
      // A faint streak behind each bird, then the bodies.
      ctx.strokeStyle = ctx.fillStyle = HUES[k];
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      for (var j = 0; j < list.length; j++) {
        b = list[j];
        var x = b.x * W, y = b.y * W, ux = b.ux, uy = b.uy;
        ctx.moveTo(x - ux * len * 0.6, y - uy * len * 0.6);
        ctx.lineTo(x - ux * len * 2.6, y - uy * len * 2.6);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      for (j = 0; j < list.length; j++) {
        b = list[j];
        x = b.x * W;
        y = b.y * W;
        ux = b.ux;
        uy = b.uy;
        ctx.moveTo(x + ux * len, y + uy * len);
        ctx.lineTo(x - ux * len * 0.6 - uy * wid, y - uy * len * 0.6 + ux * wid);
        ctx.lineTo(x - ux * len * 0.3, y - uy * len * 0.3);
        ctx.lineTo(x - ux * len * 0.6 + uy * wid, y - uy * len * 0.6 - ux * wid);
        ctx.closePath();
      }
      ctx.fill();
    }
    var together = Math.sqrt(sumx * sumx + sumy * sumy) / boids.length;
    V.setText(readout, boids.length + ' birds\nHeading the same way ' + Math.round(together * 100) + '%');
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- The hawk ----
  // No preventDefault, so a finger on a phone still scrolls the page.

  function at(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' && !e.buttons && !hawk) return;
    hawk = at(e);
    stage.dirty = true;
  });
  canvas.addEventListener('pointerdown', function (e) {
    hawk = at(e);
    stage.dirty = true;
  });
  function away(e) {
    if (e.pointerType === 'mouse' && e.type === 'pointerup') return;
    hawk = null;
    stage.dirty = true;
  }
  canvas.addEventListener('pointerleave', away);
  canvas.addEventListener('pointerup', away);
  canvas.addEventListener('pointercancel', away);

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'scatter').addEventListener('click', function () {
    if (!W) return;
    scatter();
    stage.dirty = true;
  });

  ['sep', 'ali', 'coh'].forEach(function (k) {
    V.range(V.ctl(section, k), V.ctl(section, k + '-out'),
      function (v) { return v.toFixed(1) + '×'; },
      function (v) { weights[k] = v; });
  });
})();
