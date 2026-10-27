// Buffon's needle: drop needles on a floor of evenly spaced lines. The chance
// that one crosses a line is 2L / (π d), so counting crossings estimates π.
// Darts thrown at a square estimate π the same way, from the circle inside it.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('buffon');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var lenInput = V.ctl(section, 'length');

  var MAX = 100000;
  var STRIPS = 6;       // gaps between floor lines
  var HIT = [255, 95, 162];
  var MISS = [110, 231, 255];

  var mode = 'needles';
  var len = 1;          // needle length, as a fraction of the line spacing
  var perFrame = 3;
  var playing = !V.reducedMotion;
  // Needles: u in [0, 1] across, v in [0, STRIPS) down, angle. Darts: x, y in [-1, 1].
  var data = new Float32Array(MAX * 3);
  var hits = new Uint8Array(MAX);
  var count = 0;
  var hitCount = 0;
  var queued = 0;
  var layer = document.createElement('canvas');
  var lctx = layer.getContext('2d');
  var painted = 0;      // items already drawn onto the layer

  function reset() {
    count = hitCount = queued = painted = 0;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, layer.width, layer.height);
  }

  function drop(n) {
    for (var j = 0; j < n && count < MAX; j++) {
      var o = count * 3, hit;
      if (mode === 'needles') {
        var v = Math.random() * STRIPS, a = Math.random() * Math.PI;
        var dy = len / 2 * Math.sin(a);
        data[o] = Math.random();
        data[o + 1] = v;
        data[o + 2] = a;
        // The lines sit at whole numbers, so a crossing means the two ends
        // land in different gaps.
        hit = Math.floor(v - dy) !== Math.floor(v + dy);
      } else {
        var x = Math.random() * 2 - 1, y = Math.random() * 2 - 1;
        data[o] = x;
        data[o + 1] = y;
        hit = x * x + y * y <= 1;
      }
      hits[count] = hit ? 1 : 0;
      if (hit) hitCount++;
      count++;
    }
    if (count >= MAX) setPlaying(false);
  }

  function geom(st) {
    var W = st.width, H = st.height;
    if (mode === 'needles') {
      var d = H / (STRIPS + 1);
      return { W: W, H: H, d: d, top: d / 2 };
    }
    var s = Math.min(W, H) - 40;
    return { W: W, H: H, cx: W / 2, cy: H / 2, r: s / 2 };
  }

  // Early items are drawn boldly; later ones fade so the floor never
  // saturates. It depends only on the index, so a resize redraws the same.
  function alphaFor(i) {
    return i < 500 ? 0.8 : i < 5000 ? 0.35 : i < 25000 ? 0.14 : 0.06;
  }

  function paint(G, from, to) {
    var colors = [MISS, HIT];
    for (var h = 0; h < 2; h++) {
      var c = colors[h];
      // Batch by brightness band so each band is one path.
      var start = from;
      while (start < to) {
        var a = alphaFor(start), end = start;
        while (end < to && alphaFor(end) === a) end++;
        lctx.globalAlpha = h ? a : a * 0.75;
        lctx.strokeStyle = lctx.fillStyle = 'rgb(' + c.join(',') + ')';
        lctx.beginPath();
        for (var i = start; i < end; i++) {
          if (hits[i] !== h) continue;
          var o = i * 3;
          if (mode === 'needles') {
            var cx = G.d / 2 + data[o] * (G.W - G.d);
            var cy = G.top + data[o + 1] * G.d;
            var hx = Math.cos(data[o + 2]) * len * G.d / 2;
            var hy = Math.sin(data[o + 2]) * len * G.d / 2;
            lctx.moveTo(cx - hx, cy - hy);
            lctx.lineTo(cx + hx, cy + hy);
          } else {
            lctx.rect(G.cx + data[o] * G.r - 1, G.cy - data[o + 1] * G.r - 1, 2, 2);
          }
        }
        if (mode === 'needles') {
          lctx.lineWidth = 1.2;
          lctx.stroke();
        } else {
          lctx.fill();
        }
        start = end;
      }
    }
    lctx.globalAlpha = 1;
  }

  function frame(dt, st) {
    if (layer.width !== st.canvas.width || layer.height !== st.canvas.height) {
      layer.width = st.canvas.width;
      layer.height = st.canvas.height;
      painted = 0;
    }
    if (playing) drop(perFrame);
    if (queued > 0) {
      var q = Math.min(queued, 200);
      drop(q);
      queued -= q;
    }

    var G = geom(st);
    lctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    if (painted === 0) lctx.clearRect(0, 0, G.W, G.H);
    if (painted < count) {
      paint(G, painted, count);
      painted = count;
    }

    var ctx = st.ctx;
    ctx.clearRect(0, 0, G.W, G.H);

    if (mode === 'needles') {
      ctx.strokeStyle = 'rgba(236,232,223,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var k = 0; k <= STRIPS; k++) {
        var ly = Math.round(G.top + k * G.d) + 0.5;
        ctx.moveTo(0, ly);
        ctx.lineTo(G.W, ly);
      }
      ctx.stroke();
    }

    ctx.drawImage(layer, 0, 0, G.W, G.H);

    if (mode === 'darts') {
      ctx.strokeStyle = 'rgba(236,232,223,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(G.cx - G.r + 0.5, G.cy - G.r + 0.5, G.r * 2 - 1, G.r * 2 - 1);
      ctx.beginPath();
      ctx.arc(G.cx, G.cy, G.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // At slow speeds, pick out the newest one in white.
    if (count && (!playing || perFrame <= 3)) {
      var o = (count - 1) * 3;
      ctx.strokeStyle = ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      if (mode === 'needles') {
        var cx = G.d / 2 + data[o] * (G.W - G.d), cy = G.top + data[o + 1] * G.d;
        var hx = Math.cos(data[o + 2]) * len * G.d / 2, hy = Math.sin(data[o + 2]) * len * G.d / 2;
        ctx.lineWidth = 2.5;
        ctx.moveTo(cx - hx, cy - hy);
        ctx.lineTo(cx + hx, cy + hy);
        ctx.stroke();
      } else {
        ctx.arc(G.cx + data[o] * G.r, G.cy - data[o + 1] * G.r, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    updateReadout();
  }

  function updateReadout() {
    var needles = mode === 'needles';
    var line1 = (needles ? 'Needles ' : 'Darts ') + count.toLocaleString() +
      (needles ? '   crossing ' : '   inside ') + hitCount.toLocaleString() +
      (count >= MAX ? ' (full)' : '');
    var est = needles ? (hitCount ? 2 * len * count / hitCount : 0) : (count ? 4 * hitCount / count : 0);
    var line2 = est
      ? 'π ≈ ' + est.toFixed(4) + '   off by ' + Math.abs(est - Math.PI).toFixed(4)
      : 'π ≈ ?   ' + (needles ? 'waiting for a crossing' : 'waiting for a dart');
    V.setText(readout, line1 + '\n' + line2);
  }

  reset();
  V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    if (!playing && count >= MAX) reset();
    setPlaying(!playing);
  });

  V.ctl(section, 'one').addEventListener('click', function () { drop(1); });
  V.ctl(section, 'thousand').addEventListener('click', function () { queued += 1000; });
  V.ctl(section, 'reset').addEventListener('click', reset);

  V.segmented(V.ctl(section, 'mode'), function (v) {
    mode = v;
    lenInput.disabled = mode !== 'needles';
    reset();
  });

  V.range(lenInput, V.ctl(section, 'length-out'),
    function (v) { return Math.round(v * 100) + '% of the gap'; },
    function (v) {
      if (v === len) return;
      len = v;
      if (mode === 'needles') reset();
    });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { var n = Math.round(Math.pow(10, v)); return n.toLocaleString() + ' / frame'; },
    function (v) { perFrame = Math.round(Math.pow(10, v)); });

})();
