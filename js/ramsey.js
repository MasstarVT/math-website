// Ramsey's R(3, 3) = 6: color every edge of the complete graph on six points
// red or blue and some triangle is all one color. On five points the pentagon
// and the pentagram avoid it. The game (Sim) makes the triangle the losing move.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('ramsey');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var modeGroup = V.ctl(section, 'mode');
  var guestGroup = V.ctl(section, 'guests');
  var dangerBtn = V.ctl(section, 'danger');

  var TAU = Math.PI * 2;
  var INK = ['', '#ff5a6e', '#5aa9ff'];
  var NAME = ['', 'Red', 'Blue'];
  var n = 6;
  var edges = [];        // [a, b]
  var col = [];          // 0 uncolored, 1 red, 2 blue
  var grow = [];         // 0..1 while a new color sweeps along an edge
  var order = [];        // which end each edge grows from
  var turn = 1;
  var mode = 'cpu';
  var demo = !V.reducedMotion;
  var showDanger = true;
  var over = null;       // { loser, tris } or { draw } or { random, tris } or { perfect }
  var cpuWait = 0;
  var queue = null;      // edges still to fill for a random coloring
  var queueWait = 0;
  var hover = -1, picked = -1, rubber = null;
  var pts = [];
  var W = 0, H = 0;

  function setup(count) {
    n = count;
    edges = [];
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) edges.push([i, j]);
    reset();
  }

  function reset() {
    col = edges.map(function () { return 0; });
    grow = edges.map(function () { return 1; });
    order = edges.map(function () { return 0; });
    turn = 1;
    over = null;
    queue = null;
    picked = -1;
    rubber = null;
    cpuWait = demo ? 0.9 : 0;
    stage.dirty = true;
  }

  function edgeIndex(a, b) {
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i];
      if ((e[0] === a && e[1] === b) || (e[0] === b && e[1] === a)) return i;
    }
    return -1;
  }

  // Triangles of one color c that use edge i.
  function trianglesThrough(i, c, colors) {
    var a = edges[i][0], b = edges[i][1], out = [];
    for (var w = 0; w < n; w++) {
      if (w === a || w === b) continue;
      if (colors[edgeIndex(a, w)] === c && colors[edgeIndex(b, w)] === c) out.push([a, b, w]);
    }
    return out;
  }

  function allTriangles(colors) {
    var out = [];
    for (var a = 0; a < n; a++) {
      for (var b = a + 1; b < n; b++) {
        for (var c = b + 1; c < n; c++) {
          var x = colors[edgeIndex(a, b)];
          if (x && x === colors[edgeIndex(a, c)] && x === colors[edgeIndex(b, c)]) out.push([a, b, c]);
        }
      }
    }
    return out;
  }

  function losing(i, c) { return !col[i] && trianglesThrough(i, c, col).length > 0; }

  function play(i, from) {
    if (over || col[i]) return;
    col[i] = turn;
    grow[i] = V.reducedMotion ? 1 : 0;
    order[i] = from === edges[i][1] ? 1 : 0;
    var tris = trianglesThrough(i, turn, col);
    if (tris.length) {
      over = { loser: turn, tris: tris };
    } else if (col.indexOf(0) < 0) {
      over = { draw: true };
    } else {
      turn = 3 - turn;
      if (demo || (mode === 'cpu' && turn === 2)) cpuWait = demo ? 0.8 : 0.65;
    }
    stage.dirty = true;
  }

  // Greedy: keep as many safe moves for yourself and as few for the other
  // player as possible.
  function choose(me) {
    var best = -1, bestScore = -Infinity;
    for (var i = 0; i < edges.length; i++) {
      if (col[i]) continue;
      var score;
      if (losing(i, me)) {
        score = -1000 + Math.random();
      } else {
        col[i] = me;
        var mine = 0, theirs = 0;
        for (var j = 0; j < edges.length; j++) {
          if (col[j]) continue;
          if (!losing(j, me)) mine++;
          if (!losing(j, 3 - me)) theirs++;
        }
        col[i] = 0;
        score = mine - theirs + Math.random() * 0.5;
      }
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  function randomColoring() {
    demo = false;
    reset();
    queue = [];
    edges.forEach(function (e, i) { queue.push(i); });
    queue.sort(function () { return Math.random() - 0.5; });
    queueWait = 0;
  }

  function perfect() {
    demo = false;
    V.setSegmented(guestGroup, '5');
    setup(5);
    edges.forEach(function (e, i) {
      var d = Math.min(e[1] - e[0], 5 - (e[1] - e[0]));
      col[i] = d === 1 ? 1 : 2;
      grow[i] = V.reducedMotion ? 1 : 0;
    });
    over = { perfect: true, tris: [] };
  }

  // ---- Drawing ----

  function layout() {
    var cx = W / 2, cy = H / 2 + Math.min(W, H) * 0.035, R = Math.min(W, H) * 0.36;
    // Six guests sit with an edge on top, five with a point at the bottom,
    // so nobody sits under the readout.
    var off = n === 6 ? 0 : Math.PI / 2;
    pts = [];
    for (var i = 0; i < n; i++) {
      var a = off + i * TAU / n;
      pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
    }
  }

  function line(ctx, i, t) {
    var e = edges[i], A = pts[e[order[i]]], B = pts[e[1 - order[i]]];
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t);
  }

  function draw(st) {
    var ctx = st.ctx, i;
    ctx.clearRect(0, 0, W, H);
    layout();
    ctx.lineCap = 'round';
    var tris = over && over.tris ? over.tris : [];

    // Shade the one-color triangles.
    tris.forEach(function (t) {
      var c = col[edgeIndex(t[0], t[1])];
      ctx.beginPath();
      ctx.moveTo(pts[t[0]].x, pts[t[0]].y);
      ctx.lineTo(pts[t[1]].x, pts[t[1]].y);
      ctx.lineTo(pts[t[2]].x, pts[t[2]].y);
      ctx.closePath();
      ctx.fillStyle = c === 1 ? 'rgba(255,90,110,0.16)' : 'rgba(90,169,255,0.16)';
      ctx.fill();
    });

    var mover = over ? 0 : turn;
    var human = !demo && !over && !queue && (mode === 'two' || turn === 1);
    for (i = 0; i < edges.length; i++) {
      if (col[i]) continue;
      var danger = human && showDanger && losing(i, mover);
      ctx.beginPath();
      line(ctx, i, 1);
      if (i === hover && human) {
        ctx.strokeStyle = INK[mover];
        ctx.globalAlpha = danger ? 0.35 : 0.6;
        ctx.lineWidth = 4;
        ctx.setLineDash(danger ? [2, 7] : []);
      } else if (danger) {
        ctx.strokeStyle = INK[mover];
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2;
        ctx.setLineDash([2, 7]);
      } else {
        ctx.strokeStyle = '#ece8df';
        ctx.globalAlpha = 0.2;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }

    var inTri = {};
    tris.forEach(function (t) {
      inTri[edgeIndex(t[0], t[1])] = inTri[edgeIndex(t[1], t[2])] = inTri[edgeIndex(t[0], t[2])] = 1;
    });
    for (i = 0; i < edges.length; i++) {
      if (!col[i]) continue;
      ctx.beginPath();
      line(ctx, i, V.easeInOut(grow[i]));
      ctx.strokeStyle = INK[col[i]];
      ctx.lineWidth = inTri[i] ? 6 : 3.5;
      ctx.globalAlpha = tris.length && !inTri[i] ? 0.55 : 1;
      if (inTri[i]) { ctx.shadowColor = INK[col[i]]; ctx.shadowBlur = 16; }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    if (rubber && picked >= 0) {
      ctx.beginPath();
      ctx.moveTo(pts[picked].x, pts[picked].y);
      ctx.lineTo(rubber.x, rubber.y);
      ctx.strokeStyle = INK[turn];
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // The guests.
    var r = Math.max(15, Math.min(W, H) * 0.04);
    ctx.font = '600 ' + Math.round(r * 0.9) + 'px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (i = 0; i < n; i++) {
      var p = pts[i], lit = tris.some(function (t) { return t.indexOf(i) >= 0; });
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fillStyle = '#1a1d29';
      ctx.fill();
      ctx.lineWidth = i === picked ? 3 : 2;
      ctx.strokeStyle = i === picked ? INK[turn] : lit ? '#ffffff' : '#ffb454';
      ctx.stroke();
      ctx.fillStyle = '#ece8df';
      ctx.fillText('ABCDEF'[i], p.x, p.y + 1);
    }

    var colored = 0;
    col.forEach(function (c) { if (c) colored++; });
    var top, sub = colored + ' of ' + edges.length + ' lines colored';
    if (queue) {
      top = 'Coloring at random';
    } else if (over && over.perfect) {
      top = 'No one-color triangle';
      sub = 'Pentagon red, star blue';
    } else if (over && over.random) {
      top = tris.length + ' one-color triangle' + (tris.length === 1 ? '' : 's');
      sub = n === 6 ? 'Six guests: always 2 or more' : 'Five guests can dodge them';
    } else if (over && over.draw) {
      top = 'A draw: no triangle';
    } else if (over) {
      if (demo) top = NAME[over.loser] + ' made a triangle';
      else if (mode === 'cpu') top = over.loser === 1 ? 'Red triangle: you lose' : 'Blue triangle: you win!';
      else top = NAME[over.loser] + ' made a triangle and loses';
    } else if (demo) {
      top = 'Demo game';
      sub = 'Tap a line to play';
    } else if (mode === 'cpu') {
      top = turn === 1 ? 'Your move: you are red' : 'Computer is thinking';
    } else {
      top = NAME[turn] + "'s move";
    }
    V.setText(readout, top + '\n' + sub);
  }

  function frame(dt, st) {
    W = st.width;
    H = st.height;
    var busy = false;
    for (var i = 0; i < grow.length; i++) {
      if (grow[i] < 1) { grow[i] = Math.min(1, grow[i] + dt / 0.3); busy = true; }
    }
    if (queue) {
      busy = true;
      queueWait -= dt;
      if (queueWait <= 0) {
        var q = queue.shift();
        col[q] = Math.random() < 0.5 ? 1 : 2;
        grow[q] = V.reducedMotion ? 1 : 0;
        queueWait = 0.06;
        if (!queue.length) {
          queue = null;
          over = { random: true, tris: allTriangles(col) };
        }
      }
    }
    if (!over && !queue && (demo || (mode === 'cpu' && turn === 2))) {
      busy = true;
      cpuWait -= dt;
      if (cpuWait <= 0) play(choose(turn), -1);
    } else if (over && demo) {
      // Let the finished demo sit for a moment, then play another.
      busy = true;
      cpuWait -= dt;
      if (cpuWait < -3.2) reset();
    }
    if (!busy && !st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Pointer ----

  function guestAt(x, y) {
    var r = Math.max(22, Math.min(W, H) * 0.05);
    for (var i = 0; i < pts.length; i++) if (Math.hypot(pts[i].x - x, pts[i].y - y) < r) return i;
    return -1;
  }

  function edgeAt(x, y) {
    var best = -1, bd = 11;
    edges.forEach(function (e, i) {
      if (col[i]) return;
      var A = pts[e[0]], B = pts[e[1]], dx = B.x - A.x, dy = B.y - A.y;
      var t = Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / (dx * dx + dy * dy)));
      var d = Math.hypot(A.x + dx * t - x, A.y + dy * t - y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  function canMove() { return !over && !queue && (mode === 'two' || turn === 1); }

  // Any touch during the demo or after a finished game starts a fresh one.
  function wake() {
    if (demo || over) {
      demo = false;
      reset();
    }
  }

  V.drag(canvas, {
    hit: function (x, y) {
      if (!pts.length) return null;
      var g = guestAt(x, y);
      if (g >= 0) return { g: g };
      var e = edgeAt(x, y);
      if (e >= 0) return { e: e };
      return null;
    },
    move: function (h, x, y, first) {
      if (first) {
        wake();
        if (!canMove()) return;
        if (h.e != null) {
          play(h.e, -1);
          h.done = true;
        } else if (picked >= 0 && picked !== h.g) {
          var i = edgeIndex(picked, h.g);
          var from = picked;
          picked = -1;
          if (!col[i]) play(i, from);
          h.done = true;
        } else {
          picked = h.g;
        }
        stage.dirty = true;
        return;
      }
      if (h.done || picked < 0) return;
      rubber = { x: x, y: y };
      stage.dirty = true;
    },
    end: function (h) {
      if (h.done || picked < 0 || !rubber) { rubber = null; return; }
      var g = guestAt(rubber.x, rubber.y);
      rubber = null;
      if (g >= 0 && g !== picked) {
        var i = edgeIndex(picked, g), from = picked;
        picked = -1;
        if (!col[i] && canMove()) play(i, from);
      }
      stage.dirty = true;
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || rubber) return;
    var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    var h = guestAt(x, y) >= 0 ? -1 : edgeAt(x, y);
    if (h !== hover) { hover = h; stage.dirty = true; }
  });
  canvas.addEventListener('pointerleave', function () { hover = -1; stage.dirty = true; });

  // ---- Controls ----

  V.segmented(modeGroup, function (v) { mode = v; demo = false; reset(); });
  V.segmented(guestGroup, function (v) { demo = false; setup(+v); });
  V.toggle(dangerBtn, function (on) { showDanger = on; stage.dirty = true; });
  V.ctl(section, 'new').addEventListener('click', function () { demo = false; reset(); });
  V.ctl(section, 'random').addEventListener('click', randomColoring);
  V.ctl(section, 'perfect').addEventListener('click', perfect);

  setup(6);
})();
