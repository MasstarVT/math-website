// Nim: take any number of stones from one row; whoever takes the last stone
// wins. Bouton's rule: XOR the row sizes (add in binary without carrying).
// A position is lost for the player to move exactly when that nim-sum is 0.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('nim');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var trickBtn = V.ctl(section, 'trick');

  var PRESETS = { '345': [3, 4, 5], '1357': [1, 3, 5, 7] };
  var STONE = '#a78bfa';
  var BITS = [8, 4, 2, 1];

  var preset = '345';
  var first = 'you';
  var level = 'perfect';
  var showTrick = true;
  var heaps = [];
  var turn = 'you';
  var over = false;
  var winner = '';
  var cpuWait = 0;
  var cpuPlan = null;
  var lastMove = null;
  var fading = [];         // stones on their way out: { heap, from, to, t, who }
  var hover = null;        // { heap, from } under the pointer
  var geo = null;

  function newGame() {
    if (preset === 'random') {
      heaps = [];
      var k = 3 + Math.floor(Math.random() * 3);
      for (var i = 0; i < k; i++) heaps.push(1 + Math.floor(Math.random() * 9));
    } else {
      heaps = PRESETS[preset].slice();
    }
    turn = first;
    over = false;
    winner = '';
    cpuWait = turn === 'cpu' ? 1.1 : 0;
    cpuPlan = null;
    lastMove = null;
    fading = [];
    hover = null;
    stage.dirty = true;
  }

  function nimSum() {
    var s = 0;
    for (var i = 0; i < heaps.length; i++) s ^= heaps[i];
    return s;
  }

  // The move that brings the nim-sum back to 0, if there is one.
  function winningMove() {
    var s = nimSum();
    if (!s) return null;
    for (var i = 0; i < heaps.length; i++) {
      var t = heaps[i] ^ s;
      if (t < heaps[i]) return { heap: i, take: heaps[i] - t };
    }
    return null;
  }

  function randomMove() {
    var rows = [];
    for (var i = 0; i < heaps.length; i++) if (heaps[i]) rows.push(i);
    var h = rows[Math.floor(Math.random() * rows.length)];
    return { heap: h, take: 1 + Math.floor(Math.random() * Math.min(heaps[h], 3)) };
  }

  function planCpu() {
    var m = winningMove();
    if (level === 'careless' && Math.random() < 0.5) m = null;
    if (!m) {
      // Lost against good play, or being careless: stall with a small move.
      if (level === 'perfect') {
        var big = 0;
        for (var i = 1; i < heaps.length; i++) if (heaps[i] > heaps[big]) big = i;
        m = { heap: big, take: 1 };
      } else {
        m = randomMove();
      }
    }
    return m;
  }

  function take(h, k, who) {
    fading.push({ heap: h, from: heaps[h] - k, to: heaps[h], t: 0, who: who });
    heaps[h] -= k;
    lastMove = { who: who, heap: h, take: k };
    hover = null;
    var left = 0;
    for (var i = 0; i < heaps.length; i++) left += heaps[i];
    if (!left) {
      over = true;
      winner = who;
    } else {
      turn = who === 'you' ? 'cpu' : 'you';
      if (turn === 'cpu') cpuWait = 1.1;
    }
    stage.dirty = true;
  }

  function frame(dt, st) {
    var busy = false;
    if (!over && turn === 'cpu') {
      cpuWait -= dt;
      if (cpuWait < 0.5 && !cpuPlan) { cpuPlan = planCpu(); st.dirty = true; }
      if (cpuWait <= 0) {
        var m = cpuPlan;
        cpuPlan = null;
        take(m.heap, m.take, 'cpu');
      }
    }
    for (var i = fading.length - 1; i >= 0; i--) {
      fading[i].t += dt * 2.4;
      if (fading[i].t >= 1) fading.splice(i, 1);
      busy = true;
    }
    if (!busy && !st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  // ---- Drawing ----

  function layout(st) {
    var W = st.width, H = st.height, small = W < 480;
    var top = small ? 86 : 90, rows = heaps.length;
    var cell = small ? 20 : 34;
    var tableW = showTrick ? cell * 4 + (small ? 8 : 16) : 0;
    var under = showTrick ? cell + 22 : 0;
    var rowH = Math.min(small ? 50 : 76, (H - top - 30 - under) / rows);
    // Center the rows in the space below the readout.
    top += Math.max(0, (H - top - 20 - rows * rowH - under) / 2);
    var labelW = small ? 22 : 34;
    var x0 = (small ? 10 : 18) + labelW;
    var right = W - (small ? 10 : 18) - tableW;
    var maxStones = 0;
    for (var i = 0; i < rows; i++) maxStones = Math.max(maxStones, heaps[i], 7);
    var sp = Math.min(small ? 30 : 46, (right - x0) / maxStones);
    return {
      W: W, H: H, small: small, top: top, rowH: rowH, x0: x0, sp: sp, cell: cell,
      r: Math.min(sp * 0.4, rowH * 0.34), tableX: W - (small ? 10 : 18) - cell * 4, labelX: x0 - labelW
    };
  }

  function rowY(G, i) { return G.top + (i + 0.5) * G.rowH; }
  function stoneX(G, j) { return G.x0 + (j + 0.5) * G.sp; }

  function stone(ctx, x, y, r, fill, alpha) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.globalAlpha = alpha * 0.35;
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function draw(st) {
    var ctx = st.ctx, G = layout(st), i, j;
    geo = G;
    ctx.clearRect(0, 0, G.W, G.H);
    var s = nimSum();
    var hint = showTrick && !over && turn === 'you' ? winningMove() : null;

    for (i = 0; i < heaps.length; i++) {
      var y = rowY(G, i);
      ctx.font = '500 12px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#6f7286';
      ctx.fillText(String(i + 1), G.labelX, y);
      ctx.strokeStyle = 'rgba(236,232,223,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(G.x0, y + G.rowH / 2);
      ctx.lineTo(G.x0 + G.sp * Math.max(7, heaps[i]), y + G.rowH / 2);
      ctx.stroke();

      for (j = 0; j < heaps[i]; j++) {
        var x = stoneX(G, j), fill = STONE;
        if (cpuPlan && cpuPlan.heap === i && j >= heaps[i] - cpuPlan.take) fill = '#ffb454';
        else if (hover && hover.heap === i && j >= hover.from && turn === 'you' && !over) fill = '#ffffff';
        stone(ctx, x, y, G.r, fill, 1);
        if (hint && hint.heap === i && j >= heaps[i] - hint.take) {
          ctx.strokeStyle = 'rgba(126,224,161,0.9)';
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, G.r + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // Stones just taken drift up and fade.
    for (i = 0; i < fading.length; i++) {
      var f = fading[i];
      for (j = f.from; j < f.to; j++) {
        stone(ctx, stoneX(G, j), rowY(G, f.heap) - f.t * 18, G.r, f.who === 'cpu' ? '#ffb454' : '#ffffff', 1 - f.t);
      }
    }

    if (showTrick) drawTable(ctx, G, s, hint);
    updateReadout(s, hint);
  }

  function drawTable(ctx, G, s, hint) {
    var c = G.cell, x0 = G.tableX, b, i;
    var yTop = G.top - (G.small ? 14 : 16);
    ctx.font = '500 ' + (G.small ? 10 : 12) + 'px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#6f7286';
    for (b = 0; b < 4; b++) ctx.fillText(String(BITS[b]), x0 + (b + 0.5) * c, yTop);

    // Columns with an odd number of 1s are what the nim-sum reports.
    for (b = 0; b < 4; b++) {
      if (s & BITS[b]) {
        ctx.fillStyle = 'rgba(255,95,162,0.1)';
        ctx.fillRect(x0 + b * c + 1, G.top, c - 2, heaps.length * G.rowH + c + 14);
      }
    }
    ctx.font = '600 ' + (G.small ? 12 : 16) + 'px "IBM Plex Mono", monospace';
    for (i = 0; i < heaps.length; i++) {
      var y = rowY(G, i);
      if (hint && hint.heap === i) {
        ctx.strokeStyle = 'rgba(126,224,161,0.7)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x0 - 3, y - c / 2 - 3, c * 4 + 6, c + 6);
      }
      for (b = 0; b < 4; b++) {
        var on = heaps[i] & BITS[b];
        if (on) {
          ctx.fillStyle = 'rgba(167,139,250,0.28)';
          ctx.fillRect(x0 + b * c + 3, y - c / 2 + 3, c - 6, c - 6);
        }
        ctx.fillStyle = on ? '#ece8df' : '#4a4e63';
        ctx.fillText(on ? '1' : '0', x0 + (b + 0.5) * c, y + 1);
      }
    }
    var ly = G.top + heaps.length * G.rowH + 6;
    ctx.strokeStyle = 'rgba(236,232,223,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, ly);
    ctx.lineTo(x0 + c * 4, ly);
    ctx.stroke();
    var sy = ly + c / 2 + 6;
    for (b = 0; b < 4; b++) {
      var bit = s & BITS[b];
      ctx.fillStyle = bit ? '#ff5fa2' : '#7ee0a1';
      ctx.fillText(bit ? '1' : '0', x0 + (b + 0.5) * c, sy);
    }
    ctx.font = '500 ' + (G.small ? 10 : 11) + 'px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9b9daf';
    ctx.fillText('nim-sum', x0 - 8, sy);
  }

  function updateReadout(s, hint) {
    var lines = [];
    if (over) {
      lines.push(winner === 'you' ? 'You took the last stone. You win!' : 'The computer took the last stone');
      lines.push('Press New game to play again');
    } else if (turn === 'you') {
      lines.push(lastMove && lastMove.who === 'cpu'
        ? 'Computer took ' + lastMove.take + ' from row ' + (lastMove.heap + 1) + '. Your turn'
        : 'Your turn');
      if (showTrick) {
        lines.push(s ? 'Nim-sum ' + s + ', not 0: you can win' : 'Nim-sum 0: no move wins from here');
        if (hint) lines.push('Take ' + hint.take + ' from row ' + (hint.heap + 1) + ' to make it 0');
      }
    } else {
      lines.push('Computer is thinking…');
      if (showTrick) lines.push(s ? 'Nim-sum ' + s + ': it can win' : 'Nim-sum 0: it has no winning move');
    }
    V.setText(readout, lines.join('\n'));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Pointer ----

  function stoneAt(e) {
    if (!geo) return null;
    var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    var i = Math.floor((y - geo.top) / geo.rowH);
    if (i < 0 || i >= heaps.length) return null;
    var j = Math.floor((x - geo.x0) / geo.sp);
    if (j < 0 || j >= heaps[i]) return null;
    return { heap: i, from: j };
  }

  canvas.addEventListener('pointermove', function (e) {
    var h = over || turn !== 'you' ? null : stoneAt(e);
    if (e.pointerType === 'mouse') canvas.style.cursor = h ? 'pointer' : '';
    if ((h && hover && h.heap === hover.heap && h.from === hover.from) || (!h && !hover)) return;
    hover = h;
    stage.dirty = true;
  });

  canvas.addEventListener('pointerleave', function () {
    hover = null;
    stage.dirty = true;
  });

  canvas.addEventListener('click', function (e) {
    if (over || turn !== 'you') return;
    var h = stoneAt(e);
    if (h) take(h.heap, heaps[h.heap] - h.from, 'you');
  });

  // ---- Controls ----

  V.ctl(section, 'new').addEventListener('click', newGame);

  V.segmented(V.ctl(section, 'start'), function (v) { preset = v; newGame(); });
  V.segmented(V.ctl(section, 'first'), function (v) { first = v; newGame(); });
  V.segmented(V.ctl(section, 'level'), function (v) { level = v; });

  V.toggle(trickBtn, function (on) {
    showTrick = on;
    stage.dirty = true;
  });

  newGame();
})();
