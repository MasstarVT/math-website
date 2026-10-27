// Towers of Hanoi: to move n disks, move n − 1 out of the way, move the
// biggest, then move the n − 1 back on top, 2ⁿ − 1 moves in all. On move m
// the disk to move is the lowest 1 bit of m written in binary.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('hanoi');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var oneBtn = V.ctl(section, 'one');
  var hintBtn = V.ctl(section, 'hint');
  var cap = V.ctl(section, 'cap');
  var CAPS = { watch: cap.textContent, play: 'Readout: the fewest moves still needed from here' };

  var NAMES = ['A', 'B', 'C'];
  var n = 5;
  var mode = 'watch';
  var speed = 2;           // moves per second
  var playing = !V.reducedMotion;
  var pegs = [[], [], []];
  var moves = [];          // the recursive solution, as [disk, from, to]
  var done = 0;            // moves finished
  var anim = null;         // { disk, from, to, t } while a disk is flying
  var stepOnce = false;
  var held = null;         // play mode: { disk, peg } lifted above a peg
  var flash = null;        // { peg, t } after an illegal drop
  var hint = null;         // { from, to }
  var handMoves = 0;
  var solved = false;
  var geo = null;

  function solve(k, from, to, via, out) {
    if (!k) return;
    solve(k - 1, from, via, to, out);
    out.push([k, from, to]);
    solve(k - 1, via, to, from, out);
  }

  function reset() {
    pegs = [[], [], []];
    for (var k = n; k >= 1; k--) pegs[0].push(k);
    moves = [];
    solve(n, 0, 2, 1, moves);
    done = 0;
    anim = null;
    stepOnce = false;
    held = null;
    flash = null;
    hint = null;
    handMoves = 0;
    solved = false;
    stage.dirty = true;
  }

  function top(p) { var s = pegs[p]; return s.length ? s[s.length - 1] : 0; }

  // Fewest moves to stack disks 1..k on peg t from here. If disk k is already
  // on t, leave it; otherwise the k − 1 above must clear to the third peg,
  // disk k moves, and the k − 1 follow it (2^(k−1) − 1 more moves).
  function where(k) {
    if (held && held.disk === k) return held.peg;
    if (anim && anim.disk === k) return anim.to;
    for (var p = 0; p < 3; p++) if (pegs[p].indexOf(k) >= 0) return p;
    return -1;
  }
  function distance(k, t) {
    if (!k) return 0;
    var p = where(k);
    if (p === t) return distance(k - 1, t);
    return distance(k - 1, 3 - p - t) + Math.pow(2, k - 1);
  }
  // The first move of that best route.
  function bestMove(k, t) {
    if (!k) return null;
    var p = where(k);
    if (p === t) return bestMove(k - 1, t);
    var o = 3 - p - t;
    var m = bestMove(k - 1, o);
    return m || { from: p, to: t };
  }

  function finishAnim() {
    if (!anim) return;
    pegs[anim.to].push(anim.disk);
    if (mode === 'watch') done++;
    anim = null;
    if (mode === 'play' && pegs[2].length === n) solved = true;
    stage.dirty = true;
  }

  function frame(dt, st) {
    var busy = false;
    if (anim) {
      anim.t += dt * Math.max(speed, mode === 'play' ? 3 : 0);
      if (anim.t >= 1) {
        var extra = anim.t - 1;
        finishAnim();
        if (mode === 'watch' && playing && done < moves.length) startMove(extra);
      }
      busy = true;
    }
    if (mode === 'watch' && !anim && done < moves.length && (playing || stepOnce)) {
      stepOnce = false;
      startMove(0);
      busy = true;
    }
    if (mode === 'watch' && playing && !anim && done >= moves.length) setPlaying(false);
    if (flash) {
      flash.t -= dt;
      if (flash.t <= 0) flash = null;
      busy = true;
    }
    if (!busy && !st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function startMove(t) {
    var m = moves[done];
    pegs[m[1]].pop();
    anim = { disk: m[0], from: m[1], to: m[2], t: Math.min(t, 0.9) };
  }

  // ---- Drawing ----

  function layout(st) {
    var W = st.width, H = st.height;
    var box = Math.min(30, (W - 120) / n - 4, H * 0.07);
    var base = H - 38 - (mode === 'watch' ? box + 16 : 0);
    // Disks as thick as fit, pegs just tall enough for the tower plus a bit,
    // and room above them to lift a disk clear of the readout.
    var diskH = Math.min(34, (base - 84) / (n + 3.2));
    var pegTop = base - diskH * (n + 1.2);
    var maxW = W / 3 - (W < 480 ? 10 : 22);
    return {
      W: W, H: H, base: base, pegTop: pegTop, diskH: diskH, maxW: maxW,
      x: [W / 6, W / 2, W * 5 / 6], lift: pegTop - diskH - 12, bitsY: H - 12, box: box
    };
  }

  function diskWidth(G, k) {
    return G.maxW * (0.3 + 0.7 * (n === 1 ? 1 : (k - 1) / (n - 1)));
  }

  function diskColor(k) {
    return V.gradient(V.SPECTRUM, n === 1 ? 0.5 : (k - 1) / (n - 1));
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawDisk(ctx, G, k, cx, y, glow) {
    var w = diskWidth(G, k), h = G.diskH - 3;
    roundRect(ctx, cx - w / 2, y - h, w, h, 6);
    ctx.fillStyle = diskColor(k);
    ctx.fill();
    if (glow) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (h >= 12) {
      ctx.fillStyle = 'rgba(10,11,16,0.75)';
      ctx.font = '600 ' + Math.min(13, h - 2) + 'px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(k), cx, y - h / 2 + 0.5);
    }
  }

  // Where a flying disk is at time t: up, across in an arc, then down.
  function flyPos(G, a) {
    var fromY = G.base - pegs[a.from].length * G.diskH;
    var toY = G.base - pegs[a.to].length * G.diskH;
    var x0 = G.x[a.from], x1 = G.x[a.to], t = a.t;
    if (t < 0.3) return { x: x0, y: fromY + (G.lift - fromY) * V.easeInOut(t / 0.3) };
    if (t < 0.7) {
      var s = V.easeInOut((t - 0.3) / 0.4);
      var rise = Math.max(0, Math.min(16, G.lift - G.diskH - 70));
      return { x: x0 + (x1 - x0) * s, y: G.lift - Math.sin(s * Math.PI) * rise };
    }
    return { x: x1, y: G.lift + (toY - G.lift) * V.easeInOut((t - 0.7) / 0.3) };
  }

  function draw(st) {
    var ctx = st.ctx, G = layout(st), p, i;
    geo = G;
    ctx.clearRect(0, 0, G.W, G.H);

    // Pegs and base.
    for (p = 0; p < 3; p++) {
      var bad = flash && flash.peg === p;
      ctx.fillStyle = bad ? 'rgba(255,95,162,' + (0.4 + flash.t) + ')' : 'rgba(236,232,223,0.22)';
      roundRect(ctx, G.x[p] - 3, G.pegTop, 6, G.base - G.pegTop, 3);
      ctx.fill();
      ctx.fillStyle = mode === 'play' && p === 2 ? '#6ee7ff' : '#6f7286';
      ctx.font = '500 12px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(NAMES[p] + (mode === 'play' && p === 2 ? ' (goal)' : ''), G.x[p], G.base + 10);
    }
    ctx.fillStyle = 'rgba(236,232,223,0.3)';
    roundRect(ctx, 8, G.base, G.W - 16, 4, 2);
    ctx.fill();

    for (p = 0; p < 3; p++) {
      for (i = 0; i < pegs[p].length; i++) {
        drawDisk(ctx, G, pegs[p][i], G.x[p], G.base - i * G.diskH, false);
      }
    }
    if (held) drawDisk(ctx, G, held.disk, G.x[held.peg], G.lift, true);
    if (anim) {
      var q = flyPos(G, anim);
      drawDisk(ctx, G, anim.disk, q.x, q.y, false);
    }

    if (hint) drawHint(ctx, G);
    if (mode === 'watch') drawBits(ctx, G);
    updateReadout();
  }

  function drawHint(ctx, G) {
    var x0 = G.x[hint.from], x1 = G.x[hint.to], y = G.pegTop - 8;
    var mid = (x0 + x1) / 2, rise = Math.min(46, Math.abs(x1 - x0) * 0.3);
    ctx.strokeStyle = '#6ee7ff';
    ctx.fillStyle = '#6ee7ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.quadraticCurveTo(mid, y - rise * 2, x1, y);
    ctx.stroke();
    ctx.setLineDash([]);
    var dir = x1 > x0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x1, y + 2);
    ctx.lineTo(x1 - dir * 11, y - 7);
    ctx.lineTo(x1 - dir * 2, y - 11);
    ctx.closePath();
    ctx.fill();
  }

  // One box per disk, smallest on the right, showing the move count in binary.
  function drawBits(ctx, G) {
    var m = anim ? done + 1 : done;
    var low = m ? Math.round(Math.log(m & -m) / Math.LN2) : -1;
    var box = G.box;
    var total = n * (box + 4) - 4;
    var x0 = (G.W - total) / 2, y = G.bitsY;
    ctx.font = '600 ' + Math.round(box * 0.5) + 'px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var b = 0; b < n; b++) {
      var k = n - b;                     // disk number for this box
      var on = (m >> (k - 1)) & 1;
      var x = x0 + b * (box + 4);
      roundRect(ctx, x, y - box, box, box, 5);
      if (on) {
        ctx.fillStyle = diskColor(k);
        ctx.fill();
      }
      ctx.strokeStyle = k - 1 === low ? '#ffffff' : 'rgba(236,232,223,0.25)';
      ctx.lineWidth = k - 1 === low ? 2 : 1;
      ctx.stroke();
      ctx.fillStyle = on ? 'rgba(10,11,16,0.8)' : '#6f7286';
      ctx.fillText(on ? '1' : '0', x + box / 2, y - box / 2 + 1);
    }
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#9b9daf';
    ctx.textAlign = 'right';
    ctx.fillText(String(m) + ' =', x0 - 10, y - box / 2);
  }

  function sup(k) {
    return String(k).replace(/\d/g, function (d) { return '⁰¹²³⁴⁵⁶⁷⁸⁹'.charAt(+d); });
  }

  function updateReadout() {
    var total = moves.length;
    var line1, line2;
    if (mode === 'watch') {
      var m = anim ? done + 1 : done;
      line1 = 'Move ' + m + ' of ' + total.toLocaleString();
      var mv = anim ? [anim.disk, anim.from, anim.to] : done ? moves[done - 1] : null;
      line2 = mv ? 'Disk ' + mv[0] + ' from ' + NAMES[mv[1]] + ' to ' + NAMES[mv[2]] : 'Fewest possible: 2' + sup(n) + ' − 1';
      if (!anim && done === total) line2 = 'Done in 2' + sup(n) + ' − 1 = ' + total.toLocaleString();
    } else {
      line1 = 'Moves ' + handMoves;
      if (solved) {
        line2 = handMoves === total ? 'Solved in the fewest possible!' : 'Solved. Fewest possible: ' + total;
      } else {
        line2 = 'Fewest left from here: ' + distance(n, 2);
      }
    }
    V.setText(readout, line1 + '\n' + line2);
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Playing by hand ----

  canvas.addEventListener('click', function (e) {
    if (mode !== 'play' || !geo || solved) return;
    var r = canvas.getBoundingClientRect();
    var p = Math.max(0, Math.min(2, Math.floor((e.clientX - r.left) / (geo.W / 3))));
    if (anim) finishAnim();
    if (solved) return;
    hint = null;
    if (!held) {
      if (pegs[p].length) held = { disk: pegs[p].pop(), peg: p };
    } else if (p === held.peg) {
      pegs[p].push(held.disk);
      held = null;
    } else if (top(p) && top(p) < held.disk) {
      flash = { peg: p, t: 0.6 };
    } else {
      anim = { disk: held.disk, from: held.peg, to: p, t: 0.3 };
      held = null;
      handMoves++;
    }
    stage.dirty = true;
  });

  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'mouse') canvas.style.cursor = mode === 'play' && !solved ? 'pointer' : '';
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);

  function setMode(m) {
    mode = m;
    playBtn.hidden = oneBtn.hidden = mode !== 'watch';
    hintBtn.hidden = mode !== 'play';
    V.setText(cap, CAPS[mode]);
    reset();
    setPlaying(mode === 'watch' && !V.reducedMotion);
  }

  playBtn.addEventListener('click', function () {
    if (!playing && done >= moves.length) reset();
    setPlaying(!playing);
  });

  oneBtn.addEventListener('click', function () {
    setPlaying(false);
    if (anim) finishAnim();
    else stepOnce = true;
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    reset();
    if (mode === 'watch') setPlaying(!V.reducedMotion);
  });

  hintBtn.addEventListener('click', function () {
    if (mode !== 'play' || solved) return;
    if (anim) finishAnim();
    if (held) { pegs[held.peg].push(held.disk); held = null; }
    hint = bestMove(n, 2);
    stage.dirty = true;
  });

  V.segmented(V.ctl(section, 'mode'), setMode);

  V.range(V.ctl(section, 'disks'), V.ctl(section, 'disks-out'),
    function (v) { return v + (v === 1 ? ' disk' : ' disks') + ', ' + (Math.pow(2, v) - 1).toLocaleString() + ' moves'; },
    function (v) {
      n = v;
      if (stage) reset();
    });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) {
      var s = Math.pow(2, v);
      return (s < 1 ? s.toFixed(1) : Math.round(s)) + ' moves / s';
    },
    function (v) { speed = Math.pow(2, v); });

  setMode('watch');
})();
