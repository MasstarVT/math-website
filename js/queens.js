// n queens by backtracking: put a queen on the first safe square of the next
// row; when a row has none left, go back one row and move that queen along.
// Each step of the animation examines one square.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('queens');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var stopBtn = V.ctl(section, 'stop');

  var TOTAL = [1, 1, 0, 0, 2, 10, 4, 40, 92, 352, 724, 2680, 14200];
  var KEEP = 80;            // solutions kept for the gallery
  var QUEEN = '#ff5fa2';

  var n = 8;
  var rate = 32;            // squares per second
  var fastest = false;
  var playing = !V.reducedMotion;
  var stopAtSolutions = false;
  var cols, colUsed, d1, d2;
  var row, col, checks, solutions, done, justSolved, bad, hold, acc;
  var gallery = [];

  function reset() {
    cols = [];
    for (var i = 0; i < n; i++) cols.push(-1);
    colUsed = new Uint8Array(n);
    d1 = new Uint8Array(2 * n);
    d2 = new Uint8Array(2 * n);
    row = 0;
    col = 0;
    checks = 0;
    solutions = 0;
    done = false;
    justSolved = false;
    bad = -1;
    hold = 0;
    acc = 0;
    gallery = [];
    stage.dirty = true;
  }

  function mark(r, c, v) {
    colUsed[c] = v;
    d1[r + c] = v;
    d2[r - c + n - 1] = v;
  }

  // One square. Returns true when a solution was just completed.
  function step() {
    if (done) return false;
    bad = -1;
    if (justSolved) {
      justSolved = false;
      row = n - 1;
      mark(row, cols[row], 0);
      col = cols[row] + 1;
      cols[row] = -1;
      return false;
    }
    if (col >= n) {
      row--;
      if (row < 0) { done = true; row = 0; return false; }
      mark(row, cols[row], 0);
      col = cols[row] + 1;
      cols[row] = -1;
      return false;
    }
    checks++;
    if (!colUsed[col] && !d1[row + col] && !d2[row - col + n - 1]) {
      cols[row] = col;
      mark(row, col, 1);
      row++;
      col = 0;
      if (row === n) {
        solutions++;
        justSolved = true;
        gallery.push(cols.slice());
        if (gallery.length > KEEP) gallery.shift();
        return true;
      }
    } else {
      bad = col;
      col++;
    }
    return false;
  }

  function frame(dt, st) {
    var moved = false;
    if (hold > 0) {
      hold -= dt;
      moved = true;
    } else if (playing && !done) {
      var t0 = performance.now(), k;
      if (fastest) {
        // As many squares as fit in about 5 ms.
        do {
          for (k = 0; k < 512 && !done; k++) {
            if (step() && stopAtSolutions) { setPlaying(false); break; }
          }
        } while (playing && !done && performance.now() - t0 < 5);
      } else {
        acc += dt * rate;
        var m = Math.floor(acc);
        acc -= m;
        for (k = 0; k < m && !done; k++) {
          if (step()) {
            if (stopAtSolutions) { setPlaying(false); acc = 0; break; }
            if (rate <= 200) { hold = 0.7; acc = 0; break; }
          }
          if (performance.now() - t0 > 5) { acc = 0; break; }
        }
      }
      moved = true;
      if (done) setPlaying(false);
    }
    if (!moved && !st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  // ---- Drawing ----

  function layout(st) {
    var W = st.width, H = st.height;
    if (W / H > 1.15) {
      // Leave the panel wide enough for the readout.
      var B = Math.min(H - 24, W - 250);
      return { W: W, H: H, B: B, x: W - B - 12, y: 12, side: true, px: 12, pw: W - B - 40, py: 84 };
    }
    var Bm = Math.min(W - 16, H - 74);
    return { W: W, H: H, B: Bm, x: (W - Bm) / 2, y: H - Bm - 8, side: false };
  }

  function crown(ctx, cx, cy, s, fill, alpha) {
    var w = s * 0.64, h = s * 0.5, y0 = cy - h * 0.55, y1 = cy + h * 0.45;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, y1);
    ctx.lineTo(cx - w / 2, y0 + h * 0.12);
    ctx.lineTo(cx - w * 0.22, y0 + h * 0.5);
    ctx.lineTo(cx, y0);
    ctx.lineTo(cx + w * 0.22, y0 + h * 0.5);
    ctx.lineTo(cx + w / 2, y0 + h * 0.12);
    ctx.lineTo(cx + w / 2, y1);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,11,16,0.6)';
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.stroke();
    ctx.fillRect(cx - w / 2, y1 + h * 0.1, w, h * 0.16);
    ctx.globalAlpha = 1;
  }

  // How far through the whole search tree we are, from the queens placed.
  function progress() {
    if (done) return 1;
    var f = 0, scale = 1;
    for (var r = 0; r < n; r++) {
      scale /= n;
      if (cols[r] >= 0) f += cols[r] * scale;
      else { f += Math.min(col, n) * scale; break; }
    }
    return Math.min(1, f);
  }

  function draw(st) {
    var ctx = st.ctx, G = layout(st), r, c;
    ctx.clearRect(0, 0, G.W, G.H);
    var s = G.B / n;

    for (r = 0; r < n; r++) {
      for (c = 0; c < n; c++) {
        ctx.fillStyle = (r + c) % 2 ? '#1a1d29' : '#121420';
        ctx.fillRect(G.x + c * s, G.y + r * s, s + 0.5, s + 0.5);
        // Squares attacked by the queens above.
        if (r >= row && !justSolved && (colUsed[c] || d1[r + c] || d2[r - c + n - 1])) {
          ctx.fillStyle = 'rgba(255,95,162,0.13)';
          ctx.fillRect(G.x + c * s, G.y + r * s, s + 0.5, s + 0.5);
        }
      }
    }
    // The row being worked on.
    if (!done && !justSolved && row < n) {
      ctx.strokeStyle = 'rgba(236,232,223,0.5)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(G.x + 0.75, G.y + row * s + 0.75, G.B - 1.5, s - 1.5);
    }

    // A rejected square, with a line to one queen that attacks it.
    if (bad >= 0 && row < n) {
      var bx = G.x + (bad + 0.5) * s, by = G.y + (row + 0.5) * s;
      for (r = row - 1; r >= 0; r--) {
        c = cols[r];
        if (c === bad || Math.abs(c - bad) === row - r) {
          ctx.strokeStyle = 'rgba(255,95,162,0.75)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(G.x + (c + 0.5) * s, G.y + (r + 0.5) * s);
          ctx.lineTo(bx, by);
          ctx.stroke();
          break;
        }
      }
      crown(ctx, bx, by, s, '#ff5fa2', 0.35);
    }

    // When the search is over, leave the last solution on the board.
    if (done && gallery.length) {
      var lastSol = gallery[gallery.length - 1];
      for (r = 0; r < n; r++) crown(ctx, G.x + (lastSol[r] + 0.5) * s, G.y + (r + 0.5) * s, s, '#ffd166', 0.9);
    }
    for (r = 0; r < n; r++) {
      if (cols[r] >= 0) crown(ctx, G.x + (cols[r] + 0.5) * s, G.y + (r + 0.5) * s, s, justSolved ? '#ffd166' : QUEEN, 1);
    }

    ctx.strokeStyle = 'rgba(236,232,223,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(G.x + 0.5, G.y + 0.5, G.B - 1, G.B - 1);

    drawProgress(ctx, G);
    if (G.side) drawGallery(ctx, G);

    var line1 = done ? 'All ' + TOTAL[n].toLocaleString() + ' found'
      : 'Solved ' + solutions.toLocaleString() + ' of ' + TOTAL[n].toLocaleString();
    var line2 = 'Checked ' + (checks < 1e6 ? checks.toLocaleString() : (checks / 1e6).toFixed(1) + 'M') + ' squares';
    V.setText(readout, line1 + '\n' + line2);
  }

  function drawProgress(ctx, G) {
    var x, y, w;
    if (G.side) { x = G.px; y = G.py; w = G.pw; }
    else { x = G.W * 0.63; y = 26; w = G.W - x - 10; }
    var f = progress();
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6f7286';
    ctx.fillText('Search tree', x, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ece8df';
    ctx.fillText(Math.floor(f * 100) + '%', x + w, y);
    ctx.fillStyle = 'rgba(236,232,223,0.12)';
    ctx.fillRect(x, y + 6, w, 4);
    ctx.fillStyle = QUEEN;
    ctx.fillRect(x, y + 6, w * f, 4);
  }

  // The most recent solutions as little boards, newest first.
  function drawGallery(ctx, G) {
    var x0 = G.px, y0 = G.py + 34, w = G.pw;
    var gap = 6, t = Math.max(22, Math.min(40, (w - gap * 3) / 4));
    var per = Math.max(1, Math.floor((w + gap) / (t + gap)));
    var rows = Math.max(0, Math.floor((G.H - y0 - 30) / (t + gap)));
    var fit = per * rows;
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#6f7286';
    ctx.fillText(solutions ? 'Latest solutions' : 'Solutions appear here', x0, y0 - 8);
    var shown = Math.min(fit, gallery.length);
    for (var i = 0; i < shown; i++) {
      var sol = gallery[gallery.length - 1 - i];
      var gx = x0 + (i % per) * (t + gap), gy = y0 + Math.floor(i / per) * (t + gap);
      ctx.fillStyle = i === 0 && (justSolved || hold > 0) ? 'rgba(255,209,102,0.18)' : '#141621';
      ctx.fillRect(gx, gy, t, t);
      var q = t / n;
      ctx.fillStyle = i === 0 ? '#ffd166' : QUEEN;
      for (var r = 0; r < n; r++) ctx.fillRect(gx + sol[r] * q + q * 0.15, gy + r * q + q * 0.15, q * 0.7, q * 0.7);
    }
    if (solutions > shown && shown) {
      ctx.fillStyle = '#6f7286';
      ctx.fillText('and ' + (solutions - shown).toLocaleString() + ' more', x0, y0 + rows * (t + gap) + 12);
    }
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);

  playBtn.addEventListener('click', function () {
    if (!playing && done) reset();
    hold = 0;
    setPlaying(!playing);
  });

  V.ctl(section, 'one').addEventListener('click', function () {
    setPlaying(false);
    hold = 0;
    step();
    stage.dirty = true;
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    reset();
    setPlaying(!V.reducedMotion);
  });

  V.toggle(stopBtn, function (on) { stopAtSolutions = on; });

  V.range(V.ctl(section, 'n'), V.ctl(section, 'n-out'),
    function (v) { return v + ' queens, ' + TOTAL[v].toLocaleString() + ' solutions'; },
    function (v) {
      n = v;
      reset();
    });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return v >= 15 ? 'as fast as it can' : Math.round(Math.pow(2, v)).toLocaleString() + ' squares / s'; },
    function (v) {
      fastest = v >= 15;
      rate = Math.pow(2, v);
    });
})();
