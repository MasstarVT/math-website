// The dihedral groups D₃ and D₄: the turns and flips that put a triangle or a
// square back on its outline. Each move is a 2×2 matrix acting on the plane;
// "a then b" is the product Mb·Ma, and the Cayley table lists every such pair.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('symmetry-group');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var shapeGroup = V.ctl(section, 'shape');
  var movesBox = V.ctl(section, 'moves');
  var fillBtn = V.ctl(section, 'fill');
  var clearBtn = V.ctl(section, 'clear');

  var VCOL = ['#6ee7ff', '#ff5fa2', '#ffb454', '#7ee0a1'];
  var ROT = 'rgba(167,139,250,', FLIP = 'rgba(110,231,255,';
  var TAU = Math.PI * 2;

  var n = 3;
  var els = [];            // { name, label, kind, m, angle, axis }
  var corners = [];        // where the corners start
  var S = [1, 0, 0, 1];    // the shape's current position, as a matrix [a, b, c, d]
  var queue = [];          // moves waiting to be animated
  var cur = null;          // { el, t }
  var since = [];          // moves since the shape was last at the start
  var table = [];
  var fresh = [];          // when each cell was filled, for a pop-in
  var lastCell = null;
  var pending = null;      // a table cell to fill once the moves finish
  var notes = ['', '', ''];
  var filling = null;      // cells still to fill, one by one
  var fillWait = 0;
  var hoverCell = null;
  var clock = 0;
  var stage;

  function mul(A, B) {
    return [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
  }
  function rot(t) { return [Math.cos(t), -Math.sin(t), Math.sin(t), Math.cos(t)]; }
  function refl(phi) { return [Math.cos(2 * phi), Math.sin(2 * phi), Math.sin(2 * phi), -Math.cos(2 * phi)]; }
  function same(A, B) {
    for (var k = 0; k < 4; k++) if (Math.abs(A[k] - B[k]) > 1e-6) return false;
    return true;
  }
  function find(M) {
    for (var k = 0; k < els.length; k++) if (same(els[k].m, M)) return k;
    return -1;
  }
  function apply(M, p) { return [M[0] * p[0] + M[1] * p[1], M[2] * p[0] + M[3] * p[1]]; }

  function build() {
    els = [];
    var k, start = n === 3 ? Math.PI / 2 : 3 * Math.PI / 4;
    corners = [];
    for (k = 0; k < n; k++) corners.push([Math.cos(start + k * TAU / n), Math.sin(start + k * TAU / n)]);
    for (k = 0; k < n; k++) {
      var deg = k * 360 / n;
      els.push({ kind: 'rot', label: deg + '°', name: k ? 'turn ' + deg + '°' : 'do nothing', m: rot(k * TAU / n), angle: k * TAU / n });
    }
    // Mirror lines, counterclockwise from the vertical one.
    var axes = n === 3 ? [90, 150, 30] : [90, 135, 0, 45];
    axes.forEach(function (a, i) {
      var letter = 'ABCD'.charAt(i);
      els.push({ kind: 'flip', label: letter, name: 'flip ' + letter, m: refl(a * Math.PI / 180), axis: a * Math.PI / 180 });
    });
    table = [];
    fresh = [];
    for (k = 0; k < els.length; k++) {
      table.push([]);
      fresh.push([]);
      for (var j = 0; j < els.length; j++) { table[k].push(-1); fresh[k].push(-1); }
    }
    S = [1, 0, 0, 1];
    queue = [];
    cur = null;
    since = [];
    lastCell = null;
    pending = null;
    filling = null;
    notes = ['Pick a move, or tap a square of', 'the table: row first, then column', ''];
    makeButtons();
    if (stage) stage.dirty = true;
  }

  function makeButtons() {
    movesBox.innerHTML = '';
    els.forEach(function (el, i) {
      if (!i) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ghost';
      btn.textContent = el.kind === 'rot' ? 'Turn ' + el.label : 'Flip ' + el.label;
      btn.addEventListener('click', function () { move(i, true); });
      movesBox.appendChild(btn);
    });
  }

  function fillCell(a, b, quiet) {
    var r = find(mul(els[b].m, els[a].m));
    if (table[a][b] < 0) fresh[a][b] = clock;
    table[a][b] = r;
    lastCell = [a, b];
    if (quiet) return;
    notes[0] = cap(els[a].name) + ', then ' + els[b].name;
    notes[1] = '= ' + els[r].name + ', in one move';
    notes[2] = '';
    var back = table[b][a];
    if (back >= 0 && back !== r) {
      notes[2] = 'The other order gives ' + els[back].name;
    } else if (back < 0 && find(mul(els[a].m, els[b].m)) !== r) {
      notes[2] = 'Now try ' + els[b].name + ' first';
    }
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function move(i, fromButton) {
    if (fromButton) {
      filling = null;
      if (!cur && !queue.length && same(S, [1, 0, 0, 1])) since = [];
    }
    queue.push(i);
    since.push(i);
    if (fromButton) {
      if (since.length === 2) {
        pending = [since[0], since[1]];
        notes = [cap(els[since[0]].name) + ', then ' + els[since[1]].name, '= ?', ''];
      } else {
        var after = cur ? mul(els[cur.el].m, S) : S;
        queue.forEach(function (q) { after = mul(els[q].m, after); });
        notes[0] = cap(els[i].name);
        notes[1] = 'Now: same as ' + els[find(after)].name;
        notes[2] = '';
      }
    }
    stage.dirty = true;
  }

  function runCell(a, b) {
    filling = null;
    queue = [];
    cur = null;
    S = [1, 0, 0, 1];
    since = [];
    move(a, false);
    move(b, false);
    pending = [a, b];
    notes = [cap(els[a].name) + ', then ' + els[b].name, '= ?', ''];
  }

  // The moving part of a move at time t: a partial turn, or a squash across the mirror.
  function partial(el, t) {
    if (el.kind === 'rot') return rot(el.angle * t);
    var c = Math.cos(el.axis), s = Math.sin(el.axis), k = Math.cos(Math.PI * t);
    var P = [c * c, c * s, c * s, s * s];
    return [P[0] + k * (1 - P[0]), P[1] - k * P[1], P[2] - k * P[2], P[3] + k * (1 - P[3])];
  }

  // Wide: shape and notes on the left, table on the right. Narrow: shape on
  // top, then the table, then the notes.
  function layout(W, H) {
    if (W / H > 1.15) {
      return { wide: true, sx: W * 0.24, sy: H * 0.4, R: Math.min(W * 0.16, H * 0.24),
        nx: W * 0.24, ny: H * 0.78, tx: W * 0.49, ty: H * 0.08, tw: W * 0.48, th: H * 0.86, title: 18 };
    }
    return { wide: false, sx: W * 0.5, sy: H * 0.2, R: Math.min(W * 0.2, H * 0.115),
      nx: W * 0.5, ny: H * 0.875, tx: W * 0.04, ty: H * 0.36, tw: W * 0.92, th: H * 0.49, title: 0 };
  }

  function tableGeom(L) {
    var m = els.length + 1, cell = Math.floor(Math.min(L.tw, L.th - L.title) / m);
    var x0 = L.tx + (L.tw - cell * m) / 2, y0 = L.ty + L.title + (L.th - L.title - cell * m) / 2;
    return { cell: cell, x0: x0, y0: y0, m: m };
  }

  function frame(dt, st) {
    clock += dt;
    var busy = false;
    if (!cur && queue.length) cur = { el: queue.shift(), t: 0 };
    if (cur) {
      cur.t += dt / (V.reducedMotion ? 0.01 : 0.75);
      if (cur.t >= 1) {
        S = mul(els[cur.el].m, S);
        cur = null;
        if (!queue.length && pending) {
          fillCell(pending[0], pending[1]);
          pending = null;
        }
        if (!queue.length && same(S, [1, 0, 0, 1])) since = [];
      }
      busy = true;
    }
    if (filling) {
      fillWait -= dt;
      while (filling.length && fillWait <= 0) {
        var c = filling.shift();
        fillCell(c[0], c[1], true);
        fillWait += 0.045;
      }
      if (!filling.length) {
        filling = null;
        notes = ['Every row and column holds each', 'move exactly once: a Latin square', ''];
      }
      busy = true;
    }
    var popping = false;
    fresh.forEach(function (row) { row.forEach(function (f) { if (f >= 0 && clock - f < 0.4) popping = true; }); });
    if (!busy && !popping && !st.dirty) return;
    st.dirty = false;

    var W = st.width, H = st.height, ctx = st.ctx, L = layout(W, H);
    ctx.clearRect(0, 0, W, H);

    // ---- The shape ----
    var R = L.R;
    function scr(p) { return [L.sx + p[0] * R, L.sy - p[1] * R]; }
    var D = cur ? mul(partial(els[cur.el], V.easeInOut(Math.min(1, cur.t))), S) : S;

    // Mirror lines.
    els.forEach(function (el) {
      if (el.kind !== 'flip') return;
      var active = cur && cur.el === els.indexOf(el);
      var c = Math.cos(el.axis), s = Math.sin(el.axis), r = 1.34;
      var a0 = scr([-c * r, -s * r]), a1 = scr([c * r, s * r]);
      ctx.strokeStyle = active ? 'rgba(110,231,255,0.9)' : 'rgba(236,232,223,0.16)';
      ctx.lineWidth = active ? 1.5 : 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(a0[0], a0[1]);
      ctx.lineTo(a1[0], a1[1]);
      ctx.stroke();
      ctx.setLineDash([]);
      var lp = scr([c * (r + 0.13), s * (r + 0.13)]);
      ctx.font = '600 12px "IBM Plex Mono", monospace';
      ctx.fillStyle = active ? '#6ee7ff' : '#9b9daf';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.label, lp[0], lp[1]);
    });

    // Where the corners started.
    ctx.strokeStyle = 'rgba(236,232,223,0.25)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    corners.forEach(function (p, k) {
      var q = scr(p);
      if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // A flip shows the back of the shape, so shade it by which side is up.
    var det = D[0] * D[3] - D[1] * D[2];
    ctx.beginPath();
    corners.forEach(function (p, k) {
      var q = scr(apply(D, p));
      if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
    });
    ctx.closePath();
    ctx.fillStyle = det >= 0 ? 'rgba(167,139,250,0.3)' : 'rgba(110,231,255,0.16)';
    ctx.fill();
    ctx.strokeStyle = det >= 0 ? '#a78bfa' : '#6ee7ff';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (Math.abs(det) > 0.25) {
      ctx.font = '500 10px "IBM Plex Mono", monospace';
      ctx.fillStyle = 'rgba(236,232,223,0.45)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(det >= 0 ? 'FRONT' : 'BACK', L.sx, L.sy);
    }

    if (cur && els[cur.el].kind === 'rot') {
      var ang = els[cur.el].angle * V.easeInOut(Math.min(1, cur.t));
      ctx.strokeStyle = 'rgba(167,139,250,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(L.sx, L.sy, R * 0.32, 0, -ang, true);
      ctx.stroke();
    }

    ctx.font = '600 12px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    corners.forEach(function (p, k) {
      var q = scr(apply(D, p));
      ctx.beginPath();
      ctx.arc(q[0], q[1], 10, 0, TAU);
      ctx.fillStyle = VCOL[k];
      ctx.fill();
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#0a0b10';
      ctx.fillText(String(k + 1), q[0], q[1] + 0.5);
    });

    // ---- The Cayley table ----
    var G = tableGeom(L), cell = G.cell;
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#9b9daf';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    if (L.title) ctx.fillText('Row move first, then column move', G.x0, G.y0 - 6);
    var fsz = Math.max(9, Math.min(13, cell * 0.36));
    for (var r = 0; r < G.m; r++) {
      for (var c2 = 0; c2 < G.m; c2++) {
        var x = G.x0 + c2 * cell, y = G.y0 + r * cell;
        if (!r && !c2) continue;
        var idx = !r ? c2 - 1 : !c2 ? r - 1 : table[r - 1][c2 - 1];
        var header = !r || !c2;
        ctx.strokeStyle = 'rgba(236,232,223,0.09)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
        if (idx < 0) {
          if (hoverCell && hoverCell[0] === r - 1 && hoverCell[1] === c2 - 1) {
            ctx.fillStyle = 'rgba(236,232,223,0.06)';
            ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
          }
          continue;
        }
        var el = els[idx];
        var grow = header ? 1 : Math.min(1, (clock - fresh[r - 1][c2 - 1]) / 0.3);
        if (!header && fresh[r - 1][c2 - 1] < 0) grow = 1;
        var inset = (1 - V.easeInOut(grow)) * cell * 0.4 + 2;
        ctx.fillStyle = (el.kind === 'rot' ? ROT : FLIP) + (header ? '0.08)' : '0.24)');
        ctx.fillRect(x + inset, y + inset, cell - inset * 2, cell - inset * 2);
        ctx.font = (header ? '600 ' : '500 ') + fsz + 'px "IBM Plex Mono", monospace';
        ctx.fillStyle = el.kind === 'rot' ? '#c9b8ff' : '#a6f0ff';
        if (header) ctx.fillStyle = el.kind === 'rot' ? '#a78bfa' : '#6ee7ff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = grow;
        ctx.fillText(cell < 28 ? el.label.replace('°', '') : el.label, x + cell / 2, y + cell / 2 + 0.5);
        ctx.globalAlpha = 1;
      }
    }
    if (lastCell) {
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 2;
      ctx.strokeRect(G.x0 + (lastCell[1] + 1) * cell + 1, G.y0 + (lastCell[0] + 1) * cell + 1, cell - 2, cell - 2);
      var back = table[lastCell[1]][lastCell[0]];
      if (back >= 0 && back !== table[lastCell[0]][lastCell[1]]) {
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(G.x0 + (lastCell[0] + 1) * cell + 1, G.y0 + (lastCell[1] + 1) * cell + 1, cell - 2, cell - 2);
        ctx.setLineDash([]);
      }
    }

    var filled = 0;
    table.forEach(function (row) { row.forEach(function (v) { if (v >= 0) filled++; }); });
    // Notes go on the canvas, clear of the shape and the table.
    var note = [notes[0], notes[1], notes[2] || ('Table: ' + filled + ' of ' + els.length * els.length + ' filled')];
    var nf = L.wide ? 12 : 11;
    ctx.font = '500 ' + nf + 'px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    note.forEach(function (t, k) {
      ctx.fillStyle = k === 1 ? '#ece8df' : '#9b9daf';
      ctx.fillText(t, L.nx, L.ny + k * nf * (L.wide ? 1.5 : 1.35));
    });
  }

  stage = V.createStage(canvas, { frame: frame });

  // ---- Tapping the table ----

  function cellAt(e) {
    var r = canvas.getBoundingClientRect(), L = layout(stage.width, stage.height), G = tableGeom(L);
    var c = Math.floor((e.clientX - r.left - G.x0) / G.cell) - 1, w = Math.floor((e.clientY - r.top - G.y0) / G.cell) - 1;
    if (c < 0 || w < 0 || c >= els.length || w >= els.length) return null;
    return [w, c];
  }
  canvas.addEventListener('click', function (e) {
    var c = cellAt(e);
    if (!c) return;
    runCell(c[0], c[1]);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    var c = cellAt(e);
    if (String(c) !== String(hoverCell)) {
      hoverCell = c;
      canvas.style.cursor = c ? 'pointer' : '';
      stage.dirty = true;
    }
  });

  // ---- Controls ----

  V.segmented(shapeGroup, function (v) {
    n = v === 'square' ? 4 : 3;
    build();
  });
  fillBtn.addEventListener('click', function () {
    filling = [];
    for (var a = 0; a < els.length; a++) {
      for (var b = 0; b < els.length; b++) if (table[a][b] < 0) filling.push([a, b]);
    }
    fillWait = 0;
    stage.dirty = true;
  });
  clearBtn.addEventListener('click', build);
  build();
})();
