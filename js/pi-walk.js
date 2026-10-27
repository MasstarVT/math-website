// A walk on the digits of a number: digit d means one step at angle d × 36°.
// π, e and √2 wander like random walks; a fraction's digits repeat, so its
// walk repeats the same shape over and over. Digits come from BigInt
// arithmetic, computed a slice per frame the first time they're needed.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('pi-walk');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var randomBtn = V.ctl(section, 'random');

  var D = 10000;           // digits after the point
  var GUARD = 12;
  var NAMES = { pi: 'π', e: 'e', sqrt2: '√2', r22: '22/7', r355: '355/113' };
  var START = { pi: '3.', e: '2.', sqrt2: '1.', r22: '3.', r355: '3.' };

  var which = 'pi';
  var digits = {};         // name → Uint8Array of D digits once known
  var job = null;          // a sliced computation in progress
  var walks = {};          // name → Float32Array of x, y after each step
  var randomWalk = null;
  var shown = 0;
  var playing = !V.reducedMotion;
  var showRandom = false;
  var view = null;         // eased center and scale
  var box = null;

  // ---- Digits ----

  function big(n) { return BigInt(n); }

  function pow10(n) {
    var r = big(1), b = big(10);
    while (n) {
      if (n & 1) r *= b;
      b *= b;
      n >>= 1;
    }
    return r;
  }

  // arctan(1/x) × unity as a series, a few hundred terms at a time.
  function arctan(x, unity) {
    var X = big(x), x2 = big(x * x), term = unity / X, sum = term, k = 1, zero = big(0);
    return function (budget) {
      for (var i = 0; i < budget; i++) {
        term = term / x2;
        if (term === zero) return sum;
        var t = term / big(2 * k + 1);
        sum = k % 2 ? sum - t : sum + t;
        k++;
      }
      return null;
    };
  }

  function piJob() {
    var unity = pow10(D + GUARD);
    var a = arctan(5, unity), b = arctan(239, unity), A = null, B = null;
    return function () {
      if (A === null) A = a(250);
      else if (B === null) B = b(250);
      if (A === null || B === null) return null;
      return (big(16) * A - big(4) * B) / pow10(GUARD);
    };
  }

  function eJob() {
    var unity = pow10(D + GUARD), zero = big(0);
    var sum = zero, term = unity, k = 1;
    return function () {
      for (var i = 0; i < 800 && term !== zero; i++) {
        sum += term;
        term = term / big(k++);
      }
      return term === zero ? sum / pow10(GUARD) : null;
    };
  }

  function sqrt2Job() {
    return function () {
      var scale = pow10(D + GUARD);
      var N = big(2) * scale * scale;
      var x = big(Math.floor(Math.SQRT2 * 1e15)) * pow10(D + GUARD - 15);
      for (var i = 0; i < 40; i++) {
        var nx = (x + N / x) / big(2);
        if (nx === x) break;
        x = nx;
      }
      return x / pow10(GUARD);
    };
  }

  function fraction(p, q) {
    var out = new Uint8Array(D), r = p % q;
    for (var i = 0; i < D; i++) {
      r *= 10;
      out[i] = Math.floor(r / q);
      r %= q;
    }
    return out;
  }

  function toDigits(n) {
    var s = n.toString(), out = new Uint8Array(D);
    for (var i = 0; i < D; i++) out[i] = s.charCodeAt(i + 1) - 48;
    return out;
  }

  function need(name) {
    if (digits[name] || (job && job.name === name)) return;
    if (name === 'r22') digits[name] = fraction(22, 7);
    else if (name === 'r355') digits[name] = fraction(355, 113);
    else job = { name: name, step: name === 'pi' ? piJob() : name === 'e' ? eJob() : sqrt2Job() };
  }

  // Keep each frame's share of the arithmetic to a few milliseconds.
  function work() {
    if (!job) return;
    var t0 = performance.now();
    while (performance.now() - t0 < 4) {
      var result = job.step();
      if (result !== null) {
        digits[job.name] = toDigits(result);
        job = null;
        return;
      }
    }
  }

  // ---- Walks ----

  function walkOf(ds) {
    var pts = new Float32Array(2 * (D + 1)), x = 0, y = 0;
    for (var i = 0; i < D; i++) {
      var a = ds[i] * Math.PI / 5;
      x += Math.cos(a);
      y -= Math.sin(a);
      pts[2 * i + 2] = x;
      pts[2 * i + 3] = y;
    }
    return pts;
  }

  function newRandom() {
    var ds = new Uint8Array(D);
    for (var i = 0; i < D; i++) ds[i] = Math.floor(Math.random() * 10);
    randomWalk = walkOf(ds);
  }

  function restart() {
    shown = 0;
    box = null;
    view = null;
    newRandom();
  }

  function grow(pts, from, to) {
    if (!box) box = { x0: 0, x1: 0, y0: 0, y1: 0 };
    for (var i = from + 1; i <= to; i++) {
      var x = pts[2 * i], y = pts[2 * i + 1];
      if (x < box.x0) box.x0 = x; else if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y; else if (y > box.y1) box.y1 = y;
    }
  }

  function frame(dt, st) {
    need(which);
    work();
    var ds = digits[which];
    if (!ds) {
      V.setText(readout, 'Working out ' + D.toLocaleString() + ' digits of ' + NAMES[which] + '…');
      st.ctx.clearRect(0, 0, st.width, st.height);
      return;
    }
    if (!walks[which]) walks[which] = walkOf(ds);
    if (!randomWalk) newRandom();
    var pts = walks[which];
    var before = Math.floor(shown);
    if (playing && shown < D) {
      // Speed up as it goes: the first steps slowly, thousands a second later.
      shown = Math.min(D, shown + dt * (24 + shown * 0.55));
      if (shown >= D) setPlaying(false);
    }
    var now = Math.floor(shown);
    if (!box || now < before) { box = null; grow(pts, -1, now); }
    else if (now > before) grow(pts, before, now);
    if (showRandom) grow(randomWalk, -1, now);

    // Ease the camera toward a frame around everything drawn so far.
    var W = st.width, H = st.height, pad = 30;
    var bw = Math.max(box.x1 - box.x0, 8), bh = Math.max(box.y1 - box.y0, 8);
    var want = {
      cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2,
      s: Math.min((W - 2 * pad) / bw, (H - 2 * pad - 40) / bh, 40)
    };
    var moving = false;
    if (!view) view = want;
    else {
      var f = V.reducedMotion ? 1 : 1 - Math.exp(-dt * 5);
      view.cx += (want.cx - view.cx) * f;
      view.cy += (want.cy - view.cy) * f;
      view.s *= Math.pow(want.s / view.s, f);
      moving = Math.abs(want.s / view.s - 1) > 0.002 || Math.abs(want.cx - view.cx) * view.s > 0.3 || Math.abs(want.cy - view.cy) * view.s > 0.3;
    }
    if (now === before && !moving && !st.dirty) return;
    st.dirty = false;
    draw(st, pts, ds, now);
  }

  function draw(st, pts, ds, n) {
    var ctx = st.ctx, W = st.width, H = st.height;
    ctx.clearRect(0, 0, W, H);
    var ox = W / 2 - view.cx * view.s, oy = H / 2 + 20 - view.cy * view.s;
    var s = view.s;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    var lw = Math.max(0.7, Math.min(2.4, s * 0.25));

    if (showRandom) {
      ctx.strokeStyle = 'rgba(236,232,223,0.32)';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      for (var i = 1; i <= n; i++) ctx.lineTo(ox + randomWalk[2 * i] * s, oy + randomWalk[2 * i + 1] * s);
      ctx.stroke();
    }

    // The walk in colored stretches, cool at the start and warm at the end.
    var chunks = 60, per = Math.max(1, Math.ceil(D / chunks));
    ctx.lineWidth = lw;
    for (var c = 0; c * per < n; c++) {
      var a = c * per, b = Math.min(n, a + per);
      ctx.strokeStyle = V.gradient(V.SPECTRUM, a / D);
      ctx.beginPath();
      ctx.moveTo(ox + pts[2 * a] * s, oy + pts[2 * a + 1] * s);
      for (i = a + 1; i <= b; i++) ctx.lineTo(ox + pts[2 * i] * s, oy + pts[2 * i + 1] * s);
      ctx.stroke();
    }

    // Six 9s in a row, the Feynman point, starting at decimal 762.
    if (which === 'pi' && n >= 767) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = lw + 2;
      ctx.beginPath();
      ctx.moveTo(ox + pts[2 * 761] * s, oy + pts[2 * 761 + 1] * s);
      for (i = 762; i <= 767; i++) ctx.lineTo(ox + pts[2 * i] * s, oy + pts[2 * i + 1] * s);
      ctx.stroke();
      var ex = ox + pts[2 * 767] * s, ey = oy + pts[2 * 767 + 1] * s;
      ctx.font = '500 11px "IBM Plex Mono", monospace';
      ctx.fillStyle = 'rgba(10,11,16,0.8)';
      ctx.fillRect(ex + 6, ey - 8, 50, 16);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('999999', ex + 9, ey);
    }

    // Start and current position.
    ctx.fillStyle = '#ece8df';
    ctx.beginPath();
    ctx.arc(ox, oy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ox + pts[2 * n] * s, oy + pts[2 * n + 1] * s, 4, 0, Math.PI * 2);
    ctx.fill();

    compass(ctx, W - 40, H - 40, n ? ds[n - 1] : -1);
    updateReadout(ds, pts, n);
  }

  // Which way each digit points, with the latest digit lit.
  function compass(ctx, cx, cy, lit) {
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var d = 0; d < 10; d++) {
      var a = d * Math.PI / 5, c = Math.cos(a), sn = -Math.sin(a);
      ctx.strokeStyle = d === lit ? '#ffffff' : 'rgba(236,232,223,0.25)';
      ctx.lineWidth = d === lit ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + c * 18, cy + sn * 18);
      ctx.stroke();
      ctx.fillStyle = d === lit ? '#ffffff' : '#6f7286';
      ctx.fillText(String(d), cx + c * 28, cy + sn * 28);
    }
  }

  function updateReadout(ds, pts, n) {
    var head = START[which];
    for (var i = 0; i < 12; i++) head += ds[i];
    var dist = Math.hypot(pts[2 * n], pts[2 * n + 1]);
    var lines = [
      NAMES[which] + ' = ' + head + '…',
      'Step ' + n.toLocaleString() + ', ' + Math.round(dist) + ' steps from the start'
    ];
    if (which === 'r22') lines.push('Repeats every 6 digits');
    else if (which === 'r355') lines.push('Repeats every 112 digits');
    else lines.push('Random digits stray about √n = ' + Math.round(Math.sqrt(n)));
    V.setText(readout, lines.join('\n'));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    if (!playing && shown >= D) restart();
    setPlaying(!playing);
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    restart();
    setPlaying(true);
    stage.dirty = true;
  });

  V.segmented(V.ctl(section, 'number'), function (v) {
    which = v;
    restart();
    setPlaying(!V.reducedMotion);
    stage.dirty = true;
  });

  V.toggle(randomBtn, function (on) {
    showRandom = on;
    box = null;
    stage.dirty = true;
  });
})();
