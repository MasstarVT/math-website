// Gambler's ruin: bet 1 chip at a time from k until you hit 0 or N. A fair
// game reaches N with chance k/N; with win chance p it's (1 − r^k)/(1 − r^N), r = q/p.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('gamblers-ruin');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var startInput = V.ctl(section, 'start');

  var HISTORY = 50;          // finished games kept on screen
  var KEEP_POINTS = 300;     // points kept per finished game
  var ANIMATE_BELOW = 4;     // games per second; faster than this, skip the animation
  var STEP_TIME = 3;         // seconds for a game started with "One gambler"
  var MAX_BETS_FRAME = 300000;
  var WIN = '#7ee0a1';
  var RUIN = '#ff5fa2';

  var p = 0.5, k = 50, N = 100;
  var rate = 1;
  var playing = !V.reducedMotion;
  var stepping = false;
  var games = 0, wins = 0, betsTotal = 0;
  var history = [];
  var game = null;           // the game being animated
  var acc = 0;
  var xMax = 1;
  var layer = null, layerKey = '';   // finished games, redrawn only when they change
  var changed = true;

  function chanceWin() {
    if (p === 0.5) return k / N;
    var r = (1 - p) / p;
    return (1 - Math.pow(r, k)) / (1 - Math.pow(r, N));
  }

  function meanLength() {
    if (p === 0.5) return k * (N - k);
    var d = (1 - p) - p;
    return k / d - N / d * chanceWin();
  }

  // The next round number at or above v, from a list of mantissas.
  function niceCeil(v, steps) {
    steps = steps || [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    var e = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    for (var i = 0; i < steps.length; i++) if (v <= steps[i] * e * 1.0001) return steps[i] * e;
    return 10 * e;
  }

  function clearStats() {
    games = 0;
    wins = 0;
    betsTotal = 0;
    history = [];
    game = null;
    acc = 0;
    xMax = niceCeil(meanLength() * 2.5);
    changed = true;
  }

  function newGame() {
    return { chips: k, path: [k], done: false, t: 0 };
  }

  // One bet. Returns true when the game is over.
  function bet(g) {
    g.chips += Math.random() < p ? 1 : -1;
    g.path.push(g.chips);
    if (g.chips === 0 || g.chips === N) {
      g.done = true;
      return true;
    }
    return false;
  }

  function finish(g) {
    games++;
    if (g.chips === N) wins++;
    var len = g.path.length - 1;
    betsTotal += len;
    // Keep a thinned copy for drawing, always including the last bet.
    var stride = Math.max(1, Math.ceil(len / KEEP_POINTS));
    var xs = [], ys = [];
    for (var i = 0; i < len; i += stride) {
      xs.push(i);
      ys.push(g.path[i]);
    }
    xs.push(len);
    ys.push(g.path[len]);
    history.push({ xs: xs, ys: ys, won: g.chips === N, len: len });
    if (history.length > HISTORY) history.shift();
    changed = true;
  }

  // A whole game at once, without keeping every step.
  function quickGame() {
    var c = k, len = 0, stride = Math.max(1, Math.ceil(meanLength() * 3 / KEEP_POINTS));
    var xs = [0], ys = [k];
    while (c > 0 && c < N) {
      c += Math.random() < p ? 1 : -1;
      len++;
      if (len % stride === 0) {
        xs.push(len);
        ys.push(c);
      }
    }
    if (xs[xs.length - 1] !== len) {
      xs.push(len);
      ys.push(c);
    }
    games++;
    if (c === N) wins++;
    betsTotal += len;
    history.push({ xs: xs, ys: ys, won: c === N, len: len });
    if (history.length > HISTORY) history.shift();
    return len;
  }

  function frame(dt, st) {
    var mean = Math.max(1, meanLength());
    if (stepping || (playing && rate < ANIMATE_BELOW)) {
      // Hold a finished game on screen for a moment before the next one.
      if (game && game.done && !stepping) {
        game.hold -= dt;
        if (game.hold <= 0) game = null;
      }
      if (!game) game = newGame();
      if (!game.done) {
        // Bets per second chosen so an average game takes 1 / rate seconds.
        var per = stepping ? mean / STEP_TIME : mean * rate;
        game.t += dt * Math.max(per, 8);
        var m = Math.floor(game.t);
        game.t -= m;
        for (var i = 0; i < m && i < MAX_BETS_FRAME; i++) {
          if (bet(game)) {
            finish(game);
            game.hold = Math.min(0.7, 0.6 / rate);
            stepping = false;
            break;
          }
        }
        if (m) changed = true;
      }
    } else if (playing) {
      game = null;
      acc = Math.min(acc + dt * rate, 200);
      var n = Math.floor(acc), spent = 0;
      acc -= n;
      for (var j = 0; j < n && spent < MAX_BETS_FRAME; j++) spent += quickGame();
      if (n) changed = true;
    }

    // Stretch the bet axis if the game on screen runs long.
    var want = xMax;
    if (game && game.path.length > xMax * 0.97) want = niceCeil(game.path.length * 1.3);
    if (want !== xMax) {
      xMax = want;
      changed = true;
    }

    if (!changed && !st.dirty) return;
    changed = false;
    st.dirty = false;
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    var L = { left: 16, right: W - 56, top: 80, bottom: H - 100 };
    var plotW = L.right - L.left, plotH = L.bottom - L.top;
    function px(x) { return L.left + Math.min(x, xMax) / xMax * plotW; }
    function py(c) { return L.bottom - c / N * plotH; }
    var i;
    ctx.clearRect(0, 0, W, H);

    // Floor, start and goal lines.
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.lineWidth = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    [[N, 'goal ' + N, WIN], [k, 'start ' + k, '#6f7286'], [0, 'broke', RUIN]].forEach(function (t) {
      var y = Math.round(py(t[0])) + 0.5;
      ctx.strokeStyle = t[0] === k ? 'rgba(236,232,223,0.07)' : 'rgba(236,232,223,0.22)';
      ctx.beginPath();
      ctx.moveTo(L.left, y);
      ctx.lineTo(L.right, y);
      ctx.stroke();
      ctx.fillStyle = t[2];
      ctx.fillText(t[1], L.right + 6, y);
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#6f7286';
    var tick = niceCeil(xMax / 5, [1, 2, 2.5, 5, 10]);
    ctx.fillText('0 bets', px(0) + 20, L.bottom + 8);
    for (var tx = tick; tx <= xMax * 1.0001; tx += tick) {
      ctx.fillText(Math.round(tx).toLocaleString(), px(tx), L.bottom + 8);
    }

    var key = [games, xMax, k, N, W, H, st.dpr, !game].join();
    if (!layer) layer = document.createElement('canvas');
    if (key !== layerKey) {
      layerKey = key;
      if (layer.width !== st.canvas.width || layer.height !== st.canvas.height) {
        layer.width = st.canvas.width;
        layer.height = st.canvas.height;
      }
      var lc = layer.getContext('2d');
      lc.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      lc.clearRect(0, 0, W, H);
      drawHistory(lc, px, py);
    }
    ctx.drawImage(layer, 0, 0, W, H);

    // The average drift: 2p − 1 chips per bet.
    var endX = xMax, endY = k + (2 * p - 1) * xMax;
    if (endY < 0) {
      endX = k / (1 - 2 * p);
      endY = 0;
    }
    ctx.strokeStyle = 'rgba(236,232,223,0.6)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(px(0), py(k));
    ctx.lineTo(px(endX), py(endY));
    ctx.stroke();
    ctx.setLineDash([]);

    // The game in progress, thinned if it's long.
    if (game) {
      var path = game.path, len = path.length - 1;
      var stride = Math.max(1, Math.ceil(len / 1500));
      ctx.strokeStyle = '#ece8df';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(px(0), py(path[0]));
      for (i = stride; i < len; i += stride) ctx.lineTo(px(i), py(path[i]));
      ctx.lineTo(px(len), py(path[len]));
      ctx.stroke();
      ctx.fillStyle = game.done ? (game.chips === N ? WIN : RUIN) : '#ffffff';
      ctx.beginPath();
      ctx.arc(px(len), py(path[len]), 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // How often the goal was reached, against the exact chance.
    var exact = chanceWin();
    var share = games ? wins / games : 0;
    var bx = L.left, bw = W - 32, by = H - 44, bh = 12;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#9b9daf';
    ctx.fillText('Reached the goal', bx, by - 7);
    ctx.textAlign = 'right';
    ctx.fillStyle = WIN;
    ctx.fillText(games ? (share * 100).toFixed(share < 0.1 ? 2 : 1) + '%' : '–', bx + bw, by - 7);
    ctx.fillStyle = 'rgba(236,232,223,0.07)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = WIN;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(bx, by, bw * share, bh);
    ctx.globalAlpha = 1;
    var ex = Math.round(bx + bw * exact) + 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ex, by - 4);
    ctx.lineTo(ex, by + bh + 4);
    ctx.stroke();
    ctx.textBaseline = 'top';
    ctx.textAlign = exact > 0.75 ? 'right' : 'left';
    ctx.fillStyle = '#ece8df';
    ctx.fillText('exact ' + pct(exact), ex + (exact > 0.75 ? -6 : 6), by + bh + 5);

    V.setText(readout, 'Gamblers ' + games.toLocaleString() + '\n' +
      'Average game ' + (games ? Math.round(betsTotal / games).toLocaleString() : '–') +
      ' bets   exact ' + Math.round(meanLength()).toLocaleString());
  }

  // Finished games, oldest faintest, and a dot where each one ended.
  function drawHistory(ctx, px, py) {
    var i, g;
    ctx.lineJoin = 'round';
    for (i = 0; i < history.length; i++) {
      g = history[i];
      var newest = i === history.length - 1 && !game;
      ctx.strokeStyle = g.won ? WIN : RUIN;
      ctx.globalAlpha = newest ? 0.95 : 0.16 + 0.4 * (i + 1) / history.length;
      ctx.lineWidth = newest ? 1.6 : 1;
      ctx.beginPath();
      for (var j = 0; j < g.xs.length; j++) {
        if (g.xs[j] > xMax) break;
        if (j) ctx.lineTo(px(g.xs[j]), py(g.ys[j])); else ctx.moveTo(px(g.xs[j]), py(g.ys[j]));
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < history.length; i++) {
      g = history[i];
      if (g.len > xMax) continue;
      ctx.fillStyle = g.won ? WIN : RUIN;
      ctx.beginPath();
      ctx.arc(px(g.len), py(g.won ? N : 0), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function pct(v) {
    return (v * 100).toFixed(v < 0.1 ? 2 : 1) + '%';
  }

  clearStats();
  V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(on) {
    playing = on;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    stepping = false;
    setPlaying(!playing);
  });

  V.ctl(section, 'one').addEventListener('click', function () {
    setPlaying(false);
    game = newGame();
    stepping = true;
  });

  V.ctl(section, 'reset').addEventListener('click', clearStats);

  V.segmented(V.ctl(section, 'odds'), function (v) {
    p = parseFloat(v);
    // 18/38, betting on red at American roulette.
    if (Math.abs(p - 18 / 38) < 1e-4) p = 18 / 38;
    clearStats();
  });

  var syncStart = V.range(startInput, V.ctl(section, 'start-out'),
    function (v) { return v + ' chips'; },
    function (v) {
      if (v === k) return;
      k = v;
      clearStats();
    });

  V.range(V.ctl(section, 'goal'), V.ctl(section, 'goal-out'),
    function (v) { return v + ' chips'; },
    function (v) {
      if (v === N) return;
      N = v;
      startInput.max = String(N - 1);
      if (k > N - 1) startInput.value = String(N - 1);
      syncStart();
      clearStats();
    });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) {
      var r = Math.pow(10, v);
      return (r < 10 ? r.toFixed(1) : Math.round(r).toLocaleString()) + ' gamblers / second';
    },
    function (v) { rate = Math.pow(10, v); });

})();
