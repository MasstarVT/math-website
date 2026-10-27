// Euler's formula from compound growth: e^z is the limit of (1 + z/n)^n.
// For z = iθ each factor (1 + iθ/n) is a small turn plus a tiny stretch, so
// n of them walk a polygon that closes in on the point e^{iθ} on the circle.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('euler');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var nInput = V.ctl(section, 'n');
  var nOut = V.ctl(section, 'n-out');
  var thetaInput = V.ctl(section, 'theta');
  var thetaOut = V.ctl(section, 'theta-out');
  var presetGroup = V.ctl(section, 'preset');
  var growBtn = V.ctl(section, 'grow');

  var n = 4;
  var theta = Math.PI;
  var growing = !V.reducedMotion;
  var growT = 0;
  var view = 0;            // eased complex radius that fits on screen

  function points() {
    var pts = [[1, 0]], re = 1, im = 0, b = theta / n;
    for (var k = 0; k < n; k++) {
      // Multiply by (1 + i·θ/n).
      var r2 = re - im * b, i2 = im + re * b;
      re = r2;
      im = i2;
      pts.push([re, im]);
    }
    return pts;
  }

  function fmtTheta(v) {
    var m = v / Math.PI;
    if (Math.abs(m - 0.5) < 1e-6) return 'π/2';
    if (Math.abs(m - 1) < 1e-6) return 'π';
    if (Math.abs(m - 2) < 1e-6) return '2π';
    return m.toFixed(3) + 'π';
  }

  function cx(re, im) {
    return (re < 0 ? '−' : '') + Math.abs(re).toFixed(4) + (im < 0 ? ' − ' : ' + ') + Math.abs(im).toFixed(4) + 'i';
  }

  function frame(dt, st) {
    if (growing) {
      growT += dt;
      // Double n every 1.2 seconds up to 256, then start again.
      var cycle = growT % 11;
      setN(Math.min(256, Math.max(1, Math.round(Math.pow(2, cycle / 1.2)))), false);
    }

    var pts = points();
    var far = 1.15;
    pts.forEach(function (p) { far = Math.max(far, Math.hypot(p[0], p[1]) * 1.08); });
    view = view && !V.reducedMotion ? view + (far - view) * Math.min(1, dt * 4) : far;

    var W = st.width, H = st.height, ctx = st.ctx;
    var s = Math.min(W, H) / 2 / view * 0.92;
    var ox = W / 2, oy = H / 2;
    function X(p) { return ox + p[0] * s; }
    function Y(p) { return oy - p[1] * s; }

    ctx.clearRect(0, 0, W, H);

    // Axes and the unit circle.
    ctx.strokeStyle = 'rgba(236,232,223,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, oy + 0.5);
    ctx.lineTo(W, oy + 0.5);
    ctx.moveTo(ox + 0.5, 0);
    ctx.lineTo(ox + 0.5, H);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236,232,223,0.35)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(ox, oy, s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#6f7286';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('1', ox + s, oy + 6);
    ctx.fillText('−1', ox - s, oy + 6);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('i', ox + 6, oy - s);

    // Each step is a thin right triangle; all of them are the same shape.
    for (var k = 0; k < n; k++) {
      ctx.fillStyle = V.gradient(V.SPECTRUM, n > 1 ? k / (n - 1) : 0);
      ctx.globalAlpha = n > 64 ? 0.35 : 0.22;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(X(pts[k]), Y(pts[k]));
      ctx.lineTo(X(pts[k + 1]), Y(pts[k + 1]));
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // The path of partial products.
    ctx.lineWidth = n > 64 ? 1.5 : 2;
    ctx.lineJoin = 'round';
    for (k = 0; k < n; k++) {
      ctx.strokeStyle = V.gradient(V.SPECTRUM, n > 1 ? k / (n - 1) : 0);
      ctx.beginPath();
      ctx.moveTo(X(pts[k]), Y(pts[k]));
      ctx.lineTo(X(pts[k + 1]), Y(pts[k + 1]));
      ctx.stroke();
    }
    if (n <= 48) {
      for (k = 0; k <= n; k++) {
        ctx.fillStyle = V.gradient(V.SPECTRUM, n ? Math.min(1, k / n) : 0);
        ctx.beginPath();
        ctx.arc(X(pts[k]), Y(pts[k]), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // The target e^{iθ}.
    var tx = ox + Math.cos(theta) * s, ty = oy - Math.sin(theta) * s;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx, ty, 7, 0, Math.PI * 2);
    ctx.stroke();
    var end = pts[n];
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(X(end), Y(end), 4, 0, Math.PI * 2);
    ctx.fill();

    V.setText(readout,
      '(1 + i·' + fmtTheta(theta) + '/' + n + ')^' + n + ' = ' + cx(end[0], end[1]) + '\n' +
      'e^(i·' + fmtTheta(theta) + ') = ' + cx(Math.cos(theta), Math.sin(theta)));
  }

  V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setN(v, fromInput) {
    n = v;
    if (!fromInput) nInput.value = Math.log2(v);
    nOut.textContent = String(v);
  }

  function setGrowing(on) {
    if (on && !growing) growT = Math.log2(n) * 1.2;
    growing = on;
    growBtn.setAttribute('aria-pressed', String(on));
  }
  V.toggle(growBtn, setGrowing);
  growBtn.setAttribute('aria-pressed', String(growing));

  nInput.addEventListener('input', function () {
    setGrowing(false);
    setN(Math.round(Math.pow(2, parseFloat(nInput.value))), true);
  });
  setN(n, false);

  thetaInput.addEventListener('input', function () {
    V.setSegmented(presetGroup, '');
    theta = parseFloat(thetaInput.value);
    thetaOut.textContent = fmtTheta(theta);
  });

  V.segmented(presetGroup, function (v) {
    theta = parseFloat(v) * Math.PI;
    thetaInput.value = theta;
    thetaOut.textContent = fmtTheta(theta);
  });
  thetaOut.textContent = fmtTheta(theta);
})();
