// Weierstrass function W(x) = Σ aⁿ cos(3ⁿ π x): continuous everywhere,
// differentiable nowhere when 3a ≥ 1 (Hardy, 1916). Each panel is sampled
// once per device pixel; terms finer than a pixel are left out.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('weierstrass');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var zoomInput = V.ctl(section, 'zoom');
  var zoomOut = V.ctl(section, 'zoom-out');

  var B = 3;
  var MAX_ZOOM = 10;        // powers of ten
  var a = 0.5;
  var terms = 3;
  var x0 = 0.4127;
  var zoom = 0;             // log10 of the magnification
  var playing = !V.reducedMotion;
  var hold = 0;
  var ys = null;

  // Sum the terms from n = 0 up to (not including) count.
  function sum(x, count) {
    var s = 0, amp = 1, freq = Math.PI;
    for (var n = 0; n < count; n++) {
      s += amp * Math.cos(freq * x);
      amp *= a;
      freq *= B;
    }
    return s;
  }

  function frame(dt, st) {
    if (playing) {
      if (zoom < MAX_ZOOM) {
        zoom = Math.min(MAX_ZOOM, zoom + dt * 0.42);
      } else {
        hold += dt;
        if (hold > 1.5) { hold = 0; zoom = 0; }
      }
      zoomInput.value = zoom.toFixed(2);
      showZoom();
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function panels(W, H) {
    var top = 62, gap = 16, bottom = 12, h = (H - top - gap - bottom) / 2;
    return [{ x: 12, y: top, w: W - 24, h: h }, { x: 12, y: top + h + gap, w: W - 24, h: h }];
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height, P = panels(W, H);
    ctx.clearRect(0, 0, W, H);
    var width = 2 / Math.pow(10, zoom);
    var n = Math.round(P[0].w * Math.min(st.dpr, 1.5));
    if (!ys || ys.length !== n + 1) ys = new Float64Array(n + 1);
    // Terms whose wiggles are narrower than a pixel only add noise.
    var dx = width / n, all = 0;
    while (all < 60 && Math.pow(B, all) * dx < 0.5) all++;
    plot(ctx, P[0], Math.min(terms, all), terms, width, n, 'rgba(236,232,223,0.9)',
      'First ' + terms + (terms === 1 ? ' wave' : ' waves') + ': smooth');
    plot(ctx, P[1], all, Infinity, width, n, '#6ee7ff', 'All the waves: never smooth');

    V.setText(readout, 'Zoom × ' + fmtZoom(zoom) + '\n' +
      'a = ' + a.toFixed(2) + ', 3a = ' + (3 * a).toFixed(2) + ', dimension ' + (2 + Math.log(a) / Math.log(B)).toFixed(2));
  }

  function plot(ctx, p, count, want, width, n, color, label) {
    var lo = Infinity, hi = -Infinity, i;
    for (i = 0; i <= n; i++) {
      var v = sum(x0 + (i / n - 0.5) * width, count);
      ys[i] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    // Stretch the height to fit, so only the shape is left to compare.
    var span = Math.max(hi - lo, 1e-300), pad = p.h * 0.12;
    ctx.fillStyle = 'rgba(20,22,33,0.6)';
    ctx.strokeStyle = '#222534';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(p.x, p.y, p.w, p.h, 10); else ctx.rect(p.x, p.y, p.w, p.h);
    ctx.fill();
    ctx.stroke();

    // The point we're zooming into.
    var cx = p.x + p.w / 2;
    ctx.strokeStyle = 'rgba(155,157,175,0.3)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(cx, p.y + 6); ctx.lineTo(cx, p.y + p.h - 6); ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x, p.y, p.w, p.h);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'bevel';
    ctx.beginPath();
    for (i = 0; i <= n; i++) {
      var x = p.x + p.w * i / n, y = p.y + p.h - pad - (ys[i] - lo) / span * (p.h - 2 * pad);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = '#9b9daf';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(label, p.x + p.w - 10, p.y + 8);
    if (want !== Infinity && count < want) {
      ctx.fillStyle = '#6f7286';
      ctx.fillText('(finer waves are below a pixel)', p.x + p.w - 10, p.y + 24);
    }
  }

  function fmtZoom(z) {
    var v = Math.pow(10, z);
    if (v < 1e6) return Math.round(v).toLocaleString('en-US');
    var e = Math.floor(z);
    return (v / Math.pow(10, e)).toFixed(1) + ' × 10' + sup(e);
  }

  function sup(n) {
    var d = '⁰¹²³⁴⁵⁶⁷⁸⁹';
    return String(n).split('').map(function (c) { return d[+c]; }).join('');
  }

  function showZoom() { zoomOut.textContent = '× ' + fmtZoom(zoom); }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Pointer: tap a panel to zoom in there instead ----

  // A click, not pointerdown, so a swipe that scrolls the page moves nothing.
  canvas.addEventListener('click', function (e) {
    var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    var P = panels(stage.width, stage.height);
    for (var k = 0; k < 2; k++) {
      var p = P[k];
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
        x0 += ((x - p.x) / p.w - 0.5) * 2 / Math.pow(10, zoom);
        stage.dirty = true;
      }
    }
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = p ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    if (!playing && zoom >= MAX_ZOOM) zoom = 0;
    hold = 0;
    setPlaying(!playing);
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    zoom = 0;
    hold = 0;
    zoomInput.value = '0';
    showZoom();
    stage.dirty = true;
  });

  zoomInput.addEventListener('input', function () {
    setPlaying(false);
    zoom = parseFloat(zoomInput.value);
    showZoom();
    stage.dirty = true;
  });
  showZoom();

  V.range(V.ctl(section, 'a'), V.ctl(section, 'a-out'),
    function (v) { return v.toFixed(2); },
    function (v) { a = v; stage.dirty = true; });

  V.range(V.ctl(section, 'terms'), V.ctl(section, 'terms-out'),
    function (v) { return String(v); },
    function (v) { terms = v; stage.dirty = true; });
})();
