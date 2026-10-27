// Optimal stopping: skip the first r of n candidates, then take the first who
// beats them all. You get the best with chance (r/n)(1/r + … + 1/(n − 1)), most near r = n/e.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('secretary');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var cutInput = V.ctl(section, 'cut');

  var ANIMATE_BELOW = 3;     // rounds per second; faster than this, skip the interviews
  var STEP_TIME = 4;
  var CYAN = '#6ee7ff';
  var MISS = '#ff5fa2';

  var n = 100, cut = 37;
  var rate = 0.63;
  var playing = !V.reducedMotion;
  var stepping = false;
  var rounds = 0, wins = [];
  var round = null;
  var acc = 0;
  var changed = true;

  function exact(r) {
    if (r === 0) return 1 / n;
    var s = 0;
    for (var i = r + 1; i <= n; i++) s += 1 / (i - 1);
    return r / n * s;
  }

  function clearStats() {
    rounds = 0;
    wins = new Array(n).fill(0);
    round = null;
    acc = 0;
    changed = true;
  }

  // One random order of candidates. Every cutoff is scored on it at once:
  // with the best at b and the best before it at m, cutoffs m < r ≤ b win.
  function newRound() {
    var score = [], b = 0, m = -1, i;
    for (i = 0; i < n; i++) {
      score.push(Math.random());
      if (score[i] > score[b]) b = i;
    }
    for (i = 0; i < b; i++) if (m < 0 || score[i] > score[m]) m = i;
    return { score: score, best: b, prior: m, t: 0, counted: false, hold: 0 };
  }

  function count(rd) {
    rounds++;
    if (rd.best === 0) wins[0]++;
    for (var r = Math.max(1, rd.prior + 1); r <= rd.best; r++) wins[r]++;
    rd.counted = true;
    changed = true;
  }

  // Who the rule hires with this cutoff, or the last one if nobody beats the bar.
  function hired(rd) {
    var bar = -1, i;
    for (i = 0; i < cut; i++) bar = Math.max(bar, rd.score[i]);
    for (i = cut; i < n; i++) if (rd.score[i] > bar) return i;
    return n - 1;
  }

  function frame(dt, st) {
    if (stepping || (playing && rate < ANIMATE_BELOW)) {
      if (!round || (round.t >= n && round.hold <= 0 && !stepping)) round = newRound();
      var h = hired(round);
      // Interviews slow before the pick and speed up after it.
      var speed = stepping ? n / STEP_TIME : n * rate * 1.3;
      if (round.t > h) speed *= 4;
      if (round.t < n) {
        round.t = Math.min(n, round.t + dt * Math.max(speed, 3));
        if (round.t >= n) {
          if (!round.counted) count(round);
          round.hold = Math.min(0.8, 0.5 / rate);
          stepping = false;
        }
      } else {
        round.hold -= dt;
      }
      changed = true;
    } else if (playing) {
      acc = Math.min(acc + dt * rate, 400);
      var k = Math.floor(acc);
      acc -= k;
      for (var i = 0; i < k; i++) {
        round = newRound();
        count(round);
        round.t = n;
      }
    }
    if (!changed && !st.dirty) return;
    changed = false;
    st.dirty = false;
    draw(st);
  }

  function layout(st) {
    var W = st.width, H = st.height, narrow = W < 480;
    var top = narrow ? 80 : 92;
    var base = Math.round(top + (H - top) * 0.5);
    return {
      W: W, H: H, left: 16, right: W - 16, top: top, base: base,
      cleft: 16, cright: W - 50, ctop: base + 50, cbottom: H - 26
    };
  }

  function draw(st) {
    var ctx = st.ctx, L = layout(st), i;
    ctx.clearRect(0, 0, L.W, L.H);
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    drawRound(ctx, L);
    drawChart(ctx, L);
    var sim = rounds ? wins[cut] / rounds : 0;
    V.setText(readout, 'Rounds ' + rounds.toLocaleString() + '\n' +
      'Hired the best ' + (rounds ? (sim * 100).toFixed(1) + '%' : '–') +
      '   exact ' + (exact(cut) * 100).toFixed(1) + '%');
  }

  function drawRound(ctx, L) {
    var w = (L.right - L.left) / n, maxH = L.base - L.top - 34, i;
    var rd = round, shown = rd ? Math.floor(rd.t + 1e-9) : 0;
    var h = rd ? hired(rd) : -1;
    var bar = -1;
    if (rd) for (i = 0; i < Math.min(cut, shown); i++) bar = Math.max(bar, rd.score[i]);

    // The cutoff.
    var cx = Math.round(L.left + cut * w) + 0.5;
    ctx.strokeStyle = 'rgba(110,231,255,0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, L.top - 10);
    ctx.lineTo(cx, L.base + 8);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = CYAN;
    var label = cut === 0 ? 'hire from the start' : 'start hiring';
    ctx.textAlign = cut > n * 0.7 ? 'right' : 'left';
    ctx.fillText(label, cx + (cut > n * 0.7 ? -6 : 6), L.top - 4);

    // Baseline and empty slots.
    ctx.strokeStyle = 'rgba(236,232,223,0.15)';
    ctx.beginPath();
    ctx.moveTo(L.left, L.base + 0.5);
    ctx.lineTo(L.right, L.base + 0.5);
    ctx.stroke();

    var gap = Math.min(2, w * 0.25);
    for (i = 0; i < n; i++) {
      var x = L.left + i * w + gap / 2, bw = Math.max(1, w - gap);
      if (!rd || i >= shown) {
        ctx.fillStyle = 'rgba(236,232,223,0.08)';
        ctx.fillRect(x, L.base - 3, bw, 3);
        continue;
      }
      var bh = Math.max(2, rd.score[i] * maxH);
      if (i < cut) ctx.fillStyle = 'rgba(155,157,175,0.55)';
      else if (i === h) ctx.fillStyle = shown < n ? '#ece8df' : h === rd.best ? CYAN : MISS;
      else if (i < h) ctx.fillStyle = 'rgba(110,231,255,0.3)';
      else ctx.fillStyle = 'rgba(236,232,223,0.16)';
      ctx.fillRect(x, L.base - bh, bw, bh);
    }

    if (!rd) return;
    // The bar to beat: the best of those turned away.
    if (bar >= 0 && cut < n) {
      var by = Math.round(L.base - bar * maxH) + 0.5;
      ctx.strokeStyle = 'rgba(236,232,223,0.45)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(L.left, by);
      ctx.lineTo(L.right, by);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (shown > h) {
      var hx = L.left + (h + 0.5) * w, hy = L.base - rd.score[h] * maxH;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, hy - 9, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    if (shown >= n) {
      var bx = L.left + (rd.best + 0.5) * w, bY = L.base - rd.score[rd.best] * maxH;
      ctx.fillStyle = '#ece8df';
      ctx.textAlign = rd.best > n * 0.8 ? 'right' : rd.best < n * 0.2 ? 'left' : 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(h === rd.best ? 'hired the best' : 'best', bx, bY - (h === rd.best ? 19 : 4));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = h === rd.best ? CYAN : MISS;
      ctx.fillText(h === rd.best ? 'Got the very best' :
        rd.best < cut ? 'Missed: the best was turned away' : 'Missed: hired too early',
      (L.left + L.right) / 2, L.base + 10);
    }
  }

  function drawChart(ctx, L) {
    var plotW = L.cright - L.cleft, plotH = L.cbottom - L.ctop, top = 0.5;
    function px(r) { return L.cleft + r / n * plotW; }
    function py(s) { return L.cbottom - s / top * plotH; }
    var r;

    ctx.fillStyle = '#9b9daf';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Chance of hiring the best, by how many you turn away', L.cleft, L.ctop - 8);

    ctx.lineWidth = 1;
    ctx.textBaseline = 'middle';
    [0, 0.25, 0.5].forEach(function (t) {
      var y = Math.round(py(t)) + 0.5;
      ctx.strokeStyle = 'rgba(236,232,223,0.07)';
      ctx.beginPath();
      ctx.moveTo(L.cleft, y);
      ctx.lineTo(L.cright, y);
      ctx.stroke();
      ctx.fillStyle = '#6f7286';
      ctx.fillText(Math.round(t * 100) + '%', L.cright + 8, y);
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
      ctx.fillStyle = '#6f7286';
      ctx.fillText(Math.round(f * 100) + '%', px(f * n) + (f === 0 ? 8 : f === 1 ? -12 : 0), L.cbottom + 6);
    });

    var ex = Math.round(px(n / Math.E)) + 0.5;
    ctx.strokeStyle = 'rgba(236,232,223,0.35)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(ex, L.ctop);
    ctx.lineTo(ex, L.cbottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ece8df';
    ctx.textAlign = 'left';
    ctx.fillText('1/e', ex + 5, L.ctop + 2);

    // The exact chance for every cutoff.
    ctx.strokeStyle = 'rgba(236,232,223,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (r = 0; r < n; r++) {
      if (r) ctx.lineTo(px(r), py(exact(r))); else ctx.moveTo(px(r), py(exact(r)));
    }
    ctx.stroke();

    // What the rounds here gave, for every cutoff at once.
    if (rounds >= 10) {
      ctx.fillStyle = CYAN;
      ctx.globalAlpha = 0.7;
      for (r = 0; r < n; r++) {
        if (wins[r] / rounds > top) continue;
        ctx.beginPath();
        ctx.arc(px(r), py(wins[r] / rounds), n > 50 ? 1.6 : 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    var cx = Math.round(px(cut)) + 0.5;
    ctx.strokeStyle = 'rgba(110,231,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, L.ctop);
    ctx.lineTo(cx, L.cbottom);
    ctx.stroke();
    ctx.fillStyle = CYAN;
    ctx.beginPath();
    ctx.arc(px(cut), py(rounds >= 10 ? Math.min(top, wins[cut] / rounds) : exact(cut)), 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  var stage = V.createStage(canvas, { frame: frame });

  // Click or drag along the chart to choose the cutoff.
  function chartPick(x, y) {
    var L = layout(stage);
    if (y < L.ctop - 20 || y > L.cbottom + 20) return null;
    var r = Math.round((x - L.cleft) / (L.cright - L.cleft) * n);
    return Math.max(0, Math.min(n - 1, r));
  }
  V.drag(canvas, {
    hit: function (x, y) { return chartPick(x, y) === null ? null : 'chart'; },
    move: function (h, x, y) {
      var r = chartPick(x, Math.max(layout(stage).ctop, Math.min(layout(stage).cbottom, y)));
      if (r !== null && r !== cut) {
        cutInput.value = String(r);
        syncCut();
      }
    },
    cursor: 'pointer'
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    stepping = false;
    setPlaying(!playing);
  });

  V.ctl(section, 'one').addEventListener('click', function () {
    setPlaying(false);
    round = newRound();
    stepping = true;
  });

  V.ctl(section, 'reset').addEventListener('click', clearStats);

  var syncCut = V.range(cutInput, V.ctl(section, 'cut-out'),
    function (v) { return v + ' of ' + n + ' (' + Math.round(v / n * 100) + '%)'; },
    function (v) {
      cut = v;
      changed = true;
    });

  V.segmented(V.ctl(section, 'size'), function (v) {
    var frac = cut / n;
    n = parseInt(v, 10);
    cutInput.max = String(n - 1);
    cutInput.value = String(Math.min(n - 1, Math.round(frac * n)));
    syncCut();
    clearStats();
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) {
      var r = Math.pow(10, v);
      return (r < 10 ? r.toFixed(1) : Math.round(r).toLocaleString()) + ' rounds / second';
    },
    function (v) { rate = Math.pow(10, v); });

  clearStats();

})();
