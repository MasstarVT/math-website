// Iterated prisoner's dilemma. Each round both players cooperate or defect:
// both cooperate 3 each, both defect 1 each, a defector facing a cooperator
// gets 5 and the cooperator 0. Strategies play 200-round matches in a round
// robin; in Evolution, shares grow with their score (replicator dynamics).
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('prisoners');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var startCtl = V.ctl(section, 'start-control');
  var capA = V.ctl(section, 'cap-a'), capB = V.ctl(section, 'cap-b');
  var CAPS = {
    robin: [capA.textContent, capB.textContent],
    evolve: ["Each band: one strategy's share of the population", 'Generations run left to right']
  };

  var C = 1, D = 0;
  var ROUNDS = 200, REPS = 16, GENS = 80, STEPS = 6;
  var NAMES = ['Tit for tat', 'Tit for two tats', 'Grudger', 'Pavlov', 'Joss', 'Always cooperate', 'Always defect', 'Random'];
  var SHORT = ['TFT', 'TF2T', 'Grudge', 'Pavlov', 'Joss', 'AllC', 'AllD', 'Random'];
  var ABBR = ['TFT', 'TF2T', 'Grud', 'Pavl', 'Joss', 'AllC', 'AllD', 'Rand'];
  var COLORS = ['#7ee0a1', '#6ee7ff', '#a78bfa', '#ffd166', '#ff8a5c', '#ece8df', '#ff5fa2', '#7c8cff'];
  var HEAT = [[24, 22, 34], [124, 140, 255], [126, 224, 161], [255, 209, 102]];

  var view = 'robin';
  var start = 'pushovers';
  var mistakes = 0;
  var on = [true, true, true, true, true, true, true, true];
  var playing = !V.reducedMotion;
  var M = null;              // M[i][j]: average points a round for i against j
  var games = null;          // one sample match per pair, for the move strip
  var revealed = 0, acc = 0;
  var rowPos = [];
  var pick = null;           // [i, j] shown in the move strip
  var hist = [], gen = 0;
  var cells = null;          // last layout, for clicks

  function choose(k, t, my, op, st) {
    switch (k) {
      case 0: return t ? op[t - 1] : C;
      case 1: return t > 1 && op[t - 1] === D && op[t - 2] === D ? D : C;
      case 2: return st.grudge ? D : C;
      case 3: return t ? (my[t - 1] === op[t - 1] ? C : D) : C;
      case 4:
        var m = t ? op[t - 1] : C;
        return m === C && Math.random() < 0.1 ? D : m;
      case 5: return C;
      case 6: return D;
      default: return Math.random() < 0.5 ? C : D;
    }
  }

  function pay(a, b) { return a ? (b ? 3 : 0) : (b ? 5 : 1); }

  function play(i, j) {
    var a = new Uint8Array(ROUNDS), b = new Uint8Array(ROUNDS), sa = { grudge: false }, sb = { grudge: false };
    var pa = 0, pb = 0;
    for (var t = 0; t < ROUNDS; t++) {
      var x = choose(i, t, a, b, sa), y = choose(j, t, b, a, sb);
      // A mistake flips the move the player meant to make.
      if (mistakes && Math.random() < mistakes) x ^= 1;
      if (mistakes && Math.random() < mistakes) y ^= 1;
      a[t] = x;
      b[t] = y;
      if (!y) sa.grudge = true;
      if (!x) sb.grudge = true;
      pa += pay(x, y);
      pb += pay(y, x);
    }
    return { a: a, b: b, pa: pa / ROUNDS, pb: pb / ROUNDS };
  }

  // Every pair, including each strategy against its twin. Matches with any
  // chance in them are played several times and averaged.
  function tournament() {
    M = [];
    games = [];
    for (var i = 0; i < 8; i++) { M.push([0, 0, 0, 0, 0, 0, 0, 0]); games.push([]); }
    for (i = 0; i < 8; i++) {
      for (var j = i; j < 8; j++) {
        var luck = mistakes > 0 || i === 4 || i === 7 || j === 4 || j === 7;
        var reps = luck ? REPS : 1, si = 0, sj = 0;
        for (var r = 0; r < reps; r++) {
          var g = play(i, j);
          if (!r) {
            games[i][j] = { mine: g.a, theirs: g.b, me: 0, them: 0 };
            games[j][i] = { mine: g.b, theirs: g.a, me: 0, them: 0 };
          }
          si += g.pa;
          sj += g.pb;
        }
        M[i][j] = si / reps;
        M[j][i] = sj / reps;
        if (i === j) M[i][i] = (si + sj) / 2 / reps;
        games[i][j].me = M[i][j]; games[i][j].them = M[j][i];
        games[j][i].me = M[j][i]; games[j][i].them = M[i][j];
      }
    }
  }

  function included() {
    var out = [];
    for (var i = 0; i < 8; i++) if (on[i]) out.push(i);
    return out;
  }

  function restart() {
    tournament();
    var inc = included();
    revealed = V.reducedMotion ? inc.length * inc.length : 0;
    acc = 0;
    rowPos = [];
    for (var r = 0; r < 8; r++) rowPos.push(inc.indexOf(r));
    if (!pick || !on[pick[0]] || !on[pick[1]]) {
      pick = on[0] && on[6] ? [0, 6] : [inc[0], inc[inc.length - 1]];
    }
    // Evolution starts from equal shares, or with half the population
    // made of pushovers who always cooperate.
    var x = [0, 0, 0, 0, 0, 0, 0, 0];
    var others = inc.filter(function (k) { return k !== 5; });
    for (var k = 0; k < inc.length; k++) {
      var s = inc[k];
      if (start === 'pushovers' && on[5]) x[s] = s === 5 ? 0.5 : 0.5 / others.length;
      else x[s] = 1 / inc.length;
    }
    hist = [x];
    gen = 0;
    stage.dirty = true;
  }

  function score(i) {
    var inc = included(), s = 0;
    for (var k = 0; k < inc.length; k++) s += M[i][inc[k]];
    return s / inc.length;
  }

  // One generation: shares grow in proportion to exp(β × how far their score
  // is above the average). Shares under 0.1% die out.
  function evolve() {
    var x = hist[hist.length - 1], f = [], avg = 0, i, j;
    for (i = 0; i < 8; i++) {
      f[i] = 0;
      for (j = 0; j < 8; j++) f[i] += x[j] * M[i][j];
      avg += x[i] * f[i];
    }
    var y = [], sum = 0;
    for (i = 0; i < 8; i++) { y[i] = x[i] * Math.exp(0.5 * (f[i] - avg)); sum += y[i]; }
    var sum2 = 0;
    for (i = 0; i < 8; i++) { y[i] /= sum; if (y[i] < 1e-3) y[i] = 0; sum2 += y[i]; }
    for (i = 0; i < 8; i++) y[i] /= sum2;
    hist.push(y);
    gen++;
  }

  function frame(dt, st) {
    if (!M) restart();
    var moved = false;
    var inc = included(), cellsTotal = inc.length * inc.length;
    if (view === 'robin') {
      if (playing && revealed < cellsTotal) {
        acc += dt * 26;
        var m = Math.floor(acc);
        acc -= m;
        revealed = Math.min(cellsTotal, revealed + m);
        moved = true;
      }
      // Rows slide into order once every match is in.
      var order = inc.slice();
      if (revealed >= cellsTotal) order.sort(function (a, b) { return score(b) - score(a); });
      for (var r = 0; r < order.length; r++) {
        var cur = rowPos[order[r]], goal = r;
        if (Math.abs(cur - goal) > 0.002) {
          rowPos[order[r]] = V.reducedMotion ? goal : cur + (goal - cur) * Math.min(1, dt * 7);
          moved = true;
        } else rowPos[order[r]] = goal;
      }
      if (playing && revealed >= cellsTotal && !moved) setPlaying(false);
    } else if (playing && gen < GENS) {
      acc += dt * STEPS;
      while (acc >= 1 && gen < GENS) { evolve(); acc -= 1; }
      moved = true;
      if (gen >= GENS) setPlaying(false);
    }
    if (!moved && !st.dirty) return;
    st.dirty = false;
    if (view === 'robin') drawRobin(st); else drawEvolution(st);
  }

  // ---- Drawing: round robin ----

  function drawRobin(st) {
    var ctx = st.ctx, W = st.width, H = st.height, inc = included(), k = inc.length;
    var wide = W >= 520, top = 64, header = 18, strip = wide ? 62 : 54;
    var labelW = wide ? 118 : 50, barW = wide ? 132 : 60;
    var cell = Math.min(44, (W - 16 - labelW - barW - 10) / k, (H - top - header - strip - 6) / k);
    var mw = cell * k, x0 = (W - (labelW + mw + 10 + barW)) / 2 + labelW, y0 = top + header;
    ctx.clearRect(0, 0, W, H);
    cells = { x: x0, y: y0, cell: cell, inc: inc };

    // Columns follow the same order as the rows, so twins stay on the diagonal.
    ctx.font = '500 ' + (cell < 34 ? 9 : 10) + 'px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (var c = 0; c < k; c++) {
      ctx.fillStyle = COLORS[inc[c]];
      ctx.fillText(ABBR[inc[c]], x0 + (rowPos[inc[c]] + 0.5) * cell, y0 - 6);
    }

    var n = 0, best = -1, bestScore = -1;
    for (var a = 0; a < k; a++) {
      var i = inc[a], ry = y0 + rowPos[i] * cell;
      var total = 0, seen = 0;
      ctx.font = '500 ' + (wide ? 12 : 10) + 'px "IBM Plex Sans", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS[i];
      ctx.fillText(wide ? NAMES[i] : SHORT[i], x0 - 8, ry + cell / 2);
      for (var b = 0; b < k; b++) {
        var j = inc[b], idx = a * k + b, cx = x0 + rowPos[j] * cell;
        if (idx < revealed) {
          var v = M[i][j];
          total += v;
          seen++;
          ctx.fillStyle = V.gradient(HEAT, v / 5);
          ctx.fillRect(cx + 1, ry + 1, cell - 2, cell - 2);
          if (cell >= 30) {
            ctx.font = '500 ' + (cell >= 40 ? 11 : 10) + 'px "IBM Plex Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = v > 2.2 ? 'rgba(10,11,16,0.85)' : 'rgba(236,232,223,0.85)';
            ctx.fillText(v.toFixed(1), cx + cell / 2, ry + cell / 2 + 1);
          }
        } else {
          ctx.fillStyle = '#121420';
          ctx.fillRect(cx + 1, ry + 1, cell - 2, cell - 2);
        }
        if (pick && pick[0] === i && pick[1] === j) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.strokeRect(cx + 1, ry + 1, cell - 2, cell - 2);
        }
      }
      // Average a round over the whole field so far.
      var avg = seen ? total / k : 0;
      if (seen === k) {
        n++;
        if (avg > bestScore) { bestScore = avg; best = i; }
      }
      var bx = x0 + mw + 10, bw = barW - (wide ? 40 : 30);
      ctx.fillStyle = 'rgba(236,232,223,0.07)';
      ctx.fillRect(bx, ry + cell * 0.3, bw, cell * 0.4);
      ctx.fillStyle = COLORS[i];
      ctx.fillRect(bx, ry + cell * 0.3, bw * Math.min(1, avg / 3.5), cell * 0.4);
      if (seen) {
        ctx.font = '500 ' + (wide ? 11 : 10) + 'px "IBM Plex Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#c4c1ba';
        ctx.fillText(avg.toFixed(2), bx + bw + 6, ry + cell / 2 + 1);
      }
    }

    drawStrip(ctx, W, H, strip, wide);
    var line1 = '200 rounds a match, ' + Math.round(mistakes * 100) + '% mistakes';
    var line2 = n === k && best >= 0 ? 'Top: ' + NAMES[best] + ', ' + bestScore.toFixed(2) + ' a round' : 'Playing every pair…';
    V.setText(readout, line1 + '\n' + line2);
  }

  // The first rounds of one match, as two rows of dots.
  function drawStrip(ctx, W, H, strip, wide) {
    if (!pick) return;
    var g = games[pick[0]][pick[1]], y = H - strip + 8;
    ctx.font = '500 ' + (wide ? 11 : 10) + 'px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#9b9daf';
    ctx.fillText((wide ? NAMES : SHORT)[pick[0]] + ' ' + g.me.toFixed(2) + ' vs ' + g.them.toFixed(2) + ' ' + (wide ? NAMES : SHORT)[pick[1]], 12, y);
    var label = wide ? 46 : 0, dots = Math.floor((W - 24 - label) / 8), r = 2.6;
    dots = Math.min(dots, ROUNDS);
    for (var row = 0; row < 2; row++) {
      var moves = row ? g.theirs : g.mine, yy = y + 16 + row * 12;
      if (wide) {
        ctx.fillStyle = COLORS[pick[row]];
        ctx.fillText(ABBR[pick[row]], 12, yy);
      }
      for (var t = 0; t < dots; t++) {
        ctx.fillStyle = moves[t] ? '#7ee0a1' : '#ff5fa2';
        ctx.beginPath();
        ctx.arc(12 + label + t * 8 + r, yy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---- Drawing: evolution ----

  function drawEvolution(st) {
    var ctx = st.ctx, W = st.width, H = st.height, wide = W >= 520;
    var top = 66, left = 14, right = W - (wide ? 150 : 76), bottom = H - 26;
    var inc = included(), g, i;
    ctx.clearRect(0, 0, W, H);
    function X(t) { return left + t / GENS * (right - left); }
    function Y(v) { return bottom - v * (bottom - top); }

    // Stacked shares over the generations so far.
    var base = [];
    for (g = 0; g < hist.length; g++) base.push(0);
    for (var k = 0; k < inc.length; k++) {
      i = inc[k];
      ctx.beginPath();
      for (g = 0; g < hist.length; g++) {
        var yv = Y(base[g] + hist[g][i]);
        if (g) ctx.lineTo(X(g), yv); else ctx.moveTo(X(g), yv);
      }
      for (g = hist.length - 1; g >= 0; g--) ctx.lineTo(X(g), Y(base[g]));
      ctx.closePath();
      ctx.fillStyle = COLORS[i];
      ctx.globalAlpha = 0.78;
      ctx.fill();
      ctx.globalAlpha = 1;
      for (g = 0; g < hist.length; g++) base[g] += hist[g][i];
    }

    ctx.strokeStyle = 'rgba(236,232,223,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, bottom + 0.5);
    ctx.lineTo(right, bottom + 0.5);
    ctx.stroke();
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#6f7286';
    ctx.textBaseline = 'top';
    for (var t = 0; t <= GENS; t += 20) {
      ctx.textAlign = t === 0 ? 'left' : t === GENS ? 'right' : 'center';
      ctx.fillText(String(t), X(t), bottom + 7);
    }

    // Labels beside the latest shares, nudged apart so they don't overlap.
    var last = hist[hist.length - 1], acc2 = 0, tags = [];
    for (k = 0; k < inc.length; k++) {
      i = inc[k];
      if (last[i] > 0.004) tags.push({ i: i, y: Y(acc2 + last[i] / 2) });
      acc2 += last[i];
    }
    tags.sort(function (a, b) { return b.y - a.y; });
    for (k = 1; k < tags.length; k++) if (tags[k - 1].y - tags[k].y < 14) tags[k].y = tags[k - 1].y - 14;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '500 ' + (wide ? 11 : 10) + 'px "IBM Plex Mono", monospace';
    var lx = X(Math.min(gen, GENS)) + 8;
    for (k = 0; k < tags.length; k++) {
      ctx.fillStyle = COLORS[tags[k].i];
      ctx.fillText((wide ? NAMES[tags[k].i] : SHORT[tags[k].i]) + ' ' + Math.round(last[tags[k].i] * 100) + '%', lx, tags[k].y);
    }

    var top1 = -1;
    for (k = 0; k < inc.length; k++) if (top1 < 0 || last[inc[k]] > last[top1]) top1 = inc[k];
    V.setText(readout, 'Generation ' + gen + ' of ' + GENS + ', ' + Math.round(mistakes * 100) + '% mistakes\n' +
      'Biggest: ' + NAMES[top1] + ', ' + Math.round(last[top1] * 100) + '%');
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Pointer: pick a match to see its moves ----

  canvas.addEventListener('click', function (e) {
    if (view !== 'robin' || !cells) return;
    var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    var col = Math.floor((x - cells.x) / cells.cell), row = Math.floor((y - cells.y) / cells.cell);
    if (col < 0 || col >= cells.inc.length || row < 0 || row >= cells.inc.length) return;
    var i = -1, j = -1;
    for (var k = 0; k < cells.inc.length; k++) {
      var at = Math.round(rowPos[cells.inc[k]]);
      if (at === row) i = cells.inc[k];
      if (at === col) j = cells.inc[k];
    }
    if (i < 0 || j < 0) return;
    pick = [i, j];
    stage.dirty = true;
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);

  playBtn.addEventListener('click', function () {
    var inc = included();
    if (!playing && ((view === 'robin' && revealed >= inc.length * inc.length) || (view === 'evolve' && gen >= GENS))) restart();
    setPlaying(!playing);
  });

  V.ctl(section, 'again').addEventListener('click', function () {
    restart();
    setPlaying(true);
  });

  V.segmented(V.ctl(section, 'view'), function (v) {
    view = v;
    startCtl.hidden = view !== 'evolve';
    V.setText(capA, CAPS[view][0]);
    V.setText(capB, CAPS[view][1]);
    if (view === 'evolve') { hist = [hist[0]]; gen = 0; acc = 0; }
    setPlaying(true);
    stage.dirty = true;
  });

  V.segmented(V.ctl(section, 'start'), function (v) {
    start = v;
    restart();
    setPlaying(true);
  });

  V.range(V.ctl(section, 'mistakes'), V.ctl(section, 'mistakes-out'),
    function (v) { return v + '% of moves'; },
    function (v) {
      mistakes = v / 100;
      if (M) { restart(); setPlaying(true); }
    });

  section.querySelectorAll('[data-strategy]').forEach(function (chip) {
    var k = parseInt(chip.dataset.strategy, 10);
    chip.addEventListener('click', function () {
      if (on[k] && included().length <= 2) return;
      on[k] = !on[k];
      chip.setAttribute('aria-pressed', String(on[k]));
      restart();
      setPlaying(true);
    });
  });
})();
