// Archimedes' bounds: a circle of diameter 1 has perimeter π, which lies
// between the perimeters of the inscribed and circumscribed regular n-gons,
// n·sin(π/n) < π < n·tan(π/n). Doubling n cuts the gap to about a quarter.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('archimedes');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var sidesInput = V.ctl(section, 'sides');
  var sidesOut = V.ctl(section, 'sides-out');
  var doubleBtn = V.ctl(section, 'double');

  var TAU = Math.PI * 2, TOP = -Math.PI / 2;
  var MAXN = 6144;
  var CYAN = '110,231,255', AMBER = '255,180,84';

  var n = 6;
  var tween = null;          // { from: n, t: 0..1 }
  var lens = true;

  // Corners of both polygons, in circle radii from the center. The outer
  // polygon's sides touch the circle at the inner polygon's corners.
  // Mid-doubling, the new inner corners rise from the old sides to the circle
  // and new outer sides slice off the old corners.
  function build(N, rOdd, dOdd) {
    var inn = [], out = [], k, step = TAU / N;
    for (k = 0; k < N; k++) {
      var a = TOP + step * k, r = k & 1 ? rOdd : 1;
      inn.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    var det = Math.sin(step);
    for (k = 0; k < N; k++) {
      var a0 = TOP + step * k, a1 = a0 + step;
      var d0 = k & 1 ? dOdd : 1, d1 = k & 1 ? 1 : dOdd;
      out.push([(d0 * Math.sin(a1) - d1 * Math.sin(a0)) / det, (d1 * Math.cos(a0) - d0 * Math.cos(a1)) / det]);
    }
    return { N: N, inn: inn, out: out };
  }

  function perimeter(pts) {
    var s = 0;
    for (var k = 0; k < pts.length; k++) {
      var a = pts[k], b = pts[(k + 1) % pts.length];
      s += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return s / 2;   // in diameters
  }

  function gapOf(m) { return 1 / Math.cos(Math.PI / m) - Math.cos(Math.PI / m); }
  function midOf(m) { return (1 / Math.cos(Math.PI / m) + Math.cos(Math.PI / m)) / 2; }

  // Clip a segment to the square |x|, |y| ≤ h (Liang–Barsky).
  function clip(x0, y0, x1, y1, h) {
    var t0 = 0, t1 = 1, dx = x1 - x0, dy = y1 - y0;
    var p = [-dx, dx, -dy, dy], q = [x0 + h, h - x0, y0 + h, h - y0];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return null; continue; }
      var r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
      else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
  }

  function polyPath(ctx, pts, cx, cy, R) {
    ctx.beginPath();
    ctx.moveTo(cx + pts[0][0] * R, cy + pts[0][1] * R);
    for (var k = 1; k < pts.length; k++) ctx.lineTo(cx + pts[k][0] * R, cy + pts[k][1] * R);
    ctx.closePath();
  }

  function layout(W, H) {
    var L = {}, band = 64;
    if (W / H > 1.15) {
      L.R = Math.min((H - band) * 0.43, W * 0.27);
      L.cx = W * 0.4;
      L.cy = (H - band) / 2 + 12;
      L.rm = Math.min(L.R * 0.5, W * 0.15);
      L.lx = W - L.rm - 22;
      L.ly = L.cy - L.R * 0.18;
    } else {
      L.R = Math.min(W, H) * 0.27;
      L.cx = W * 0.37;
      L.cy = (H - band) * 0.5 + 30;
      L.rm = Math.min(W, H) * 0.16;
      L.lx = W - L.rm - 12;
      L.ly = L.rm + 16;
    }
    return L;
  }

  function fmt(x, d, up) {
    var p = Math.pow(10, d);
    return ((up ? Math.ceil(x * p - 1e-7) : Math.floor(x * p + 1e-7)) / p).toFixed(d);
  }

  function niceStep(raw) {
    var p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }

  function frame(dt, st) {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 2);
      if (tween.t >= 1) { n = tween.from * 2; tween = null; syncInput(); }
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;

    var ctx = st.ctx, W = st.width, H = st.height, L = layout(W, H);
    var poly, lo, hi, psi, K, m;
    if (tween) {
      var n0 = tween.from, c0 = Math.cos(Math.PI / n0);
      var e1 = V.easeInOut(Math.min(1, tween.t / 0.6));
      var e2 = V.easeInOut(Math.max(0, (tween.t - 0.6) / 0.4));
      poly = build(2 * n0, c0 + (1 - c0) * e1, 1 / c0 + (1 - 1 / c0) * e1);
      lo = perimeter(poly.inn);
      hi = perimeter(poly.out);
      psi = TOP + Math.PI / n0 * (1 - e2 / 2);
      K = 1.2 * L.rm / gapOf(n0) * Math.pow(gapOf(n0) / gapOf(2 * n0), e2);
      m = midOf(n0) + (midOf(2 * n0) - midOf(n0)) * e2;
    } else {
      poly = build(n, 1, 1);
      lo = n * Math.sin(Math.PI / n);
      hi = n * Math.tan(Math.PI / n);
      psi = TOP + Math.PI / n;
      K = 1.2 * L.rm / gapOf(n);
      m = midOf(n);
    }

    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round';

    // ---- Circle and polygons ----
    var R = L.R, cx = L.cx, cy = L.cy;
    polyPath(ctx, poly.out, cx, cy, R);
    ctx.fillStyle = 'rgba(' + AMBER + ',0.07)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(' + AMBER + ',0.95)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    polyPath(ctx, poly.inn, cx, cy, R);
    ctx.fillStyle = 'rgba(' + CYAN + ',0.09)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(' + CYAN + ',0.95)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.strokeStyle = 'rgba(236,232,223,0.85)';
    ctx.lineWidth = 1.25;
    ctx.stroke();

    if (poly.N <= 48) {
      ctx.fillStyle = 'rgb(' + CYAN + ')';
      for (var k = 0; k < poly.N; k++) {
        ctx.beginPath();
        ctx.arc(cx + poly.inn[k][0] * R, cy + poly.inn[k][1] * R, poly.N <= 24 ? 2.6 : 1.8, 0, TAU);
        ctx.fill();
      }
    }

    // ---- Magnifier, turned so "outward from the center" points up ----
    if (lens) {
      var fx = cx + Math.cos(psi) * R * m, fy = cy + Math.sin(psi) * R * m;
      var mark = Math.max(6, L.rm / K * R);
      ctx.strokeStyle = 'rgba(236,232,223,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(fx, fy, mark, 0, TAU);
      ctx.stroke();
      var gx = L.lx - fx, gy = L.ly - fy, gl = Math.hypot(gx, gy);
      ctx.beginPath();
      ctx.moveTo(fx + gx / gl * mark, fy + gy / gl * mark);
      ctx.lineTo(L.lx - gx / gl * L.rm, L.ly - gy / gl * L.rm);
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.arc(L.lx, L.ly, L.rm, 0, TAU);
      ctx.fillStyle = '#0d0f16';
      ctx.fill();
      ctx.clip();

      var cs = Math.cos(psi), sn = Math.sin(psi), h = 1.3 * L.rm / K;
      var toLocal = function (p) {
        return [p[0] * cs + p[1] * sn - m, -p[0] * sn + p[1] * cs];
      };
      var drawEdges = function (pts, color) {
        var N = pts.length, j0 = Math.round((psi - TOP) / (TAU / N));
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (var j = j0 - 2; j <= j0 + 2; j++) {
          var a = toLocal(pts[((j % N) + N) % N]), b = toLocal(pts[(((j + 1) % N) + N) % N]);
          var s = clip(a[0], a[1], b[0], b[1], h);
          if (!s) continue;
          ctx.moveTo(L.lx + s[1] * K, L.ly - s[0] * K);
          ctx.lineTo(L.lx + s[3] * K, L.ly - s[2] * K);
        }
        ctx.stroke();
      };
      drawEdges(poly.out, 'rgb(' + AMBER + ')');
      drawEdges(poly.inn, 'rgb(' + CYAN + ')');

      // The arc, sampled as a short polyline. 1 − cos δ is written as 2·sin²(δ/2)
      // so it stays accurate at a million times magnification.
      ctx.strokeStyle = '#ece8df';
      ctx.lineWidth = 2;
      ctx.beginPath();
      var span = Math.min(h * 1.2, Math.PI);
      for (var i = 0; i <= 48; i++) {
        var d = -span + 2 * span * i / 48, sh = Math.sin(d / 2);
        var u = (1 - m) - 2 * sh * sh, v = Math.sin(d);
        if (i) ctx.lineTo(L.lx + v * K, L.ly - u * K);
        else ctx.moveTo(L.lx + v * K, L.ly - u * K);
      }
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(L.lx, L.ly, L.rm, 0, TAU);
      ctx.strokeStyle = '#343a4e';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      var zoom = K / R;
      ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#9b9daf';
      ctx.fillText('×' + (zoom < 10 ? zoom.toFixed(1) : Math.round(zoom).toLocaleString('en-US')), L.lx, L.ly + L.rm + 6);
    }

    // ---- Number line around π, zoomed so the bounds stay apart ----
    var y0 = H - 34, x0 = 28, x1 = W - 28, mid = (lo + hi) / 2, spanV = (hi - lo) / 0.5;
    var px = (x1 - x0) / spanV;
    var X = function (v) { return (x0 + x1) / 2 + (v - mid) * px; };
    var step = niceStep(spanV / 4), dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    ctx.strokeStyle = '#343a4e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y0);
    ctx.stroke();
    ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#6f7286';
    var first = Math.ceil((mid - spanV / 2) / step), last = Math.floor((mid + spanV / 2) / step);
    for (var q = first; q <= last; q++) {
      var xv = X(q * step);
      ctx.fillRect(xv - 0.5, y0 - 3, 1, 6);
      if (last - first < 9) ctx.fillText((q * step).toFixed(dec), xv, y0 + 8);
    }
    var xl = X(lo), xh = X(hi), xp = X(Math.PI);
    var grad = ctx.createLinearGradient(xl, 0, xh, 0);
    grad.addColorStop(0, 'rgba(' + CYAN + ',0.35)');
    grad.addColorStop(1, 'rgba(' + AMBER + ',0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(xl, y0 - 5, xh - xl, 10);
    ctx.fillStyle = 'rgb(' + CYAN + ')';
    ctx.fillRect(xl - 1, y0 - 9, 2.5, 18);
    ctx.fillStyle = 'rgb(' + AMBER + ')';
    ctx.fillRect(xh - 1.5, y0 - 9, 2.5, 18);
    ctx.fillStyle = '#ece8df';
    ctx.fillRect(xp - 0.75, y0 - 12, 1.5, 24);
    ctx.font = '600 13px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textBaseline = 'bottom';
    ctx.fillText('π', xp, y0 - 13);

    var digits = Math.max(3, Math.min(12, Math.ceil(-Math.log10(hi - lo)) + 2));
    var head = tween ? tween.from + ' → ' + tween.from * 2 + ' sides' : n + ' sides';
    V.setText(readout, head + '\ninside   ' + fmt(lo, digits, false) + '\noutside  ' + fmt(hi, digits, true));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function syncInput() {
    sidesInput.value = String(Math.min(n, +sidesInput.max));
    sidesOut.textContent = n.toLocaleString('en-US');
    doubleBtn.disabled = n * 2 > MAXN;
  }

  sidesInput.addEventListener('input', function () {
    tween = null;
    n = parseInt(sidesInput.value, 10);
    syncInput();
    stage.dirty = true;
  });

  doubleBtn.addEventListener('click', function () {
    if (tween) { n = tween.from * 2; tween = null; }
    if (n * 2 > MAXN) return;
    if (V.reducedMotion) n *= 2;
    else tween = { from: n, t: 0 };
    syncInput();
    if (tween) sidesOut.textContent = (n * 2).toLocaleString('en-US');
    stage.dirty = true;
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    tween = null;
    n = 6;
    syncInput();
    stage.dirty = true;
  });

  V.toggle(V.ctl(section, 'lens'), function (on) { lens = on; stage.dirty = true; });

  syncInput();
})();
