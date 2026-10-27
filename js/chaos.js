// The chaos game: from the current point, pick a random corner and jump a
// fixed fraction of the way there. Plot, repeat. A fractal appears.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('chaos');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var MAX_POINTS = 3000000;
  var BG = 0xff160f0d;

  function polygon(n, rot) {
    var v = [];
    for (var i = 0; i < n; i++) {
      var a = Math.PI / 2 + rot + i * 2 * Math.PI / n;
      v.push([Math.cos(a), Math.sin(a)]);
    }
    return v;
  }

  // ratio: how far toward the chosen corner each jump goes.
  var GAMES = {
    triangle: { verts: polygon(3, 0), ratio: 0.5, rule: 'any' },
    square: { verts: polygon(4, Math.PI / 4), ratio: 0.5, rule: 'no-repeat' },
    pentagon: { verts: polygon(5, 0), ratio: 0.618, rule: 'any' },
    hexagon: { verts: polygon(6, 0), ratio: 2 / 3, rule: 'any' },
    fern: { fern: true }
  };

  // Barnsley's fern: four affine maps picked with these probabilities.
  var FERN = [
    { p: 0.01, a: 0, b: 0, c: 0, d: 0.16, e: 0, f: 0 },
    { p: 0.85, a: 0.85, b: 0.04, c: -0.04, d: 0.85, e: 0, f: 1.6 },
    { p: 0.07, a: 0.2, b: -0.26, c: 0.23, d: 0.22, e: 0, f: 1.6 },
    { p: 0.07, a: -0.15, b: 0.28, c: 0.26, d: 0.24, e: 0, f: 0.44 }
  ];

  var game = GAMES.triangle;
  var x = 0, y = 0, prev = -1;
  var count = 0;
  var perFrame = 50;
  var playing = !V.reducedMotion;
  var last = null;
  var image = null, pixels = null, colors = [];
  var map = null;

  function reset(st) {
    var W = st.canvas.width, H = st.canvas.height;
    image = st.ctx.createImageData(W, H);
    pixels = new Uint32Array(image.data.buffer);
    pixels.fill(BG);

    var n = game.fern ? FERN.length : game.verts.length;
    colors = [];
    for (var i = 0; i < n; i++) {
      var m = V.gradient(V.SPECTRUM, n === 1 ? 0 : i / (n - 1)).match(/\d+/g);
      colors.push((255 << 24 | m[2] << 16 | m[1] << 8 | m[0]) >>> 0);
    }

    // Math -> device pixels.
    var half = Math.min(W, H) / 2;
    if (game.fern) {
      var s = Math.min(W / 5.6, H / 10.6);
      map = { s: s, ox: W / 2 - 0.24 * s, oy: H / 2 + 5 * s };
    } else {
      var r = half * 0.9;
      var shift = game.verts.length === 3 ? r * 0.25 : 0;
      map = { s: r, ox: W / 2, oy: H / 2 + shift };
    }

    // Start somewhere random inside the shape.
    x = (Math.random() - 0.5) * (game.fern ? 1 : 0.6);
    y = game.fern ? Math.random() * 2 : (Math.random() - 0.5) * 0.6;
    prev = -1;
    count = 0;
    last = null;
    st.dirty = true;
  }

  function pickFern() {
    var r = Math.random(), acc = 0;
    for (var i = 0; i < FERN.length; i++) {
      acc += FERN[i].p;
      if (r < acc) return i;
    }
    return FERN.length - 1;
  }

  function run(n) {
    var W = image.width, H = image.height;
    var verts = game.verts, ratio = game.ratio;
    for (var i = 0; i < n && count < MAX_POINTS; i++) {
      var fromX = x, fromY = y, k;
      if (game.fern) {
        k = pickFern();
        var m = FERN[k];
        var nx = m.a * x + m.b * y + m.e;
        y = m.c * x + m.d * y + m.f;
        x = nx;
      } else {
        do {
          k = Math.floor(Math.random() * verts.length);
        } while (game.rule === 'no-repeat' && k === prev);
        prev = k;
        x += (verts[k][0] - x) * ratio;
        y += (verts[k][1] - y) * ratio;
      }
      count++;
      var px = Math.round(map.ox + x * map.s), py = Math.round(map.oy - y * map.s);
      if (px >= 0 && px < W && py >= 0 && py < H) pixels[py * W + px] = colors[k];
      last = { fromX: fromX, fromY: fromY, k: k };
    }
    if (count >= MAX_POINTS) setPlaying(false);
  }

  function frame(dt, st) {
    if (!image || image.width !== st.canvas.width || image.height !== st.canvas.height) reset(st);
    if (playing) {
      run(perFrame);
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;

    var ctx = st.ctx;
    ctx.putImageData(image, 0, 0);

    // putImageData works in device pixels; overlays use CSS pixels.
    var d = st.dpr;
    function sx(v) { return (map.ox + v * map.s) / d; }
    function sy(v) { return (map.oy - v * map.s) / d; }

    if (!game.fern) {
      game.verts.forEach(function (v, i) {
        ctx.fillStyle = V.gradient(V.SPECTRUM, i / (game.verts.length - 1));
        ctx.beginPath();
        ctx.arc(sx(v[0]), sy(v[1]), 5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // At slow speeds, show the last jump: from where, toward which corner.
    if (last && (!playing || perFrame <= 3)) {
      if (!game.fern) {
        var v = game.verts[last.k];
        ctx.strokeStyle = 'rgba(236,232,223,0.5)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx(last.fromX), sy(last.fromY));
        ctx.lineTo(sx(v[0]), sy(v[1]));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx(last.fromX), sy(last.fromY));
        ctx.lineTo(sx(x), sy(y));
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx(x), sy(y), 4, 0, Math.PI * 2);
      ctx.fill();
    }

    V.setText(readout, 'Points ' + count.toLocaleString());
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'one').addEventListener('click', function () {
    setPlaying(false);
    if (!image) reset(stage);
    run(1);
    stage.dirty = true;
  });

  V.ctl(section, 'reset').addEventListener('click', function () { reset(stage); });

  V.segmented(V.ctl(section, 'game'), function (name) {
    game = GAMES[name];
    reset(stage);
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { var n = Math.round(Math.pow(10, v)); return n.toLocaleString() + ' / frame'; },
    function (v) { perFrame = Math.round(Math.pow(10, v)); });
})();
