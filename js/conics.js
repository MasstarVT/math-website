// A double cone x² + y² = (z·tan α)² cut by the plane n·p = d, n = (sin β, 0, cos β).
// The generator through (tan α·cos θ, tan α·sin θ, 1) meets it at
// λ = d / (sin β·tan α·cos θ + cos β). Eccentricity sin β / cos α: below 1 an
// ellipse, 1 a parabola, above 1 a hyperbola. Dandelin spheres sit on the axis at
// z = d / (cos β ± sin α), touching the cone and touching the plane at a focus.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('conics');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var presetGroup = V.ctl(section, 'preset');
  var tiltInput = V.ctl(section, 'tilt');
  var tiltOut = V.ctl(section, 'tilt-out');
  var spinBtn = V.ctl(section, 'spin');

  var TAU = Math.PI * 2;
  var ALPHA = Math.PI / 6, TA = Math.tan(ALPHA), SA = Math.sin(ALPHA), CA = Math.cos(ALPHA);
  var HGT = 1.8, CAM = 10;
  var GREEN = '126,224,161';

  var beta = 30 * Math.PI / 180, dist = 0.4;
  var spheres = true;
  var spin = !V.reducedMotion;
  var yaw = -Math.PI / 2 + 0.8, pitch = 0.34, vyaw = 0, vpitch = 0, drag = null;
  var tween = null;
  var W = 0, H = 0, unit = 1, cx = 0, cy = 0;
  var cyw, syw, cp, sp;

  function n3() { return [Math.sin(beta), 0, Math.cos(beta)]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  // World (z up) to screen: turn by yaw about z, then tip by pitch.
  function setView() {
    cyw = Math.cos(yaw); syw = Math.sin(yaw); cp = Math.cos(pitch); sp = Math.sin(pitch);
  }
  function proj(p) {
    var x1 = p[0] * cyw - p[1] * syw, y1 = p[0] * syw + p[1] * cyw;
    var up = y1 * sp + p[2] * cp, depth = y1 * cp - p[2] * sp, s = CAM / (CAM + depth);
    return [cx + x1 * s * unit, cy - up * s * unit, depth, s];
  }
  function camPos() {
    return [-CAM * cp * syw, -CAM * cp * cyw, CAM * sp];
  }

  function gen(th, lam) { return [lam * TA * Math.cos(th), lam * TA * Math.sin(th), lam]; }

  // ---- Pieces, each tagged with the side of the plane it's on ----

  // Generators and rings as polylines, each with a brightness.
  function coneLines() {
    var lines = [], k, i, N = 24, M = 12;
    for (k = 0; k < N; k++) {
      var pts = [];
      for (i = 0; i <= M; i++) pts.push(gen(TAU * k / N, -HGT + 2 * HGT * i / M));
      lines.push({ pts: pts, a: 0.34 });
    }
    [-HGT, -HGT / 2, HGT / 2, HGT].forEach(function (z) {
      var pts = [];
      for (var j = 0; j <= 64; j++) pts.push(gen(TAU * j / 64, z));
      lines.push({ pts: pts, a: Math.abs(z) === HGT ? 0.6 : 0.2 });
    });
    return lines;
  }
  var CONE = null;

  function curve() {
    var out = [], cur = [], i;
    if (dist < 0.004) {
      var k = -Math.cos(beta) / (Math.sin(beta) * TA);
      if (Math.sin(beta) * TA < 1e-9 || Math.abs(k) > 1) return { pts: [], kind: 'point' };
      var t0 = Math.acos(k);
      return { pts: [[gen(t0, -HGT), gen(t0, HGT)], [gen(-t0, -HGT), gen(-t0, HGT)]], kind: Math.abs(k) > 0.9999 ? 'line' : 'lines' };
    }
    for (i = 0; i <= 480; i++) {
      var th = TAU * i / 480, den = Math.sin(beta) * TA * Math.cos(th) + Math.cos(beta);
      var lam = Math.abs(den) < 1e-9 ? Infinity : dist / den;
      if (Math.abs(lam) > HGT) {
        if (cur.length > 1) out.push(cur);
        cur = [];
        continue;
      }
      cur.push(gen(th, lam));
    }
    if (cur.length > 1) {
      // Join the wrap-around piece onto the first one if they meet.
      if (out.length && Math.hypot(cur[cur.length - 1][0] - out[0][0][0], cur[cur.length - 1][1] - out[0][0][1], cur[cur.length - 1][2] - out[0][0][2]) < 0.05) out[0] = cur.concat(out[0]);
      else out.push(cur);
    }
    return { pts: out, kind: 'curve' };
  }

  function sphereList() {
    if (!spheres || dist < 0.004) return [];
    var n = n3(), list = [];
    [Math.cos(beta) + SA, Math.cos(beta) - SA].forEach(function (den) {
      if (Math.abs(den) < 1e-6) return;
      var z = dist / den, r = Math.abs(z) * SA;
      if (Math.abs(z) + r > HGT + 0.35) return;
      var c = [0, 0, z], off = dot(n, c) - dist;
      list.push({ c: c, r: r, focus: [c[0] - off * n[0], c[1] - off * n[1], c[2] - off * n[2]], ring: z * CA * CA, ringR: Math.abs(z) * SA * CA });
    });
    return list;
  }

  // ---- Drawing ----

  // Sort every little segment of the cone into four groups: which side of the
  // plane it's on, and whether it's in the far or near half. Runs that stay in
  // one group become one polyline, so each group is a single path.
  function splitCone(n, camSide) {
    var groups = [];
    for (var g = 0; g < 8; g++) groups.push(new Path2D());
    CONE.forEach(function (line) {
      var prev = -1, last = null;
      for (var i = 1; i < line.pts.length; i++) {
        var a = line.pts[i - 1], b = line.pts[i];
        var m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        var front = (dot(n, m) - dist >= 0) === camSide, back = proj(m)[2] > 0;
        var g = (front ? 0 : 2) + (back ? 1 : 0) + (line.a > 0.3 ? 0 : 4);
        var pb = proj(b), path = groups[g];
        if (g !== prev) {
          var pa = last || proj(a);
          path.moveTo(pa[0], pa[1]);
        }
        path.lineTo(pb[0], pb[1]);
        prev = g;
        last = pb;
      }
    });
    return groups;
  }

  // Group bits: 2 = far side of the plane, 1 = far half, 4 = faint ring.
  function drawGroup(ctx, groups, g) {
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = 'rgba(236,232,223,' + (g & 1 ? 0.2 : 0.42) + ')';
    ctx.stroke(groups[g]);
    ctx.strokeStyle = 'rgba(236,232,223,' + (g & 1 ? 0.08 : 0.16) + ')';
    ctx.stroke(groups[g + 4]);
  }

  function drawSphere(ctx, s) {
    var p = proj(s.c), r = s.r * p[3] * unit;
    ctx.beginPath();
    ctx.arc(p[0], p[1], r, 0, TAU);
    ctx.fillStyle = 'rgba(167,139,250,0.14)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p[0] - r * 0.3, p[1] - r * 0.34, r * 0.42, 0, TAU);
    ctx.fillStyle = 'rgba(236,232,223,0.07)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p[0], p[1], r, 0, TAU);
    ctx.strokeStyle = 'rgba(167,139,250,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // The circle where the sphere touches the cone.
    ctx.beginPath();
    for (var i = 0; i <= 48; i++) {
      var q = proj([s.ringR * Math.cos(TAU * i / 48), s.ringR * Math.sin(TAU * i / 48), s.ring]);
      if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
    }
    ctx.strokeStyle = 'rgba(167,139,250,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawPlane(ctx) {
    var n = n3(), u = [Math.cos(beta), 0, -Math.sin(beta)], o = [n[0] * dist, n[1] * dist, n[2] * dist];
    var S = 2.0, T = 1.6, corners = [[-S, -T], [S, -T], [S, T], [-S, T]];
    ctx.beginPath();
    corners.forEach(function (c, i) {
      var q = proj([o[0] + u[0] * c[0], o[1] + c[1], o[2] + u[2] * c[0]]);
      if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(' + GREEN + ',0.1)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(' + GREEN + ',0.45)';
    ctx.lineWidth = 1.25;
    ctx.stroke();
  }

  function frame(dt, st) {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 1.2);
      var e = V.easeInOut(tween.t);
      yaw = tween.y0 + (tween.y1 - tween.y0) * e;
      pitch = tween.p0 + (tween.p1 - tween.p0) * e;
      if (tween.t >= 1) tween = null;
    } else if (!drag) {
      if (spin) yaw += dt * 0.22;
      yaw += vyaw * dt;
      pitch = clampPitch(pitch + vpitch * dt);
      var decay = Math.exp(-dt * 2.5);
      vyaw *= decay;
      vpitch *= decay;
    }
    var moving = tween || drag || spin || Math.abs(vyaw) > 1e-3 || Math.abs(vpitch) > 1e-3;
    if (!moving && !st.dirty) return;
    st.dirty = false;
    W = st.width;
    H = st.height;
    unit = Math.min(W, H) / (2 * HGT * 1.12);
    cx = W / 2;
    cy = H / 2;
    setView();
    if (!CONE) CONE = coneLines();

    var ctx = st.ctx, n = n3(), cam = camPos(), camSide = dot(n, cam) - dist >= 0;
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    var groups = splitCone(n, camSide);
    var sph = sphereList(), sNear = [], sFar = [];
    sph.forEach(function (s) { ((dot(n, s.c) - dist >= 0) === camSide ? sNear : sFar).push(s); });

    drawGroup(ctx, groups, 3);
    sFar.forEach(function (s) { drawSphere(ctx, s); });
    drawGroup(ctx, groups, 2);
    drawPlane(ctx);

    var cv = curve();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgb(' + GREEN + ')';
    ctx.lineWidth = 3;
    cv.pts.forEach(function (piece) {
      ctx.beginPath();
      piece.forEach(function (p, i) {
        var q = proj(p);
        if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
      });
      ctx.stroke();
    });
    if (cv.kind === 'point') {
      var a = proj([0, 0, 0]);
      ctx.beginPath();
      ctx.arc(a[0], a[1], 4, 0, TAU);
      ctx.fillStyle = 'rgb(' + GREEN + ')';
      ctx.fill();
    }

    drawGroup(ctx, groups, 1);
    sNear.forEach(function (s) { drawSphere(ctx, s); });
    drawGroup(ctx, groups, 0);

    sph.forEach(function (s) {
      var f = proj(s.focus);
      ctx.beginPath();
      ctx.arc(f[0], f[1], 4.5, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0a0b10';
      ctx.stroke();
    });

    var deg = beta * 180 / Math.PI, e = Math.sin(beta) / CA, name;
    if (dist < 0.004) name = cv.kind === 'point' ? 'a single point' : cv.kind === 'line' ? 'a single line' : 'two crossing lines';
    else if (deg < 0.25) name = 'circle';
    else if (Math.abs(deg - 60) < 0.25) name = 'parabola';
    else name = deg < 60 ? 'ellipse' : 'hyperbola';
    if (Math.abs(deg - 60) < 0.25) e = 1;
    var text = name + '\ntilt ' + (Math.round(deg * 10) / 10) + '°, cone side 60°' +
      (dist < 0.004 ? '\nthe plane goes through the tip' : '\neccentricity ' + e.toFixed(2));
    V.setText(readout, text);
  }

  function clampPitch(p) { return Math.max(-Math.PI / 2, Math.min(Math.PI / 2, p)); }

  var stage = V.createStage(canvas, { frame: frame });
  function touch() { stage.dirty = true; }

  // ---- Controls ----

  function setTilt(deg, fromInput) {
    beta = deg * Math.PI / 180;
    if (!fromInput) tiltInput.value = String(deg);
    tiltOut.textContent = deg + '°';
    V.setSegmented(presetGroup, String(deg));
  }

  tiltInput.addEventListener('input', function () { setTilt(parseFloat(tiltInput.value), true); touch(); });
  setTilt(parseFloat(tiltInput.value), true);

  V.segmented(presetGroup, function (v) { setTilt(parseFloat(v), false); touch(); });

  V.range(V.ctl(section, 'offset'), V.ctl(section, 'offset-out'),
    function (v) { return v.toFixed(2); },
    function (v) { dist = v; touch(); });

  V.toggle(V.ctl(section, 'spheres'), function (on) { spheres = on; touch(); });

  function setSpin(on) {
    spin = on;
    spinBtn.setAttribute('aria-pressed', String(on));
    touch();
  }
  setSpin(spin);
  V.toggle(spinBtn, setSpin);

  // Turn the camera to look along the plane's normal, so the curve shows its true shape.
  V.ctl(section, 'face').addEventListener('click', function () {
    setSpin(false);
    vyaw = vpitch = 0;
    var target = -Math.PI / 2, y0 = yaw;
    while (y0 - target > Math.PI) y0 -= TAU;
    while (target - y0 > Math.PI) y0 += TAU;
    tween = { t: V.reducedMotion ? 1 : 0, y0: y0, y1: target, p0: pitch, p1: Math.PI / 2 - beta };
  });

  // ---- Drag to orbit ----

  canvas.addEventListener('pointerdown', function (e) {
    drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    tween = null;
    vyaw = vpitch = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-grabbing');
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var now = performance.now();
    var dx = (e.clientX - drag.x) * 0.008, dy = (e.clientY - drag.y) * 0.008;
    var dts = Math.max((now - drag.t) / 1000, 0.008);
    yaw += dx;
    pitch = clampPitch(pitch + dy);
    vyaw = vyaw * 0.5 + (dx / dts) * 0.5;
    vpitch = vpitch * 0.5 + (dy / dts) * 0.5;
    drag = { x: e.clientX, y: e.clientY, t: now };
    touch();
  });

  function endDrag() {
    if (!drag) return;
    if (performance.now() - drag.t > 80) vyaw = vpitch = 0;
    drag = null;
    canvas.classList.remove('is-grabbing');
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
})();
