// Ford circles: on every fraction p/q (in lowest terms) stand a circle of
// radius 1/(2q²) touching the number line. Two circles a/b and c/d touch
// exactly when ad − bc = ±1, and none of them ever overlap.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('ford');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var zoomInput = V.ctl(section, 'zoom');
  var zoomOut = V.ctl(section, 'zoom-out');
  var denInput = V.ctl(section, 'den');
  var denOut = V.ctl(section, 'den-out');
  var diveBtn = V.ctl(section, 'dive');

  var ALL = 41;              // the slider's top end means every denominator
  var MAX_ZOOM = 5;          // 10^5 times
  var SEL = '#ffffff';
  var TOUCH = '#7ee0a1';

  var zoomLog = 0;
  var focusX = (Math.sqrt(5) - 1) / 2;   // 1/φ, which no circle ever lands on
  var focusSX = -1;                      // its place on screen, set on first draw
  var den = ALL;
  var grow = V.reducedMotion ? ALL : 1;  // denominators appear one at a time at first
  var diving = false;
  var hover = null;
  var picked = null;
  var circles = [];
  var G = null;

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = a % b; a = b; b = t; }
    return a;
  }

  function frame(dt, st) {
    var changed = false;
    if (grow < den) {
      grow = Math.min(den, grow + dt * (grow < 12 ? 4 : 12));
      changed = true;
    }
    if (diving) {
      zoomLog = Math.min(MAX_ZOOM, zoomLog + dt * 0.35);
      zoomInput.value = zoomLog.toFixed(3);
      showZoom();
      if (zoomLog >= MAX_ZOOM) setDive(false);
      changed = true;
    }
    if (!changed && !st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function layout(st) {
    var W = st.width, H = st.height;
    var s0 = W / 1.08;
    if (focusSX < 0) focusSX = (focusX + 0.04) * s0;
    var s = s0 * Math.pow(10, zoomLog);
    return { W: W, H: H, base: H - 30, s: s, xl: focusX - focusSX / s };
  }

  function draw(st) {
    var ctx = st.ctx;
    G = layout(st);
    var W = G.W, H = G.H, s = G.s, base = G.base;
    var xl = G.xl, xr = xl + W / s;
    var limit = grow >= ALL ? Infinity : Math.min(Math.floor(grow), den);
    var qmax = Math.min(limit, Math.floor(Math.sqrt(s / 0.7)));
    ctx.clearRect(0, 0, W, H);

    circles = [];
    for (var q = 1; q <= qmax; q++) {
      var r = 1 / (2 * q * q), R = r * s;
      var p0 = Math.ceil((xl - r) * q), p1 = Math.floor((xr + r) * q);
      for (var p = p0; p <= p1; p++) {
        if (gcd(p, q) !== 1) continue;
        var cx = (p / q - xl) * s, cy = base - R;
        // Skip circles that miss the screen entirely.
        var nx = Math.max(0, Math.min(W, cx)), ny = Math.max(0, Math.min(H, cy));
        if (Math.hypot(nx - cx, ny - cy) > R) continue;
        circles.push({ p: p, q: q, cx: cx, cy: cy, R: R });
      }
    }

    // Colors run from the simplest fraction on screen, so deep zooms stay varied.
    var qBase = Infinity;
    for (var i = 0; i < circles.length; i++) qBase = Math.min(qBase, circles[i].q);
    var focus = hover || picked;
    var fade = den >= ALL && grow >= ALL ? 0 : Math.floor(grow);
    for (i = 0; i < circles.length; i++) {
      var c = circles[i];
      var col = V.gradient(V.SPECTRUM, Math.min(1, Math.log(c.q / qBase) / Math.log(60)));
      var alpha = fade && c.q === fade + 1 ? grow - fade : 1;
      var touching = focus && focus !== c && Math.abs(focus.p * c.q - focus.q * c.p) === 1;
      ctx.globalAlpha = alpha * (focus && !touching && !same(c, focus) ? 0.55 : 1);
      ctx.fillStyle = col;
      ctx.strokeStyle = same(c, focus) ? SEL : touching ? TOUCH : col;
      ctx.lineWidth = same(c, focus) || touching ? 2 : c.R > 8 ? 1.1 : 0.7;
      var fillA = same(c, focus) ? 0.32 : touching ? 0.24 : 0.13;
      circlePath(ctx, c, W, H);
      ctx.globalAlpha *= fillA;
      ctx.fill();
      ctx.globalAlpha = alpha * (focus && !touching && !same(c, focus) ? 0.55 : 1);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Where the circles touch the selected one.
    if (focus) {
      ctx.fillStyle = '#ffffff';
      for (i = 0; i < circles.length; i++) {
        var o = circles[i], f = findSame(focus);
        if (!f || o === f || Math.abs(f.p * o.q - f.q * o.p) !== 1) continue;
        var d = Math.hypot(o.cx - f.cx, o.cy - f.cy);
        var tx = f.cx + (o.cx - f.cx) * f.R / d, ty = f.cy + (o.cy - f.cy) * f.R / d;
        if (tx < -5 || tx > W + 5 || ty < -5 || ty > H + 5) continue;
        ctx.beginPath();
        ctx.arc(tx, ty, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Fractions written inside circles big enough to hold them.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (i = 0; i < circles.length; i++) {
      c = circles[i];
      if (c.R < 15 || c.R > 4000) continue;
      var size = Math.min(22, c.R * 0.42);
      var ly = Math.max(c.cy, base - Math.min(c.R, 120) - 2);
      ctx.font = '500 ' + size.toFixed(1) + 'px "IBM Plex Mono", monospace';
      ctx.fillStyle = same(c, focus) ? '#ffffff' : 'rgba(236,232,223,0.8)';
      // Keep labels of big circles at the screen's edge on screen.
      var lx = Math.max(size * 1.3, Math.min(W - size * 1.3, c.cx));
      if (Math.abs(lx - c.cx) > c.R * 0.8) continue;
      ctx.fillText(c.p + '/' + c.q, lx, ly);
    }

    // The number line, its ends, and the point the zoom closes in on.
    ctx.strokeStyle = 'rgba(236,232,223,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, base + 0.5);
    ctx.lineTo(W, base + 0.5);
    ctx.stroke();
    var fx = (focusX - xl) * s;
    ctx.fillStyle = '#ece8df';
    ctx.beginPath();
    ctx.moveTo(fx, base + 4);
    ctx.lineTo(fx - 5, base + 11);
    ctx.lineTo(fx + 5, base + 11);
    ctx.closePath();
    ctx.fill();
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#6f7286';
    ctx.textBaseline = 'top';
    if (zoomLog > 0.15) {
      var digits = Math.max(1, Math.min(9, Math.ceil(-Math.log(xr - xl) / Math.LN10) + 2));
      ctx.textAlign = 'left';
      ctx.fillText(fmt(xl, digits), 8, base + 10);
      ctx.textAlign = 'right';
      ctx.fillText(fmt(xr, digits), W - 8, base + 10);
    }

    updateReadout(focus);
  }

  function fmt(x, d) { return (x < 0 ? '−' : '') + Math.abs(x).toFixed(d); }

  function same(a, b) { return !!(a && b && a.p === b.p && a.q === b.q); }
  function findSame(f) {
    for (var i = 0; i < circles.length; i++) if (same(circles[i], f)) return circles[i];
    return null;
  }

  // Huge circles are traced along the screen instead of handed to arc(),
  // which gets shaky at radii in the millions of pixels.
  function circlePath(ctx, c, W, H) {
    ctx.beginPath();
    if (c.R < 3000) {
      ctx.arc(c.cx, c.cy, Math.max(0.3, c.R - 0.3), 0, Math.PI * 2);
      return;
    }
    var lo = Math.max(-4, c.cx - c.R), hi = Math.min(W + 4, c.cx + c.R);
    var top = [], x, h;
    for (x = lo; x <= hi + 0.01; x += 3) {
      h = Math.sqrt(Math.max(0, c.R * c.R - (x - c.cx) * (x - c.cx)));
      ctx.lineTo(x, Math.min(H + 20, c.cy + h));
      top.push([x, Math.max(-20, c.cy - h)]);
    }
    for (var i = top.length - 1; i >= 0; i--) ctx.lineTo(top[i][0], top[i][1]);
    ctx.closePath();
  }

  // The two neighbors with smaller denominators: a/b < p/q < c/d with
  // pb − qa = 1, and p/q is their mediant (a + c)/(b + d).
  function parents(p, q) {
    var b = 1;
    while ((p * b - 1) % q !== 0) b++;
    var a = (p * b - 1) / q;
    return [[a, b], [p - a, q - b]];
  }

  function updateReadout(f) {
    var lines;
    if (!f) {
      lines = [
        den >= ALL ? 'A circle on every fraction p/q' : 'Circles on p/q with q up to ' + den,
        'Radius 1/(2q²). None of them overlap.',
        'Tap a circle to see its neighbors'
      ];
    } else if (f.q === 1) {
      var list = [];
      for (var i = 0; i < circles.length && list.length < 3; i++) {
        var o = circles[i];
        if (o.q > 1 && Math.abs(f.p * o.q - o.p) === 1) list.push(o.p + '/' + o.q);
      }
      lines = [
        f.p + '/1, radius 1/2, the biggest size',
        'Touches ' + (list.length ? list.join(', ') + ', …' : 'infinitely many'),
        'A whole number has no parents'
      ];
    } else {
      var pr = parents(f.p, f.q), a = pr[0], c = pr[1];
      var det = f.p * a[1] - f.q * a[0];
      lines = [
        f.p + '/' + f.q + ', radius 1/(2 × ' + f.q + '²) = 1/' + 2 * f.q * f.q,
        'Mediant of ' + a[0] + '/' + a[1] + ' and ' + c[0] + '/' + c[1],
        a[0] + '/' + a[1] + ' touches it: ' + a[0] + '×' + f.q + ' − ' + a[1] + '×' + f.p + ' = ' + (det === 1 ? '−1' : det)
      ];
    }
    V.setText(readout, lines.map(function (l) { return l.length > 38 ? l.slice(0, 37) + '…' : l; }).join('\n'));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Pointer ----

  function circleAt(e) {
    var b = canvas.getBoundingClientRect();
    var x = e.clientX - b.left, y = e.clientY - b.top;
    for (var i = 0; i < circles.length; i++) {
      var c = circles[i];
      if (Math.hypot(x - c.cx, y - c.cy) < c.R) return { p: c.p, q: c.q };
    }
    return null;
  }

  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    var c = circleAt(e);
    if (!same(c, hover)) { hover = c; stage.dirty = true; }
  });
  canvas.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse' && hover) { hover = null; stage.dirty = true; }
  });
  canvas.addEventListener('pointerdown', function (e) {
    if (!G) return;
    var b = canvas.getBoundingClientRect();
    var x = e.clientX - b.left;
    // The tapped spot becomes the point the zoom closes in on.
    focusX = G.xl + x / G.s;
    focusSX = x;
    picked = circleAt(e);
    hover = e.pointerType === 'mouse' ? picked : null;
    stage.dirty = true;
  });

  // ---- Controls ----

  function showZoom() {
    var z = Math.pow(10, zoomLog);
    zoomOut.textContent = (z < 10 ? z.toFixed(1) : Math.round(z).toLocaleString()) + '×';
  }

  function setDive(on) {
    diving = on;
    diveBtn.setAttribute('aria-pressed', String(on));
    if (on && zoomLog >= MAX_ZOOM - 0.01) zoomLog = 0;
  }
  V.toggle(diveBtn, setDive);

  zoomInput.max = MAX_ZOOM;
  zoomInput.addEventListener('input', function () {
    setDive(false);
    zoomLog = parseFloat(zoomInput.value);
    showZoom();
    stage.dirty = true;
  });
  showZoom();

  V.range(denInput, denOut, function (v) { return v >= ALL ? 'all' : String(v); }, function (v) {
    den = v;
    if (grow > den || V.reducedMotion) grow = den;
    stage.dirty = true;
  });

  V.ctl(section, 'regrow').addEventListener('click', function () {
    grow = 1;
    stage.dirty = true;
  });
})();
