// Proofs without words: dots rearranged into a shape whose size you can read
// off. Two staircases make an n × (n + 1) rectangle, odd numbers wrap into a
// square, and the cubes 1³ … n³ tile a square of side 1 + 2 + … + n.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('figurate');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var nInput = V.ctl(section, 'n');

  var SUP = { 2: '²', 3: '³' };
  var A = '#a78bfa', B = '#6ee7ff';
  var HOLD0 = 1.3, MOVE = 1.7, HOLD1 = 2.8, BACK = 1.1;
  var CYCLE = HOLD0 + MOVE + HOLD1 + BACK;

  var proof = 'tri';
  var n = 5;
  var playing = !V.reducedMotion;
  var clock = V.reducedMotion ? HOLD0 + MOVE : 0;
  var groups = [];
  var box = null;
  var outline = null;     // the finished shape: { w, h, labels }

  function tri(rows) {
    var pts = [];
    for (var r = 0; r < rows; r++) for (var c = 0; c <= r; c++) pts.push([c, r]);
    return pts;
  }

  // A rigid group moves and turns as one piece; a loose group's dots each
  // travel from their own start to their own end.
  function rigid(color, delay, local, from, to) {
    return { color: color, delay: delay, local: local, from: from, to: to };
  }

  function build() {
    groups = [];
    var k, i, j, pts;
    if (proof === 'tri') {
      // Side by side at first, centered on where the rectangle will be.
      groups.push(rigid(A, 0, tri(n), { x: -n / 2, y: 0, a: 0 }, { x: 0, y: 0, a: 0 }));
      groups.push(rigid(B, 0.15, tri(n), { x: n / 2 + 1, y: 0, a: 0 }, { x: n, y: n - 1, a: Math.PI }));
      outline = { w: n + 1, h: n, labels: [String(n + 1), String(n)] };
    } else if (proof === 'two') {
      groups.push(rigid(A, 0, tri(n), { x: -n / 2, y: 0, a: 0 }, { x: 0, y: 0, a: 0 }));
      groups.push(rigid(B, 0.15, tri(n - 1), { x: n / 2 + 1, y: 1, a: 0 }, { x: n - 1, y: n - 2, a: Math.PI }));
      outline = { w: n, h: n, labels: [String(n), String(n)] };
    } else if (proof === 'odd') {
      // Row k of the pyramid folds at its middle dot into an L around the
      // square before it.
      for (k = 1; k <= n; k++) {
        pts = [];
        for (i = 0; i < 2 * k - 1; i++) {
          var ax, ay;
          if (i < k - 1) { ax = i; ay = k - 1; }
          else if (i === k - 1) { ax = k - 1; ay = k - 1; }
          else { ax = k - 1; ay = 2 * k - 2 - i; }
          pts.push({ b: [i - (k - 1) + (n - 1) / 2, k - 1], a: [ax, ay] });
        }
        groups.push({ color: V.gradient(V.SPECTRUM, n > 1 ? (k - 1) / (n - 1) : 0.5), delay: (k - 1) * 0.12, dots: pts });
      }
      outline = { w: n, h: n, labels: [String(n), String(n)] };
    } else {
      // k³ is k blocks of k × k. They fill the L-shaped band between squares
      // of side 1 + … + (k − 1) and 1 + … + k.
      var T = n * (n + 1) / 2;
      var y = (T - 1) / 2 - (T + 0.8 * (n - 1) - 1) / 2;
      for (k = 1; k <= n; k++) {
        var x0 = (T - 1) / 2 - (k * k + 0.6 * (k - 1) - 1) / 2;
        var t0 = k * (k - 1) / 2;
        var col = V.gradient(V.SPECTRUM, n > 1 ? (k - 1) / (n - 1) : 0.5);
        var fullV = Math.floor((k + 1) / 2), fullH = Math.floor((k - 1) / 2);
        for (var b = 0; b < k; b++) {
          pts = [];
          for (i = 0; i < k; i++) {
            for (j = 0; j < k; j++) {
              var before = [x0 + b * (k + 0.6) + i, y + j];
              var after;
              if (b < fullV) after = [t0 + i, b * k + j];
              else if (b < fullV + fullH) after = [(b - fullV) * k + i, t0 + j];
              else if (j < k / 2) after = [t0 + i, k * k / 2 + j];      // even k: half on the upright arm
              else after = [t0 - k / 2 + (j - k / 2), t0 + i];            // and half on the flat arm
              pts.push({ b: before, a: after });
            }
          }
          groups.push({ color: col, shade: b % 2, delay: (k - 1) * 0.16, dots: pts });
        }
        y += k + 0.8;
      }
      outline = { w: T, h: T, labels: [String(T), String(T)] };
    }

    // One box around both arrangements and the moves between, so nothing
    // jumps or leaves the screen.
    box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    groups.forEach(function (g) {
      [0, 0.25, 0.5, 0.75, 1].forEach(function (end) {
        eachDot(g, end, function (x, y) {
          box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x);
          box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
        });
      });
    });
  }

  function place(tr, p) {
    var c = Math.cos(tr.a), sn = Math.sin(tr.a);
    return [tr.x + c * p[0] - sn * p[1], tr.y + sn * p[0] + c * p[1]];
  }

  function eachDot(g, t, fn) {
    var e = V.easeInOut(t);
    if (g.local) {
      // Slide the piece's middle in a straight line while it turns.
      if (!g.mid) {
        var mx = 0, my = 0;
        g.local.forEach(function (p) { mx += p[0]; my += p[1]; });
        g.mid = [mx / g.local.length, my / g.local.length];
      }
      var m = g.mid, c0 = place(g.from, m), c1 = place(g.to, m);
      var cx = c0[0] + (c1[0] - c0[0]) * e, cy = c0[1] + (c1[1] - c0[1]) * e;
      var a = g.from.a + (g.to.a - g.from.a) * e, c = Math.cos(a), sn = Math.sin(a);
      g.local.forEach(function (p) {
        var dx = p[0] - m[0], dy = p[1] - m[1];
        fn(cx + c * dx - sn * dy, cy + sn * dx + c * dy);
      });
    } else {
      g.dots.forEach(function (d) { fn(d.b[0] + (d.a[0] - d.b[0]) * e, d.b[1] + (d.a[1] - d.b[1]) * e); });
    }
  }

  // Where the loop is: 0 = laid out, 1 = rearranged, per group with its delay.
  function progress(g) {
    var spread = 0.6;
    var t = clock % CYCLE;
    if (t < HOLD0) return 0;
    t -= HOLD0;
    if (t < MOVE) return Math.max(0, Math.min(1, (t - g.delay) / Math.max(0.3, MOVE - spread)));
    t -= MOVE;
    if (t < HOLD1) return 1;
    t -= HOLD1;
    return 1 - Math.min(1, t / BACK);
  }

  function frame(dt, st) {
    if (!groups.length) build();
    if (playing) clock += dt;
    else if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    ctx.clearRect(0, 0, W, H);
    var top = 70, pad = 26;
    var bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
    var s = Math.min((W - 2 * pad) / bw, (H - top - pad) / bh, 44);
    var ox = W / 2 - (box.x0 + box.x1) / 2 * s;
    var oy = top + (H - top - pad) / 2 - (box.y0 + box.y1) / 2 * s;
    var r = Math.max(1, s * 0.36);

    // The finished shape's outline fades in once everything has landed.
    var done = Math.min.apply(null, groups.map(progress));
    if (done > 0.6) {
      var al = (done - 0.6) / 0.4;
      var x0 = ox - s / 2, y0 = oy - s / 2, w = outline.w * s, h = outline.h * s;
      ctx.strokeStyle = 'rgba(236,232,223,' + (0.5 * al).toFixed(3) + ')';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x0 - 3, y0 - 3, w + 6, h + 6);
      ctx.font = '500 12px "IBM Plex Mono", monospace';
      ctx.fillStyle = 'rgba(236,232,223,' + (0.85 * al).toFixed(3) + ')';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(outline.labels[0], x0 + w / 2, y0 + h + 9);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(outline.labels[1], x0 - 10, y0 + h / 2);
    }

    groups.forEach(function (g) {
      var t = progress(g);
      ctx.fillStyle = g.color;
      ctx.globalAlpha = g.shade ? 0.72 : 1;
      ctx.beginPath();
      eachDot(g, t, function (x, y) {
        var px = ox + x * s, py = oy + y * s;
        ctx.moveTo(px + r, py);
        ctx.arc(px, py, r, 0, Math.PI * 2);
      });
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    updateReadout();
  }

  function sum(fn, sep) {
    var parts = [];
    for (var k = 1; k <= n; k++) parts.push(fn(k));
    var text = parts.join(sep || ' + ');
    if (text.length > 26 && n > 4) text = parts.slice(0, 3).join(' + ') + ' + … + ' + parts[n - 1];
    return text;
  }

  function updateReadout() {
    var T = n * (n + 1) / 2, lines;
    if (proof === 'tri') {
      lines = [
        sum(String) + ' = ' + T,
        'Two copies: ' + n + ' × ' + (n + 1) + ' = ' + n * (n + 1),
        'So 1 + … + n = n(n + 1) ÷ 2'
      ];
    } else if (proof === 'two') {
      var t1 = (n - 1) * n / 2;
      lines = [
        t1 + ' + ' + T + ' = ' + n * n + ' = ' + n + '²',
        'Two neighboring triangle numbers',
        'always make a square'
      ];
    } else if (proof === 'odd') {
      lines = [
        sum(function (k) { return String(2 * k - 1); }) + ' = ' + n * n,
        'The first ' + n + ' odd numbers make ' + n + '²',
        'Each one wraps around the square'
      ];
    } else {
      lines = [
        sum(function (k) { return String(k * k * k); }) + ' = ' + T * T,
        '= ' + T + '² = (' + (n > 4 ? '1 + … + ' + n : sum(String)) + ')²',
        'Each k³ is k squares of k × k'
      ];
    }
    V.setText(readout, lines.join('\n'));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); stage.dirty = true; });

  V.ctl(section, 'reset').addEventListener('click', function () {
    clock = 0;
    setPlaying(true);
    stage.dirty = true;
  });

  function clampN() {
    var max = proof === 'cubes' ? 6 : 10;
    nInput.max = max;
    if (n > max) n = max;
    if (proof === 'two' && n < 2) n = 2;
    nInput.value = n;
    V.ctl(section, 'n-out').textContent = String(n);
  }

  nInput.addEventListener('input', function () {
    n = parseInt(nInput.value, 10);
    clampN();
    build();
    stage.dirty = true;
  });

  V.segmented(V.ctl(section, 'proof'), function (v) {
    proof = v;
    clampN();
    build();
    clock = V.reducedMotion ? HOLD0 + MOVE : 0;
    stage.dirty = true;
  });
  clampN();
})();
