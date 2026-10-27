// Penney's game: two runs of three flips race to appear first in a stream of
// coin flips. Against any run A = abc, the run (not b)ab wins with odds of 2:1 or better.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('penney');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var youSeg = V.ctl(section, 'you');
  var themSeg = V.ctl(section, 'them');

  var RUNS = ['HHH', 'HHT', 'HTH', 'HTT', 'THH', 'THT', 'TTH', 'TTT'];
  var YOU = '#a78bfa';
  var THEM = '#ffb454';
  var ANIMATE_BELOW = 4;     // races per second; faster than this, skip the flips
  var STEP_TIME = 0.32;      // seconds per flip for "One race"

  var you = 'HHT', them = 'THH';
  var rate = 1;
  var playing = !V.reducedMotion;
  var stepping = false;
  var races = 0, youWins = 0, themWins = 0, flipsTotal = 0;
  var race = null;
  var acc = 0;
  var exact = null;
  var changed = true;

  function bestReply(a) {
    return (a[1] === 'H' ? 'T' : 'H') + a[0] + a[1];
  }

  // Exact chances, by following the probability of every "last two flips"
  // state until almost nothing is left unfinished.
  function odds(a, b) {
    var dist = { '': 1 }, wa = 0, wb = 0, len = 0;
    for (var it = 0; it < 120; it++) {
      var next = {};
      for (var s in dist) {
        var q = dist[s];
        len += q;
        for (var f = 0; f < 2; f++) {
          var t = s + (f ? 'T' : 'H'), end = t.slice(-3);
          if (t.length >= 3 && end === a) wa += q / 2;
          else if (t.length >= 3 && end === b) wb += q / 2;
          else next[t.slice(-2)] = (next[t.slice(-2)] || 0) + q / 2;
        }
      }
      dist = next;
    }
    if (a === b) wa = wb = 0;  // the same run always ties
    return { you: wa, them: wb, len: len };
  }

  var table = null;          // best reply to every run, worked out on first view

  function clearStats() {
    races = 0;
    youWins = 0;
    themWins = 0;
    flipsTotal = 0;
    race = null;
    acc = 0;
    exact = odds(you, them);
    changed = true;
  }

  function newRace() {
    return { flips: '', winner: null, t: 0, hold: 0 };
  }

  // Add one flip; returns true when a run has turned up.
  function flip(r) {
    r.flips += Math.random() < 0.5 ? 'H' : 'T';
    var end = r.flips.slice(-3);
    if (r.flips.length < 3) return false;
    if (end === you) r.winner = end === them ? 'tie' : 'you';
    else if (end === them) r.winner = 'them';
    return !!r.winner;
  }

  function count(r) {
    races++;
    flipsTotal += r.flips.length;
    if (r.winner === 'you') youWins++;
    else if (r.winner === 'them') themWins++;
    changed = true;
  }

  function frame(dt, st) {
    if (!table) {
      table = RUNS.map(function (a) {
        var b = bestReply(a);
        return { a: a, b: b, p: odds(a, b).them };
      });
    }
    if (stepping || (playing && rate < ANIMATE_BELOW)) {
      if (race && race.winner && !stepping) {
        race.hold -= dt;
        if (race.hold <= 0) race = null;
      }
      if (!race) race = newRace();
      if (!race.winner) {
        race.t += dt * (stepping ? 1 / STEP_TIME : Math.max(5, rate * 9));
        while (race.t >= 1 && !race.winner) {
          race.t -= 1;
          if (flip(race)) {
            count(race);
            race.hold = Math.min(1.2, 1 / rate);
            stepping = false;
          }
        }
      }
      changed = true;
    } else if (playing) {
      acc = Math.min(acc + dt * rate, 300);
      var n = Math.floor(acc);
      acc -= n;
      for (var i = 0; i < n; i++) {
        var r = newRace();
        while (!flip(r)) { /* keep flipping */ }
        count(r);
        race = r;
      }
    }
    if (!changed && !st.dirty) return;
    changed = false;
    st.dirty = false;
    draw(st);
  }

  function layout(st) {
    var W = st.width, H = st.height, narrow = W < 480;
    return narrow ? {
      W: W, H: H, narrow: true, coin: 9.5,
      pickY: 80, streamTop: 114, perRow: Math.floor((W - 32) / 22), streamRows: 1,
      barsX: 16, barsW: W - 32, barsTop: 180,
      tableX: 16, tableW: W - 32, tableTop: 266, tableCols: 2
    } : {
      W: W, H: H, narrow: false, coin: 13,
      pickY: 98, streamTop: 152, perRow: Math.floor((W - 32) / 30), streamRows: 2,
      barsX: 16, barsW: W * 0.5 - 40, barsTop: 290,
      tableX: W * 0.56, tableW: W * 0.44 - 16, tableTop: 290, tableCols: 1
    };
  }

  function coin(ctx, x, y, r, face, color, strong) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = face === 'H' ? '#2a2e40' : '#1a1d2a';
    ctx.fill();
    ctx.strokeStyle = color || 'rgba(236,232,223,0.3)';
    ctx.lineWidth = strong ? 2.2 : 1.2;
    ctx.stroke();
    ctx.fillStyle = color || (face === 'H' ? '#ece8df' : '#9b9daf');
    ctx.font = '600 ' + Math.round(r * 1.05) + 'px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(face, x, y + 0.5);
  }

  function draw(st) {
    var ctx = st.ctx, L = layout(st), i;
    ctx.clearRect(0, 0, L.W, L.H);
    var r = L.coin, gap = r * 2 + (L.narrow ? 3 : 5);

    // The two picks.
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    var picks = [['You', you, YOU], ['Friend', them, THEM]];
    var pw = L.narrow ? (L.W - 32) / 2 : 230;
    picks.forEach(function (pk, k) {
      var x0 = 16 + k * pw;
      ctx.font = '500 11px "IBM Plex Mono", monospace';
      ctx.fillStyle = pk[2];
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(pk[0], x0, L.pickY);
      var cx = x0 + (L.narrow ? 54 : 64);
      for (var j = 0; j < 3; j++) coin(ctx, cx + j * gap, L.pickY, r, pk[1][j], pk[2], true);
    });

    if (!L.narrow) {
      ctx.font = '500 11px "IBM Plex Mono", monospace';
      ctx.fillStyle = '#9b9daf';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('The flips', 16, L.streamTop - r - 8);
    }

    // The race so far, wrapped onto rows. Long races scroll.
    var flips = race ? race.flips : '';
    var cap = L.perRow * L.streamRows;
    var start = Math.max(0, flips.length - cap);
    if (start) start = Math.ceil(start / L.perRow) * L.perRow;
    var winLen = race && race.winner ? flips.length : -1;
    for (i = start; i < flips.length; i++) {
      var k2 = i - start;
      var x = 16 + r + (k2 % L.perRow) * gap, y = L.streamTop + Math.floor(k2 / L.perRow) * (gap + 6);
      var inWin = winLen > 0 && i >= winLen - 3;
      var col = inWin ? (race.winner === 'them' ? THEM : YOU) : null;
      coin(ctx, x, y, r, flips[i], col, inWin);
    }
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    var msgY = L.streamTop + L.streamRows * (gap + 6) - 4;
    if (!race || !flips.length) {
      ctx.fillStyle = '#6f7286';
      ctx.fillText('Flipping…', 16, msgY);
    } else if (race.winner) {
      ctx.fillStyle = race.winner === 'them' ? THEM : YOU;
      ctx.fillText(race.winner === 'tie' ? 'Same run: a tie, every time' :
        (race.winner === 'them' ? 'Friend\'s ' + them : 'Your ' + you) + ' came first, after ' +
        flips.length + ' flips', 16, msgY);
    }

    drawBars(ctx, L);
    drawTable(ctx, L);

    V.setText(readout, 'Races ' + races.toLocaleString() + '\n' +
      'Average race ' + (races ? (flipsTotal / races).toFixed(1) : '–') + ' flips   exact ' + exact.len.toFixed(1));
  }

  function drawBars(ctx, L) {
    var rows = [['You', youWins, exact.you, YOU], ['Friend', themWins, exact.them, THEM]];
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#9b9daf';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Wins so far', L.barsX, L.barsTop - 8);
    var rowH = L.narrow ? 30 : 46;
    rows.forEach(function (row, k) {
      var y = L.barsTop + k * rowH, share = races ? row[1] / races : 0, bh = L.narrow ? 8 : 12;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillStyle = row[3];
      ctx.fillText(row[0], L.barsX, y + 10);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ece8df';
      ctx.fillText(races ? (share * 100).toFixed(1) + '%' : '–', L.barsX + L.barsW, y + 10);
      var by = y + 16;
      ctx.fillStyle = 'rgba(236,232,223,0.07)';
      ctx.fillRect(L.barsX, by, L.barsW, bh);
      ctx.fillStyle = row[3];
      ctx.globalAlpha = 0.85;
      ctx.fillRect(L.barsX, by, L.barsW * share, bh);
      ctx.globalAlpha = 1;
      var ex = Math.round(L.barsX + L.barsW * row[2]) + 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ex, by - 3);
      ctx.lineTo(ex, by + bh + 3);
      ctx.stroke();
    });
    if (!L.narrow) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#6f7286';
      var e = exact.them;
      ctx.fillText(you === them ? 'The same run always ties' :
        'Exact: friend wins ' + fraction(e) + ' of the time', L.barsX, L.barsTop + 2 * rowH + 6);
    }
  }

  // Exact chances here are all simple fractions.
  function fraction(p) {
    for (var d = 1; d <= 16; d++) {
      var nn = Math.round(p * d);
      if (Math.abs(nn / d - p) < 1e-6) return nn + ' in ' + d;
    }
    return (p * 100).toFixed(1) + '%';
  }

  function drawTable(ctx, L) {
    if (!table) return;
    var cols = L.tableCols, rowsN = Math.ceil(RUNS.length / cols);
    var colW = L.tableW / cols, rowH = L.narrow ? 21 : 25;
    ctx.font = '500 ' + (L.narrow ? 10 : 11) + 'px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#9b9daf';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(L.narrow ? 'Best reply to every run' : 'Best reply to every run, and how often it wins',
      L.tableX, L.tableTop - 8);
    table.forEach(function (row, i) {
      var c = Math.floor(i / rowsN), k = i % rowsN;
      var x = L.tableX + c * colW, y = L.tableTop + k * rowH;
      var on = row.a === you;
      if (on) {
        ctx.fillStyle = 'rgba(167,139,250,0.12)';
        ctx.fillRect(x - 6, y - 2, colW - 6, rowH - 4);
      }
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = on ? YOU : '#9b9daf';
      ctx.fillText(row.a, x, y + 3);
      ctx.fillStyle = '#6f7286';
      ctx.fillText('→', x + (L.narrow ? 28 : 34), y + 3);
      ctx.fillStyle = on ? THEM : '#c4c1ba';
      ctx.fillText(row.b, x + (L.narrow ? 44 : 54), y + 3);
      ctx.textAlign = 'right';
      ctx.fillStyle = on ? '#ece8df' : '#6f7286';
      ctx.fillText(L.narrow ? Math.round(row.p * 100) + '%' : fraction(row.p), x + colW - 14, y + 3);
    });
  }

  clearStats();
  V.createStage(canvas, { frame: frame });

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
    race = newRace();
    stepping = true;
  });

  V.ctl(section, 'reset').addEventListener('click', clearStats);

  // Your friend answers your pick with the best reply; you can override it.
  V.segmented(youSeg, function (v) {
    you = v;
    them = bestReply(v);
    V.setSegmented(themSeg, them);
    clearStats();
  });

  V.segmented(themSeg, function (v) {
    them = v;
    clearStats();
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) {
      var r = Math.pow(10, v);
      return (r < 10 ? r.toFixed(1) : Math.round(r).toLocaleString()) + ' races / second';
    },
    function (v) { rate = Math.pow(10, v); });

})();
