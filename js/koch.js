// The Koch snowflake: split every edge into thirds and raise an equilateral
// bump on the middle third. Each round multiplies the perimeter by 4/3, but
// the added area shrinks fast enough that the total stays finite.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('koch');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var levelInput = V.ctl(section, 'level');
  var levelOut = V.ctl(section, 'level-out');
  var playBtn = V.ctl(section, 'play');

  var MAX = 7;
  var H3 = Math.sqrt(3) / 6;
  var sign = 1;          // 1 bumps outward, -1 inward (anti-snowflake)
  var target = 0;
  var shown = 0;         // eased level, fractional while a round grows in
  var playing = !V.reducedMotion;
  var hold = 0;
  var cache = {};        // whole levels, as flat [x0, y0, x1, y1, ...] arrays
  var lens = null;       // magnifier position in CSS pixels

  function base() {
    var pts = [];
    for (var i = 0; i < 3; i++) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / 3;
      pts.push(Math.cos(a), Math.sin(a));
    }
    return pts;
  }

  // Replace each edge with four. t scales the bump, so 0 is still flat.
  function grow(pts, t) {
    var n = pts.length / 2, out = new Float64Array(n * 8), o = 0;
    for (var i = 0; i < n; i++) {
      var ax = pts[i * 2], ay = pts[i * 2 + 1];
      var j = (i + 1) % n, bx = pts[j * 2], by = pts[j * 2 + 1];
      var dx = bx - ax, dy = by - ay, h = H3 * t * sign;
      out[o++] = ax; out[o++] = ay;
      out[o++] = ax + dx / 3; out[o++] = ay + dy / 3;
      out[o++] = ax + dx / 2 + dy * h; out[o++] = ay + dy / 2 - dx * h;
      out[o++] = ax + dx * 2 / 3; out[o++] = ay + dy * 2 / 3;
    }
    return out;
  }

  function level(k) {
    if (!cache[k]) cache[k] = k === 0 ? base() : grow(level(k - 1), 1);
    return cache[k];
  }

  function shape() {
    var k = Math.floor(shown), f = shown - k;
    return f > 0.001 ? grow(level(k), V.easeInOut(f)) : level(k);
  }

  function path(ctx, pts, cx, cy, R) {
    ctx.beginPath();
    ctx.moveTo(cx + pts[0] * R, cy + pts[1] * R);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(cx + pts[i] * R, cy + pts[i + 1] * R);
    ctx.closePath();
  }

  function draw(ctx, pts, cx, cy, R, width) {
    path(ctx, pts, cx, cy, R);
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, 'rgba(110,231,255,0.16)');
    g.addColorStop(1, 'rgba(124,140,255,0.06)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#6ee7ff';
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function frame(dt, st) {
    if (playing) {
      if (Math.abs(shown - target) < 0.001) {
        hold += dt;
        if (hold > (target === MAX - 1 ? 2.5 : 1.1)) {
          hold = 0;
          setTarget(target === MAX - 1 ? 0 : target + 1);
        }
      }
    }
    var speed = target < shown ? 4 : 1.2;
    if (shown < target) shown = Math.min(target, shown + dt * speed);
    else if (shown > target) shown = Math.max(target, shown - dt * speed);
    if (V.reducedMotion) shown = target;

    var W = st.width, H = st.height, ctx = st.ctx;
    var R = Math.min(W, H) * 0.46;
    // The anti-snowflake stays inside the triangle, so center the triangle.
    var cx = W / 2, cy = H / 2 + (sign > 0 ? 0 : R * 0.25);
    var pts = shape();

    ctx.clearRect(0, 0, W, H);
    draw(ctx, pts, cx, cy, R, 1.25);

    // Magnifier: the same edge, four times closer.
    if (lens) {
      var LR = Math.min(W, H) * 0.2, Z = 4;
      ctx.save();
      ctx.beginPath();
      ctx.arc(lens.x, lens.y, LR, 0, Math.PI * 2);
      ctx.fillStyle = '#0d0f16';
      ctx.fill();
      ctx.clip();
      draw(ctx, pts, lens.x + (cx - lens.x) * Z, lens.y + (cy - lens.y) * Z, R * Z, 1.5);
      ctx.restore();
      ctx.strokeStyle = 'rgba(236,232,223,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(lens.x, lens.y, LR, 0, Math.PI * 2);
      ctx.stroke();
    }

    var n = target;
    var perim = Math.pow(4 / 3, n);
    var area = 1 + sign * 0.6 * (1 - Math.pow(4 / 9, n));
    V.setText(readout,
      'Round ' + n + '   edges ' + (3 * Math.pow(4, n)).toLocaleString() + '\n' +
      'Perimeter ×' + perim.toFixed(3) + '   area ×' + area.toFixed(4));
  }

  V.createStage(canvas, { frame: frame });

  // ---- Magnifier ----

  function pointAt(e) {
    var b = canvas.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }
  canvas.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') lens = pointAt(e); });
  canvas.addEventListener('pointerdown', function (e) { lens = pointAt(e); });
  canvas.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') lens = null; });

  // ---- Controls ----

  function setTarget(k) {
    target = k;
    levelInput.value = k;
    levelOut.textContent = String(k);
  }

  function setPlaying(p) {
    playing = p;
    hold = 0;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  levelInput.addEventListener('input', function () {
    setPlaying(false);
    setTarget(parseInt(levelInput.value, 10));
  });
  setTarget(V.reducedMotion ? 4 : 0);

  V.segmented(V.ctl(section, 'shape'), function (v) {
    sign = v === 'anti' ? -1 : 1;
    cache = {};
  });
})();
