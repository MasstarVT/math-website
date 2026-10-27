// A ripple tank: each source sends out cos(kr − ωt), and the water's height is
// the sum. Where the distances to the two sources differ by a half-odd number
// of wavelengths the waves cancel, along hyperbolas with the sources as foci.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('interference');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var gapInput = V.ctl(section, 'gap');
  var gapOut = V.ctl(section, 'gap-out');

  var TABLE = 1024;
  var COS = new Float32Array(TABLE);
  for (var c = 0; c < TABLE; c++) COS[c] = Math.cos(2 * Math.PI * c / TABLE);
  var WAVE = [], GLOW = [];          // color lookup tables, filled on first use

  var mode = 'two';
  var view = 'waves';
  var lambda = 28;                   // css px
  var gap = 130;                     // distance between sources or slits
  var playing = !V.reducedMotion;
  var nodal = false;
  var t = 0;
  var src = [null, null];            // two-source positions, fractions of the canvas
  var hover = null;
  var grid = null;                   // per-cell phases and weights
  var off = null, img = null;
  var geo = { W: 0, H: 0, cell: 4, gw: 0, gh: 0 };

  function luts() {
    for (var i = 0; i < 256; i++) {
      var v = i / 127.5 - 1, a = Math.abs(v), r, g, b;
      // Troughs blue, still water dark, crests amber.
      if (v < 0) { r = 12 + 18 * a; g = 13 + 70 * a; b = 20 + 150 * a; }
      else { r = 12 + 243 * a; g = 13 + 180 * a; b = 20 + 70 * a; }
      WAVE.push([r | 0, g | 0, b | 0]);
      var f = i / 255;
      GLOW.push([(12 + 243 * Math.pow(f, 0.8)) | 0, (13 + 196 * f) | 0, (20 + 90 * f * f) | 0]);
    }
  }

  function sources() {
    if (mode === 'two') return [[src[0][0] * geo.W, src[0][1] * geo.H], [src[1][0] * geo.W, src[1][1] * geo.H]];
    var bx = barrierX(), g = Math.min(gap, geo.H - 40);
    return [[bx, geo.H / 2 - g / 2], [bx, geo.H / 2 + g / 2]];
  }

  function barrierX() { return Math.round(geo.W * 0.3); }

  // Phase k·r and weight for every cell from each source; redone only when
  // the sources or the wavelength change.
  function build() {
    var S = sources(), n = geo.gw * geo.gh, k = 2 * Math.PI / lambda, bx = barrierX();
    grid = { p0: new Float32Array(n), p1: new Float32Array(n), w0: new Float32Array(n), w1: new Float32Array(n), inten: new Float32Array(n) };
    for (var j = 0; j < geo.gh; j++) {
      for (var i = 0; i < geo.gw; i++) {
        var x = (i + 0.5) * geo.cell, y = (j + 0.5) * geo.cell, q = j * geo.gw + i;
        if (mode === 'slit' && x < bx) {
          // The plane wave arriving from the left.
          grid.p0[q] = k * x; grid.w0[q] = 1; grid.w1[q] = 0;
          grid.inten[q] = 0.45;
          continue;
        }
        var r0 = Math.hypot(x - S[0][0], y - S[0][1]), r1 = Math.hypot(x - S[1][0], y - S[1][1]);
        var base = mode === 'slit' ? k * bx : 0;
        grid.p0[q] = base + k * r0;
        grid.p1[q] = base + k * r1;
        var a = 1 / Math.sqrt(1 + r0 / 60), b = 1 / Math.sqrt(1 + r1 / 60);
        // Even out the contrast so the pattern reads across the whole tank.
        var norm = (0.55 + 0.45 * (a + b) / 2) / (a + b);
        grid.w0[q] = a * norm;
        grid.w1[q] = b * norm;
        var re = a * Math.cos(k * r0) + b * Math.cos(k * r1), im = a * Math.sin(k * r0) + b * Math.sin(k * r1);
        grid.inten[q] = (re * re + im * im) / ((a + b) * (a + b));
      }
    }
  }

  function frame(dt, st) {
    var W = st.width, H = st.height, ctx = st.ctx;
    var cell = Math.max(3, Math.ceil(W / 230));
    var gw = Math.ceil(W / cell), gh = Math.ceil(H / cell);
    if (!WAVE.length) luts();
    if (!src[0]) { src = [[0.5 - gap / 2 / W, 0.5], [0.5 + gap / 2 / W, 0.5]]; }
    if (geo.W !== W || geo.H !== H || geo.cell !== cell || !off) {
      geo = { W: W, H: H, cell: cell, gw: gw, gh: gh };
      off = document.createElement('canvas');
      off.width = gw;
      off.height = gh;
      img = off.getContext('2d').createImageData(gw, gh);
      grid = null;
    }
    if (!grid) build();

    var animate = playing && view === 'waves';
    if (animate) t += dt;
    else if (!st.dirty) return;
    st.dirty = false;

    // Fill the low-resolution picture, then scale it up smoothly.
    var data = img.data, n = gw * gh, wt = 2 * Math.PI * t * 1.1, q, col, idx;
    var shift = Math.round(wt / (2 * Math.PI) * TABLE) % TABLE, scale = TABLE / (2 * Math.PI);
    for (q = 0; q < n; q++) {
      if (view === 'waves') {
        var i0 = ((grid.p0[q] * scale | 0) - shift) & (TABLE - 1);
        var i1 = ((grid.p1[q] * scale | 0) - shift) & (TABLE - 1);
        var v = (grid.w0[q] * COS[i0] + grid.w1[q] * COS[i1]) * 0.85;
        idx = Math.max(0, Math.min(255, (v * 127.5 + 127.5) | 0));
        col = WAVE[idx];
      } else {
        col = GLOW[Math.min(255, (grid.inten[q] * 255) | 0)];
      }
      data[q * 4] = col[0];
      data[q * 4 + 1] = col[1];
      data[q * 4 + 2] = col[2];
      data[q * 4 + 3] = 255;
    }
    off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, gw * cell, gh * cell);

    var S = sources();
    if (nodal) drawNodal(ctx, S);

    if (mode === 'slit') {
      // The barrier, with two narrow openings.
      var bx = barrierX(), sw = 6;
      ctx.fillStyle = '#343a4e';
      ctx.fillRect(bx - 3, 0, 6, S[0][1] - sw / 2);
      ctx.fillRect(bx - 3, S[0][1] + sw / 2, 6, S[1][1] - S[0][1] - sw);
      ctx.fillRect(bx - 3, S[1][1] + sw / 2, 6, H - S[1][1] - sw / 2);
      screenGraph(ctx, S);
    } else {
      S.forEach(function (p) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0a0b10';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p[0], p[1], 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }

    var d = Math.hypot(S[1][0] - S[0][0], S[1][1] - S[0][1]);
    var lines = [(mode === 'two' ? 'Sources ' : 'Slits ') + (d / lambda).toFixed(1) + ' wavelengths apart',
      'Dark where the paths differ by ½, 1½, 2½… λ'];
    if (hover && (mode === 'two' || hover[0] > barrierX())) {
      var diff = Math.abs(Math.hypot(hover[0] - S[0][0], hover[1] - S[0][1]) - Math.hypot(hover[0] - S[1][0], hover[1] - S[1][1])) / lambda;
      var near = Math.abs(diff - Math.round(diff));
      lines.push('Here: paths differ by ' + diff.toFixed(2) + ' λ' + (near < 0.12 ? ', bright' : near > 0.38 ? ', dark' : ''));
    }
    V.setText(readout, lines.join('\n'));
  }

  // Hyperbolas |r₀ − r₁| = (m + ½)λ, both branches, foci at the sources.
  function drawNodal(ctx, S) {
    var mx = (S[0][0] + S[1][0]) / 2, my = (S[0][1] + S[1][1]) / 2;
    var cc = Math.hypot(S[1][0] - S[0][0], S[1][1] - S[0][1]) / 2;
    if (cc < 1) return;
    var ang = Math.atan2(S[1][1] - S[0][1], S[1][0] - S[0][0]), ca = Math.cos(ang), sa = Math.sin(ang);
    ctx.save();
    if (mode === 'slit') {
      ctx.beginPath();
      ctx.rect(barrierX(), 0, geo.W, geo.H);
      ctx.clip();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([4, 4]);
    for (var m = 0; (m + 0.5) * lambda < 2 * cc; m++) {
      var a = (m + 0.5) * lambda / 2, b = Math.sqrt(cc * cc - a * a);
      for (var side = -1; side <= 1; side += 2) {
        ctx.beginPath();
        for (var j = 0; j <= 80; j++) {
          var u = -4 + 8 * j / 80, hx = side * a * Math.cosh(u), hy = b * Math.sinh(u);
          var x = mx + hx * ca - hy * sa, y = my + hx * sa + hy * ca;
          if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Average brightness along the right-hand wall, as a curve.
  function screenGraph(ctx, S) {
    var W = geo.W, H = geo.H, x = W - 4, k = 2 * Math.PI / lambda, band = Math.min(70, W * 0.12);
    ctx.fillStyle = 'rgba(10,11,16,0.7)';
    ctx.fillRect(W - band - 8, 0, band + 8, H);
    ctx.strokeStyle = '#ffb454';
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    for (var y = 0; y <= H; y += 2) {
      var r0 = Math.hypot(x - S[0][0], y - S[0][1]), r1 = Math.hypot(x - S[1][0], y - S[1][1]);
      var I = (1 + Math.cos(k * (r0 - r1))) / 2;
      var px = W - 6 - I * band;
      if (y) ctx.lineTo(px, y); else ctx.moveTo(px, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#6f7286';
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('screen', W - 8, H - 8);
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Drag the sources ----

  V.drag(canvas, {
    hit: function (x, y) {
      if (mode !== 'two') return null;
      var S = sources();
      for (var i = 0; i < 2; i++) if (Math.hypot(x - S[i][0], y - S[i][1]) < 20) return { i: i };
      return null;
    },
    move: function (h, x, y) {
      src[h.i] = [Math.max(0.02, Math.min(0.98, x / geo.W)), Math.max(0.02, Math.min(0.98, y / geo.H))];
      var S = sources();
      gap = Math.round(Math.hypot(S[1][0] - S[0][0], S[1][1] - S[0][1]));
      gapInput.value = gap;
      V.setText(gapOut, gap + ' px');
      hover = null;
      grid = null;
      stage.dirty = true;
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    hover = [e.clientX - r.left, e.clientY - r.top];
    stage.dirty = true;
  });
  canvas.addEventListener('pointerleave', function () { hover = null; stage.dirty = true; });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); stage.dirty = true; });

  V.segmented(V.ctl(section, 'mode'), function (v) {
    mode = v;
    grid = null;
    stage.dirty = true;
  });

  V.segmented(V.ctl(section, 'view'), function (v) {
    view = v;
    stage.dirty = true;
  });

  V.range(V.ctl(section, 'lambda'), V.ctl(section, 'lambda-out'),
    function (v) { return v + ' px'; },
    function (v) { lambda = v; grid = null; stage.dirty = true; });

  V.range(gapInput, gapOut,
    function (v) { return v + ' px'; },
    function (v) {
      gap = v;
      // Two sources: keep their midpoint and direction, change the distance.
      if (src[0] && geo.W) {
        var mx = (src[0][0] + src[1][0]) / 2 * geo.W, my = (src[0][1] + src[1][1]) / 2 * geo.H;
        var dx = (src[1][0] - src[0][0]) * geo.W, dy = (src[1][1] - src[0][1]) * geo.H, d = Math.hypot(dx, dy) || 1;
        src = [[(mx - dx / d * gap / 2) / geo.W, (my - dy / d * gap / 2) / geo.H],
          [(mx + dx / d * gap / 2) / geo.W, (my + dy / d * gap / 2) / geo.H]];
      }
      grid = null;
      stage.dirty = true;
    });

  V.toggle(V.ctl(section, 'nodal'), function (on) { nodal = on; stage.dirty = true; });
})();
