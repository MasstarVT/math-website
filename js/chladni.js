// Chladni figures on a square plate, using the classic approximation
// u = cos(mπx)·cos(nπy) ± cos(nπx)·cos(mπy). Grains of sand take random steps
// in proportion to how hard the plate shakes under them, so they pile up on
// the nodal lines where u = 0.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('chladni');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var G = 160;               // field lookup grid
  var m = 2, n = 5, sign = -1;
  var field = null;          // |u| scaled to 1 at its largest
  var signed = null;
  var slopeX = null, slopeY = null;
  var grains = 0;
  var gx = null, gy = null;
  var showField = false;
  var playing = !V.reducedMotion;
  var catchUp = 0;           // steps still to take while paused, a few per frame
  var shade = null;          // offscreen picture of the vibration
  var settle = 0;            // steps since the mode changed
  var plate = { x: 0, y: 0, s: 1 };

  function build() {
    field = new Float32Array(G * G);
    signed = new Float32Array(G * G);
    var max = 0, i, j;
    for (j = 0; j < G; j++) {
      var y = (j + 0.5) / G;
      for (i = 0; i < G; i++) {
        var x = (i + 0.5) / G, u;
        // With m = n the minus mix vanishes everywhere; use the plain mode.
        if (m === n) u = Math.cos(m * Math.PI * x) * Math.cos(m * Math.PI * y);
        else u = Math.cos(m * Math.PI * x) * Math.cos(n * Math.PI * y) + sign * Math.cos(n * Math.PI * x) * Math.cos(m * Math.PI * y);
        signed[j * G + i] = u;
        if (Math.abs(u) > max) max = Math.abs(u);
      }
    }
    for (i = 0; i < G * G; i++) {
      signed[i] /= max;
      field[i] = Math.abs(signed[i]);
    }
    // Which way the shaking gets weaker, cell by cell.
    slopeX = new Float32Array(G * G);
    slopeY = new Float32Array(G * G);
    for (j = 0; j < G; j++) {
      for (i = 0; i < G; i++) {
        var l = field[j * G + Math.max(0, i - 1)], r = field[j * G + Math.min(G - 1, i + 1)];
        var u0 = field[Math.max(0, j - 1) * G + i], d0 = field[Math.min(G - 1, j + 1) * G + i];
        slopeX[j * G + i] = (r - l) * G / 2;
        slopeY[j * G + i] = (d0 - u0) * G / 2;
      }
    }
    shade = null;
    settle = 0;
  }

  function scatter() {
    for (var i = 0; i < grains; i++) {
      gx[i] = Math.random();
      gy[i] = Math.random();
    }
    settle = 0;
  }

  function shake(steps) {
    for (var s = 0; s < steps; s++) {
      for (var i = 0; i < grains; i++) {
        var x = gx[i], y = gy[i];
        var c = ((y * G) | 0) * G + ((x * G) | 0), a = field[c];
        // Kicked about by the shaking, and nudged toward calmer spots.
        var step = 0.0016 + 0.016 * a;
        x += (Math.random() - 0.5) * 2 * step - 0.00012 * slopeX[c];
        y += (Math.random() - 0.5) * 2 * step - 0.00012 * slopeY[c];
        // The rim keeps the sand on the plate.
        if (x < 0) x = -x; else if (x >= 1) x = 1.999999 - x;
        if (y < 0) y = -y; else if (y >= 1) y = 1.999999 - y;
        gx[i] = x;
        gy[i] = y;
      }
    }
    settle += steps;
  }

  function drawShade(ctx) {
    if (!shade) {
      shade = document.createElement('canvas');
      shade.width = shade.height = G;
      var c = shade.getContext('2d'), img = c.createImageData(G, G), d = img.data;
      for (var i = 0; i < G * G; i++) {
        var u = signed[i], a = Math.abs(u);
        // Violet one way, cyan the other; clear where the plate is still.
        d[i * 4] = u > 0 ? 167 : 110;
        d[i * 4 + 1] = u > 0 ? 139 : 231;
        d[i * 4 + 2] = 255;
        d[i * 4 + 3] = Math.round(a * 120);
      }
      c.putImageData(img, 0, 0);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(shade, plate.x, plate.y, plate.s, plate.s);
  }

  function frame(dt, st) {
    var W = st.width, H = st.height, ctx = st.ctx;
    var s = Math.min(W - 32, H - 80);
    plate = { x: (W - s) / 2, y: 64 + (H - 80 - s) / 2, s: s };
    if (!field) {
      build();
      // Paused: settle the new pattern over a few frames.
      if (!playing) catchUp = 300;
    }
    if (!gx) {
      grains = Math.round(Math.max(3000, Math.min(9000, 9000 * (s / 430) * (s / 430))));
      gx = new Float32Array(grains);
      gy = new Float32Array(grains);
      scatter();
      if (!playing) catchUp = 300;
    }
    if (playing) shake(3);
    else if (catchUp > 0) {
      shake(Math.min(30, catchUp));
      catchUp -= 30;
    } else if (!st.dirty) return;
    st.dirty = false;

    ctx.clearRect(0, 0, W, H);
    // The plate, and the clamp at its center.
    var g = ctx.createLinearGradient(plate.x, plate.y, plate.x + s, plate.y + s);
    g.addColorStop(0, '#1b1e2b');
    g.addColorStop(1, '#11131b');
    ctx.fillStyle = g;
    ctx.fillRect(plate.x, plate.y, s, s);
    ctx.strokeStyle = '#343a4e';
    ctx.lineWidth = 1;
    ctx.strokeRect(plate.x + 0.5, plate.y + 0.5, s - 1, s - 1);
    if (showField) drawShade(ctx);

    ctx.fillStyle = 'rgba(239,227,196,0.85)';
    ctx.beginPath();
    var r = Math.max(1.1, s / 330);
    for (var i = 0; i < grains; i++) ctx.rect(plate.x + gx[i] * s - r / 2, plate.y + gy[i] * s - r / 2, r, r);
    ctx.fill();

    V.setText(readout, 'Mode (' + m + ', ' + n + ')' + (m === n ? '' : sign < 0 ? ', subtracted' : ', added') + '\n' +
      (settle >= 90 ? 'Sand rests where the plate stays still' : playing ? 'The sand is moving…' : 'Paused'));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Tap the plate to knock sand loose ----

  canvas.addEventListener('click', function (e) {
    if (!gx) return;
    var b = canvas.getBoundingClientRect();
    var x = (e.clientX - b.left - plate.x) / plate.s, y = (e.clientY - b.top - plate.y) / plate.s;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    for (var i = 0; i < grains; i++) {
      var dx = gx[i] - x, dy = gy[i] - y;
      if (dx * dx + dy * dy < 0.012) {
        gx[i] = Math.min(0.999, Math.max(0, gx[i] + (Math.random() - 0.5) * 0.25));
        gy[i] = Math.min(0.999, Math.max(0, gy[i] + (Math.random() - 0.5) * 0.25));
      }
    }
    settle = 0;
    stage.dirty = true;
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
    stage.dirty = true;
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.range(V.ctl(section, 'm'), V.ctl(section, 'm-out'), String, function (v) {
    m = v;
    field = null;
    stage.dirty = true;
  });
  V.range(V.ctl(section, 'n'), V.ctl(section, 'n-out'), String, function (v) {
    n = v;
    field = null;
    stage.dirty = true;
  });

  V.segmented(V.ctl(section, 'sign'), function (v) {
    sign = v === 'plus' ? 1 : -1;
    field = null;
    stage.dirty = true;
  });

  V.ctl(section, 'scatter').addEventListener('click', function () {
    if (gx) {
      scatter();
      if (!playing) catchUp = 300;
    }
    stage.dirty = true;
  });

  V.toggle(V.ctl(section, 'field'), function (on) { showField = on; stage.dirty = true; });
})();
