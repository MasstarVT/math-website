// Sieve of Eratosthenes: the smallest number nobody has crossed out is prime,
// so cross out its multiples, starting at its square (smaller ones are already
// gone). Once the next prime's square is past the end, everything left is prime.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('sieve');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  // Crossed-out cells take the color of the prime that crossed them first,
  // which is always their smallest prime factor.
  var CROSS = {
    2: [124, 140, 255], 3: [255, 95, 162], 5: [255, 180, 84], 7: [126, 224, 161],
    11: [196, 107, 255], 13: [255, 138, 92], 17: [255, 209, 102], 19: [167, 139, 250],
    23: [120, 200, 255]
  };
  var PRIME = '#6ee7ff';
  var SUP = { 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

  var N = 120;
  var cols = 10;
  var playing = !V.reducedMotion;
  var events = [];     // { t, kind: 0 pick a prime / 1 cross out / 2 left over, n, p }
  var phases = [];     // start time of each prime's turn, then of the final sweep
  var ei = 0;
  var T = 0;
  var status = null;   // per number: 0 open, 1 prime, 2 crossed out
  var by = null;       // smallest prime that crossed it
  var hit = null;      // clock time it last changed, for the flash
  var clock = 0;
  var lastHit = -9;
  var current = 0;     // prime whose multiples are being crossed out
  var cells = [];      // drawn rectangles, eased toward the layout
  var L = null;
  var moving = false;
  var hover = 0;
  var built = 0;

  function build() {
    events = [];
    phases = [];
    var comp = new Uint8Array(N + 1);
    var t = 0.5;
    for (var p = 2; p * p <= N; p++) {
      if (comp[p]) continue;
      phases.push(t);
      events.push({ t: t, kind: 0, n: p, p: p });
      t += 0.6;
      var count = Math.floor((N - p * p) / p) + 1;
      var gap = Math.min(0.09, 1.6 / count);
      for (var m = p * p; m <= N; m += p) {
        comp[m] = 1;
        events.push({ t: t, kind: 1, n: m, p: p });
        t += gap;
      }
      t += 0.45;
    }
    phases.push(t);
    for (var k = 2; k <= N; k++) {
      if (!comp[k] && k * k > N) {
        events.push({ t: t, kind: 2, n: k, p: 0 });
        t += 1.2 / N;
      }
    }
    built = N;
    restart();
  }

  function restart() {
    lastHit = -9;
    status = new Uint8Array(N + 1);
    by = new Uint8Array(N + 1);
    hit = new Float32Array(N + 1).fill(-9);
    ei = 0;
    T = 0;
    current = 0;
  }

  function advance(to) {
    T = to;
    while (ei < events.length && events[ei].t <= T) {
      var e = events[ei++];
      if (e.kind === 0) {
        status[e.n] = 1;
        current = e.p;
      } else if (e.kind === 1) {
        if (!status[e.n]) {
          status[e.n] = 2;
          by[e.n] = e.p;
        }
      } else {
        status[e.n] = 1;
        current = 0;
      }
      hit[e.n] = clock;
      lastHit = clock;
    }
  }

  function finished() { return ei >= events.length; }

  // Cells are squares when they fit, stretched wider when there are few
  // columns. The top strip stays clear for the readout.
  function layout(st) {
    var W = st.width, H = st.height;
    var top = 66, pad = 12;
    var rows = Math.ceil(N / cols);
    var ch = Math.min((H - top - pad) / rows, (W - 2 * pad) / cols);
    var cw = Math.min((W - 2 * pad) / cols, ch * 2.4);
    return { x0: (W - cw * cols) / 2, y0: top + (H - top - pad - ch * rows) / 2, cw: cw, ch: ch };
  }

  function target(k) {
    var i = k - 1;
    return { x: L.x0 + (i % cols) * L.cw, y: L.y0 + Math.floor(i / cols) * L.ch, w: L.cw, h: L.ch };
  }

  function relayout(st, snap) {
    L = layout(st);
    if (snap || cells.length !== N + 1) {
      cells = [null];
      for (var k = 1; k <= N; k++) cells.push(target(k));
    }
    moving = !snap;
  }

  function frame(dt, st) {
    if (built !== N) build();
    if (!L) relayout(st, true);
    clock += dt;
    var animating = clock - lastHit < 0.45;
    if (playing && !finished()) {
      advance(T + dt);
      animating = true;
      if (finished()) setPlaying(false);
    }
    if (moving) {
      var f = 1 - Math.exp(-dt * 9), still = true;
      for (var k = 1; k <= N; k++) {
        var c = cells[k], g = target(k);
        c.x += (g.x - c.x) * f;
        c.y += (g.y - c.y) * f;
        c.w += (g.w - c.w) * f;
        c.h += (g.h - c.h) * f;
        if (Math.abs(g.x - c.x) + Math.abs(g.y - c.y) + Math.abs(g.w - c.w) > 0.3) still = false;
      }
      if (still) relayout(st, true);
      animating = true;
    }
    if (!animating && !st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function draw(st) {
    var ctx = st.ctx;
    ctx.clearRect(0, 0, st.width, st.height);
    var small = L.ch < 12 || L.cw < 12;
    var gap = small ? Math.max(0.5, L.ch * 0.1) : 2;
    var fontPx = Math.min(15, L.ch * 0.46, L.cw * 0.34);
    var labels = fontPx >= 7.5;
    ctx.font = '500 ' + fontPx.toFixed(1) + 'px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (var k = 1; k <= N; k++) {
      var c = cells[k];
      var x = c.x + gap / 2, y = c.y + gap / 2, w = c.w - gap, h = c.h - gap;
      var s = status[k];
      var fill, text;
      if (k === 1) {
        fill = 'rgba(236,232,223,0.025)';
        text = '#4a4d5e';
      } else if (s === 1) {
        fill = PRIME;
        text = '#0a0b10';
      } else if (s === 2) {
        fill = rgba(CROSS[by[k]] || [150, 150, 170], 0.22);
        text = 'rgba(236,232,223,0.38)';
      } else {
        fill = 'rgba(236,232,223,0.07)';
        text = '#9b9daf';
      }
      ctx.fillStyle = fill;
      if (small) {
        ctx.fillRect(x, y, w, h);
      } else {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, Math.min(6, h * 0.2));
        ctx.fill();
      }
      if (s === 2 && !small && h >= 16) {
        ctx.strokeStyle = rgba(CROSS[by[k]] || [150, 150, 170], 0.75);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.22, y + h * 0.78);
        ctx.lineTo(x + w * 0.78, y + h * 0.22);
        ctx.stroke();
      }
      if (labels) {
        ctx.fillStyle = text;
        ctx.fillText(String(k), x + w / 2, y + h / 2 + 0.5);
      }
      // A quick ring where something just happened.
      var age = clock - hit[k];
      if (age >= 0 && age < 0.4) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * (1 - age / 0.4)).toFixed(3) + ')';
        ctx.lineWidth = small ? 1 : 2;
        ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
      }
    }

    // The prime doing the crossing, and the hovered cell.
    if (current && current <= N) ring(ctx, cells[current], gap, '#ffffff', 2);
    if (hover && hover <= N) ring(ctx, cells[hover], gap, 'rgba(236,232,223,0.8)', 1.5);

    updateReadout();
  }

  function ring(ctx, c, gap, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.roundRect(c.x + gap / 2 - 1.5, c.y + gap / 2 - 1.5, c.w - gap + 3, c.h - gap + 3, Math.min(7, c.h * 0.22));
    ctx.stroke();
  }

  function factor(n) {
    var parts = [];
    for (var p = 2; p * p <= n; p++) {
      var e = 0;
      while (n % p === 0) { n /= p; e++; }
      if (e) parts.push(p + (e > 1 ? SUP[e] : ''));
    }
    if (n > 1) parts.push(String(n));
    return parts.join(' × ');
  }

  function primeCount() {
    var c = 0;
    for (var k = 2; k <= N; k++) if (status[k] === 1) c++;
    return c;
  }

  function nextPrimeAfter(p) {
    for (var q = p + 1; ; q++) {
      var ok = true;
      for (var d = 2; d * d <= q; d++) if (q % d === 0) { ok = false; break; }
      if (ok) return q;
    }
  }

  function updateReadout() {
    var line1, line2;
    if (!ei) {
      line1 = 'Every number from 2 to ' + N;
      line2 = playing ? '1 is not a prime, so skip it' : 'Press Play or Next prime';
    } else if (current) {
      line1 = 'Crossing out multiples of ' + current;
      line2 = current === 2 ? 'From 2² = 4, every 2nd number'
        : 'From ' + current + '² = ' + current * current + ', smaller ones are out';
    } else {
      var lastP = 2;
      for (var q = 2; q * q <= N; q++) if (status[q] === 1) lastP = q;
      var nxt = nextPrimeAfter(lastP);
      line1 = 'Next is ' + nxt + ', but ' + nxt + '² = ' + nxt * nxt + ' > ' + N;
      line2 = 'So the rest are prime: ' + primeCount() + ' primes';
    }
    if (hover) {
      var f = factor(hover);
      line1 = hover === 1 ? '1 is not counted as a prime'
        : f === String(hover) ? hover + ' is prime' : hover + ' = ' + f;
    }
    V.setText(readout, line1 + '\n' + line2);
  }

  var stage = V.createStage(canvas, {
    frame: frame,
    resize: function (st) { if (built === N) relayout(st, true); }
  });

  // ---- Hover ----

  function cellAt(e) {
    if (!L) return 0;
    var b = canvas.getBoundingClientRect();
    var c = Math.floor((e.clientX - b.left - L.x0) / L.cw);
    var r = Math.floor((e.clientY - b.top - L.y0) / L.ch);
    if (c < 0 || c >= cols || r < 0) return 0;
    var k = r * cols + c + 1;
    return k <= N ? k : 0;
  }
  function onPoint(e) {
    var k = cellAt(e);
    if (k !== hover) { hover = k; stage.dirty = true; }
  }
  canvas.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') onPoint(e); });
  canvas.addEventListener('pointerdown', onPoint);
  canvas.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse') { hover = 0; stage.dirty = true; }
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    if (built !== N) build();
    if (!playing && finished()) restart();
    setPlaying(!playing);
    stage.dirty = true;
  });

  V.ctl(section, 'next').addEventListener('click', function () {
    if (built !== N) build();
    setPlaying(false);
    if (finished()) restart();
    // Jump to the next prime's turn; from the last one, finish the sieve.
    var i = 0;
    while (i < phases.length && phases[i] <= T + 1e-6) i++;
    if (i >= phases.length - 1) advance(1e9); else advance(phases[i]);
    stage.dirty = true;
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    if (built !== N) build();
    restart();
    setPlaying(true);
    stage.dirty = true;
  });

  V.range(V.ctl(section, 'cols'), V.ctl(section, 'cols-out'),
    function (v) { return String(v); },
    function (v) {
      cols = v;
      if (L && built === N) relayout(stage, false);
      stage.dirty = true;
    });

  V.segmented(V.ctl(section, 'count'), function (v) {
    N = parseInt(v, 10);
    hover = 0;
    build();
    relayout(stage, true);
    setPlaying(!V.reducedMotion);
    stage.dirty = true;
  });
})();
