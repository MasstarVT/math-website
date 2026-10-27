// (a + b)² and (a + b)³ as dissections: cutting each side at a splits the
// square into a² + 2ab + b² and the cube into 8 boxes, a³ + 3a²b + 3ab² + b³.
// The boxes form a 2×2×2 grid, so they're painted back to front axis by axis.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('binomial-cube');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var modeGroup = V.ctl(section, 'mode');
  var apartBtn = V.ctl(section, 'apart');
  var spinBtn = V.ctl(section, 'spin');
  var aInput = V.ctl(section, 'a');
  var aOut = V.ctl(section, 'a-out');
  var bInput = V.ctl(section, 'b');
  var bOut = V.ctl(section, 'b-out');

  // By how many b's a piece has: a³, a²b, ab², b³.
  var COLORS = [[110, 231, 255], [167, 139, 250], [255, 95, 162], [255, 180, 84]];
  var NAMES3 = ['a³', 'a²b', 'ab²', 'b³'];
  var NAMES2 = ['a²', 'ab', 'b²'];

  var mode = 'cube';
  var a = 3, b = 2;
  var apart = true;
  var spinning = !V.reducedMotion;
  var ex = 0;              // eased 0 (together) → 1 (apart)
  var yaw = 0.7, pitch = 0.5, vyaw = 0, vpitch = 0;
  var drag = null;
  var stage;

  function rgb(c, k) {
    return 'rgb(' + Math.round(c[0] * k) + ',' + Math.round(c[1] * k) + ',' + Math.round(c[2] * k) + ')';
  }

  function clampPitch(p) { return Math.max(-1.35, Math.min(1.35, p)); }

  function frame(dt, st) {
    var busy = false;
    var want = apart ? 1 : 0;
    if (ex !== want) {
      ex = V.reducedMotion ? want : (want > ex ? Math.min(want, ex + dt * 0.9) : Math.max(want, ex - dt * 0.9));
      busy = true;
    }
    if (mode === 'cube' && !drag) {
      if (spinning) yaw += 0.22 * dt;
      yaw += vyaw * dt;
      pitch = clampPitch(pitch + vpitch * dt);
      var decay = Math.exp(-dt * 2.5);
      vyaw *= decay;
      vpitch *= decay;
      busy = busy || spinning || Math.abs(vyaw) + Math.abs(vpitch) > 1e-3;
    }
    if (!busy && !st.dirty) return;
    st.dirty = false;

    var W = st.width, H = st.height, ctx = st.ctx;
    ctx.clearRect(0, 0, W, H);
    var e = V.easeInOut(ex), T = a + b;
    var fs = Math.max(13, Math.min(19, W * 0.028));
    var formulaY = H - Math.max(26, H * 0.075);

    if (mode === 'square') {
      var size = Math.min(W * 0.62, (formulaY - fs * 2) * 0.82);
      var u = size / T, gap = e * size * 0.09;
      var x0 = W / 2 - size / 2 - gap / 2, y0 = (formulaY - fs) / 2 - size / 2 - gap / 2 + 6;
      [[0, 0, a, a, 0], [1, 0, b, a, 1], [0, 1, a, b, 1], [1, 1, b, b, 2]].forEach(function (p) {
        var px = x0 + (p[0] ? a * u + gap : 0), py = y0 + (p[1] ? a * u + gap : 0), w = p[2] * u, h = p[3] * u;
        var c = COLORS[p[4] === 2 ? 3 : p[4]];
        ctx.fillStyle = rgb(c, 0.32);
        ctx.fillRect(px, py, w, h);
        // Unit squares, so the areas can be counted.
        ctx.strokeStyle = rgb(c, 0.55);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var i = 1; i < p[2]; i++) { ctx.moveTo(px + i * u, py); ctx.lineTo(px + i * u, py + h); }
        for (i = 1; i < p[3]; i++) { ctx.moveTo(px, py + i * u); ctx.lineTo(px + w, py + i * u); }
        ctx.stroke();
        ctx.strokeStyle = rgb(c, 1);
        ctx.lineWidth = 2;
        ctx.strokeRect(px, py, w, h);
        ctx.fillStyle = rgb(c, 1);
        ctx.font = '600 ' + Math.max(12, Math.min(22, Math.min(w, h) * 0.32)) + 'px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(NAMES2[p[4]], px + w / 2, py + h / 2);
      });
      ctx.font = '500 12px "IBM Plex Mono", monospace';
      ctx.fillStyle = '#9b9daf';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('a', x0 + a * u / 2, y0 - 6);
      ctx.fillText('b', x0 + a * u + gap + b * u / 2, y0 - 6);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('a', x0 - 8, y0 + a * u / 2);
      ctx.fillText('b', x0 - 8, y0 + a * u + gap + b * u / 2);
    } else {
      drawCube(ctx, W, formulaY - fs, e, T);
    }

    // The identity, each term in its piece's color.
    var parts = mode === 'cube'
      ? [['(a + b)³ = ', '#ece8df'], ['a³', 0], [' + ', '#6f7286'], ['3a²b', 1], [' + ', '#6f7286'], ['3ab²', 2], [' + ', '#6f7286'], ['b³', 3]]
      : [['(a + b)² = ', '#ece8df'], ['a²', 0], [' + ', '#6f7286'], ['2ab', 1], [' + ', '#6f7286'], ['b²', 3]];
    ctx.font = '500 ' + fs + 'px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    var total = 0;
    parts.forEach(function (p) { total += ctx.measureText(p[0]).width; });
    var fx = W / 2 - total / 2;
    parts.forEach(function (p) {
      ctx.fillStyle = typeof p[1] === 'number' ? rgb(COLORS[p[1]], 1) : p[1];
      ctx.fillText(p[0], fx, formulaY);
      fx += ctx.measureText(p[0]).width;
    });

    if (mode === 'cube') {
      V.setText(readout, '(' + a + ' + ' + b + ')³ = ' + T * T * T + '\n' +
        a * a * a + ' + ' + 3 * a * a * b + ' + ' + 3 * a * b * b + ' + ' + b * b * b + ' = ' + T * T * T);
    } else {
      V.setText(readout, '(' + a + ' + ' + b + ')² = ' + T * T + '\n' +
        a * a + ' + ' + 2 * a * b + ' + ' + b * b + ' = ' + T * T);
    }
  }

  function drawCube(ctx, W, H, e, T) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var D = 7;
    var scale = Math.min(W, H) * (W / H > 1.15 ? 0.215 : 0.2);
    var u = 2 / T, gap = e * 0.28;
    function view(p) {
      var x = p[0] * cy + p[2] * sy, z = -p[0] * sy + p[2] * cy, y = p[1];
      var y2 = y * cp - z * sp, z2 = y * sp + z * cp;
      return [x, y2, z2];
    }
    function project(v) {
      var f = D / (D - v[2]);
      return [W / 2 + v[0] * f * scale, H * (W / H > 1.15 ? 0.53 : 0.55) - v[1] * f * scale];
    }
    // The camera, in world coordinates: undo the rotations of (0, 0, D).
    var cam = (function () {
      var y = D * sp, z = D * cp;
      return [-z * sy, y, z * cy];
    })();
    var split = (a - T / 2) * u;
    function order(c) { return c > split ? [0, 1] : [1, 0]; }
    var ox = order(cam[0]), oy = order(cam[1]), oz = order(cam[2]);
    var light = [-0.45, 0.7, 0.55];

    ox.forEach(function (i) {
      oy.forEach(function (j) {
        oz.forEach(function (k) {
          var lo = [i ? split + gap : -T / 2 * u - gap, j ? split + gap : -T / 2 * u - gap, k ? split + gap : -T / 2 * u - gap];
          var dims = [(i ? b : a), (j ? b : a), (k ? b : a)];
          var hi = [lo[0] + dims[0] * u, lo[1] + dims[1] * u, lo[2] + dims[2] * u];
          var kind = i + j + k;
          drawBox(lo, hi, dims, COLORS[kind], NAMES3[kind]);
        });
      });
    });

    function drawBox(lo, hi, dims, color, name) {
      var faces = [
        [0, -1], [0, 1], [1, -1], [1, 1], [2, -1], [2, 1]
      ];
      faces.forEach(function (f) {
        var ax = f[0], sgn = f[1];
        var c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
        c[ax] = sgn > 0 ? hi[ax] : lo[ax];
        if ((cam[ax] - c[ax]) * sgn <= 0) return;
        var a1 = (ax + 1) % 3, a2 = (ax + 2) % 3;
        function corner(s1, s2) {
          var p = c.slice();
          p[a1] = s1 ? hi[a1] : lo[a1];
          p[a2] = s2 ? hi[a2] : lo[a2];
          return project(view(p));
        }
        var q = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
        var n = [0, 0, 0];
        n[ax] = sgn;
        var nv = view(n), lum = 0.42 + 0.58 * Math.max(0, nv[0] * light[0] + nv[1] * light[1] + nv[2] * light[2]);
        ctx.beginPath();
        ctx.moveTo(q[0][0], q[0][1]);
        for (var m = 1; m < 4; m++) ctx.lineTo(q[m][0], q[m][1]);
        ctx.closePath();
        ctx.fillStyle = rgb(color, lum * 0.78);
        ctx.fill();
        // Unit squares on each face, so the little cubes can be counted.
        ctx.strokeStyle = rgb(color, Math.min(1, lum * 1.15));
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var t = 1; t < dims[a1]; t++) {
          var g0 = t / dims[a1];
          ctx.moveTo(q[0][0] + (q[1][0] - q[0][0]) * g0, q[0][1] + (q[1][1] - q[0][1]) * g0);
          ctx.lineTo(q[3][0] + (q[2][0] - q[3][0]) * g0, q[3][1] + (q[2][1] - q[3][1]) * g0);
        }
        for (t = 1; t < dims[a2]; t++) {
          var g1 = t / dims[a2];
          ctx.moveTo(q[0][0] + (q[3][0] - q[0][0]) * g1, q[0][1] + (q[3][1] - q[0][1]) * g1);
          ctx.lineTo(q[1][0] + (q[2][0] - q[1][0]) * g1, q[1][1] + (q[2][1] - q[1][1]) * g1);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(10,11,16,0.85)';
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(q[0][0], q[0][1]);
        for (m = 1; m < 4; m++) ctx.lineTo(q[m][0], q[m][1]);
        ctx.closePath();
        ctx.stroke();
      });
      if (e > 0.35) {
        var mid = project(view([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]));
        ctx.globalAlpha = Math.min(1, (e - 0.35) * 3);
        ctx.font = '600 13px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var tw = ctx.measureText(name).width;
        ctx.fillStyle = 'rgba(10,11,16,0.7)';
        ctx.fillRect(mid[0] - tw / 2 - 4, mid[1] - 9, tw + 8, 18);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(name, mid[0], mid[1]);
        ctx.globalAlpha = 1;
      }
    }
  }

  stage = V.createStage(canvas, { frame: frame });

  // ---- Drag to turn the cube ----

  canvas.addEventListener('pointerdown', function (e) {
    if (mode !== 'cube') return;
    drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    vyaw = vpitch = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-grabbing');
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var now = performance.now();
    var dx = (e.clientX - drag.x) * 0.009, dy = (e.clientY - drag.y) * 0.009;
    var dts = Math.max((now - drag.t) / 1000, 0.008);
    yaw += dx;
    pitch = clampPitch(pitch + dy);
    vyaw = vyaw * 0.5 + (dx / dts) * 0.5;
    vpitch = vpitch * 0.5 + (dy / dts) * 0.5;
    drag = { x: e.clientX, y: e.clientY, t: now };
    stage.dirty = true;
  });
  function endDrag() {
    if (!drag) return;
    if (performance.now() - drag.t > 80) vyaw = vpitch = 0;
    drag = null;
    canvas.classList.remove('is-grabbing');
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ---- Controls ----

  V.segmented(modeGroup, function (v) {
    mode = v;
    spinBtn.hidden = mode !== 'cube';
    stage.dirty = true;
  });
  V.toggle(spinBtn, function (on) {
    spinning = on;
    stage.dirty = true;
  });
  spinBtn.setAttribute('aria-pressed', String(spinning));
  V.toggle(apartBtn, function (on) {
    apart = on;
    stage.dirty = true;
  });
  V.range(aInput, aOut, function (v) { return String(v); }, function (v) {
    a = v;
    stage.dirty = true;
  });
  V.range(bInput, bOut, function (v) { return String(v); }, function (v) {
    b = v;
    stage.dirty = true;
  });
  if (V.reducedMotion) ex = 1;
})();
