// Monty Hall: pick a door, the host opens every other door but one, and you
// may switch. Each game is won by exactly one of the two strategies.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('monty');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var CAR = '#ffb454';
  var STAY = '#6ee7ff';
  var SWITCH = '#ff5fa2';
  var OPEN = 0.3;          // fraction of a game when the host opens doors
  var REVEAL = 0.6;        // ...and when the car is shown and the game counts
  var ANIMATE_BELOW = 6;   // games per second; faster than this, skip the steps
  var REFRESH = 0.35;      // seconds between redrawn doors at high speed
  var STEP_TIME = 2;       // seconds for one game played with "One game"

  var doors = 3;
  var rate = 2;
  var playing = !V.reducedMotion;
  var stepping = false;
  var games = 0;
  var stayWins = 0;
  var game = null;
  var acc = 0;
  var sinceShown = 0;

  function newGame() {
    var car = Math.floor(Math.random() * doors);
    var pick = Math.floor(Math.random() * doors);
    // The host leaves one other door shut: the car's, unless you already picked it.
    var other = car;
    if (pick === car) {
      other = Math.floor(Math.random() * (doors - 1));
      if (other >= pick) other++;
    }
    return { car: car, pick: pick, other: other, t: 0, counted: false };
  }

  function advance(g, dt) {
    g.t = Math.min(1, g.t + dt);
    if (g.t >= REVEAL && !g.counted) {
      g.counted = true;
      games++;
      if (g.pick === g.car) stayWins++;
    }
  }

  function reset() {
    games = stayWins = 0;
    acc = 0;
    stepping = false;
    game = newGame();
  }

  function frame(dt, st) {
    if (stepping) {
      advance(game, dt / STEP_TIME);
      if (game.t >= 1) stepping = false;
    } else if (playing && rate < ANIMATE_BELOW) {
      if (game.t >= 1) game = newGame();
      advance(game, dt * rate);
    } else if (playing) {
      // Too fast to watch each one: play whole games, and only change the
      // doors on screen every so often so they don't strobe.
      acc += dt * rate;
      sinceShown += dt;
      var m = Math.floor(acc);
      acc -= m;
      for (var i = 0; i < m; i++) {
        var g = newGame();
        advance(g, 1);
        if (sinceShown >= REFRESH) {
          game = g;
          sinceShown = 0;
        }
      }
    }
    draw(st);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    ctx.clearRect(0, 0, W, H);

    // ---- Doors ----
    var cols = Math.min(doors, 10);
    var rows = Math.ceil(doors / cols);
    var top = 64, bottom = H * 0.52;
    var labelH = rows === 1 ? 24 : 0;  // room for "Your pick" under a single row
    var cellW = (W - 40) / cols;
    var cellH = (bottom - labelH - top) / rows;
    var dh = Math.min(cellH * 0.85, cellW * 0.78 / 0.62);
    var dw = dh * 0.62;
    var gridW = cellW * cols;
    var x0 = (W - gridW) / 2;
    var radius = Math.min(6, dw * 0.12);
    var ring = Math.max(2, Math.min(3, dw * 0.06));
    var opened = game.t >= OPEN;
    var revealed = game.t >= REVEAL;

    for (var i = 0; i < doors; i++) {
      var cx = x0 + (i % cols + 0.5) * cellW;
      var cy = top + (Math.floor(i / cols) + 0.5) * cellH;
      var x = cx - dw / 2, y = cy - dh / 2;
      var shut = !opened || i === game.pick || i === game.other;

      roundRect(ctx, x, y, dw, dh, radius);
      if (revealed && i === game.car) {
        ctx.fillStyle = CAR;
        ctx.fill();
      } else if (shut && !(revealed && i !== game.car)) {
        ctx.fillStyle = '#1c1f2d';
        ctx.fill();
        ctx.strokeStyle = '#343a4e';
        ctx.lineWidth = 1;
        ctx.stroke();
        if (dw > 22) {
          ctx.fillStyle = '#6f7286';
          ctx.beginPath();
          ctx.arc(x + dw * 0.8, cy, Math.max(1.5, dw * 0.04), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // An open door with a goat behind it.
        ctx.strokeStyle = 'rgba(236,232,223,0.14)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      if (i === game.pick || (opened && i === game.other)) {
        roundRect(ctx, x - ring * 1.6, y - ring * 1.6, dw + ring * 3.2, dh + ring * 3.2, radius + ring);
        ctx.strokeStyle = i === game.pick ? STAY : SWITCH;
        ctx.lineWidth = ring;
        ctx.stroke();
      }

      if (doors <= 10 && (i === game.pick || (opened && i === game.other))) {
        ctx.font = '500 ' + (doors === 3 ? 12 : 10) + 'px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = i === game.pick ? STAY : SWITCH;
        ctx.fillText(i === game.pick ? (doors === 3 ? 'Your pick' : 'Pick') : (doors === 3 ? 'Switch to' : 'Switch'),
          cx, y + dh + ring * 2 + 6);
      }
    }

    if (revealed) {
      var switchWon = game.pick !== game.car;
      ctx.font = '500 13px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = switchWon ? SWITCH : STAY;
      ctx.fillText(switchWon ? 'Switching wins this one' : 'Staying wins this one', W / 2, bottom + 12);
    }

    // ---- Running totals ----
    var barL = 20, barR = W - 20, barsTop = bottom + 40;
    var rowH = (H - 12 - barsTop) / 2;
    bar(ctx, 'Always stay', STAY, games ? stayWins / games : 0, 1 / doors,
      barL, barR, barsTop, rowH, stayWins);
    bar(ctx, 'Always switch', SWITCH, games ? (games - stayWins) / games : 0, 1 - 1 / doors,
      barL, barR, barsTop + rowH, rowH, games - stayWins);

    V.setText(readout, 'Games ' + games.toLocaleString() + '\n' + doors + ' doors, 1 car');
  }

  function bar(ctx, label, color, value, expected, l, r, y, h, wins) {
    var trackY = y + 20, trackH = Math.max(6, Math.min(14, h - 42));
    ctx.font = '500 12px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.fillText(label.toUpperCase(), l, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ece8df';
    ctx.fillText(games ? (value * 100).toFixed(1) + '%  ' + wins.toLocaleString() + ' won' : '–', r, y);

    ctx.fillStyle = 'rgba(236,232,223,0.07)';
    ctx.fillRect(l, trackY, r - l, trackH);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(l, trackY, (r - l) * value, trackH);
    ctx.globalAlpha = 1;

    // Where the bar should settle.
    var ex = Math.round(l + (r - l) * expected) + 0.5;
    ctx.strokeStyle = '#ece8df';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ex, trackY - 4);
    ctx.lineTo(ex, trackY + trackH + 4);
    ctx.stroke();
    ctx.font = '400 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#9b9daf';
    ctx.textAlign = expected > 0.5 ? 'right' : 'left';
    ctx.fillText('expected ' + fraction(expected), expected > 0.5 ? ex - 6 : ex + 6, trackY + trackH + 6);
  }

  function fraction(p) {
    var k = Math.round(p * doors);
    return k + '/' + doors + ' = ' + (p * 100).toFixed(1) + '%';
  }

  reset();
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
    if (!game.counted && game.t > 0) advance(game, 1);
    game = newGame();
    stepping = true;
  });

  V.ctl(section, 'reset').addEventListener('click', reset);

  V.segmented(V.ctl(section, 'doors'), function (v) {
    doors = parseInt(v, 10);
    reset();
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) {
      var r = Math.pow(10, v);
      return (r < 10 ? r.toFixed(1) : Math.round(r).toLocaleString()) + ' games / second';
    },
    function (v) { rate = Math.pow(10, v); });

})();
