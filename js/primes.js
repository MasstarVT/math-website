// Every whole number n plotted at polar coordinates (n, n radians). The arms
// come from 2π ≈ 44/7 ≈ 710/113; primes only land in arms whose numbers
// share no factor with 6, 44 or 710.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('primes');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var zoomInput = V.ctl(section, 'zoom');
  var presetGroup = V.ctl(section, 'preset');
  var zoomBtn = V.ctl(section, 'auto');

  var MAX_N = 1000000;
  var MIN_LOG = Math.log10(30);
  var MAX_LOG = Math.log10(MAX_N);

  // Sieve of Eratosthenes: composite[n] = 1 for every non-prime.
  var composite = new Uint8Array(MAX_N + 1);
  composite[0] = composite[1] = 1;
  for (var i = 2; i * i <= MAX_N; i++) {
    if (!composite[i]) for (var j = i * i; j <= MAX_N; j += i) composite[j] = 1;
  }

  var PRIME = [255, 180, 84];
  var OTHER = [72, 82, 112];
  var ALL = [110, 231, 255];

  var logR = Math.log10(120);
  var targetLog = logR;
  var show = 'both';
  var autoZoom = false;
  var image = null;

  function frame(dt, st) {
    if (autoZoom) {
      targetLog = Math.min(MAX_LOG, logR + dt * 0.22);
      if (targetLog >= MAX_LOG) setAuto(false);
    }
    if (Math.abs(targetLog - logR) > 1e-4) {
      logR += (targetLog - logR) * (autoZoom ? 1 : 1 - Math.exp(-dt * 4));
      zoomInput.value = logR.toFixed(3);
      st.dirty = true;
    } else if (logR !== targetLog) {
      logR = targetLog;
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function draw(st) {
    var W = st.canvas.width, Hd = st.canvas.height;
    if (!image || image.width !== W || image.height !== Hd) image = st.ctx.createImageData(W, Hd);
    var data = new Uint32Array(image.data.buffer);
    data.fill(0xff160f0d);

    var R = Math.pow(10, logR);
    var half = Math.min(W, Hd) / 2;
    var s = half / R;
    var cx = W / 2, cy = Hd / 2;
    // Numbers past R still land in the corners of a non-square canvas.
    var limit = Math.min(MAX_N, Math.ceil(R * Math.hypot(W, Hd) / 2 / half));
    // Bigger dots when few numbers are on screen, single pixels when zoomed far out.
    var rad = Math.max(0, Math.round((3.4 - logR * 0.75) * st.dpr));
    var primes = 0;

    for (var n = 1; n <= limit; n++) {
      var isPrime = !composite[n];
      if (isPrime) primes++;
      if (show === 'primes' && !isPrime) continue;
      var c = show === 'all' ? ALL : isPrime ? PRIME : OTHER;
      plot(data, W, Hd, Math.round(cx + n * Math.cos(n) * s), Math.round(cy - n * Math.sin(n) * s), rad, c);
    }
    st.ctx.putImageData(image, 0, 0);

    V.setText(readout, 'Numbers 1 to ' + limit.toLocaleString() + '   ' + primes.toLocaleString() + ' primes');
  }

  function plot(data, W, Hd, x, y, rad, c) {
    var word = (255 << 24 | c[2] << 16 | c[1] << 8 | c[0]) >>> 0;
    for (var dy = -rad; dy <= rad; dy++) {
      var yy = y + dy;
      if (yy < 0 || yy >= Hd) continue;
      for (var dx = -rad; dx <= rad; dx++) {
        var xx = x + dx;
        if (xx < 0 || xx >= W || dx * dx + dy * dy > rad * rad + rad) continue;
        data[yy * W + xx] = word;
      }
    }
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setAuto(on) {
    if (on && logR >= MAX_LOG - 0.01) {
      logR = targetLog = Math.log10(120);
      stage.dirty = true;
    }
    autoZoom = on;
    zoomBtn.setAttribute('aria-pressed', String(on));
    if (on) V.setSegmented(presetGroup, '');
  }
  V.toggle(zoomBtn, setAuto);

  zoomInput.min = MIN_LOG.toFixed(3);
  zoomInput.max = MAX_LOG.toFixed(3);
  zoomInput.value = logR.toFixed(3);
  zoomInput.addEventListener('input', function () {
    setAuto(false);
    V.setSegmented(presetGroup, '');
    logR = targetLog = parseFloat(zoomInput.value);
    stage.dirty = true;
  });

  V.segmented(presetGroup, function (r) {
    setAuto(false);
    targetLog = Math.log10(parseFloat(r));
  });

  V.segmented(V.ctl(section, 'show'), function (v) {
    show = v;
    stage.dirty = true;
  });
})();
