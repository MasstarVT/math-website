// The Basel problem: 1 + 1/4 + 1/9 + … = π²/6. Squares of side 1/n pack in
// rows n = 2^j … 2^(j+1) − 1, each under 1 wide and 1/2^j tall, so all of them
// fit in a 1 × 2 box. The partial sums fall short of π²/6 by about 1/n.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('basel');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var nInput = V.ctl(section, 'n');
  var nOut = V.ctl(section, 'n-out');
  var playBtn = V.ctl(section, 'play');
  var eulerBtn = V.ctl(section, 'euler');

  var NMAX = 10000;
  var DECADES = 4;
  var LIMIT = Math.PI * Math.PI / 6;
  var PAL = [[126, 224, 161], [110, 231, 255], [124, 140, 255], [196, 107, 255], [255, 95, 162]];

  var nf = 1;           // squares so far, fractional while one fades in
  var playing = !V.reducedMotion;
  var euler = false;
  var hold = 0;
  var sums = null;      // sums[k] = 1 + 1/4 + … + 1/k²

  function build() {
    sums = new Float64Array(NMAX + 1);
    for (var k = 1; k <= NMAX; k++) sums[k] = sums[k - 1] + 1 / (k * k);
  }

  // Euler–Maclaurin estimate of what's left after n terms.
  function eulerGuess(n) { return sums[n] + 1 / n - 1 / (2 * n * n) + 1 / (6 * n * n * n); }

  function frame(dt, st) {
    if (playing) {
      if (nf < NMAX) {
        // Speed up as the squares shrink, so each new row takes about as long.
        nf = Math.min(NMAX, nf + dt * (1.4 + nf * 0.55));
        setN(nf, false);
      } else {
        hold += dt;
        if (hold > 2.5) { hold = 0; nf = 1; setN(1, false); }
      }
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    if (!sums) build();
    var n = Math.max(1, Math.floor(nf)), fade = nf - n;
    ctx.clearRect(0, 0, W, H);

    // ---- The box ----
    var top = 78, bottom = H - 28;
    var u = Math.min((bottom - top) / 2, W * 0.27);   // one unit in px
    var bx = 18, by = bottom;                        // bottom-left corner
    function BX(x) { return bx + x * u; }
    function BY(y) { return by - y * u; }

    // Shelves, 1 wide and 1/2^j tall.
    ctx.strokeStyle = 'rgba(236,232,223,0.14)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    var y0 = 0;
    for (var j = 0; j < 12; j++) {
      var hgt = Math.pow(0.5, j);
      if (hgt * u < 1.5) break;
      ctx.strokeRect(Math.round(BX(0)) + 0.5, Math.round(BY(y0 + hgt)) + 0.5, Math.round(u), Math.round(hgt * u));
      y0 += hgt;
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(236,232,223,0.5)';
    ctx.strokeRect(Math.round(BX(0)) + 0.5, Math.round(BY(2)) + 0.5, Math.round(u), Math.round(2 * u));

    // The squares, row by row.
    var row = 0, rowY = 0, rowX = 0, rowEnd = 2;
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var k = 1; k <= Math.min(NMAX, n + 1); k++) {
      if (k === rowEnd) {
        rowY += Math.pow(0.5, row);
        row++;
        rowX = 0;
        rowEnd *= 2;
      }
      var s = 1 / k;
      if (s * u < 0.6) break;
      var a = k <= n ? 1 : fade;
      if (a > 0) {
        ctx.globalAlpha = a;
        ctx.fillStyle = V.gradient(PAL, Math.log(k) / Math.log(4000));
        var px = BX(rowX), py = BY(rowY + s), side = s * u;
        ctx.fillRect(px, py, side, side);
        if (side > 4) {
          ctx.strokeStyle = '#0d0f16';
          ctx.lineWidth = Math.min(1.5, side / 8);
          ctx.strokeRect(px, py, side, side);
        }
        if (side > 30) {
          ctx.fillStyle = 'rgba(10,11,16,0.85)';
          ctx.fillText(k === 1 ? '1' : '1/' + k * k, px + side / 2, py + side / 2);
        }
        ctx.globalAlpha = 1;
      }
      rowX += s;
    }
    ctx.fillStyle = '#6f7286';
    ctx.textBaseline = 'top';
    ctx.fillText('1 wide', BX(0.5), bottom + 8);

    // ---- The running total ----
    var C = { l: BX(1) + 34, r: W - 50, t: top + 30, b: bottom };
    var ylo = 0.95, yhi = 2.05;
    var compact = C.r - C.l < 300;
    function cx(k) { return C.l + Math.log(k) / Math.LN10 / DECADES * (C.r - C.l); }
    function cy(v) { return C.b - (v - ylo) / (yhi - ylo) * (C.b - C.t); }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#6f7286';
    ctx.lineWidth = 1;
    for (var d = 0; d <= DECADES; d++) {
      var gx = Math.round(cx(Math.pow(10, d))) + 0.5;
      ctx.strokeStyle = 'rgba(236,232,223,0.07)';
      ctx.beginPath();
      ctx.moveTo(gx, C.t);
      ctx.lineTo(gx, C.b);
      ctx.stroke();
      var tick = compact ? ['1', '10', '100', '1k', '10k'][d] : d === 0 ? 'n = 1' : Math.pow(10, d).toLocaleString('en-US');
      ctx.fillText(tick, Math.max(C.l + (compact ? 4 : 16), Math.min(C.r - 14, gx)), C.b + 8);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    [[1, '1', false], [1.5, '1.5', false], [LIMIT, 'π²/6', true], [2, '2', true]].forEach(function (t) {
      var ty = Math.round(cy(t[0])) + 0.5;
      ctx.strokeStyle = t[2] ? 'rgba(236,232,223,0.4)' : 'rgba(236,232,223,0.07)';
      if (t[2]) ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(C.l, ty);
      ctx.lineTo(C.r, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = t[2] ? '#ece8df' : '#6f7286';
      ctx.fillText(t[1], C.r + 7, ty);
    });

    ctx.lineJoin = 'round';
    function line(f, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      var steps = 240, end = Math.log(n) / Math.LN10 / DECADES;
      for (var i = 0; i <= steps; i++) {
        var k = Math.max(1, Math.round(Math.pow(10, end * DECADES * i / steps)));
        if (i) ctx.lineTo(cx(k), cy(f(k))); else ctx.moveTo(cx(k), cy(f(k)));
      }
      ctx.lineTo(cx(n), cy(f(n)));
      ctx.stroke();
    }
    if (euler) line(eulerGuess, '#ffb454', 2);
    line(function (k) { return sums[k]; }, '#7ee0a1', 2.5);
    ctx.fillStyle = '#7ee0a1';
    ctx.strokeStyle = '#0d0f16';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx(n), cy(sums[n]), 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#9b9daf';
    ctx.fillText('Running total', C.l, C.t - 10);

    V.setText(readout,
      n.toLocaleString('en-US') + (n === 1 ? ' square' : ' squares') + ', total ' + sums[n].toFixed(6) + '\n' +
      'π²/6 = ' + LIMIT.toFixed(6) + ', short by ' + (LIMIT - sums[n]).toFixed(6) + '\n' +
      (euler ? "Euler's guess " + eulerGuess(n).toFixed(9) : 'About 1/n short: 1/' + n.toLocaleString('en-US') + ' = ' + (1 / n).toFixed(6)));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setN(v, fromInput) {
    nf = v;
    if (!fromInput) nInput.value = (Math.log(Math.max(1, v)) / Math.LN10).toFixed(3);
    nOut.textContent = Math.floor(v).toLocaleString('en-US');
    stage.dirty = true;
  }

  nInput.addEventListener('input', function () {
    setPlaying(false);
    setN(Math.round(Math.pow(10, parseFloat(nInput.value))), true);
  });

  function setPlaying(on) {
    if (on && nf >= NMAX) setN(1, false);
    playing = on;
    hold = 0;
    playBtn.textContent = on ? 'Pause' : 'Play';
  }
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'restart').addEventListener('click', function () {
    setN(1, false);
    setPlaying(true);
  });

  V.toggle(eulerBtn, function (on) {
    euler = on;
    stage.dirty = true;
  });

  setPlaying(playing);
  setN(playing ? 1 : 100, false);
})();
