// A square with its edges glued. Leaving through one edge brings you back
// through its partner; a flipped pair (Klein bottle, projective plane) also
// mirrors you. Only the torus can fold up in 3D without crossing itself.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('torus');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var glueGroup = V.ctl(section, 'glue');
  var foldBtn = V.ctl(section, 'fold');
  var trailBtn = V.ctl(section, 'trail');
  var playBtn = V.ctl(section, 'play');

  var TAU = Math.PI * 2;
  var AMBER = '#ffb454', CYAN = '#6ee7ff', PINK = '#ff5fa2';
  var SPEED = 0.17;
  var TRAIL = 900;

  // flipX: the left and right edges are glued with a flip; flipY: top and bottom.
  var GLUES = {
    torus: { flipX: false, flipY: false, name: 'Torus' },
    klein: { flipX: true, flipY: false, name: 'Klein bottle' },
    projective: { flipX: true, flipY: true, name: 'Projective plane' }
  };
  var glue = GLUES.torus;
  var ship = { x: 0.3, y: 0.62, dx: Math.cos(-0.42), dy: Math.sin(-0.42), mirror: false };
  var target = null;
  var trail = [];          // [x, y] points, or null where the ship jumped an edge
  var showTrail = true;
  var playing = !V.reducedMotion;
  var crossings = 0;
  var flash = { x: 0, y: 0 };
  var turn = 0;            // from the arrow keys
  var wander = 0;
  var fold = 0, folding = false;
  var box = null;
  var W = 0, H = 0;

  // ---- Moving ----

  // Carry a point (and its heading) back into the square after it leaves.
  function wrap(s) {
    var crossed = '';
    if (s.x >= 1 || s.x < 0) {
      s.x += s.x >= 1 ? -1 : 1;
      if (glue.flipX) { s.y = 1 - s.y; s.dy = -s.dy; s.mirror = !s.mirror; }
      crossed = 'x';
    }
    if (s.y >= 1 || s.y < 0) {
      s.y += s.y >= 1 ? -1 : 1;
      if (glue.flipY) { s.x = 1 - s.x; s.dx = -s.dx; s.mirror = !s.mirror; }
      crossed = 'y';
    }
    return crossed;
  }

  function step(dt) {
    var steer = turn * 2.4;
    if (target) {
      var want = Math.atan2(target.y - ship.y, target.x - ship.x), now = Math.atan2(ship.dy, ship.dx);
      var d = Math.atan2(Math.sin(want - now), Math.cos(want - now));
      steer += Math.max(-2.6, Math.min(2.6, d * 4));
      if (Math.hypot(target.x - ship.x, target.y - ship.y) < 0.025) target = null;
    } else if (!turn) {
      wander += dt;
      steer += Math.sin(wander * 0.45) * 0.35;
    }
    var a = Math.atan2(ship.dy, ship.dx) + steer * dt;
    ship.dx = Math.cos(a);
    ship.dy = Math.sin(a);
    ship.x += ship.dx * SPEED * dt;
    ship.y += ship.dy * SPEED * dt;
    var c = wrap(ship);
    if (c) {
      crossings++;
      flash[c] = 1;
      trail.push(null);
      target = null;
    }
    trail.push([ship.x, ship.y]);
    if (trail.length > TRAIL) trail.splice(0, trail.length - TRAIL);
  }

  // ---- Flat view ----

  function layout() {
    var top = 84, bottom = 22;
    var S = Math.min(H - top - bottom, W - 44);
    box = { x: (W - S) / 2, y: top, s: S };
  }

  function arrow(ctx, x0, y0, x1, y1, color, count, glow) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 + glow * 3;
    ctx.globalAlpha = 0.75 + glow * 0.25;
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 14 * glow; }
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.shadowBlur = 0;
    var ux = (x1 - x0), uy = (y1 - y0), l = Math.hypot(ux, uy);
    ux /= l; uy /= l;
    var mx = (x0 + x1) / 2, my = (y0 + y1) / 2, size = 9;
    ctx.lineWidth = 3;
    for (var k = 0; k < count; k++) {
      var cx = mx + ux * (k - (count - 1) / 2) * 11, cy = my + uy * (k - (count - 1) / 2) * 11;
      ctx.beginPath();
      ctx.moveTo(cx - ux * size - uy * size, cy - uy * size + ux * size);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx - ux * size + uy * size, cy - uy * size - ux * size);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawShip(ctx, s, size) {
    var fx = s.dx, fy = s.dy, lx = fy, ly = -fx;   // left of the heading, with y pointing down
    if (s.mirror) { lx = -lx; ly = -ly; }
    function pt(f, l) { return [s.px + fx * f * size + lx * l * size, s.py + fy * f * size + ly * l * size]; }
    var nose = pt(1.1, 0), tail = pt(-0.55, 0), left = pt(-0.75, 0.85), right = pt(-0.75, -0.85);
    ctx.beginPath();
    ctx.moveTo(nose[0], nose[1]); ctx.lineTo(left[0], left[1]); ctx.lineTo(tail[0], tail[1]); ctx.closePath();
    ctx.fillStyle = PINK;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(nose[0], nose[1]); ctx.lineTo(right[0], right[1]); ctx.lineTo(tail[0], tail[1]); ctx.closePath();
    ctx.fillStyle = CYAN;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(nose[0], nose[1]); ctx.lineTo(left[0], left[1]); ctx.lineTo(tail[0], tail[1]); ctx.lineTo(right[0], right[1]); ctx.closePath();
    ctx.strokeStyle = '#0a0b10';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // The ship, plus its copies just past each glued edge, so it slides through.
  function shipImages() {
    var list = [{ x: ship.x, y: ship.y, dx: ship.dx, dy: ship.dy, mirror: ship.mirror }];
    [-1, 0, 1].forEach(function (a) {
      [-1, 0, 1].forEach(function (b) {
        if (!a && !b) return;
        var s = { x: ship.x, y: ship.y, dx: ship.dx, dy: ship.dy, mirror: ship.mirror };
        if (a) { s.x -= a; if (glue.flipX) { s.y = 1 - s.y; s.dy = -s.dy; s.mirror = !s.mirror; } }
        if (b) { s.y -= b; if (glue.flipY) { s.x = 1 - s.x; s.dx = -s.dx; s.mirror = !s.mirror; } }
        list.push(s);
      });
    });
    return list;
  }

  function drawFlat(ctx) {
    var B = box, n = 6, i;
    ctx.fillStyle = 'rgba(255,180,84,0.035)';
    ctx.fillRect(B.x, B.y, B.s, B.s);
    ctx.strokeStyle = 'rgba(236,232,223,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (i = 1; i < n; i++) {
      ctx.moveTo(B.x + B.s * i / n, B.y); ctx.lineTo(B.x + B.s * i / n, B.y + B.s);
      ctx.moveTo(B.x, B.y + B.s * i / n); ctx.lineTo(B.x + B.s, B.y + B.s * i / n);
    }
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(B.x, B.y, B.s, B.s);
    ctx.clip();

    if (showTrail) drawTrail(ctx);
    if (target) {
      var tx = B.x + target.x * B.s, ty = B.y + target.y * B.s;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(tx, ty, 7, 0, TAU);
      ctx.moveTo(tx - 12, ty); ctx.lineTo(tx - 4, ty);
      ctx.moveTo(tx + 4, ty); ctx.lineTo(tx + 12, ty);
      ctx.moveTo(tx, ty - 12); ctx.lineTo(tx, ty - 4);
      ctx.moveTo(tx, ty + 4); ctx.lineTo(tx, ty + 12);
      ctx.stroke();
    }
    var size = Math.max(10, B.s * 0.038);
    shipImages().forEach(function (s) {
      s.px = B.x + s.x * B.s;
      s.py = B.y + s.y * B.s;
      if (s.px < B.x - size * 2 || s.px > B.x + B.s + size * 2 || s.py < B.y - size * 2 || s.py > B.y + B.s + size * 2) return;
      drawShip(ctx, s, size);
    });
    ctx.restore();

    // The edges and their gluing arrows: matching arrows are glued together.
    var x0 = B.x, y0 = B.y, x1 = B.x + B.s, y1 = B.y + B.s;
    arrow(ctx, x0, y1, x1, y1, AMBER, 1, flash.y);
    if (glue.flipY) arrow(ctx, x1, y0, x0, y0, AMBER, 1, flash.y);
    else arrow(ctx, x0, y0, x1, y0, AMBER, 1, flash.y);
    arrow(ctx, x0, y1, x0, y0, CYAN, 2, flash.x);
    if (glue.flipX) arrow(ctx, x1, y0, x1, y1, CYAN, 2, flash.x);
    else arrow(ctx, x1, y1, x1, y0, CYAN, 2, flash.x);
  }

  function drawTrail(ctx) {
    var B = box, n = trail.length, buckets = 6;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (var k = 0; k < buckets; k++) {
      var from = Math.floor(n * k / buckets), to = Math.floor(n * (k + 1) / buckets);
      ctx.strokeStyle = 'rgba(255,209,102,' + (0.08 + 0.6 * (k + 1) / buckets) + ')';
      ctx.beginPath();
      var pen = false;
      for (var i = Math.max(0, from - 1); i < to; i++) {
        var p = trail[i];
        if (!p) { pen = false; continue; }
        var x = B.x + p[0] * B.s, y = B.y + p[1] * B.s;
        if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        pen = true;
      }
      ctx.stroke();
    }
  }

  // ---- Folding into a doughnut (torus only) ----

  var NU = 40, NV = 20;

  // Roll top to bottom into a tube, then bend the tube round. a and b run 0..1.
  function surf(u, v, a, b, out) {
    var X = u - 0.5, Y = v - 0.5, Z = 0;
    if (a > 1e-4) {
      var rho = 1 / (TAU * a), ph = Y * TAU * a;
      Y = rho * Math.sin(ph);
      Z = rho * (1 - Math.cos(ph)) - rho;
    } else {
      Z = 0;
    }
    // Z is now measured from the tube's axis (for the flat sheet, a = 0, the "axis" is far away).
    var axisZ = a > 1e-4 ? 1 / (TAU * a) : 0;
    if (b > 1e-4) {
      var len = 1 + 1.4 * b, Rb = len / (TAU * b), th = X * TAU * b;
      var rx = Math.sin(th), ry = Math.cos(th);
      out[0] = Rb * rx + Y * rx;
      out[1] = -Rb * (1 - ry) + Y * ry;
      out[2] = Z + axisZ;
    } else {
      out[0] = X;
      out[1] = Y;
      out[2] = Z + axisZ;
    }
    return out;
  }

  function drawFold(ctx, t) {
    var a = Math.min(1, t * 2), b = Math.max(0, t * 2 - 1);
    a = V.easeInOut(a);
    b = V.easeInOut(b);
    var pitch = 0.95 * V.easeInOut(t), yawA = 0.35 * Math.sin(t * Math.PI) + 0.25 * t;
    var cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yawA), sy = Math.sin(yawA);
    var unit = Math.min(W, H) * (0.78 - 0.18 * t), cx = W / 2, cyS = H / 2 + 22;
    var pts = [], i, j, mx = 0, my = 0, mz = 0, tmp = [0, 0, 0];
    for (i = 0; i <= NU; i++) {
      for (j = 0; j <= NV; j++) {
        surf(i / NU, j / NV, a, b, tmp);
        pts.push(tmp[0], tmp[1], tmp[2]);
        mx += tmp[0]; my += tmp[1]; mz += tmp[2];
      }
    }
    var N = (NU + 1) * (NV + 1);
    mx /= N; my /= N; mz /= N;
    // Camera: x right, y down the screen, z toward the viewer.
    function view(x, y, z, out) {
      x -= mx; y -= my; z -= mz;
      var x1 = x * cy - z * sy, z1 = x * sy + z * cy;
      var y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      var k = 4 / (4 - z2);
      out[0] = cx + x1 * k * unit;
      out[1] = cyS + y2 * k * unit;
      out[2] = z2;
      return out;
    }
    var S = new Float32Array(N * 3), o = [0, 0, 0];
    for (i = 0; i < N; i++) {
      view(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], o);
      S[i * 3] = o[0]; S[i * 3 + 1] = o[1]; S[i * 3 + 2] = o[2];
    }
    var quads = [];
    for (i = 0; i < NU; i++) {
      for (j = 0; j < NV; j++) {
        var q0 = i * (NV + 1) + j, q1 = (i + 1) * (NV + 1) + j, q2 = q1 + 1, q3 = q0 + 1;
        var z = (S[q0 * 3 + 2] + S[q1 * 3 + 2] + S[q2 * 3 + 2] + S[q3 * 3 + 2]) / 4;
        var ex = S[q2 * 3] - S[q0 * 3], ey = S[q2 * 3 + 1] - S[q0 * 3 + 1];
        var fx = S[q3 * 3] - S[q1 * 3], fy = S[q3 * 3 + 1] - S[q1 * 3 + 1];
        var area = Math.abs(ex * fy - ey * fx), span = Math.hypot(ex, ey) * Math.hypot(fx, fy) || 1;
        quads.push({ i: i, j: j, z: z, q: [q0, q1, q2, q3], shade: 0.3 + 0.7 * Math.min(1, area / span) });
      }
    }
    quads.sort(function (p, q) { return p.z - q.z; });

    // Trail pieces, filed under the quad they sit on.
    var onQuad = {};
    if (showTrail) {
      for (i = 1; i < trail.length; i++) {
        var p0 = trail[i - 1], p1 = trail[i];
        if (!p0 || !p1) continue;
        var key = Math.min(NU - 1, Math.floor(p1[0] * NU)) * NV + Math.min(NV - 1, Math.floor(p1[1] * NV));
        (onQuad[key] = onQuad[key] || []).push(p0, p1, i / trail.length);
      }
    }
    var shipKey = Math.min(NU - 1, Math.floor(ship.x * NU)) * NV + Math.min(NV - 1, Math.floor(ship.y * NV));

    var c1 = [0, 0, 0], c2 = [0, 0, 0];
    function onSurface(p, out) {
      surf(p[0], p[1], a, b, tmp);
      return view(tmp[0], tmp[1], tmp[2], out);
    }
    quads.forEach(function (Q) {
      var check = (Math.floor(Q.i / (NU / 6)) + Math.floor(Q.j / (NV / 6))) % 2;
      var base = check ? [92, 102, 140] : [66, 74, 104], s = Q.shade;
      ctx.beginPath();
      ctx.moveTo(S[Q.q[0] * 3], S[Q.q[0] * 3 + 1]);
      for (var k = 1; k < 4; k++) ctx.lineTo(S[Q.q[k] * 3], S[Q.q[k] * 3 + 1]);
      ctx.closePath();
      ctx.fillStyle = 'rgb(' + Math.round(14 + base[0] * s) + ',' + Math.round(16 + base[1] * s) + ',' + Math.round(24 + base[2] * s) + ')';
      ctx.fill();
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      // The square's edges, which become the seams where they are glued.
      seam(Q, Q.j === 0, 0, 1, AMBER);
      seam(Q, Q.j === NV - 1, 3, 2, AMBER);
      seam(Q, Q.i === 0, 0, 3, CYAN);
      seam(Q, Q.i === NU - 1, 1, 2, CYAN);
      var list = onQuad[Q.i * NV + Q.j];
      if (list) {
        ctx.strokeStyle = 'rgba(255,209,102,0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (k = 0; k < list.length; k += 3) {
          onSurface(list[k], c1);
          onSurface(list[k + 1], c2);
          ctx.moveTo(c1[0], c1[1]);
          ctx.lineTo(c2[0], c2[1]);
        }
        ctx.stroke();
      }
      if (Q.i * NV + Q.j === shipKey) {
        onSurface([ship.x, ship.y], c1);
        ctx.beginPath();
        ctx.arc(c1[0], c1[1], 6, 0, TAU);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = PINK;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });

    function seam(Q, on, m, n, color) {
      if (!on) return;
      ctx.beginPath();
      ctx.moveTo(S[Q.q[m] * 3], S[Q.q[m] * 3 + 1]);
      ctx.lineTo(S[Q.q[n] * 3], S[Q.q[n] * 3 + 1]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // ---- Frame ----

  function frame(dt, st) {
    W = st.width;
    H = st.height;
    layout();
    if (playing) step(dt);
    flash.x = Math.max(0, flash.x - dt * 1.6);
    flash.y = Math.max(0, flash.y - dt * 1.6);
    if (folding && fold < 1) fold = Math.min(1, fold + dt / 3.2);
    if (!folding && fold > 0) fold = Math.max(0, fold - dt / 2);
    if (!playing && !st.dirty && !flash.x && !flash.y && (fold === 0 || fold === 1)) return;
    st.dirty = false;

    var ctx = st.ctx;
    ctx.clearRect(0, 0, W, H);
    if (fold > 0) drawFold(ctx, fold);
    else drawFlat(ctx);

    var lines = [glue.name, 'Edges crossed: ' + crossings];
    if (glue !== GLUES.torus) lines.push(ship.mirror ? 'The ship is mirrored' : 'The ship is the right way round');
    else if (fold > 0) lines.push(fold < 0.5 ? 'Rolling into a tube' : fold < 1 ? 'Bending the tube round' : 'A doughnut');
    V.setText(readout, lines.join('\n'));
  }

  // Fly for a few seconds first, so there's already a trail across the edges.
  for (var warm = 0; warm < 520; warm++) step(1 / 60);

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Steering ----

  canvas.tabIndex = 0;
  canvas.addEventListener('click', function (e) {
    if (!box || fold > 0) return;
    var r = canvas.getBoundingClientRect();
    var x = (e.clientX - r.left - box.x) / box.s, y = (e.clientY - r.top - box.y) / box.s;
    if (x < 0 || y < 0 || x > 1 || y > 1) return;
    target = { x: x, y: y };
    if (!playing) setPlaying(true);
    stage.dirty = true;
  });
  canvas.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      turn = e.key === 'ArrowLeft' ? -1 : 1;
      target = null;
      e.preventDefault();
    }
  });
  canvas.addEventListener('keyup', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') turn = 0;
  });
  canvas.addEventListener('blur', function () { turn = 0; });

  // ---- Controls ----

  V.segmented(glueGroup, function (v) {
    glue = GLUES[v];
    trail = [];
    crossings = 0;
    ship.mirror = false;
    target = null;
    foldBtn.hidden = v !== 'torus';
    if (v !== 'torus') { folding = false; fold = 0; foldBtn.setAttribute('aria-pressed', 'false'); }
    stage.dirty = true;
  });
  V.toggle(foldBtn, function (on) { folding = on; if (V.reducedMotion) fold = on ? 1 : 0; stage.dirty = true; });
  V.toggle(trailBtn, function (on) { showTrail = on; stage.dirty = true; });
  V.ctl(section, 'clear').addEventListener('click', function () { trail = []; crossings = 0; stage.dirty = true; });
  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });
})();
