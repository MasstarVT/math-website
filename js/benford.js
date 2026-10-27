// Benford's law: in data that spreads evenly across many powers of ten, the
// leading digit d turns up with probability log10(1 + 1/d). Big numbers are
// handled by their base-10 logarithm, whose fractional part fixes the digit.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('benford');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var LOG2 = Math.log10(2);
  var LOGPHI = Math.log10((1 + Math.sqrt(5)) / 2);
  var LOGSQ5 = Math.log10(Math.sqrt(5));
  var BENFORD = [0];
  for (var d = 1; d <= 9; d++) BENFORD.push(Math.log10(1 + 1 / d));
  var SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

  var data = 'pow2';
  var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  var n = 0;            // items so far
  var state = null;     // running state for the current data set
  var recent = [];      // latest items, as text
  var rate = 4;
  var acc = 0;
  var playing = !V.reducedMotion;

  function reset() {
    counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    n = 0;
    recent = [];
    state = { a: 0, b: 1, logFact: 0 };
  }

  function sup(k) { return String(k).split('').map(function (c) { return SUP[c]; }).join(''); }

  // A number from its base-10 log, written out or in scientific notation.
  function show(lg) {
    if (lg < 9) return Math.round(Math.pow(10, lg)).toLocaleString();
    var e = Math.floor(lg), m = Math.pow(10, lg - e);
    if (m >= 9.995) { m = 1; e++; }
    return m.toFixed(2) + ' × 10' + sup(e);
  }

  // Next item: its base-10 log and a label.
  function next() {
    var k = n + 1, lg, label;
    if (data === 'pow2') {
      lg = k * LOG2;
      label = '2' + sup(k);
    } else if (data === 'fib') {
      // Exact while it fits; Binet's formula after that.
      var f = state.a + state.b;
      state.a = state.b;
      state.b = f;
      lg = k <= 70 ? Math.log10(state.a) : k * LOGPHI - LOGSQ5;
      label = 'F' + k;
    } else if (data === 'fact') {
      state.logFact += Math.log10(k);
      lg = state.logFact;
      label = k + '!';
    } else if (data === 'product') {
      lg = 0;
      for (var i = 0; i < 6; i++) lg += Math.log10(1 + Math.random() * 99);
      label = 'product of 6';
    } else {
      var v = 1 + Math.floor(Math.random() * 999);
      lg = Math.log10(v);
      label = 'random';
    }
    var frac = lg - Math.floor(lg);
    var digit = Math.min(9, Math.max(1, Math.floor(Math.pow(10, frac) + 1e-9)));
    counts[digit]++;
    n++;
    recent.unshift({ label: label, value: show(lg), digit: digit });
    if (recent.length > 5) recent.pop();
  }

  function frame(dt, st) {
    if (playing) {
      acc += dt * rate;
      var steps = 0;
      while (acc >= 1 && steps < 5000) { next(); acc -= 1; steps++; }
      if (acc > 1) acc = 0;
    }

    var W = st.width, H = st.height, ctx = st.ctx;
    ctx.clearRect(0, 0, W, H);

    // Latest numbers, leading digit picked out.
    ctx.font = '13px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'middle';
    var lineY = 74;
    recent.forEach(function (r, i) {
      ctx.globalAlpha = 1 - i * 0.17;
      var x = 16, text = r.label + ' = ';
      ctx.fillStyle = '#6f7286';
      ctx.fillText(text, x, lineY + i * 20);
      x += ctx.measureText(text).width;
      ctx.fillStyle = '#ffb454';
      ctx.fillText(r.value.charAt(0), x, lineY + i * 20);
      x += ctx.measureText(r.value.charAt(0)).width;
      ctx.fillStyle = '#c4c1ba';
      ctx.fillText(r.value.slice(1), x, lineY + i * 20);
    });
    ctx.globalAlpha = 1;

    // Bars for digits 1 to 9, with Benford's prediction as white ticks.
    var top = Math.max(lineY + 5 * 20, H * 0.38), bottom = H - 30;
    var left = 16, width = W - 32, slot = width / 9, barW = slot * 0.62;
    var scale = (bottom - top) / 0.36;
    ctx.textAlign = 'center';
    for (d = 1; d <= 9; d++) {
      var x0 = left + (d - 1) * slot + (slot - barW) / 2;
      var share = n ? counts[d] / n : 0;
      var h = Math.min(bottom - top, share * scale);
      ctx.fillStyle = V.gradient([[255, 209, 102], [255, 138, 92], [255, 95, 162]], (d - 1) / 8);
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x0, bottom - h, barW, h);
      ctx.globalAlpha = 1;
      var by = bottom - BENFORD[d] * scale;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x0 - 4, Math.round(by) - 1, barW + 8, 2);
      ctx.fillStyle = '#9b9daf';
      ctx.fillText(String(d), x0 + barW / 2, bottom + 14);
      if (n) {
        ctx.fillStyle = '#c4c1ba';
        ctx.font = '11px "IBM Plex Mono", monospace';
        ctx.fillText(Math.round(share * 100) + '%', x0 + barW / 2, Math.min(bottom - h, by) - 10);
        ctx.font = '13px "IBM Plex Mono", monospace';
      }
    }
    ctx.textAlign = 'left';

    var names = { pow2: 'Powers of 2', fib: 'Fibonacci numbers', fact: 'Factorials', product: 'Products of random numbers', uniform: 'Random numbers 1 to 999' };
    V.setText(readout,
      names[data] + ': ' + n.toLocaleString() + '\n' +
      'Leading 1: ' + (n ? (counts[1] / n * 100).toFixed(1) : '0.0') + '%   Benford: 30.1%');
  }

  V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'reset').addEventListener('click', reset);

  V.segmented(V.ctl(section, 'data'), function (v) {
    data = v;
    reset();
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return Math.round(Math.pow(2, v)).toLocaleString() + ' / second'; },
    function (v) { rate = Math.pow(2, v); });

  reset();
})();
