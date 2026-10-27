// Clifford and de Jong attractors: a point hops by a fixed rule made of sines
// and cosines, and we count how often it lands in each pixel. Millions of
// hops build up a density picture of the attractor.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('attractors');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var mapGroup = V.ctl(section, 'map');
  var inputs = ['a', 'b', 'c', 'd'].map(function (n) { return V.ctl(section, n); });

  var CLASSIC = {
    clifford: [-1.4, 1.6, 1.0, 0.7],
    dejong: [1.4, -2.3, 2.4, -2.1]
  };
  var CAP = 20e6; // stop adding points here; the picture has settled long before
  var BUDGET = 5; // milliseconds of hopping per frame

  var map = 'clifford';
  var P = CLASSIC.clifford.slice();
  var bins = null, bw = 0, bh = 0;
  var layer = document.createElement('canvas');
  var lctx = layer.getContext('2d');
  var image = null;
  var x = 0.1, y = 0.1, total = 0, peak = 0;
  var view = null; // maps attractor coordinates to bins
  var frames = 0;
  var LOG = null, TONE = null;

  // Colors from faint violet to white-hot, with alpha so empty space stays dark.
  var LUT = new Uint8ClampedArray(256 * 4);
  (function () {
    var stops = [[70, 50, 150, 0], [124, 90, 230, 120], [255, 95, 162, 210], [255, 180, 84, 245], [255, 244, 222, 255]];
    for (var i = 0; i < 256; i++) {
      var t = i / 255 * (stops.length - 1), j = Math.min(Math.floor(t), stops.length - 2), f = t - j;
      for (var c = 0; c < 4; c++) LUT[i * 4 + c] = stops[j][c] + (stops[j + 1][c] - stops[j][c]) * f;
    }
  })();

  function hop(n, onPoint) {
    var a = P[0], b = P[1], c = P[2], d = P[3], nx;
    if (map === 'clifford') {
      for (var i = 0; i < n; i++) {
        nx = Math.sin(a * y) + c * Math.cos(a * x);
        y = Math.sin(b * x) + d * Math.cos(b * y);
        x = nx;
        if (onPoint) onPoint(x, y);
      }
    } else {
      for (i = 0; i < n; i++) {
        nx = Math.sin(a * y) - Math.cos(b * x);
        y = Math.sin(c * x) - Math.cos(d * y);
        x = nx;
        if (onPoint) onPoint(x, y);
      }
    }
  }

  // A quick test run: where does the attractor sit, and is it more than a
  // handful of points or a thin loop?
  function survey() {
    x = 0.1;
    y = 0.1;
    hop(200);
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, pts = [];
    hop(6000, function (px, py) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      pts.push(px, py);
    });
    var cells = {}, count = 0, sx = 39.99 / Math.max(maxX - minX, 1e-9), sy = 29.99 / Math.max(maxY - minY, 1e-9);
    for (var i = 0; i < pts.length; i += 2) {
      var k = Math.floor((pts[i] - minX) * sx) * 40 + Math.floor((pts[i + 1] - minY) * sy);
      if (!cells[k]) { cells[k] = 1; count++; }
    }
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY, cells: count, size: Math.max(maxX - minX, maxY - minY) };
  }

  function restart() {
    if (!bins) return;
    var s = survey();
    var rx = Math.max(s.maxX - s.minX, 0.05), ry = Math.max(s.maxY - s.minY, 0.05);
    var scale = Math.min(bw / rx, bh / ry) * 0.9;
    view = { s: scale, ox: bw / 2 - (s.minX + s.maxX) / 2 * scale, oy: bh / 2 + (s.minY + s.maxY) / 2 * scale };
    bins.fill(0);
    total = 0;
    peak = 0;
    frames = 0;
    stage.dirty = true;
  }

  function accumulate() {
    var t0 = performance.now(), a = P[0], b = P[1], c = P[2], d = P[3];
    var s = view.s, ox = view.ox, oy = view.oy, w = bw, h = bh, B = bins, pk = peak;
    var px = x, py = y, nx, ix, iy, k, v, n = 0, i;
    var clifford = map === 'clifford';
    do {
      if (clifford) {
        for (i = 0; i < 20000; i++) {
          nx = Math.sin(a * py) + c * Math.cos(a * px);
          py = Math.sin(b * px) + d * Math.cos(b * py);
          px = nx;
          ix = (px * s + ox) | 0;
          iy = (oy - py * s) | 0;
          if (ix >= 0 && ix < w && iy >= 0 && iy < h) {
            k = iy * w + ix;
            v = ++B[k];
            if (v > pk) pk = v;
          }
        }
      } else {
        for (i = 0; i < 20000; i++) {
          nx = Math.sin(a * py) - Math.cos(b * px);
          py = Math.sin(c * px) - Math.cos(d * py);
          px = nx;
          ix = (px * s + ox) | 0;
          iy = (oy - py * s) | 0;
          if (ix >= 0 && ix < w && iy >= 0 && iy < h) {
            k = iy * w + ix;
            v = ++B[k];
            if (v > pk) pk = v;
          }
        }
      }
      n += 20000;
    } while (performance.now() - t0 < BUDGET && total + n < CAP);
    x = px;
    y = py;
    peak = pk;
    total += n;
  }

  function render() {
    if (!LOG) {
      LOG = new Float32Array(4096);
      for (var j = 0; j < 4096; j++) LOG[j] = Math.log(1 + j);
      // Darken the middle of the log scale so only the densest folds glow,
      // while single hits still show faintly.
      TONE = new Uint8Array(256);
      for (j = 0; j < 256; j++) TONE[j] = Math.round(255 * (0.1 + 0.9 * Math.pow(j / 255, 1.8)));
    }
    var d = image.data, B = bins, n = bw * bh, inv = 255 / Math.log(1 + Math.max(peak, 1));
    for (var i = 0, o = 0; i < n; i++, o += 4) {
      var c = B[i];
      if (!c) { d[o + 3] = 0; continue; }
      var t = ((c < 4096 ? LOG[c] : Math.log(1 + c)) * inv) | 0;
      var l = TONE[t > 255 ? 255 : t] * 4;
      d[o] = LUT[l];
      d[o + 1] = LUT[l + 1];
      d[o + 2] = LUT[l + 2];
      d[o + 3] = LUT[l + 3];
    }
    lctx.putImageData(image, 0, 0);
  }

  function frame(dt, st) {
    var wq = Math.min(st.dpr, 1.25);
    var w = Math.round(st.width * wq), h = Math.round(st.height * wq);
    if (!bins || w !== bw || h !== bh) {
      bw = w;
      bh = h;
      bins = new Uint32Array(bw * bh);
      layer.width = bw;
      layer.height = bh;
      image = lctx.createImageData(bw, bh);
      restart();
    }

    var growing = total < CAP;
    if (growing) {
      // Hop on three frames, then spend the fourth on redrawing the picture,
      // so no single frame does both.
      frames++;
      if (frames % 4 !== 0) {
        accumulate();
        if (total < CAP) {
          V.setText(readout, (total / 1e6).toFixed(1) + ' million points');
          return;
        }
      }
      render();
    } else if (!st.dirty) {
      return;
    }
    st.dirty = false;

    var ctx = st.ctx;
    ctx.clearRect(0, 0, st.width, st.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(layer, 0, 0, st.width, st.height);
    V.setText(readout, (total / 1e6).toFixed(1) + ' million points' + (total >= CAP ? ', done' : ''));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  var syncing = false;
  var updaters = inputs.map(function (input, i) {
    return V.range(input, V.ctl(section, ['a', 'b', 'c', 'd'][i] + '-out'),
      function (v) { return v.toFixed(2); },
      function (v) {
        P[i] = v;
        if (!syncing) restart();
      });
  });

  function setParams(p) {
    syncing = true;
    for (var i = 0; i < 4; i++) {
      inputs[i].value = p[i];
      updaters[i]();
    }
    syncing = false;
    restart();
  }

  V.segmented(mapGroup, function (m) {
    map = m;
    setParams(CLASSIC[m]);
  });

  V.ctl(section, 'classic').addEventListener('click', function () { setParams(CLASSIC[map]); });

  // Roll until the shape is spread out, not a few points or a thin loop.
  V.ctl(section, 'random').addEventListener('click', function () {
    var p, s, tries = 0;
    do {
      p = [];
      for (var i = 0; i < 4; i++) p.push(Math.round((Math.random() * 6 - 3) * 100) / 100);
      P = p;
      s = survey();
    } while ((s.cells < 260 || s.size < 0.3) && ++tries < 200);
    setParams(p);
  });
})();
