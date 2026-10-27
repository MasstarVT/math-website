// Law of large numbers: flip coins and track the share that came up heads.
// The share closes in on 50%, while heads minus tails keeps wandering further.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('coins');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var MAX_FLIPS = 1000000;
  var DECADES = 6;      // the x axis runs from 1 to 10^6 flips
  var MIN_RATE = 6;     // flips per second while the count is tiny
  var GAP_SCALE = 2500; // heads − tails chart height, unless a run goes past it
  var SINGLE = '#ffb454';

  var runCount = 5;
  var view = 'share';
  var tenfold = 2.5;    // seconds for 10× more flips
  var playing = !V.reducedMotion;
  var n = 0;
  var heads = [];       // heads so far, per run
  var checkN = [];      // flip counts where a point was saved
  var checkH = [];      // per run: heads at each saved point
  var nextCheck = 1;
  var goal = 0;         // target for "10× more flips", reached quickly
  var acc = 0;          // fractional flips carried between frames
  var changed = true;

  function reset() {
    n = 0;
    goal = 0;
    acc = 0;
    nextCheck = 1;
    heads = [];
    checkN = [];
    checkH = [];
    for (var r = 0; r < runCount; r++) {
      heads.push(0);
      checkH.push([]);
    }
    changed = true;
  }

  // Flip m more coins in every run. Points are saved about every 1% of the
  // way, so a million flips costs no more to draw than a thousand.
  function flip(m) {
    m = Math.min(m, MAX_FLIPS - n);
    while (m > 0) {
      var chunk = Math.min(m, nextCheck - n);
      for (var r = 0; r < runCount; r++) {
        var h = 0;
        for (var i = 0; i < chunk; i++) if (Math.random() < 0.5) h++;
        heads[r] += h;
      }
      n += chunk;
      m -= chunk;
      if (n >= nextCheck || n === MAX_FLIPS) {
        checkN.push(n);
        for (r = 0; r < runCount; r++) checkH[r].push(heads[r]);
        nextCheck = Math.max(n + 1, Math.ceil(n * 1.01));
      }
    }
    changed = true;
  }

  // Grow the count by a steady factor per second, so the line moves across
  // the log axis at an even pace.
  function grow(dt, seconds) {
    return Math.max(MIN_RATE * dt, n * (Math.pow(10, dt / seconds) - 1));
  }

  function frame(dt, st) {
    var target = n;
    if (playing) target = n + grow(dt, tenfold);
    if (goal > n) target = Math.max(target, Math.min(goal, n + grow(dt, 0.35)));
    if (target > n) {
      acc += target - n;
      var m = Math.floor(acc);
      acc -= m;
      if (m > 0) flip(m);
    }
    if (goal && n >= goal) goal = 0;
    if (playing && n >= MAX_FLIPS) setPlaying(false);

    if (!changed && !st.dirty) return;
    changed = false;
    st.dirty = false;
    draw(st);
  }

  function layout(st) {
    var W = st.width, H = st.height;
    return { W: W, H: H, left: 14, right: W - 54, top: 76, bottom: H - 30 };
  }

  function xOf(L, k) {
    return L.left + Math.log(k) / Math.LN10 / DECADES * (L.right - L.left);
  }

  function runColor(r) {
    return runCount === 1 ? SINGLE : V.gradient(V.SPECTRUM, r / (runCount - 1));
  }

  function shortCount(k) {
    return k >= 1e6 ? k / 1e6 + 'M' : k >= 1e3 ? k / 1e3 + 'k' : String(k);
  }

  function draw(st) {
    var ctx = st.ctx, L = layout(st);
    var plotH = L.bottom - L.top;
    var r, i, k, y;
    ctx.clearRect(0, 0, L.W, L.H);

    // In the share view y is the fraction of heads; in the gap view it's
    // heads − tails, on a fixed scale so you can watch the gap grow.
    var lim = GAP_SCALE;
    if (view === 'gap') {
      for (r = 0; r < runCount; r++) {
        for (i = 0; i < checkN.length; i++) {
          lim = Math.max(lim, Math.abs(2 * checkH[r][i] - checkN[i]) * 1.1);
        }
      }
    }
    function yOf(heads, flips) {
      if (view === 'share') return L.bottom - heads / flips * plotH;
      return L.top + plotH / 2 - (2 * heads - flips) / lim * plotH / 2;
    }

    // Where 95% of runs should be: 50% ± 98% / √n, or 0 ± 1.96 √n.
    ctx.fillStyle = 'rgba(255,180,84,0.10)';
    ctx.beginPath();
    for (i = 0; i <= 300; i++) {
      k = Math.pow(10, DECADES * i / 300);
      y = view === 'share'
        ? L.bottom - Math.min(1, 0.5 + 0.98 / Math.sqrt(k)) * plotH
        : L.top + plotH / 2 - Math.min(lim, 1.96 * Math.sqrt(k)) / lim * plotH / 2;
      if (i) ctx.lineTo(xOf(L, k), y); else ctx.moveTo(xOf(L, k), y);
    }
    for (i = 300; i >= 0; i--) {
      k = Math.pow(10, DECADES * i / 300);
      y = view === 'share'
        ? L.bottom - Math.max(0, 0.5 - 0.98 / Math.sqrt(k)) * plotH
        : L.top + plotH / 2 + Math.min(lim, 1.96 * Math.sqrt(k)) / lim * plotH / 2;
      ctx.lineTo(xOf(L, k), y);
    }
    ctx.closePath();
    ctx.fill();

    // Grid and labels. Y labels sit on the right so the readout covers nothing.
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.lineWidth = 1;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    for (var d = 0; d <= DECADES; d++) {
      var gx = Math.round(xOf(L, Math.pow(10, d))) + 0.5;
      ctx.strokeStyle = 'rgba(236,232,223,0.07)';
      ctx.beginPath();
      ctx.moveTo(gx, L.top);
      ctx.lineTo(gx, L.bottom);
      ctx.stroke();
      ctx.fillStyle = '#6f7286';
      ctx.fillText(shortCount(Math.pow(10, d)), gx, L.bottom + 9);
    }

    var ticks = view === 'share'
      ? [[0, '0%'], [0.25, '25%'], [0.5, '50%'], [0.75, '75%'], [1, '100%']]
      : gapTicks(lim);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ticks.forEach(function (t) {
      var ty = view === 'share'
        ? L.bottom - t[0] * plotH
        : L.top + plotH / 2 - t[0] / lim * plotH / 2;
      ty = Math.round(ty) + 0.5;
      var middle = view === 'share' ? t[0] === 0.5 : t[0] === 0;
      ctx.strokeStyle = middle ? 'rgba(236,232,223,0.45)' : 'rgba(236,232,223,0.07)';
      if (middle) ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(L.left, ty);
      ctx.lineTo(L.right, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = middle ? '#ece8df' : '#6f7286';
      ctx.fillText(t[1], L.right + 8, ty);
    });

    // One line per run, then a dot where each one is now.
    ctx.lineWidth = runCount > 10 ? 1.1 : 1.6;
    ctx.lineJoin = 'round';
    for (r = runCount - 1; r >= 0; r--) {
      var hs = checkH[r];
      if (!hs.length) continue;
      ctx.strokeStyle = runColor(r);
      ctx.globalAlpha = runCount > 10 ? 0.7 : 0.9;
      ctx.beginPath();
      for (i = 0; i < checkN.length; i++) {
        var px = xOf(L, checkN[i]), py = yOf(hs[i], checkN[i]);
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.lineTo(xOf(L, n), yOf(heads[r], n));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (n) {
      for (r = 0; r < runCount; r++) {
        ctx.fillStyle = runColor(r);
        ctx.beginPath();
        ctx.arc(xOf(L, n), yOf(heads[r], n), runCount > 10 ? 2.2 : 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    updateReadout();
  }

  // Round tick spacing for the heads − tails axis.
  function gapTicks(lim) {
    var step = Math.pow(10, Math.floor(Math.log(lim / 2) / Math.LN10));
    if (lim / step > 10) step *= 5;
    else if (lim / step > 4) step *= 2;
    var out = [];
    for (var v = -Math.floor(lim / step) * step; v <= lim; v += step) {
      out.push([v, (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString()]);
    }
    return out;
  }

  function signed(v) {
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString();
  }

  function updateReadout() {
    var line1 = 'Flips ' + n.toLocaleString() + (runCount > 1 ? ' each' : '') +
      (n >= MAX_FLIPS ? ' (done)' : '');
    if (!n) {
      V.setText(readout, line1 + '\nPress Play or flip a coin');
      return;
    }
    // Only the number the chart is showing, so the line fits on a phone.
    var line2;
    if (runCount === 1) {
      line2 = view === 'share'
        ? 'Heads ' + (heads[0] / n * 100).toFixed(2) + '%'
        : 'Heads − tails ' + signed(2 * heads[0] - n);
    } else {
      var lo = 1, hi = 0, gap = 0;
      for (var r = 0; r < runCount; r++) {
        var s = heads[r] / n;
        lo = Math.min(lo, s);
        hi = Math.max(hi, s);
        gap = Math.max(gap, Math.abs(2 * heads[r] - n));
      }
      line2 = view === 'share'
        ? 'Heads ' + (lo * 100).toFixed(2) + '% to ' + (hi * 100).toFixed(2) + '%'
        : 'Heads − tails up to ' + gap.toLocaleString();
    }
    V.setText(readout, line1 + '\n' + line2);
  }

  reset();
  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    if (!playing && n >= MAX_FLIPS) reset();
    setPlaying(!playing);
  });

  V.ctl(section, 'one').addEventListener('click', function () {
    setPlaying(false);
    goal = 0;
    flip(1);
  });

  V.ctl(section, 'tenfold').addEventListener('click', function () {
    setPlaying(false);
    goal = Math.min(MAX_FLIPS, Math.max(10, (goal || n) * 10));
  });

  V.ctl(section, 'reset').addEventListener('click', reset);

  V.segmented(V.ctl(section, 'runs'), function (v) {
    runCount = parseInt(v, 10);
    reset();
  });

  V.segmented(V.ctl(section, 'view'), function (v) {
    view = v;
    stage.dirty = true;
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return '10× more every ' + (10 / v).toFixed(1) + ' s'; },
    function (v) { tenfold = 10 / v; });

})();
