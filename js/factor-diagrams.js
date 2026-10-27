// Factorization diagrams (after Brent Yorgey): n dots arranged by n's prime
// factors. A factor p puts p copies of the rest on the corners of a p-sided
// polygon, so a prime is a single ring and 2 × 2 makes a square.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('factor-diagrams');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var nInput = V.ctl(section, 'n');
  var nOut = V.ctl(section, 'n-out');
  var viewGroup = V.ctl(section, 'view');

  var MAX = 1000;
  var HOLD = 1.15;         // seconds per number while counting
  var MORPH = 0.6;
  var SUP = { 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  var NAMES = { 2: 'pair', 3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon' };

  var n = 1;
  var playing = !V.reducedMotion;
  var view = 'one';
  var clock = 0;
  var morph = 1;           // 0 → 1 while dots fly to their new places
  var from = null;         // { pts, rad } before the morph
  var fromN = 1;
  var to = null;
  var cache = {};
  var hoverCell = 0;
  var T = null;            // table layout, for hit testing

  function primeFactors(m) {
    var out = [];
    for (var p = 2; p * p <= m; p++) while (m % p === 0) { out.push(p); m /= p; }
    if (m > 1) out.push(m);
    return out;
  }

  // Layers from the outside in: biggest primes outermost, pairs of 2s as squares.
  function layers(m) {
    var f = primeFactors(m), twos = 0, out = [];
    f.forEach(function (p) { if (p === 2) twos++; else out.push(p); });
    for (var i = 0; i < Math.floor(twos / 2); i++) out.push(4);
    out.sort(function (a, b) { return b - a; });
    if (twos % 2) out.push(2);
    return out;
  }

  // Dot centers for n, each dot of radius 1, built from the innermost layer out.
  function diagram(m) {
    if (cache[m]) return cache[m];
    var L = layers(m), pts = [[0, 0]], rad = 1;
    for (var i = L.length - 1; i >= 0; i--) {
      var p = L[i];
      var gap = i === L.length - 1 ? 1.3 : 1.15;
      var R = rad * gap / Math.sin(Math.PI / p);
      var base = p === 4 ? Math.PI / 4 : p === 2 ? (i % 2 ? Math.PI / 2 : 0) : -Math.PI / 2;
      var next = [];
      for (var j = 0; j < p; j++) {
        var a = base + 2 * Math.PI * j / p;
        // Each copy turns with its corner, so the layer has p-fold symmetry.
        var rot = a - base, cr = Math.cos(rot), sr = Math.sin(rot);
        var ox = R * Math.cos(a), oy = R * Math.sin(a);
        for (var k = 0; k < pts.length; k++) {
          var x = pts[k][0], y = pts[k][1];
          next.push([x * cr - y * sr + ox, x * sr + y * cr + oy]);
        }
      }
      pts = next;
      rad += R;
    }
    var d = { pts: pts, rad: rad, layers: L };
    cache[m] = d;
    return d;
  }

  function setN(m, animate) {
    m = Math.max(1, Math.min(MAX, Math.round(m)));
    if (m === n && to) return;
    from = to || diagram(n);
    fromN = n;
    n = m;
    to = diagram(n);
    morph = animate && !V.reducedMotion ? 0 : 1;
    nInput.value = n;
    nOut.textContent = String(n);
    stage.dirty = true;
  }

  function frame(dt, st) {
    if (!to) to = diagram(n);
    var animating = false;
    if (view === 'one' && playing) {
      clock += dt;
      if (clock >= HOLD) {
        clock = 0;
        if (n >= MAX) setPlaying(false); else setN(n + 1, true);
      }
    }
    if (morph < 1) {
      morph = Math.min(1, morph + dt / MORPH);
      animating = true;
    }
    if (!animating && !st.dirty) return;
    st.dirty = false;
    if (view === 'one') drawOne(st); else drawTable(st);
  }

  function dotColor(i, count) {
    return V.gradient(V.SPECTRUM, count > 1 ? i / (count - 1) : 0.5);
  }

  function drawOne(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    ctx.clearRect(0, 0, W, H);
    // The number itself up top, its neighbors along a strip below.
    var cellW = Math.min(70, (W - 16) / 7), stripH = cellW + 14;
    var top = 56, bottom = H - stripH - 10;
    var cx = W / 2, cy = (top + bottom) / 2;
    var fit = Math.min(W - 24, bottom - top) / 2 - 6;
    var t = V.easeInOut(morph);
    var a = from || to, b = to;
    // Small numbers get modest dots rather than filling the screen.
    var sa = Math.min(fit / a.rad, 22), sb = Math.min(fit / b.rad, 22);
    var count = b.pts.length;
    for (var i = 0; i < count; i++) {
      var pb = b.pts[i], x, y, r;
      if (i < a.pts.length) {
        var pa = a.pts[i];
        x = pa[0] * sa + (pb[0] * sb - pa[0] * sa) * t;
        y = pa[1] * sa + (pb[1] * sb - pa[1] * sa) * t;
        r = sa + (sb - sa) * t;
      } else {
        x = pb[0] * sb * t;
        y = pb[1] * sb * t;
        r = sb * t;
      }
      ctx.fillStyle = dotColor(i, count);
      ctx.beginPath();
      ctx.arc(cx + x, cy + y, Math.max(0.6, r * 0.86), 0, Math.PI * 2);
      ctx.fill();
    }
    // Dots left over when counting down.
    for (i = count; i < a.pts.length; i++) {
      var q = a.pts[i];
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = dotColor(i, a.pts.length);
      ctx.beginPath();
      ctx.arc(cx + q[0] * sa, cy + q[1] * sa, Math.max(0.6, sa * 0.86), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawStrip(ctx, W, H, cellW, t);
    updateReadout(n);
  }

  function drawStrip(ctx, W, H, cellW, t) {
    // Slide along by one cell when stepping to the next number.
    var step = Math.max(-1, Math.min(1, n - fromN));
    var shift = step * (1 - t) * cellW;
    var y = H - cellW / 2 - 18;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y - cellW / 2 - 4, W, cellW + 28);
    ctx.clip();
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (var k = -4; k <= 4; k++) {
      var m = n + k;
      if (m < 1 || m > MAX) continue;
      var x = W / 2 + k * cellW + shift;
      var d = diagram(m);
      var fit = cellW * 0.36, s = Math.min(fit / d.rad, 5);
      var prime = d.layers.length === 1 && d.layers[0] !== 4 && m > 1;
      ctx.globalAlpha = Math.max(0, 1 - Math.abs(x - W / 2) / (cellW * 4));
      if (!k) {
        ctx.strokeStyle = 'rgba(255,95,162,0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(x - cellW / 2 + 3, y - cellW / 2 + 2, cellW - 6, cellW + 14, 8);
        ctx.stroke();
      }
      for (var i = 0; i < d.pts.length; i++) {
        ctx.fillStyle = dotColor(i, d.pts.length);
        var r = Math.max(0.5, s * 0.86), px = x + d.pts[i][0] * s, py = y + d.pts[i][1] * s;
        if (r < 1.4) {
          ctx.fillRect(px - r, py - r, r * 2, r * 2);
        } else {
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = prime ? '#ff5fa2' : '#6f7286';
      ctx.fillText(String(m), x, y + cellW / 2 - 2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function tableLayout(st) {
    var W = st.width, H = st.height;
    var cols = W >= 560 ? 8 : 6, rows = W >= 560 ? 6 : 6;
    var top = 62, pad = 8;
    var cw = (W - 2 * pad) / cols, ch = (H - top - pad) / rows;
    var per = cols * rows;
    var start = Math.floor((n - 1) / per) * per + 1;
    return { cols: cols, rows: rows, cw: cw, ch: ch, x0: pad, y0: top, start: start, per: per };
  }

  function drawTable(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    ctx.clearRect(0, 0, W, H);
    T = tableLayout(st);
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (var c = 0; c < T.per; c++) {
      var m = T.start + c;
      if (m > MAX) break;
      var x0 = T.x0 + (c % T.cols) * T.cw, y0 = T.y0 + Math.floor(c / T.cols) * T.ch;
      var d = diagram(m);
      var prime = d.layers.length === 1 && d.layers[0] !== 4 && m > 1;
      if (m === n || m === hoverCell) {
        ctx.fillStyle = m === n ? 'rgba(255,95,162,0.12)' : 'rgba(236,232,223,0.06)';
        ctx.beginPath();
        ctx.roundRect(x0 + 2, y0 + 2, T.cw - 4, T.ch - 4, 8);
        ctx.fill();
      }
      var fit = Math.min(T.cw, T.ch) / 2 - 9;
      var s = fit / Math.max(d.rad, 2.5);
      var cx = x0 + T.cw / 2, cy = y0 + T.ch / 2 + 3;
      var dr = Math.max(0.5, s * 0.86);
      for (var i = 0; i < d.pts.length; i++) {
        ctx.fillStyle = dotColor(i, d.pts.length);
        var px = cx + d.pts[i][0] * s, py = cy + d.pts[i][1] * s;
        if (dr < 1.2) {
          ctx.fillRect(px - dr, py - dr, dr * 2, dr * 2);
        } else {
          ctx.beginPath();
          ctx.arc(px, py, dr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = prime ? '#ff5fa2' : '#6f7286';
      ctx.fillText(String(m), x0 + 6, y0 + 5);
    }
    updateReadout(hoverCell || n);
  }

  function factorText(m) {
    var f = primeFactors(m), parts = [], i = 0;
    while (i < f.length) {
      var j = i;
      while (j < f.length && f[j] === f[i]) j++;
      parts.push(f[i] + (j - i > 1 ? SUP[j - i] || '^' + (j - i) : ''));
      i = j;
    }
    return parts.join(' × ');
  }

  function updateReadout(m) {
    var line1, line2;
    var L = diagram(m).layers;
    if (m === 1) {
      line1 = '1';
      line2 = 'A single dot';
    } else if (L.length === 1 && L[0] !== 4) {
      line1 = m + ' is prime';
      line2 = m === 2 ? 'Just a pair of dots' : 'Just one ring of ' + m + ' dots';
    } else {
      line1 = m + ' = ' + factorText(m);
      line2 = L.length > 1 ? L.slice(0, -1).map(function (p) { return p + ' groups of '; }).join('') + L[L.length - 1]
        : 'A ' + NAMES[4];
      if (line2.length > 38) line2 = L.join(' × ') + ' dots, nested';
    }
    V.setText(readout, line1 + '\n' + line2);
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Table hover and click ----

  function cellAt(e) {
    if (!T) return 0;
    var b = canvas.getBoundingClientRect();
    var c = Math.floor((e.clientX - b.left - T.x0) / T.cw);
    var r = Math.floor((e.clientY - b.top - T.y0) / T.ch);
    if (c < 0 || c >= T.cols || r < 0 || r >= T.rows) return 0;
    var m = T.start + r * T.cols + c;
    return m <= MAX ? m : 0;
  }
  canvas.addEventListener('pointermove', function (e) {
    if (view !== 'table' || e.pointerType !== 'mouse') return;
    var m = cellAt(e);
    if (m !== hoverCell) { hoverCell = m; stage.dirty = true; }
  });
  canvas.addEventListener('pointerleave', function () {
    if (hoverCell) { hoverCell = 0; stage.dirty = true; }
  });
  canvas.addEventListener('click', function (e) {
    if (view !== 'table') return;
    var m = cellAt(e);
    if (!m) return;
    // Open the number you clicked.
    hoverCell = 0;
    setView('one');
    setPlaying(false);
    setN(m, true);
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    if (view !== 'one') setView('one');
    if (!playing && n >= MAX) setN(1, false);
    clock = HOLD * 0.7;
    setPlaying(!playing);
  });

  function setView(v) {
    view = v;
    V.setSegmented(viewGroup, v);
    stage.dirty = true;
  }
  V.segmented(viewGroup, function (v) {
    if (v === 'table') setPlaying(false);
    setView(v);
  });

  V.ctl(section, 'prev').addEventListener('click', function () {
    setPlaying(false);
    setN(n - (view === 'table' ? T ? T.per : 48 : 1), true);
  });
  V.ctl(section, 'next').addEventListener('click', function () {
    setPlaying(false);
    setN(n + (view === 'table' ? T ? T.per : 48 : 1), true);
  });

  nInput.addEventListener('input', function () {
    setPlaying(false);
    setN(parseInt(nInput.value, 10), true);
  });
  nOut.textContent = String(n);
})();
