// Penrose tilings by repeated subdivision of Robinson triangles: each tile
// is two mirror-image triangles, and every round splits each triangle into
// smaller ones of the same two shapes, scaled down by the golden ratio.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('penrose');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var genInput = V.ctl(section, 'gen');
  var genOut = V.ctl(section, 'gen-out');
  var playBtn = V.ctl(section, 'play');

  var PHI = (1 + Math.sqrt(5)) / 2;
  var MAX = 8;
  // Tile colors: thin (type 0) and fat (type 1) halves.
  var FILL = [[255, 95, 162], [255, 180, 84]];

  var colorBy = 'shape';
  var gen = 5;
  var prev = -1;           // generation fading out
  var fade = 1;
  var playing = !V.reducedMotion;
  var hold = 0;
  var cache = {};

  // Each triangle is [type, ax, ay, bx, by, cx, cy] with A the apex.
  function wheel() {
    var out = [];
    for (var i = 0; i < 10; i++) {
      var b = (2 * i - 1) * Math.PI / 10, c = (2 * i + 1) * Math.PI / 10;
      if (i % 2 === 0) { var t = b; b = c; c = t; }
      out.push([0, 0, 0, Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)]);
    }
    return out;
  }

  function lerp(ax, ay, bx, by, f) { return [ax + (bx - ax) * f, ay + (by - ay) * f]; }

  function subdivide(tris) {
    var out = [], g = 1 / PHI;
    for (var i = 0; i < tris.length; i++) {
      var T = tris[i], ax = T[1], ay = T[2], bx = T[3], by = T[4], cx = T[5], cy = T[6], P, Q, R;
      if (T[0] === 0) {
        // Half a thin rhombus becomes a thin half and a fat half.
        P = lerp(ax, ay, bx, by, g);
        out.push([0, cx, cy, P[0], P[1], bx, by], [1, P[0], P[1], cx, cy, ax, ay]);
      } else {
        // Half a fat rhombus becomes two fat halves and a thin half.
        Q = lerp(bx, by, ax, ay, g);
        R = lerp(bx, by, cx, cy, g);
        out.push([1, R[0], R[1], cx, cy, ax, ay], [1, Q[0], Q[1], R[0], R[1], bx, by], [0, R[0], R[1], Q[0], Q[1], ax, ay]);
      }
    }
    return out;
  }

  function generation(k) {
    if (!cache[k]) cache[k] = k === 0 ? wheel() : subdivide(generation(k - 1));
    return cache[k];
  }

  // Which way a tile's axis lies: a multiple of 18°, folded by half a turn
  // because the two halves of a tile point opposite ways.
  function direction(T) {
    var a = Math.atan2((T[4] + T[6]) / 2 - T[2], (T[3] + T[5]) / 2 - T[1]);
    return ((Math.round(a / (Math.PI / 10)) % 10) + 10) % 10;
  }

  function draw(ctx, tris, cx, cy, R, alpha) {
    var groups = {};
    for (var i = 0; i < tris.length; i++) {
      var T = tris[i];
      var key = colorBy === 'shape' ? T[0] : T[0] * 100 + direction(T);
      (groups[key] || (groups[key] = [])).push(T);
    }
    ctx.globalAlpha = alpha;
    for (var k in groups) {
      var list = groups[k], type = list[0][0];
      if (colorBy === 'shape') {
        var c = FILL[type];
        ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (type ? 0.72 : 0.78) + ')';
      } else {
        var dir = k % 100;
        ctx.fillStyle = 'hsla(' + dir * 36 + ',75%,' + (type ? 62 : 50) + '%,0.7)';
      }
      ctx.beginPath();
      for (i = 0; i < list.length; i++) {
        T = list[i];
        ctx.moveTo(cx + T[1] * R, cy + T[2] * R);
        ctx.lineTo(cx + T[3] * R, cy + T[4] * R);
        ctx.lineTo(cx + T[5] * R, cy + T[6] * R);
        ctx.closePath();
      }
      ctx.fill();
    }
    // Outline each tile: skip the edge B–C that the two halves share.
    ctx.strokeStyle = 'rgba(10,11,16,0.9)';
    ctx.lineWidth = Math.max(0.6, Math.min(2, R / Math.pow(PHI, gen) * 0.05));
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (i = 0; i < tris.length; i++) {
      T = tris[i];
      ctx.moveTo(cx + T[5] * R, cy + T[6] * R);
      ctx.lineTo(cx + T[1] * R, cy + T[2] * R);
      ctx.lineTo(cx + T[3] * R, cy + T[4] * R);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function frame(dt, st) {
    if (playing) {
      hold += dt;
      if (hold > (gen === MAX - 1 ? 3 : 1.5)) {
        hold = 0;
        setGen(gen === MAX - 1 ? 1 : gen + 1);
      }
    }
    if (fade < 1) {
      fade = Math.min(1, fade + dt * 2.5);
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;

    var W = st.width, H = st.height, ctx = st.ctx;
    // Big enough that the decagon covers every corner of the canvas.
    var R = Math.hypot(W, H) / 2 / Math.cos(Math.PI / 10) * 1.02;
    var cx = W / 2, cy = H / 2;
    ctx.clearRect(0, 0, W, H);
    if (fade < 1 && prev >= 0) draw(ctx, generation(prev), cx, cy, R, 1 - fade);
    draw(ctx, generation(gen), cx, cy, R, fade < 1 ? fade : 1);

    var tris = generation(gen), n0 = 0, n1 = 0;
    for (var i = 0; i < tris.length; i++) { if (tris[i][0]) n1++; else n0++; }
    V.setText(readout,
      'Fat ' + (n1 / 2).toLocaleString() + '   thin ' + (n0 / 2).toLocaleString() + '\n' +
      'Fat ÷ thin = ' + (n0 ? (n1 / n0).toFixed(4) : '–') + '   φ = 1.6180');
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setGen(k) {
    if (k === gen) return;
    prev = gen;
    gen = k;
    fade = V.reducedMotion ? 1 : 0;
    genInput.value = k;
    genOut.textContent = String(k);
    stage.dirty = true;
  }

  function setPlaying(p) {
    playing = p;
    hold = 0;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  genInput.addEventListener('input', function () {
    setPlaying(false);
    setGen(parseInt(genInput.value, 10));
  });
  genOut.textContent = String(gen);

  V.segmented(V.ctl(section, 'color'), function (v) {
    colorBy = v;
    stage.dirty = true;
  });
})();
