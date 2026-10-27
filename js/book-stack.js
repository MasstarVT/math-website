// The harmonic book stack: the top book sticks out 1/2 past the one below,
// that one 1/4 past the next, then 1/6, 1/8… The overhang is half the
// harmonic series 1 + 1/2 + 1/3 + …, so it grows without limit.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('book-stack');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var countInput = V.ctl(section, 'count');
  var countOut = V.ctl(section, 'count-out');
  var playBtn = V.ctl(section, 'play');
  var dotsBtn = V.ctl(section, 'dots');

  var MAX = 50;
  var EPS = 1e-9;
  var ADD_EVERY = 1.1;
  var TIP = 0.16;

  var books = [];       // bottom first; x is the left end, a book is 1 long
  var nextId = 0;
  var playing = !V.reducedMotion;
  var playT = 0;
  var showDots = true;
  var tween = 0;        // 0 → 1 while books glide to new places
  var G = null;

  function harmonicX(n) {
    var out = [], edge = 0;
    // From the bottom: book i's right end is 1/(2n) + 1/(2(n − 1)) + … + 1/(2(n − i)).
    for (var i = 0; i < n; i++) {
      edge += 1 / (2 * (n - i));
      out.push(edge - 1);
    }
    return out;
  }

  function best(n) {
    var h = 0;
    for (var k = 1; k <= n; k++) h += 1 / k;
    return h / 2;
  }

  function newBook() {
    var id = nextId++;
    return { id: id, x: -2.6, from: -2.6, to: 0, slot: 0, slotFrom: 0, color: V.gradient(V.SPECTRUM, (id * 0.381966) % 1) };
  }

  // Grow or shrink the stack at the bottom, then glide to the best positions.
  function setCount(n) {
    n = Math.max(1, Math.min(MAX, n));
    while (books.length < n) books.unshift(newBook());
    while (books.length > n) books.shift();
    lineUp();
    countInput.value = n;
    countOut.textContent = String(n);
  }

  function lineUp() {
    var xs = harmonicX(books.length);
    books.forEach(function (b, i) {
      b.from = b.x;
      b.to = xs[i];
      b.slotFrom = b.slot;
    });
    tween = 0.0001;
    stage.dirty = true;
  }

  // The lowest support that something above it would tip off, or null.
  function failure() {
    var fail = null, sum = 0, cnt = 0;
    for (var i = books.length - 1; i >= 0; i--) {
      if (cnt) {
        var c = sum / cnt;
        if (c > books[i].x + 1 + EPS) fail = { level: i, pivot: books[i].x + 1, dir: 1 };
        else if (c < books[i].x - EPS) fail = { level: i, pivot: books[i].x, dir: -1 };
      }
      sum += books[i].x + 0.5;
      cnt++;
    }
    if (sum / cnt > EPS) fail = { level: -1, pivot: 0, dir: 1 };
    return fail;
  }

  function frame(dt, st) {
    if (tween) {
      tween = Math.min(1, tween + dt / 0.5);
      var e = V.easeInOut(tween);
      books.forEach(function (b, i) {
        b.x = b.from + (b.to - b.from) * e;
        b.slot = b.slotFrom + (i - b.slotFrom) * e;
      });
      if (tween >= 1) tween = 0;
      st.dirty = true;
    }
    if (playing) {
      // Keep drawing while the stack builds, so the canvas never stalls
      // between one book and the next.
      st.dirty = true;
      playT += dt;
      if (playT >= ADD_EVERY) {
        playT = 0;
        if (books.length >= MAX) setPlaying(false);
        else setCount(books.length + 1);
      }
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    var n = books.length;
    var left = -1.3, right = Math.max(1.25, best(n)) + 0.55;
    var sx = (W - 24) / (right - left);
    var base = H - 46;
    var bp = Math.min(sx * 0.24, (base - 84) / n);
    function X(v) { return 12 + (v - left) * sx; }
    function Y(slot) { return base - slot * bp; }
    G = { X: X, inv: function (px) { return left + (px - 12) / sx; }, base: base, bp: bp };

    ctx.clearRect(0, 0, W, H);

    // The table and its edge.
    var edge = X(0);
    ctx.fillStyle = 'rgba(236,232,223,0.06)';
    ctx.fillRect(0, base, edge, H - base);
    ctx.strokeStyle = 'rgba(236,232,223,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(base) + 0.5);
    ctx.lineTo(edge, Math.round(base) + 0.5);
    ctx.lineTo(edge, H);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236,232,223,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(Math.round(edge) + 0.5, base);
    ctx.lineTo(Math.round(edge) + 0.5, 70);
    ctx.stroke();
    ctx.setLineDash([]);

    // A ruler in book lengths past the edge.
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var rulerY = base + 16;
    ctx.strokeStyle = 'rgba(236,232,223,0.25)';
    ctx.beginPath();
    ctx.moveTo(edge, rulerY + 0.5);
    ctx.lineTo(X(Math.floor(right - 0.3)), rulerY + 0.5);
    for (var m = 0; m <= right - 0.3; m++) {
      ctx.moveTo(Math.round(X(m)) + 0.5, rulerY - 4);
      ctx.lineTo(Math.round(X(m)) + 0.5, rulerY + 4);
    }
    ctx.stroke();
    ctx.fillStyle = '#6f7286';
    for (m = 1; m <= right - 0.3; m++) ctx.fillText(m + (m === 1 ? ' book' : ' books'), X(m), rulerY + 8);

    var fail = tween ? null : failure();
    var steady = fail ? fail.level + 1 : n;   // books from here up tip over

    function bookRect(b) {
      var y = Y(b.slot + 1), h = Math.max(1, bp - (bp > 6 ? 1.5 : 0.5));
      var r = Math.min(3, h / 3);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(X(b.x), y, sx, h, r); else ctx.rect(X(b.x), y, sx, h);
    }

    function drawBook(b, tipping) {
      bookRect(b);
      ctx.globalAlpha = tipping ? 0.35 : 0.62;
      ctx.fillStyle = b.color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = tipping ? '#ff5fa2' : b.color;
      ctx.lineWidth = bp > 6 ? 1.2 : 0.6;
      ctx.stroke();
      if (bp > 14) {
        // Page edges at the right end.
        var y = Y(b.slot + 1);
        ctx.fillStyle = 'rgba(236,232,223,0.5)';
        ctx.fillRect(X(b.x + 1) - 5, y + 3, 2, bp - 7.5);
      }
    }

    var i;
    for (i = 0; i < steady; i++) drawBook(books[i], false);
    if (fail) {
      // The part that would fall, tilted about the edge it would roll over.
      var py = fail.level >= 0 ? Y(fail.level + 1) : base;
      ctx.save();
      ctx.translate(X(fail.pivot), py);
      ctx.rotate(fail.dir * TIP);
      ctx.translate(-X(fail.pivot), -py);
      for (i = steady; i < n; i++) drawBook(books[i], true);
      ctx.restore();
    }

    // Balance points: the center of mass of everything above each book.
    if (showDots) {
      var sum = 0, cnt = 0;
      for (i = n - 1; i >= -1; i--) {
        if (cnt) {
          var c = sum / cnt;
          var lo = i >= 0 ? books[i].x : -Infinity, hi = i >= 0 ? books[i].x + 1 : 0;
          var ok = tween || (c >= lo - EPS && c <= hi + EPS);
          var dy = i >= 0 ? Y(i + 1) : base;
          ctx.fillStyle = ok ? '#ece8df' : '#ff5fa2';
          ctx.strokeStyle = '#0d0f16';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(X(c), dy + 0.5);
          ctx.lineTo(X(c) - 4.5, dy - 6);
          ctx.lineTo(X(c) + 4.5, dy - 6);
          ctx.closePath();
          ctx.stroke();
          ctx.fill();
        }
        if (i >= 0) {
          sum += books[i].x + 0.5;
          cnt++;
        }
      }
    }

    // How far the farthest book reaches.
    var reach = -Infinity, topY = base;
    books.forEach(function (b) {
      if (b.x + 1 > reach) reach = b.x + 1;
      topY = Math.min(topY, Y(b.slot + 1));
    });
    if (reach > 0.02) {
      var ay = Math.max(62, topY - 14);
      ctx.strokeStyle = '#7ee0a1';
      ctx.fillStyle = '#7ee0a1';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(edge, ay);
      ctx.lineTo(X(reach), ay);
      ctx.moveTo(edge, ay - 5);
      ctx.lineTo(edge, ay + 5);
      ctx.moveTo(X(reach), ay - 5);
      ctx.lineTo(X(reach), ay + 5);
      ctx.stroke();
      ctx.textBaseline = 'bottom';
      ctx.fillText(reach.toFixed(3), (edge + X(reach)) / 2, ay - 4);
    }

    var b = best(n);
    var sum1 = n === 1 ? '1/2' : n === 2 ? '(1 + 1/2) ÷ 2' : n === 3 ? '(1 + 1/2 + 1/3) ÷ 2' :
      '(1 + 1/2 + … + 1/' + n + ') ÷ 2';
    V.setText(readout,
      n + (n === 1 ? ' book' : ' books') + ', overhang ' + Math.max(0, reach).toFixed(3) + '\n' +
      'Best: ' + sum1 + ' = ' + b.toFixed(3) + '\n' +
      (tween ? 'Sliding into place' : fail ? (fail.level < 0 ? 'The whole stack tips off the table' :
        'Tips over above book ' + (fail.level + 1)) : 'Balanced'));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Drag a book sideways ----

  V.drag(canvas, {
    cursor: 'ew-resize',
    hit: function (px, py) {
      if (!G || tween) return null;
      for (var i = books.length - 1; i >= 0; i--) {
        var b = books[i], top = G.base - (i + 1) * G.bp;
        var pad = G.bp < 10 ? (10 - G.bp) / 2 : 0;
        if (py >= top - pad && py <= top + G.bp + pad && px >= G.X(b.x) && px <= G.X(b.x + 1)) {
          return { book: b, grab: G.inv(px) - b.x };
        }
      }
      return null;
    },
    move: function (h, px) {
      setPlaying(false);
      h.book.x = Math.max(-2.2, Math.min(3.6, G.inv(px) - h.grab));
      stage.dirty = true;
    }
  });

  // ---- Controls ----

  function setPlaying(on) {
    if (on && !playing && books.length >= MAX) {
      books = [];
      setCount(1);
    }
    playing = on;
    playT = 0;
    playBtn.textContent = on ? 'Pause' : 'Play';
  }

  countInput.addEventListener('input', function () {
    setPlaying(false);
    setCount(parseInt(countInput.value, 10));
  });

  V.ctl(section, 'add').addEventListener('click', function () {
    setPlaying(false);
    setCount(books.length + 1);
  });

  V.ctl(section, 'best').addEventListener('click', lineUp);

  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.toggle(dotsBtn, function (on) {
    showDots = on;
    stage.dirty = true;
  });

  setCount(playing ? 1 : 8);
  setPlaying(playing);
})();
