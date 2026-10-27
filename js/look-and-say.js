// Look and say: read a number aloud and write down what you said. 1 is
// "one 1", so 11, then "two 1s", 21, … Lengths grow by Conway's constant
// 1.3036… per step, and every term splits into pieces that never touch again.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('look-and-say');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var viewGroup = V.ctl(section, 'view');

  var LAST = 50;            // terms worked out for the charts
  var KEEP = 16;            // terms kept whole for reading aloud
  var FIRST_SPLIT = 8;      // from here on, terms are built from pieces
  var LAMBDA = 1.303577269;
  var DIGIT = { 1: '#6ee7ff', 2: '#ff5fa2', 3: '#ffb454' };
  var WORD = { 1: 'one', 2: 'two', 3: 'three' };
  var RUN = 0.5, PAUSE = 0.8;

  var view = 'read';
  var playing = !V.reducedMotion;
  var terms = [];           // terms[n] as a Uint8Array of digits, for n ≤ KEEP
  var lengths = [];
  var tail = null;          // the latest term while generating
  var pieces = [];          // pieces[n]: atom ids of term n
  var atoms = [];           // { s, decay }
  var atomId = {};
  var kinds = [];           // distinct atoms seen in term n
  var reading = 1;          // term being read aloud
  var runT = 0;             // runs read so far in it, fractional
  var hold = 0;
  var hover = null;
  var cell = 0;
  var bars = null;          // painted rows for the pieces view
  var barsKey = '';
  var G = null;

  // ---- The sequence ----

  function say(src) {
    var out = new Uint8Array(src.length * 2), j = 0, i = 0, n = src.length;
    while (i < n) {
      var d = src[i], k = i + 1;
      while (k < n && src[k] === d) k++;
      out[j++] = k - i;
      out[j++] = d;
      i = k;
    }
    return out.slice(0, j);
  }

  function sayText(s) {
    var out = '', i = 0;
    while (i < s.length) {
      var k = i + 1;
      while (k < s.length && s[k] === s[i]) k++;
      out += (k - i) + s[i];
      i = k;
    }
    return out;
  }

  function runs(arr) {
    var out = [], i = 0;
    while (i < arr.length) {
      var k = i + 1;
      while (k < arr.length && arr[k] === arr[i]) k++;
      out.push({ start: i, len: k - i, d: arr[i] });
      i = k;
    }
    return out;
  }

  // Can a term split between L and R? Only if R's descendants never start
  // with L's last digit, which is also the last digit of all of L's
  // descendants. A short prefix of R decides that; the last pair of each
  // description of a prefix is dropped, since its run may continue.
  var splitMemo = {};
  function canSplit(last, rest, whole) {
    var key = last + rest + (whole ? '$' : '');
    if (key in splitMemo) return splitMemo[key];
    var p = rest, ok = true;
    for (var g = 0; g <= 25 && p.length; g++) {
      if (p[0] === last) { ok = false; break; }
      p = sayText(p);
      if (!whole) p = p.slice(0, -2);
    }
    splitMemo[key] = ok;
    return ok;
  }

  function split(s) {
    var parts = [], start = 0;
    for (var i = 1; i < s.length; i++) {
      if (s[i] === s[i - 1]) continue;
      if (canSplit(s[i - 1], s.slice(i, i + 20), i + 20 >= s.length)) {
        parts.push(s.slice(start, i));
        start = i;
      }
    }
    parts.push(s.slice(start));
    return parts;
  }

  function idOf(s) {
    if (!(s in atomId)) {
      atomId[s] = atoms.length;
      atoms.push({ s: s, decay: null });
    }
    return atomId[s];
  }

  // A piece always turns into the same pieces, whatever is next to it.
  function decay(id) {
    var a = atoms[id];
    if (!a.decay) a.decay = split(sayText(a.s)).map(idOf);
    return a.decay;
  }

  // One more term per frame until all are known.
  function generate() {
    var n = lengths.length;
    if (n > LAST) return false;
    if (n === 0) { lengths.push(0); tail = new Uint8Array([1]); }
    else tail = say(tail);
    n = lengths.length;
    lengths.push(tail.length);
    if (n <= KEEP) terms[n] = tail;
    if (n === FIRST_SPLIT) {
      var text = '';
      for (var i = 0; i < tail.length; i++) text += tail[i];
      pieces[n] = split(text).map(idOf);
    } else if (n > FIRST_SPLIT) {
      var prev = pieces[n - 1], next = [];
      for (i = 0; i < prev.length; i++) {
        var d = decay(prev[i]);
        for (var j = 0; j < d.length; j++) next.push(d[j]);
      }
      pieces[n] = next;
    }
    if (n >= FIRST_SPLIT) {
      var seen = new Uint8Array(256), count = 0, list = pieces[n];
      for (i = 0; i < list.length; i++) if (!seen[list[i]]) { seen[list[i]] = 1; count++; }
      kinds[n] = count;
    }
    return true;
  }

  function ready() { return lengths.length > LAST; }

  // ---- Frame ----

  function frame(dt, st) {
    var changed = false;
    if (!ready()) {
      var t0 = performance.now();
      while (!ready() && performance.now() - t0 < 4) generate();
      changed = true;
    }
    if (view === 'read' && playing && terms[reading + 1]) {
      var r = runs(terms[reading]).length;
      if (runT < r) runT = Math.min(r, runT + dt / RUN);
      else if ((hold += dt) > PAUSE) {
        hold = 0;
        runT = 0;
        reading = fits(st, reading + 1) ? reading + 1 : 1;
      }
      changed = true;
    }
    if (view === 'read' && cell && Math.abs(cell - readCell(st)) > 0.05) changed = true;
    if (!changed && !st.dirty) return;
    st.dirty = false;
    if (view === 'read') drawRead(st, dt);
    else if (view === 'growth') drawGrowth(st);
    else drawPieces(st);
  }

  function readCell(st) {
    return terms[reading + 1] ? Math.min(40, (st.width - 28) / Math.max(terms[reading + 1].length, 6)) : cell;
  }

  // Read aloud until the next term would be too long for the screen.
  function fits(st, n) {
    return terms[n + 1] && terms[n + 1].length * 11 <= st.width - 28;
  }

  function drawRead(st, dt) {
    var ctx = st.ctx, W = st.width, H = st.height;
    ctx.clearRect(0, 0, W, H);
    if (!terms[reading + 1]) return;
    var top = 66, pad = 14;
    // Boxes shrink smoothly as the terms get longer.
    var want = Math.min(40, (W - 2 * pad) / Math.max(terms[reading + 1].length, 6));
    cell = cell && dt ? cell + (want - cell) * Math.min(1, dt * 4) : want;
    var c = cell;
    var rowH = c * 1.5;
    var maxRows = Math.floor((H - top - pad) / rowH);
    var first = Math.max(1, reading + 1 - maxRows + 1);
    var rs = runs(terms[reading]);
    var done = Math.floor(runT), part = runT - done;
    ctx.font = '500 ' + Math.min(15, c * 0.62).toFixed(1) + 'px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (var n = first; n <= reading + 1; n++) {
      var y = top + (n - first) * rowH;
      var arr = terms[n];
      var count = arr.length;
      if (n === reading + 1) count = Math.min(arr.length, 2 * done + (part > 0.35 ? 2 : 0));
      var x0 = (W - arr.length * c) / 2;
      var dim = n < reading;
      for (var i = 0; i < count; i++) {
        var x = x0 + i * c;
        var col = DIGIT[arr[i]] || '#ece8df';
        var fresh = n === reading + 1 && i >= 2 * done && i < 2 * done + 2;
        ctx.globalAlpha = dim ? 0.45 : 1;
        ctx.fillStyle = col;
        ctx.globalAlpha *= fresh ? 0.42 : 0.14;
        ctx.beginPath();
        ctx.roundRect(x + 1, y + 1, c - 2, c - 2, Math.min(5, c * 0.22));
        ctx.fill();
        ctx.globalAlpha = dim ? 0.45 : 1;
        ctx.fillStyle = col;
        ctx.fillText(String(arr[i]), x + c / 2, y + c / 2 + 0.5);
      }
      ctx.globalAlpha = 1;
      // The term being read: a bracket under each run, lit while it's read.
      if (n === reading) {
        rs.forEach(function (run, k) {
          var on = k === done && runT < rs.length;
          var past = k < done;
          ctx.strokeStyle = on ? '#ffffff' : past ? 'rgba(236,232,223,0.5)' : 'rgba(236,232,223,0.18)';
          ctx.lineWidth = on ? 2 : 1;
          var bx = x0 + run.start * c + 2, bw = run.len * c - 4, by = y + c + 2;
          ctx.beginPath();
          ctx.moveTo(bx, by - 3);
          ctx.lineTo(bx, by);
          ctx.lineTo(bx + bw, by);
          ctx.lineTo(bx + bw, by - 3);
          ctx.stroke();
        });
      }
    }

    var said = rs.slice(0, Math.min(rs.length, done + (part > 0.35 ? 1 : 0))).map(function (run) {
      return WORD[run.len] + ' ' + run.d + (run.len > 1 ? 's' : '');
    }).join(', ');
    if (said.length > 38) said = '…' + said.slice(said.length - 37);
    V.setText(readout, 'Reading term ' + reading + ' aloud:\n' + (said || ' '));
  }

  function drawGrowth(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    ctx.clearRect(0, 0, W, H);
    var n = lengths.length - 1;
    var left = 14, right = W - 44, top = 70, bottom = H - 30;
    var maxLog = 6.2;
    G = { left: left, right: right, top: top, bottom: bottom, bw: (right - left) / LAST };
    function yOf(L) { return bottom - Math.log(L) / Math.LN10 / maxLog * (bottom - top); }

    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.lineWidth = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ['1', '10', '100', '1k', '10k', '100k', '1M'].forEach(function (label, e) {
      var y = Math.round(yOf(Math.pow(10, e))) + 0.5;
      ctx.strokeStyle = 'rgba(236,232,223,0.07)';
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.fillStyle = '#6f7286';
      ctx.fillText(label, right + 8, y);
    });

    for (var k = 1; k <= n; k++) {
      var x = left + (k - 1) * G.bw;
      ctx.fillStyle = hover && hover.n === k ? '#ffffff' : V.gradient([[110, 231, 255], [126, 224, 161]], k / LAST);
      ctx.globalAlpha = hover && hover.n !== k ? 0.6 : 0.9;
      var y = yOf(lengths[k]);
      ctx.fillRect(x + 1, y, Math.max(1, G.bw - 2), bottom - y);
    }
    ctx.globalAlpha = 1;

    // Steady growth by λ each step is a straight line on this scale.
    if (n >= LAST) {
      var C = lengths[LAST] / Math.pow(LAMBDA, LAST);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(left, yOf(C * Math.pow(LAMBDA, 0.5)));
      ctx.lineTo(right, yOf(C * Math.pow(LAMBDA, LAST + 0.5)));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = '#6f7286';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    [1, 10, 20, 30, 40, 50].forEach(function (t) {
      ctx.fillText(String(t), left + (t - 0.5) * G.bw, bottom + 8);
    });

    var m = hover ? hover.n : Math.min(n, LAST);
    var lines = [
      'Term ' + m + ' has ' + lengths[m].toLocaleString() + (lengths[m] === 1 ? ' digit' : ' digits'),
      m > 1 ? 'That\'s ' + (lengths[m] / lengths[m - 1]).toFixed(4) + ' × the term before' : 'The seed',
      'Dashed: growing by λ = 1.30357… a step'
    ];
    V.setText(readout, lines.join('\n'));
  }

  function atomColor(id) {
    var c = V.gradient(V.SPECTRUM, (id * 0.6180339887) % 1).match(/\d+/g);
    return [+c[0], +c[1], +c[2]];
  }

  // One row per term from 8 on, each stretched to full width and colored by
  // its pieces. Painted once into a layer.
  function piecesLayout(st) {
    var top = 70, bottom = st.height - 24;
    return { left: 14, right: st.width - 44, top: top, bottom: bottom, rowH: (bottom - top) / (LAST - FIRST_SPLIT + 1) };
  }

  function paintBars(st) {
    var dpr = st.dpr;
    var key = st.width + 'x' + st.height + '@' + dpr;
    if (barsKey === key) return;
    barsKey = key;
    var left = G.left, right = G.right, top = G.top, bottom = G.bottom;
    var rows = LAST - FIRST_SPLIT + 1;
    var pw = Math.round((right - left) * dpr), ph = Math.round((bottom - top) * dpr);
    if (!bars) bars = document.createElement('canvas');
    bars.width = pw;
    bars.height = ph;
    var c = bars.getContext('2d');
    var img = c.createImageData(pw, ph);
    var data = new Uint32Array(img.data.buffer);
    var palette = atoms.map(function (a, id) {
      var col = atomColor(id);
      return (255 << 24 | col[2] << 16 | col[1] << 8 | col[0]) >>> 0;
    });
    for (var r = 0; r < rows; r++) {
      var n = FIRST_SPLIT + r, seq = pieces[n], L = lengths[n];
      var y0 = Math.round(r * G.rowH * dpr), y1 = Math.round((r + 1) * G.rowH * dpr) - Math.max(1, Math.round(dpr));
      var line = new Uint32Array(pw), k = 0, end = atoms[seq[0]].s.length;
      for (var x = 0; x < pw; x++) {
        var at = (x + 0.5) / pw * L;
        while (at >= end && k < seq.length - 1) { k++; end += atoms[seq[k]].s.length; }
        line[x] = palette[seq[k]];
      }
      for (var y = y0; y < y1; y++) data.set(line, y * pw);
    }
    c.putImageData(img, 0, 0);
  }

  function drawPieces(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    ctx.clearRect(0, 0, W, H);
    G = piecesLayout(st);
    paintBars(st);
    ctx.drawImage(bars, G.left, G.top, G.right - G.left, G.bottom - G.top);

    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#6f7286';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    [8, 20, 30, 40, 50].forEach(function (t) {
      ctx.fillText(String(t), G.right + 8, G.top + (t - FIRST_SPLIT + 0.5) * G.rowH);
    });

    var n = hover ? hover.n : LAST, lines;
    if (hover) {
      var y = G.top + (n - FIRST_SPLIT) * G.rowH;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(G.left - 1, y - 1, G.right - G.left + 2, G.rowH + 1);
    }
    lines = [
      'Term ' + n + ': ' + lengths[n].toLocaleString() + ' digits',
      pieces[n].length.toLocaleString() + (pieces[n].length === 1 ? ' piece, ' : ' pieces, ') + kinds[n] + ' kinds of element'
    ];
    if (hover && hover.piece != null) {
      var s = atoms[hover.piece].s;
      lines.push('This piece: ' + (s.length > 24 ? s.slice(0, 22) + '…' : s) +
        (s === '22' ? ' (hydrogen)' : s === '3' ? ' (uranium)' : ''));
    }
    V.setText(readout, lines.join('\n'));
  }

  var stage = V.createStage(canvas, {
    frame: frame,
    resize: function () { barsKey = ''; }
  });

  // ---- Hover ----

  function onPoint(e) {
    if (!G || !ready() || view === 'read') return;
    var b = canvas.getBoundingClientRect();
    var x = e.clientX - b.left, y = e.clientY - b.top;
    var h = null;
    if (x >= G.left && x <= G.right && y >= G.top && y <= G.bottom) {
      if (view === 'growth') {
        h = { n: Math.min(LAST, Math.max(1, Math.floor((x - G.left) / G.bw) + 1)) };
      } else {
        var n = Math.min(LAST, FIRST_SPLIT + Math.floor((y - G.top) / G.rowH));
        var at = (x - G.left) / (G.right - G.left) * lengths[n], pos = 0, seq = pieces[n];
        for (var k = 0; k < seq.length; k++) {
          pos += atoms[seq[k]].s.length;
          if (pos > at) break;
        }
        h = { n: n, piece: seq[Math.min(k, seq.length - 1)] };
      }
    }
    if (JSON.stringify(h) !== JSON.stringify(hover)) {
      hover = h;
      stage.dirty = true;
    }
  }
  canvas.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') onPoint(e); });
  canvas.addEventListener('pointerdown', onPoint);
  canvas.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse' && hover) { hover = null; stage.dirty = true; }
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    if (view !== 'read') { view = 'read'; V.setSegmented(viewGroup, 'read'); }
    setPlaying(!playing);
    stage.dirty = true;
  });

  V.ctl(section, 'step').addEventListener('click', function () {
    if (view !== 'read') { view = 'read'; V.setSegmented(viewGroup, 'read'); }
    setPlaying(false);
    if (!terms[reading + 1]) return;
    var r = runs(terms[reading]).length;
    if (runT < r) runT = r;
    else {
      runT = 0;
      reading = fits(stage, reading + 1) ? reading + 1 : 1;
    }
    stage.dirty = true;
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    view = 'read';
    V.setSegmented(viewGroup, 'read');
    reading = 1;
    runT = 0;
    hold = 0;
    setPlaying(true);
    stage.dirty = true;
  });

  V.segmented(viewGroup, function (v) {
    view = v;
    hover = null;
    stage.dirty = true;
  });
})();
