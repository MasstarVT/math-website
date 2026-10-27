// A 2×2 matrix as a move of the whole plane: (1, 0) goes to the first column î,
// (0, 1) to the second column ĵ, and every point (x, y) to x·î + y·ĵ. Grid lines
// stay straight and evenly spaced; areas scale by the determinant ad − bc.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('matrix');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var presetGroup = V.ctl(section, 'preset');
  var playBtn = V.ctl(section, 'play');
  var resetBtn = V.ctl(section, 'reset');
  var gridBtn = V.ctl(section, 'grid');

  // Matrices as [ix, iy, jx, jy]: the two columns, where î and ĵ land.
  var PRESETS = {
    rotate: [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), -Math.sin(Math.PI / 6), Math.cos(Math.PI / 6)],
    shear: [1, 0, 1, 1],
    stretch: [2, 0, 0, 1],
    flip: [-1, 0, 0, 1],
    squash: [0.8, 0.4, 0.4, 0.2]
  };
  var IDENTITY = [1, 0, 0, 1];
  // The letter F: lopsided, so a flip shows.
  var F = [[0, 0], [0.32, 0], [0.32, 0.72], [0.78, 0.72], [0.78, 1.02], [0.32, 1.02],
    [0.32, 1.3], [1, 1.3], [1, 1.6], [0, 1.6]].map(function (p) { return [p[0] - 1.55, p[1] + 0.25]; });
  var I_COL = '#6ee7ff';
  var J_COL = '#ff5fa2';

  var m = IDENTITY.slice();      // the matrix on screen
  var target = PRESETS.shear.slice();
  var tween = null;              // { from, to, t, dur }
  var showOriginal = true;
  var stage;

  function tweenTo(from, to, dur) {
    target = to.slice();
    if (V.reducedMotion) {
      m = to.slice();
      tween = null;
    } else {
      m = from.slice();
      tween = { from: from.slice(), to: to.slice(), t: 0, dur: dur };
    }
    stage.dirty = true;
  }

  function det(a) { return a[0] * a[3] - a[2] * a[1]; }

  function num(v) {
    if (Math.abs(v) < 0.005) return ' 0.00';
    return (v < 0 ? '−' : ' ') + Math.abs(v).toFixed(2);
  }

  function arrow(ctx, x0, y0, x1, y1, color, width) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    if (len < 1) return;
    var ux = dx / len, uy = dy / len, head = Math.min(13, len * 0.45);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 - ux * head * 0.8, y1 - uy * head * 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * head - uy * head * 0.45, y1 - uy * head + ux * head * 0.45);
    ctx.lineTo(x1 - ux * head + uy * head * 0.45, y1 - uy * head - ux * head * 0.45);
    ctx.closePath();
    ctx.fill();
  }

  function frame(dt, st) {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / tween.dur);
      var e = V.easeInOut(Math.max(0, tween.t));
      for (var k = 0; k < 4; k++) m[k] = tween.from[k] + (tween.to[k] - tween.from[k]) * e;
      if (tween.t >= 1) tween = null;
    } else if (!st.dirty) {
      return;
    }
    st.dirty = false;

    var W = st.width, H = st.height, ctx = st.ctx;
    var s = Math.min(W, H) / 6.8;
    var ox = W / 2, oy = H / 2;
    function X(x, y) { return ox + (m[0] * x + m[2] * y) * s; }
    function Y(x, y) { return oy - (m[1] * x + m[3] * y) * s; }

    ctx.clearRect(0, 0, W, H);
    var N = 12, i;

    if (showOriginal) {
      ctx.strokeStyle = 'rgba(236,232,223,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (i = -N; i <= N; i++) {
        ctx.moveTo(ox + i * s, 0);
        ctx.lineTo(ox + i * s, H);
        ctx.moveTo(0, oy + i * s);
        ctx.lineTo(W, oy + i * s);
      }
      ctx.stroke();
    }

    // The moved grid. Lines through the origin are the moved axes.
    ctx.lineWidth = 1;
    for (i = -N; i <= N; i++) {
      ctx.strokeStyle = i === 0 ? 'rgba(236,232,223,0.5)' : 'rgba(110,231,255,0.22)';
      ctx.beginPath();
      ctx.moveTo(X(i, -N), Y(i, -N));
      ctx.lineTo(X(i, N), Y(i, N));
      ctx.moveTo(X(-N, i), Y(-N, i));
      ctx.lineTo(X(N, i), Y(N, i));
      ctx.stroke();
    }

    // Where the unit square lands; its area is the determinant.
    var d = det(m);
    if (showOriginal) {
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(236,232,223,0.35)';
      ctx.strokeRect(ox, oy - s, s, s);
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.moveTo(X(0, 0), Y(0, 0));
    ctx.lineTo(X(1, 0), Y(1, 0));
    ctx.lineTo(X(1, 1), Y(1, 1));
    ctx.lineTo(X(0, 1), Y(0, 1));
    ctx.closePath();
    ctx.fillStyle = d < 0 ? 'rgba(255,95,162,0.22)' : 'rgba(110,231,255,0.18)';
    ctx.fill();
    ctx.strokeStyle = d < 0 ? 'rgba(255,95,162,0.7)' : 'rgba(110,231,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // The picture.
    ctx.beginPath();
    F.forEach(function (p, k) {
      if (k) ctx.lineTo(X(p[0], p[1]), Y(p[0], p[1]));
      else ctx.moveTo(X(p[0], p[1]), Y(p[0], p[1]));
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,180,84,0.85)';
    ctx.fill();
    ctx.strokeStyle = '#ffb454';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Area label in the middle of the moved square.
    var cxp = X(0.5, 0.5), cyp = Y(0.5, 0.5);
    ctx.font = '500 12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var label = Math.abs(d) < 0.005 ? 'area 0' : 'area ' + (d < 0 ? '−' : '') + Math.abs(d).toFixed(2);
    var tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(10,11,16,0.75)';
    ctx.fillRect(cxp - tw / 2 - 5, cyp - 9, tw + 10, 18);
    ctx.fillStyle = d < 0 ? '#ff5fa2' : '#ece8df';
    ctx.fillText(label, cxp, cyp);

    // The two columns, with handles.
    arrow(ctx, ox, oy, X(1, 0), Y(1, 0), I_COL, 2.5);
    arrow(ctx, ox, oy, X(0, 1), Y(0, 1), J_COL, 2.5);
    [[X(1, 0), Y(1, 0), I_COL, 'î'], [X(0, 1), Y(0, 1), J_COL, 'ĵ']].forEach(function (h) {
      ctx.beginPath();
      ctx.arc(h[0], h[1], 7, 0, Math.PI * 2);
      ctx.fillStyle = h[2];
      ctx.fill();
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 2;
      ctx.stroke();
      var dx = h[0] - ox, dy = h[1] - oy, len = Math.hypot(dx, dy) || 1;
      ctx.font = '600 15px "IBM Plex Sans", sans-serif';
      ctx.fillStyle = h[2];
      ctx.fillText(h[3], h[0] + dx / len * 18, h[1] + dy / len * 18);
    });

    var note;
    if (Math.abs(d) < 0.005) {
      note = Math.hypot(m[0], m[1], m[2], m[3]) < 0.01 ? 'everything lands on 0' : 'squashed onto a line';
    } else if (d < 0) {
      note = 'flipped, areas × ' + Math.abs(d).toFixed(2);
    } else {
      note = 'areas × ' + d.toFixed(2);
    }
    V.setText(readout,
      '[' + num(m[0]) + ' ' + num(m[2]) + ' ]\n' +
      '[' + num(m[1]) + ' ' + num(m[3]) + ' ]\n' +
      'det = ad − bc = ' + num(d).trim() + '\n' + note);
  }

  stage = V.createStage(canvas, { frame: frame });

  // ---- Dragging the arrow tips ----

  function snap(v) {
    var h = Math.round(v * 2) / 2;
    return Math.abs(v - h) < 0.09 ? h : v;
  }

  V.drag(canvas, {
    hit: function (x, y) {
      var s = Math.min(stage.width, stage.height) / 6.8, ox = stage.width / 2, oy = stage.height / 2;
      var hi = Math.hypot(ox + m[0] * s - x, oy - m[1] * s - y);
      var hj = Math.hypot(ox + m[2] * s - x, oy - m[3] * s - y);
      if (Math.min(hi, hj) > 22) return null;
      return hi <= hj ? 'i' : 'j';
    },
    move: function (h, x, y) {
      var s = Math.min(stage.width, stage.height) / 6.8;
      var lim = Math.min(stage.width, stage.height) / 2 / s - 0.2;
      var wx = snap(Math.max(-lim, Math.min(lim, (x - stage.width / 2) / s)));
      var wy = snap(Math.max(-lim, Math.min(lim, (stage.height / 2 - y) / s)));
      tween = null;
      if (h === 'i') { m[0] = wx; m[1] = wy; } else { m[2] = wx; m[3] = wy; }
      target = m.slice();
      V.setSegmented(presetGroup, '');
      stage.dirty = true;
    }
  });

  // ---- Controls ----

  V.segmented(presetGroup, function (v) { tweenTo(m, PRESETS[v], 1.1); });
  playBtn.addEventListener('click', function () { tweenTo(IDENTITY, target, 1.6); });
  resetBtn.addEventListener('click', function () {
    V.setSegmented(presetGroup, '');
    tweenTo(m, IDENTITY, 0.9);
  });
  V.toggle(gridBtn, function (on) {
    showOriginal = on;
    stage.dirty = true;
  });

  // Open by bending the plane from the identity into a shear.
  tweenTo(IDENTITY, target, 1.6);
  if (tween) tween.t = -0.6;
})();
