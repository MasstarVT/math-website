// 4D polytopes rotated in planes that involve the W axis, projected
// 4D -> 3D with perspective along W, then 3D -> 2D with perspective along Z.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('tesseract');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  // Eye distances. Every vertex sits at radius 2, so D4 > 2 keeps w < D4.
  var D4 = 3;
  var D3 = 8;
  var TAU = Math.PI * 2;

  function scaleTo(verts, r) {
    return verts.map(function (v) {
      var n = Math.hypot(v[0], v[1], v[2], v[3]);
      return v.map(function (c) { return c * r / n; });
    });
  }

  function dist2(a, b) {
    var s = 0;
    for (var k = 0; k < 4; k++) s += (a[k] - b[k]) * (a[k] - b[k]);
    return s;
  }

  // For these regular polytopes, edges join every pair at the shortest distance.
  function edgesOf(verts) {
    var min = Infinity, edges = [], i, j;
    for (i = 0; i < verts.length; i++)
      for (j = i + 1; j < verts.length; j++) min = Math.min(min, dist2(verts[i], verts[j]));
    for (i = 0; i < verts.length; i++)
      for (j = i + 1; j < verts.length; j++)
        if (Math.abs(dist2(verts[i], verts[j]) - min) < 1e-6) edges.push([i, j]);
    return edges;
  }

  // (±1, ±1, ±1, ±1)
  function tesseract() {
    var v = [];
    for (var i = 0; i < 16; i++) v.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
    return v;
  }

  // ±e_i
  function cell16() {
    var v = [];
    for (var a = 0; a < 4; a++) {
      for (var s = -1; s <= 1; s += 2) {
        var p = [0, 0, 0, 0];
        p[a] = s;
        v.push(p);
      }
    }
    return v;
  }

  // All permutations of (±1, ±1, 0, 0)
  function cell24() {
    var v = [];
    for (var a = 0; a < 4; a++) {
      for (var b = a + 1; b < 4; b++) {
        for (var sa = -1; sa <= 1; sa += 2) {
          for (var sb = -1; sb <= 1; sb += 2) {
            var p = [0, 0, 0, 0];
            p[a] = sa;
            p[b] = sb;
            v.push(p);
          }
        }
      }
    }
    return v;
  }

  var SHAPES = {};
  [['tesseract', tesseract()], ['cell16', cell16()], ['cell24', cell24()]].forEach(function (s) {
    var verts = scaleTo(s[1], 2);
    SHAPES[s[0]] = { verts: verts, edges: edgesOf(verts) };
  });

  var shape = SHAPES.tesseract;
  var planes = { xw: true, yw: false, zw: false };
  var angle = { xw: 0, yw: 0, zw: 0 };
  var speed = 1;
  var paused = V.reducedMotion;
  var tween = null;

  // 3D orbit, set by dragging, with a little inertia.
  var yaw = 0.62, pitch = -0.42, vyaw = 0, vpitch = 0;
  var drag = null;

  var pts = [];
  var order = [];

  function frame(dt, st) {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 1.8);
      var e = V.easeInOut(tween.t);
      for (var k in tween.from) angle[k] = tween.from[k] + (tween.to[k] - tween.from[k]) * e;
      if (tween.t >= 1) tween = null;
    } else if (!paused) {
      var step = 0.45 * speed * dt;
      for (var p in planes) if (planes[p]) angle[p] = (angle[p] + step) % TAU;
    }

    if (!drag) {
      yaw += vyaw * dt;
      pitch = clampPitch(pitch + vpitch * dt);
      var decay = Math.exp(-dt * 2.5);
      vyaw *= decay;
      vpitch *= decay;
    }

    draw(st);
    updateReadout();
  }

  function clampPitch(p) {
    return Math.max(-1.45, Math.min(1.45, p));
  }

  function project(st) {
    var verts = shape.verts;
    var cxw = Math.cos(angle.xw), sxw = Math.sin(angle.xw);
    var cyw = Math.cos(angle.yw), syw = Math.sin(angle.yw);
    var czw = Math.cos(angle.zw), szw = Math.sin(angle.zw);
    var cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var cx = st.width / 2, cy = st.height / 2;
    var unit = Math.min(st.width, st.height) * 0.115;

    for (var i = 0; i < verts.length; i++) {
      var x = verts[i][0], y = verts[i][1], z = verts[i][2], w = verts[i][3], t;

      t = x * cxw - w * sxw; w = x * sxw + w * cxw; x = t;
      t = y * cyw - w * syw; w = y * syw + w * cyw; y = t;
      t = z * czw - w * szw; w = z * szw + w * czw; z = t;

      var k = D4 / (D4 - w);
      x *= k; y *= k; z *= k;

      t = x * cyaw + z * syaw; z = -x * syaw + z * cyaw; x = t;
      t = y * cp - z * sp; z = y * sp + z * cp; y = t;

      var s = D3 / (D3 - z);
      pts[i] = { x: cx + x * s * unit, y: cy - y * s * unit, w: w, z: z, s: s };
    }
  }

  // 0 = far side of the 4th dimension, 1 = near side.
  function nearness(w) {
    return Math.max(0, Math.min(1, (w + 2) / 4));
  }

  // Hue runs cyan -> blue -> magenta -> amber as an edge comes toward us in W.
  function color(t, alpha) {
    return 'hsla(' + (192 + t * 205) % 360 + ',92%,' + (60 + t * 6) + '%,' + alpha + ')';
  }

  function draw(st) {
    var ctx = st.ctx;
    ctx.clearRect(0, 0, st.width, st.height);
    project(st);

    var edges = shape.edges;
    order.length = edges.length;
    for (var i = 0; i < edges.length; i++) order[i] = i;
    order.sort(function (a, b) {
      return (pts[edges[a][0]].z + pts[edges[a][1]].z) - (pts[edges[b][0]].z + pts[edges[b][1]].z);
    });

    var base = Math.max(1, Math.min(st.width, st.height) / 420);
    ctx.lineCap = 'round';

    for (i = 0; i < order.length; i++) {
      var a = pts[edges[order[i]][0]];
      var b = pts[edges[order[i]][1]];
      var t = nearness((a.w + b.w) / 2);
      ctx.strokeStyle = color(t, 0.38 + 0.62 * t);
      ctx.lineWidth = base * (0.8 + 2.2 * t) * (a.s + b.s) / 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (i = 0; i < shape.verts.length; i++) {
      var p = pts[i];
      var tv = nearness(p.w);
      ctx.fillStyle = color(tv, 0.5 + 0.5 * tv);
      ctx.beginPath();
      ctx.arc(p.x, p.y, base * (1.6 + 2.6 * tv) * p.s, 0, TAU);
      ctx.fill();
    }
  }

  function deg(a) {
    var d = Math.round(((a % TAU) + TAU) % TAU * 180 / Math.PI) % 360;
    return (d < 100 ? (d < 10 ? '  ' : ' ') : '') + d + '°';
  }

  function updateReadout() {
    V.setText(readout, 'XW ' + deg(angle.xw) + '   YW ' + deg(angle.yw) + '   ZW ' + deg(angle.zw));
  }

  V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  V.segmented(V.ctl(section, 'shape'), function (name) {
    shape = SHAPES[name];
    pts.length = 0;
  });

  section.querySelectorAll('[data-plane]').forEach(function (btn) {
    V.toggle(btn, function (on) { planes[btn.dataset.plane] = on; });
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return v.toFixed(2) + '×'; },
    function (v) { speed = v; });

  function setPaused(p) {
    paused = p;
    playBtn.textContent = paused ? 'Play' : 'Pause';
  }
  setPaused(paused);
  playBtn.addEventListener('click', function () { setPaused(!paused); });

  // Ease to the next quarter turn in XW, unwinding the other planes, so the
  // inner and outer cubes trade places cleanly.
  V.ctl(section, 'quarter').addEventListener('click', function () {
    var q = Math.PI / 2;
    var from = { xw: angle.xw, yw: angle.yw, zw: angle.zw };
    var to = {
      xw: (Math.round(angle.xw / q) + 1) * q,
      yw: Math.round(angle.yw / TAU) * TAU,
      zw: Math.round(angle.zw / TAU) * TAU
    };
    tween = { from: from, to: to, t: 0 };
    setPaused(true);
  });

  // ---- Drag to orbit ----

  canvas.addEventListener('pointerdown', function (e) {
    drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    vyaw = vpitch = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-grabbing');
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var now = performance.now();
    var dx = (e.clientX - drag.x) * 0.008;
    var dy = (e.clientY - drag.y) * 0.008;
    var dts = Math.max((now - drag.t) / 1000, 0.008);
    yaw += dx;
    pitch = clampPitch(pitch + dy);
    vyaw = vyaw * 0.5 + (dx / dts) * 0.5;
    vpitch = vpitch * 0.5 + (dy / dts) * 0.5;
    drag = { x: e.clientX, y: e.clientY, t: now };
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
