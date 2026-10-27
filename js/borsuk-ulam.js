// Borsuk–Ulam: f(θ) = T(θ) − T(θ + π) satisfies f(θ + π) = −f(θ), so it has a
// zero, a pair of opposite points with equal temperature. On a sphere, any two
// quantities match at once at some pair of opposite points.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('borsuk-ulam');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var whereGroup = V.ctl(section, 'where');
  var weatherBtn = V.ctl(section, 'weather');
  var pressureBtn = V.ctl(section, 'pressure');
  var findBtn = V.ctl(section, 'find');

  var TAU = Math.PI * 2;
  var TEMP = [[52, 84, 200], [90, 170, 255], [110, 210, 190], [240, 215, 110], [255, 140, 80], [235, 70, 110]];
  var GREEN = '#7ee0a1';
  var where = 'circle';
  var weather = !V.reducedMotion;
  var pressure = true;
  var t = 0;
  var alpha = 0.6;          // where A sits on the ring
  var sweep = null;         // the "walk halfway round" demonstration
  var ring = null;          // { k: [{a, b, w, p}] } Fourier terms for the ring
  var globe = null;         // { temp: [bumps], press: [bumps] }
  var yaw = 0.4, pitch = 0.35;
  var held = null;
  var shade = null, shadeCtx = null, shadeImg = null, SH = 132, LUT = null;
  var W = 0, H = 0, L = null;

  function newWeather() {
    ring = [];
    for (var k = 1; k <= 4; k++) {
      ring.push({ k: k, amp: [8, 5, 3, 2][k - 1] * (0.6 + Math.random() * 0.6), ph: Math.random() * TAU, w: (Math.random() - 0.5) * 0.5, wob: Math.random() * TAU });
    }
    globe = { temp: bumps(6, 9), press: bumps(5, 14) };
  }

  function bumps(n, amp) {
    var list = [];
    for (var i = 0; i < n; i++) {
      var z = Math.random() * 2 - 1, a = Math.random() * TAU, r = Math.sqrt(1 - z * z);
      list.push({ c: [r * Math.cos(a), r * Math.sin(a), z], amp: amp * (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random()), k: 2 + Math.random() * 2.5, spin: (Math.random() - 0.5) * 0.35 });
    }
    return list;
  }

  // ---- Temperature around the ring ----

  function T(th) {
    var s = 16;
    for (var i = 0; i < ring.length; i++) {
      var f = ring[i], ph = f.ph + f.w * t, a = f.amp * (1 + 0.25 * Math.sin(t * 0.4 + f.wob));
      s += a * Math.cos(f.k * th + ph);
    }
    return s;
  }

  function diff(th) { return T(th) - T(th + Math.PI); }

  // Pairs of opposite points with equal temperature: zeros of diff in [0, π).
  function zeros() {
    var out = [], n = 240, prev = diff(0);
    for (var i = 1; i <= n; i++) {
      var th = Math.PI * i / n, cur = diff(th);
      if (prev === 0 || prev * cur < 0) {
        var lo = Math.PI * (i - 1) / n, hi = th, flo = prev;
        for (var k = 0; k < 30; k++) {
          var mid = (lo + hi) / 2, fm = diff(mid);
          if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
        }
        out.push((lo + hi) / 2);
      }
      prev = cur;
    }
    return out;
  }

  function tempColor(v, k) {
    var c = V.gradient(TEMP, (v + 4) / 40);
    if (k == null) return c;
    var rgb = c.slice(4, -1).split(',').map(Number);
    return 'rgb(' + Math.round(rgb[0] * k) + ',' + Math.round(rgb[1] * k) + ',' + Math.round(rgb[2] * k) + ')';
  }

  function deg(v) { return (v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + '°C'; }
  function signed(v) { return (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1) + '°'; }

  // ---- Layout ----

  function layout() {
    var wide = W / H > 1.15;
    if (wide) {
      var R = Math.min(W * 0.2, H * 0.33);
      L = {
        cx: W * 0.29, cy: H * 0.55, R: R,
        chart: { x: W * 0.58, y: H * 0.2, w: W * 0.38, h: H * 0.62 }
      };
    } else {
      var r = Math.min(W, H) * 0.2;
      L = {
        cx: W * 0.6, cy: H * 0.37, R: r,
        chart: { x: 34, y: H * 0.7, w: W - 50, h: H * 0.24 }
      };
    }
  }

  function ringPoint(th, r) { return [L.cx + Math.cos(th) * r, L.cy - Math.sin(th) * r]; }

  function drawCircle(ctx) {
    var i, n = 180, band = Math.max(14, L.R * 0.14);
    ctx.lineWidth = band;
    for (i = 0; i < n; i++) {
      var a0 = TAU * i / n, a1 = TAU * (i + 1) / n + 0.004;
      ctx.beginPath();
      ctx.arc(L.cx, L.cy, L.R, -a1, -a0);
      ctx.strokeStyle = tempColor(T((a0 + a1) / 2));
      ctx.stroke();
    }

    var Z = zeros(), a = alpha, b = alpha + Math.PI;
    // The matching pairs.
    Z.forEach(function (z) {
      var p = ringPoint(z, L.R), q = ringPoint(z + Math.PI, L.R);
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(q[0], q[1]);
      ctx.strokeStyle = 'rgba(126,224,161,0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      [p, q].forEach(function (s) {
        ctx.beginPath();
        ctx.arc(s[0], s[1], 5, 0, TAU);
        ctx.fillStyle = GREEN;
        ctx.fill();
        ctx.strokeStyle = '#0a0b10';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    });

    var pa = ringPoint(a, L.R), pb = ringPoint(b, L.R), ta = T(a), tb = T(b);
    var match = Math.abs(ta - tb) < 0.05;
    ctx.beginPath();
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
    ctx.strokeStyle = match ? GREEN : 'rgba(236,232,223,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    [[pa, 'A', ta, a], [pb, 'B', tb, b]].forEach(function (m) {
      var p = m[0];
      ctx.beginPath();
      ctx.arc(p[0], p[1], 10, 0, TAU);
      ctx.fillStyle = tempColor(m[2]);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      var lp = ringPoint(m[3], L.R + band / 2 + 22);
      ctx.font = '600 12px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ece8df';
      ctx.fillText(m[1], lp[0], lp[1] - 7);
      ctx.font = '500 11px "IBM Plex Mono", monospace';
      ctx.fillStyle = 'rgba(236,232,223,0.75)';
      ctx.fillText(deg(m[2]), lp[0], lp[1] + 7);
    });

    drawChart(ctx, Z);
  }

  // The difference A − B as A goes once around. The second half is the first
  // half upside down, so the curve has to cross zero.
  function drawChart(ctx, Z) {
    var C = L.chart, n = 160, i, max = 4;
    for (i = 0; i <= n; i++) max = Math.max(max, Math.abs(diff(TAU * i / n)));
    max = Math.ceil(max / 5) * 5;
    function X(th) { return C.x + C.w * (th / TAU); }
    function Y(v) { return C.y + C.h / 2 - v / max * C.h / 2; }

    ctx.strokeStyle = 'rgba(236,232,223,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(C.x, C.y, C.w, C.h);
    ctx.beginPath();
    ctx.moveTo(X(Math.PI), C.y);
    ctx.lineTo(X(Math.PI), C.y + C.h);
    ctx.setLineDash([2, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(236,232,223,0.4)';
    ctx.beginPath();
    ctx.moveTo(C.x, Y(0));
    ctx.lineTo(C.x + C.w, Y(0));
    ctx.stroke();

    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = 'rgba(236,232,223,0.55)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('A − B', C.x, C.y - 6);
    ctx.textAlign = 'right';
    ctx.fillText('+' + max + '°', C.x - 4, C.y + 10);
    ctx.fillText('−' + max + '°', C.x - 4, C.y + C.h);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillText('0°', C.x, C.y + C.h + 5);
    ctx.fillText('180°', X(Math.PI), C.y + C.h + 5);
    ctx.fillText('360°', C.x + C.w, C.y + C.h + 5);

    ctx.beginPath();
    for (i = 0; i <= n; i++) {
      var th = TAU * i / n;
      if (i) ctx.lineTo(X(th), Y(diff(th))); else ctx.moveTo(X(th), Y(diff(th)));
    }
    ctx.strokeStyle = '#ece8df';
    ctx.lineWidth = 2;
    ctx.stroke();

    Z.forEach(function (z) {
      [z, z + Math.PI].forEach(function (th) {
        ctx.beginPath();
        ctx.arc(X(th), Y(0), 4.5, 0, TAU);
        ctx.fillStyle = GREEN;
        ctx.fill();
      });
    });

    var a = ((alpha % TAU) + TAU) % TAU, d = diff(a), b = (a + Math.PI) % TAU;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(X(a), Y(d));
    ctx.lineTo(X(b), Y(-d));
    ctx.stroke();
    ctx.setLineDash([]);
    [[a, d, '#ffffff'], [b, -d, 'rgba(255,255,255,0.55)']].forEach(function (m) {
      ctx.beginPath();
      ctx.arc(X(m[0]), Y(m[1]), 5, 0, TAU);
      ctx.fillStyle = m[2];
      ctx.fill();
    });
  }

  // ---- The globe ----

  function rot(c, s) {
    // Each weather system drifts around the polar axis at its own speed.
    var a = s * t, ca = Math.cos(a), sa = Math.sin(a);
    return [c[0] * ca - c[1] * sa, c[0] * sa + c[1] * ca, c[2]];
  }

  function field(list, x, y, z) {
    var s = 0;
    for (var i = 0; i < list.length; i++) {
      var b = list[i], c = b.cw;
      s += b.amp * Math.exp(b.k * (x * c[0] + y * c[1] + z * c[2] - 1));
    }
    return s;
  }

  function temp(x, y, z) { return 17 + field(globe.temp, x, y, z); }
  function press(x, y, z) { return 1013 + field(globe.press, x, y, z); }

  // Camera: x right, y into the screen, z up.
  function toCam(p) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var x = p[0] * cy - p[1] * sy, y = p[0] * sy + p[1] * cy;
    return [x, y * cp - p[2] * sp, y * sp + p[2] * cp];
  }

  // An odd function sampled on a latitude/longitude grid.
  var NLON = 72, NLAT = 36, GRID = null;

  function sample(fn) {
    if (!GRID) {
      GRID = [];
      for (var j = 0; j <= NLAT; j++) {
        for (var i = 0; i <= NLON; i++) {
          var lat = -Math.PI / 2 + Math.PI * j / NLAT, lon = TAU * i / NLON;
          GRID.push([Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]);
        }
      }
    }
    return GRID.map(fn);
  }

  // Its zero lines, by marching squares.
  function zeroLines(vals) {
    var pts = GRID, NLon = NLON, NLat = NLAT, i, j;
    var segs = [];
    function at(i2, j2) { return j2 * (NLon + 1) + i2; }
    function lerp(a, b) {
      var fa = vals[a], fb = vals[b], s = fa / (fa - fb), p = pts[a], q = pts[b];
      return [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s, p[2] + (q[2] - p[2]) * s];
    }
    for (j = 0; j < NLat; j++) {
      for (i = 0; i < NLon; i++) {
        var c = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)], cut = [];
        for (var k = 0; k < 4; k++) {
          var a = c[k], b = c[(k + 1) % 4];
          if ((vals[a] > 0) !== (vals[b] > 0)) cut.push(lerp(a, b));
        }
        if (cut.length >= 2) segs.push([cut[0], cut[1]]);
        if (cut.length === 4) segs.push([cut[2], cut[3]]);
      }
    }
    return segs;
  }

  function oddT(p) { return temp(p[0], p[1], p[2]) - temp(-p[0], -p[1], -p[2]); }
  function oddP(p) { return press(p[0], p[1], p[2]) - press(-p[0], -p[1], -p[2]); }

  // Where both odd parts vanish: refine the grid cells where both change sign.
  function bothMatch(ft, fp) {
    var best = [], i, j;
    function at(a, b) { return b * (NLON + 1) + a; }
    for (j = 0; j < NLAT; j++) {
      for (i = 0; i < NLON; i++) {
        var c = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
        var tp = 0, tn = 0, pp = 0, pn = 0;
        c.forEach(function (k) {
          if (ft[k] > 0) tp++; else tn++;
          if (fp[k] > 0) pp++; else pn++;
        });
        if (tp && tn && pp && pn) {
          var m = [0, 0, 0];
          c.forEach(function (k) { m[0] += GRID[k][0]; m[1] += GRID[k][1]; m[2] += GRID[k][2]; });
          best.push(newton(norm(m)));
        }
      }
    }
    // Keep one point from each opposite pair.
    var pairs = [];
    best.forEach(function (p) {
      var dup = pairs.some(function (q) {
        return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 0.15 || Math.hypot(p[0] + q[0], p[1] + q[1], p[2] + q[2]) < 0.15;
      });
      if (!dup) pairs.push(p);
    });
    return pairs;
  }

  // A few Newton steps in the tangent plane to solve oddT = oddP = 0.
  function newton(p) {
    for (var it = 0; it < 6; it++) {
      var e1 = norm(cross(p, Math.abs(p[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), e2 = cross(p, e1), h = 1e-4;
      var f0 = oddT(p), g0 = oddP(p);
      var pa = norm(add(p, e1, h)), pb = norm(add(p, e2, h));
      var fa = (oddT(pa) - f0) / h, fb = (oddT(pb) - f0) / h, ga = (oddP(pa) - g0) / h, gb = (oddP(pb) - g0) / h;
      var det = fa * gb - fb * ga;
      if (Math.abs(det) < 1e-9) break;
      var da = (-f0 * gb + fb * g0) / det, db = (-fa * g0 + ga * f0) / det;
      var step = Math.min(1, 0.2 / (Math.hypot(da, db) || 1));
      p = norm(add(add(p, e1, da * step), e2, db * step));
    }
    return p;
  }

  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function add(a, b, s) { return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; }

  function drawGlobe(ctx) {
    var m = Math.min(W, H), R = m * 0.37, cx = W / 2, cy = H / 2 + m * 0.04;
    globe.temp.forEach(function (b) { b.cw = rot(b.c, b.spin); });
    globe.press.forEach(function (b) { b.cw = rot(b.c, b.spin); });

    // Shade the visible half at low resolution, then scale it up.
    if (!shade) {
      LUT = new Uint8Array(256 * 3);
      for (var n = 0; n < 256; n++) {
        var rgb = V.gradient(TEMP, n / 255).slice(4, -1).split(',');
        LUT[n * 3] = +rgb[0]; LUT[n * 3 + 1] = +rgb[1]; LUT[n * 3 + 2] = +rgb[2];
      }
      shade = document.createElement('canvas');
      shade.width = shade.height = SH;
      shadeCtx = shade.getContext('2d');
      shadeImg = shadeCtx.createImageData(SH, SH);
    }
    var d = shadeImg.data, cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    for (var j = 0; j < SH; j++) {
      for (var i = 0; i < SH; i++) {
        var o = (j * SH + i) * 4, x = (i + 0.5) / SH * 2 - 1, z = 1 - (j + 0.5) / SH * 2, r2 = x * x + z * z;
        if (r2 > 1) { d[o + 3] = 0; continue; }
        var y = -Math.sqrt(1 - r2);
        var yy = y * cp + z * sp, zz = -y * sp + z * cp;
        var wx = x * cyw + yy * syw, wy = -x * syw + yy * cyw;
        var q = Math.max(0, Math.min(255, Math.round((temp(wx, wy, zz) + 4) / 40 * 255))) * 3;
        var light = 0.5 + 0.5 * Math.max(0, -y * 0.75 + z * 0.35 - x * 0.25);
        d[o] = LUT[q] * light; d[o + 1] = LUT[q + 1] * light; d[o + 2] = LUT[q + 2] * light; d[o + 3] = 255;
      }
    }
    shadeCtx.putImageData(shadeImg, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(shade, cx - R, cy - R, R * 2, R * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.strokeStyle = 'rgba(236,232,223,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    function proj(p) { var c = toCam(p); return [cx + c[0] * R, cy - c[2] * R, c[1]]; }
    function lines(segs, color, width) {
      ctx.beginPath();
      segs.forEach(function (s) {
        var a = proj(s[0]), b = proj(s[1]);
        if (a[2] > 0.02 || b[2] > 0.02) return;
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    var ft = sample(oddT);
    lines(zeroLines(ft), 'rgba(255,255,255,0.92)', 2.2);
    var pairs = [];
    if (pressure) {
      var fp = sample(oddP);
      lines(zeroLines(fp), 'rgba(110,231,255,0.95)', 2.2);
      pairs = bothMatch(ft, fp);
      pairs.forEach(function (p) {
        var a = proj(p), b = proj([-p[0], -p[1], -p[2]]);
        var front = a[2] < 0 ? a : b, back = a[2] < 0 ? b : a;
        ctx.beginPath();
        ctx.moveTo(front[0], front[1]);
        ctx.lineTo(back[0], back[1]);
        ctx.strokeStyle = 'rgba(126,224,161,0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(back[0], back[1], 5, 0, TAU);
        ctx.strokeStyle = GREEN;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(front[0], front[1], 7, 0, TAU);
        ctx.fillStyle = GREEN;
        ctx.fill();
        ctx.strokeStyle = '#0a0b10';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }
    return pairs;
  }

  // ---- Frame ----

  function frame(dt, st) {
    W = st.width;
    H = st.height;
    if (!ring) newWeather();
    layout();
    if (weather && !sweep) t += dt;
    if (where === 'globe' && weather && !held) yaw += dt * 0.12;
    if (sweep) {
      sweep.t = Math.min(1, sweep.t + dt / 2.6);
      var goal = sweep.from + Math.PI * V.easeInOut(sweep.t);
      // Stop as soon as the difference changes sign.
      if ((diff(goal) > 0) !== sweep.sign) {
        var lo = alpha, hi = goal;
        for (var k = 0; k < 30; k++) {
          var mid = (lo + hi) / 2;
          if ((diff(mid) > 0) === sweep.sign) lo = mid; else hi = mid;
        }
        alpha = (lo + hi) / 2;
        sweep.done = true;
        sweep.t = 1;
      } else {
        alpha = goal;
      }
      if (sweep.t >= 1) { sweep.hold = (sweep.hold || 0) + dt; if (sweep.hold > 2.5) sweep = null; }
    }
    if (!weather && !sweep && !held && !st.dirty) return;
    st.dirty = false;

    var ctx = st.ctx;
    ctx.clearRect(0, 0, W, H);
    var text;
    if (where === 'circle') {
      drawCircle(ctx);
      var ta = T(alpha), tb = T(alpha + Math.PI);
      text = 'A ' + deg(ta) + '   B ' + deg(tb) + '\n';
      if (sweep && sweep.done) text += 'A − B hit 0: they match!';
      else if (sweep) text += 'A − B: ' + signed(ta - tb) + ', started ' + signed(sweep.d);
      else text += Math.abs(ta - tb) < 0.05 ? 'A and B match' : 'A − B: ' + signed(ta - tb);
    } else {
      var pairs = drawGlobe(ctx);
      if (pressure && pairs.length) {
        var p = pairs[0];
        text = 'Green: opposite points with\nthe same ' + deg(temp(p[0], p[1], p[2])) + ', ' + Math.round(press(p[0], p[1], p[2])) + ' hPa';
      } else {
        text = 'White: same temperature as\nthe exactly opposite point';
      }
    }
    V.setText(readout, text);
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Pointer ----

  V.drag(canvas, {
    hit: function (x, y) {
      if (!L) return null;
      if (where === 'globe') {
        var m = Math.min(W, H), R = m * 0.37;
        return Math.hypot(x - W / 2, y - (H / 2 + m * 0.04)) < R ? { globe: true, x: x, y: y } : null;
      }
      var r = Math.hypot(x - L.cx, y - L.cy);
      return Math.abs(r - L.R) < Math.max(28, L.R * 0.25) ? { ring: true } : null;
    },
    move: function (h, x, y) {
      held = h;
      sweep = null;
      if (h.globe) {
        yaw += (x - h.x) * 0.008;
        pitch = Math.max(-1.2, Math.min(1.2, pitch - (y - h.y) * 0.008));
        h.x = x;
        h.y = y;
      } else {
        var a = Math.atan2(L.cy - y, x - L.cx);
        // Pick whichever of A and B is nearer the pointer, so either can be dragged.
        if (h.b == null) {
          var da = Math.abs(Math.atan2(Math.sin(a - alpha), Math.cos(a - alpha)));
          h.b = da > Math.PI / 2;
        }
        alpha = h.b ? a - Math.PI : a;
      }
      stage.dirty = true;
    },
    end: function () { held = null; }
  });

  // ---- Controls ----

  V.segmented(whereGroup, function (v) {
    where = v;
    sweep = null;
    pressureBtn.hidden = v !== 'globe';
    findBtn.hidden = v !== 'circle';
    stage.dirty = true;
  });
  V.toggle(weatherBtn, function (on) { weather = on; stage.dirty = true; });
  weatherBtn.setAttribute('aria-pressed', String(weather));
  V.toggle(pressureBtn, function (on) { pressure = on; stage.dirty = true; });
  findBtn.addEventListener('click', function () {
    if (!ring) return;
    var d = diff(alpha);
    sweep = { from: alpha, t: V.reducedMotion ? 0.999 : 0, sign: d > 0, d: d };
    stage.dirty = true;
  });
  V.ctl(section, 'new').addEventListener('click', function () { newWeather(); sweep = null; stage.dirty = true; });
})();
