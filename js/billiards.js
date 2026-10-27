// Billiards: a ball rolls in straight lines and bounces off the cushion with
// the angle in equal to the angle out. Every bounce is found exactly, so any
// drift between balls comes from the table's shape, not from rounding steps.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('billiards');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var OFFSET = 0.0001 * Math.PI / 180; // between neighboring balls' starting directions
  var EPS = 1e-9;
  var SPEED = 3; // table units per second
  var COLORS = ['#a78bfa', '#6ee7ff', '#ff5fa2', '#ffb454', '#7ee0a1'];

  // Stadium: straight sides of half-length SL, ends are half circles of radius 1.
  var SL = 0.8, EA = 1.5, EB = 1;
  var TABLES = {
    circle: { w: 2, h: 2, start: [0.35, -0.25], angle: 1.05 },
    ellipse: { w: EA * 2, h: EB * 2, start: [0.45, 0.2], angle: 0.85 },
    stadium: { w: SL * 2 + 2, h: 2, start: [-0.3, 0.35], angle: 0.62 }
  };

  var table = 'stadium', count = 3, speed = 1;
  var balls = [];
  var start = null; // { x, y, a }
  var bounces = 0;
  var playing = !V.reducedMotion;
  var ink = document.createElement('canvas');
  var ictx = ink.getContext('2d');
  var view = null, aim = null;

  // ---- Exact bounces ----

  // Distance along a unit direction to the far side of a circle.
  function exitCircle(px, py, dx, dy, cx, cy, r) {
    var ox = px - cx, oy = py - cy, b = ox * dx + oy * dy, c = ox * ox + oy * oy - r * r, disc = b * b - c;
    return disc < 0 ? -1 : -b + Math.sqrt(disc);
  }

  // Next hit from (px, py) going (dx, dy): distance t and outward normal.
  function nextHit(px, py, dx, dy) {
    var t, nx, ny;
    if (table === 'circle') {
      t = exitCircle(px, py, dx, dy, 0, 0, 1);
      nx = px + t * dx;
      ny = py + t * dy;
    } else if (table === 'ellipse') {
      var A2 = EA * EA, B2 = EB * EB;
      var qa = dx * dx / A2 + dy * dy / B2, qb = px * dx / A2 + py * dy / B2, qc = px * px / A2 + py * py / B2 - 1;
      t = (-qb + Math.sqrt(Math.max(0, qb * qb - qa * qc))) / qa;
      nx = (px + t * dx) / A2;
      ny = (py + t * dy) / B2;
    } else {
      t = Infinity;
      for (var s = -1; s <= 1; s += 2) {
        if (Math.abs(dy) > 1e-15) {
          var tw = (s - py) / dy;
          if (tw > EPS && tw < t && Math.abs(px + tw * dx) <= SL + 1e-9) { t = tw; nx = 0; ny = s; }
        }
        var tc = exitCircle(px, py, dx, dy, s * SL, 0, 1);
        if (tc > EPS && tc < t && s * (px + tc * dx) >= SL - 1e-9) {
          t = tc;
          nx = px + tc * dx - s * SL;
          ny = py + tc * dy;
        }
      }
    }
    var l = Math.sqrt(nx * nx + ny * ny);
    return { t: t, nx: nx / l, ny: ny / l };
  }

  function aimBall(b) {
    var h = nextHit(b.x, b.y, b.dx, b.dy);
    b.left = h.t;
    b.nx = h.nx;
    b.ny = h.ny;
  }

  function reset() {
    var T = TABLES[table];
    if (!start) start = { x: T.start[0], y: T.start[1], a: T.angle };
    balls = [];
    for (var i = 0; i < count; i++) {
      var a = start.a + i * OFFSET;
      var b = { x: start.x, y: start.y, dx: Math.cos(a), dy: Math.sin(a), trail: [], color: COLORS[i % COLORS.length] };
      aimBall(b);
      balls.push(b);
    }
    bounces = 0;
    ictx.setTransform(1, 0, 0, 1, 0, 0);
    ictx.clearRect(0, 0, ink.width, ink.height);
    if (stage) stage.dirty = true;
  }

  // Roll a ball a distance, bouncing as needed, and ink the path it covers.
  function roll(b, dist, first) {
    var x0 = b.x, y0 = b.y;
    ictx.beginPath();
    ictx.moveTo(X(x0), Y(y0));
    while (dist >= b.left) {
      dist -= b.left;
      b.x += b.dx * b.left;
      b.y += b.dy * b.left;
      ictx.lineTo(X(b.x), Y(b.y));
      var dn = b.dx * b.nx + b.dy * b.ny;
      b.dx -= 2 * dn * b.nx;
      b.dy -= 2 * dn * b.ny;
      var l = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
      b.dx /= l;
      b.dy /= l;
      b.trail.push(b.x, b.y);
      if (first) bounces++;
      aimBall(b);
    }
    b.x += b.dx * dist;
    b.y += b.dy * dist;
    b.left -= dist;
    ictx.lineTo(X(b.x), Y(b.y));
    ictx.strokeStyle = b.color;
    ictx.stroke();
    if (b.trail.length > 8) b.trail.splice(0, b.trail.length - 8);
  }

  // ---- Drawing ----

  function fit(st) {
    var T = TABLES[table], pad = 26;
    var s = Math.min((st.width - pad * 2) / T.w, (st.height - pad * 2 - 30) / T.h);
    return { s: s, cx: st.width / 2, cy: st.height / 2 + 12 };
  }
  function X(x) { return (view.cx + x * view.s) * inkScale; }
  function Y(y) { return (view.cy - y * view.s) * inkScale; }
  var inkScale = 1;

  function outline(ctx, k) {
    var s = view.s * k, cx = view.cx * k, cy = view.cy * k;
    ctx.beginPath();
    if (table === 'circle') ctx.arc(cx, cy, s, 0, Math.PI * 2);
    else if (table === 'ellipse') ctx.ellipse(cx, cy, EA * s, EB * s, 0, 0, Math.PI * 2);
    else {
      ctx.moveTo(cx - SL * s, cy - s);
      ctx.lineTo(cx + SL * s, cy - s);
      ctx.arc(cx + SL * s, cy, s, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(cx - SL * s, cy + s);
      ctx.arc(cx - SL * s, cy, s, Math.PI / 2, Math.PI * 1.5);
    }
    ctx.closePath();
  }

  function frame(dt, st) {
    var v = fit(st);
    if (!view || v.s !== view.s || v.cx !== view.cx || v.cy !== view.cy || ink.width !== Math.round(st.width * st.dpr)) {
      view = v;
      inkScale = st.dpr;
      ink.width = Math.round(st.width * st.dpr);
      ink.height = Math.round(st.height * st.dpr);
      reset();
    }

    if (playing && !aim) {
      ictx.lineWidth = 1.1 * inkScale;
      ictx.globalAlpha = count > 1 ? 0.13 : 0.2;
      var d = Math.min(dt, 0.05) * SPEED * speed;
      for (var i = 0; i < balls.length; i++) roll(balls[i], d, i === 0);
      ictx.globalAlpha = 1;
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx;
    ctx.clearRect(0, 0, st.width, st.height);

    outline(ctx, 1);
    ctx.fillStyle = '#0a0b10';
    ctx.fill();
    ctx.drawImage(ink, 0, 0, st.width, st.height);
    outline(ctx, 1);
    ctx.strokeStyle = '#4a5068';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Bright tails back through the last few bounces, then the balls.
    for (var i = balls.length - 1; i >= 0; i--) {
      var b = balls[i];
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(view.cx + b.x * view.s, view.cy - b.y * view.s);
      for (var k = b.trail.length - 2; k >= Math.max(0, b.trail.length - 4); k -= 2) {
        ctx.lineTo(view.cx + b.trail[k] * view.s, view.cy - b.trail[k + 1] * view.s);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(view.cx + b.x * view.s, view.cy - b.y * view.s, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (aim) {
      var ax = view.cx + start.x * view.s, ay = view.cy - start.y * view.s;
      ctx.strokeStyle = '#ece8df';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + Math.cos(start.a) * 46, ay - Math.sin(start.a) * 46);
      ctx.stroke();
      ctx.save();
      ctx.translate(ax + Math.cos(start.a) * 46, ay - Math.sin(start.a) * 46);
      ctx.rotate(-start.a);
      ctx.fillStyle = '#ece8df';
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-5, -5);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    var text = 'Bounces ' + bounces;
    if (balls.length > 1) text += '\nWidest gap ' + sci(gap());
    V.setText(readout, text);
  }

  function gap() {
    var worst = 0;
    for (var i = 1; i < balls.length; i++) {
      worst = Math.max(worst, Math.hypot(balls[i].x - balls[0].x, balls[i].y - balls[0].y));
    }
    return worst;
  }

  // 0.000012 -> "1.2 × 10⁻⁵", in table radii.
  function sci(v) {
    if (v >= 0.01) return v.toFixed(2);
    if (v <= 0) return '0';
    var e = Math.floor(Math.log10(v)), m = v / Math.pow(10, e);
    var sup = '⁰¹²³⁴⁵⁶⁷⁸⁹', s = String(-e).split('').map(function (c) { return sup[+c]; }).join('');
    return m.toFixed(1) + ' × 10⁻' + s;
  }

  var stage = null;
  stage = V.createStage(canvas, { frame: frame });

  // ---- Aim: press to place the ball, drag to point it ----

  function toTable(px, py) {
    return { x: (px - view.cx) / view.s, y: (view.cy - py) / view.s };
  }
  function inside(p) {
    if (table === 'circle') return p.x * p.x + p.y * p.y < 0.92;
    if (table === 'ellipse') return p.x * p.x / (EA * EA) + p.y * p.y / (EB * EB) < 0.92;
    var ex = Math.max(0, Math.abs(p.x) - SL);
    return ex * ex + p.y * p.y < 0.92;
  }

  V.drag(canvas, {
    cursor: 'crosshair',
    hit: function (px, py) {
      if (!view) return null;
      var p = toTable(px, py);
      return inside(p) ? { x: p.x, y: p.y } : null;
    },
    move: function (h, px, py, first) {
      if (first) {
        aim = h;
        start = { x: h.x, y: h.y, a: start ? start.a : 0.6 };
      } else {
        var p = toTable(px, py), dx = p.x - h.x, dy = p.y - h.y;
        if (dx * dx + dy * dy > 0.0004) start.a = Math.atan2(dy, dx);
      }
      reset();
    },
    end: function () {
      aim = null;
      reset();
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
    start = null;
    if (view) reset();
  });

  V.segmented(V.ctl(section, 'table'), function (t) {
    table = t;
    start = null;
    view = null;
  });

  V.segmented(V.ctl(section, 'count'), function (v) {
    count = +v;
    if (view) reset();
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return v.toFixed(2) + '×'; },
    function (v) { speed = v; });
})();
