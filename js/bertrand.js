// Bertrand's paradox: a chord beats the inscribed triangle's side exactly when
// its middle is within half the radius of the center. Three fair ways to pick a
// chord put that middle there with chance 1/3, 1/2 and 1/4.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('bertrand');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var methodSeg = V.ctl(section, 'method');

  var NAMES = ['Two points', 'A radius', 'A middle'];
  var EXACT = [1 / 3, 1 / 2, 1 / 4];
  var EXACT_TEXT = ['1/3', '1/2', '1/4'];
  var KEEP = 700;            // chords kept on screen per method
  var ANIMATE_BELOW = 3;     // chords per second; faster than this, skip the build-up
  var STEP_TIME = 1.6;
  var LONG = '#a78bfa';
  var SHORT = 'rgba(155,157,175,';

  var method = 0;
  var drawMode = 'chords';
  var rate = 10;
  var playing = !V.reducedMotion;
  var stepping = false;
  var kept = [[], [], []];
  var count = [0, 0, 0], longs = [0, 0, 0];
  var latest = null;         // the newest chord of the shown method, for its build-up
  var acc = 0;
  var probe = { x: 0.32, y: -0.22 };
  var changed = true;

  // A chord through midpoint (mx, my), at right angles to the radius there.
  function chordAt(mx, my, extra) {
    var d = Math.sqrt(mx * mx + my * my);
    var ux = d > 1e-9 ? -my / d : 1, uy = d > 1e-9 ? mx / d : 0;
    var h = Math.sqrt(Math.max(0, 1 - d * d));
    return {
      x1: mx - ux * h, y1: my - uy * h, x2: mx + ux * h, y2: my + uy * h,
      mx: mx, my: my, d: d, long: d < 0.5, extra: extra
    };
  }

  function randomChord(m) {
    var t, r;
    if (m === 0) {
      var a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI * 2;
      var ax = Math.cos(a), ay = Math.sin(a), bx = Math.cos(b), by = Math.sin(b);
      var mx = (ax + bx) / 2, my = (ay + by) / 2;
      return {
        x1: ax, y1: ay, x2: bx, y2: by, mx: mx, my: my,
        d: Math.sqrt(mx * mx + my * my), long: Math.sqrt(mx * mx + my * my) < 0.5, extra: null
      };
    }
    t = Math.random() * Math.PI * 2;
    if (m === 1) {
      r = Math.random();
      return chordAt(r * Math.cos(t), r * Math.sin(t), { rx: Math.cos(t), ry: Math.sin(t) });
    }
    r = Math.sqrt(Math.random());   // even spread over the disk's area
    return chordAt(r * Math.cos(t), r * Math.sin(t), null);
  }

  // One chord for every method, so all three bars fill at the same pace.
  function addChords() {
    for (var m = 0; m < 3; m++) {
      var c = randomChord(m);
      count[m]++;
      if (c.long) longs[m]++;
      kept[m].push(c);
      if (kept[m].length > KEEP) kept[m].shift();
      if (m === method) latest = c;
    }
    if (latest) latest.t = 0;
    changed = true;
  }

  function clearAll() {
    kept = [[], [], []];
    count = [0, 0, 0];
    longs = [0, 0, 0];
    latest = null;
    acc = 0;
    changed = true;
  }

  function frame(dt, st) {
    if (stepping) {
      if (!latest || latest.t >= 1) {
        stepping = false;
      } else {
        latest.t = Math.min(1, latest.t + dt / STEP_TIME);
        changed = true;
      }
    } else if (playing) {
      if (rate < ANIMATE_BELOW) {
        if (!latest || latest.t >= 1) addChords();
        latest.t = Math.min(1, latest.t + dt * rate);
        changed = true;
      } else {
        acc = Math.min(acc + dt * rate, 60);
        var n = Math.floor(acc);
        acc -= n;
        for (var i = 0; i < n; i++) addChords();
        if (latest) latest.t = 1;
      }
    }
    if (!changed && !st.dirty) return;
    changed = false;
    st.dirty = false;
    draw(st);
  }

  function layout(st) {
    var W = st.width, H = st.height;
    if (W / H >= 1.15) {
      var R = Math.min(H / 2 - 46, W * 0.3);
      return {
        W: W, H: H, cx: W * 0.34, cy: H / 2 + 16, R: R,
        bx: W * 0.67, bw: W * 0.33 - 22, by: H / 2 - 74, row: 64, wide: true
      };
    }
    var Rn = Math.min(W / 2 - 24, (H - 64 - 104) / 2);
    return {
      W: W, H: H, cx: W / 2, cy: 64 + Rn, R: Rn,
      bx: 16, bw: W - 32, by: 64 + 2 * Rn + 14, row: Math.min(32, (H - 64 - 2 * Rn - 18) / 3), wide: false
    };
  }

  function draw(st) {
    var ctx = st.ctx, L = layout(st), i, c;
    ctx.clearRect(0, 0, L.W, L.H);
    function X(x) { return L.cx + x * L.R; }
    function Y(y) { return L.cy - y * L.R; }

    // Kept chords or their middles: short ones underneath, long ones on top.
    var list = kept[method];
    var shown = list.length - (latest && latest.t < 1 ? 1 : 0);
    var alpha = drawMode === 'chords' ? Math.max(0.07, Math.min(0.5, 14 / Math.max(1, shown))) : 0.75;
    for (var pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? LONG : SHORT + '1)';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.globalAlpha = drawMode === 'chords' ? alpha * (pass ? 1.6 : 1) : alpha;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (i = 0; i < shown; i++) {
        c = list[i];
        if (c.long !== (pass === 1)) continue;
        if (drawMode === 'chords') {
          ctx.moveTo(X(c.x1), Y(c.y1));
          ctx.lineTo(X(c.x2), Y(c.y2));
        } else {
          ctx.moveTo(X(c.mx) + 1.8, Y(c.my));
          ctx.arc(X(c.mx), Y(c.my), 1.8, 0, Math.PI * 2);
        }
      }
      if (drawMode === 'chords') ctx.stroke(); else ctx.fill();
    }
    ctx.globalAlpha = 1;

    // The circle, its triangle, and the circle of half the radius.
    ctx.strokeStyle = 'rgba(236,232,223,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(L.cx, L.cy, L.R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236,232,223,0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (i = 0; i <= 3; i++) {
      var a = Math.PI / 2 + i * Math.PI * 2 / 3;
      if (i) ctx.lineTo(X(Math.cos(a)), Y(Math.sin(a))); else ctx.moveTo(X(Math.cos(a)), Y(Math.sin(a)));
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(167,139,250,0.85)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(L.cx, L.cy, L.R / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (latest && method === methodOf(latest)) drawLatest(ctx, L, X, Y);
    drawProbe(ctx, L, X, Y);
    drawBars(ctx, L);

    var pc = chordAt(probe.x, probe.y, null);
    var ratio = 2 * Math.sqrt(1 - pc.d * pc.d) / Math.sqrt(3);
    V.setText(readout, count[method].toLocaleString() + ' chords each way\n' +
      'White chord: ' + Math.round(ratio * 100) + '% of the side');
  }

  function methodOf(c) {
    for (var m = 0; m < 3; m++) if (kept[m].length && kept[m][kept[m].length - 1] === c) return m;
    return -1;
  }

  // The newest chord, built up step by step at slow speeds.
  function drawLatest(ctx, L, X, Y) {
    var c = latest, t = c.t;
    var build = Math.min(1, t / 0.45), grow = V.easeInOut(Math.max(0, Math.min(1, (t - 0.4) / 0.4)));
    var color = c.long ? LONG : '#c4c1ba';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    if (method === 0) {
      [[c.x1, c.y1], [c.x2, c.y2]].forEach(function (q, i) {
        if (build < (i ? 0.5 : 0.01)) return;
        ctx.beginPath();
        ctx.arc(X(q[0]), Y(q[1]), 4, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (method === 1) {
      var e = Math.min(1, build * 1.4);
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo(X(c.extra.rx * e), Y(c.extra.ry * e));
      ctx.stroke();
      if (build >= 0.7) {
        ctx.beginPath();
        ctx.arc(X(c.mx), Y(c.my), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (build > 0.2) {
      ctx.beginPath();
      ctx.arc(X(c.mx), Y(c.my), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (grow > 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(X(c.mx + (c.x1 - c.mx) * grow), Y(c.my + (c.y1 - c.my) * grow));
      ctx.lineTo(X(c.mx + (c.x2 - c.mx) * grow), Y(c.my + (c.y2 - c.my) * grow));
      ctx.stroke();
    }
  }

  // The chord you control, through the white handle.
  function drawProbe(ctx, L, X, Y) {
    var c = chordAt(probe.x, probe.y, null);
    ctx.strokeStyle = '#ece8df';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(X(c.x1), Y(c.y1));
    ctx.lineTo(X(c.x2), Y(c.y2));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236,232,223,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    ctx.lineTo(X(probe.x), Y(probe.y));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(X(probe.x), Y(probe.y), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c.long ? LONG : '#6f7286';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(X(probe.x), Y(probe.y), 9, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawBars(ctx, L) {
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    if (L.wide) {
      ctx.fillStyle = '#9b9daf';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Longer than the side', L.bx, L.by - 18);
    }
    for (var m = 0; m < 3; m++) {
      var y = L.by + m * L.row, on = m === method;
      var share = count[m] ? longs[m] / count[m] : 0;
      var barY = y + (L.wide ? 20 : 15), barH = L.wide ? 12 : 8;
      ctx.globalAlpha = on ? 1 : 0.55;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillStyle = on ? '#ece8df' : '#9b9daf';
      ctx.fillText(NAMES[m] + '  ' + EXACT_TEXT[m], L.bx, y + 11);
      ctx.textAlign = 'right';
      ctx.fillStyle = LONG;
      ctx.fillText(count[m] ? (share * 100).toFixed(1) + '%' : '–', L.bx + L.bw, y + 11);
      ctx.fillStyle = 'rgba(236,232,223,0.07)';
      ctx.fillRect(L.bx, barY, L.bw, barH);
      ctx.fillStyle = LONG;
      ctx.fillRect(L.bx, barY, L.bw * share, barH);
      var ex = Math.round(L.bx + L.bw * EXACT[m]) + 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ex, barY - 3);
      ctx.lineTo(ex, barY + barH + 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  var stage = V.createStage(canvas, { frame: frame });

  // Drag the white handle, kept inside the circle.
  V.drag(canvas, {
    hit: function (x, y) {
      var L = layout(stage);
      var hx = L.cx + probe.x * L.R, hy = L.cy - probe.y * L.R;
      return (x - hx) * (x - hx) + (y - hy) * (y - hy) < 22 * 22 ? 'probe' : null;
    },
    move: function (h, x, y) {
      var L = layout(stage);
      var px = (x - L.cx) / L.R, py = (L.cy - y) / L.R, d = Math.sqrt(px * px + py * py);
      if (d > 0.98) {
        px *= 0.98 / d;
        py *= 0.98 / d;
      }
      probe.x = px;
      probe.y = py;
      changed = true;
    }
  });

  // Clicking a bar shows that method.
  canvas.addEventListener('click', function (e) {
    var r = canvas.getBoundingClientRect(), L = layout(stage);
    var x = e.clientX - r.left, y = e.clientY - r.top;
    if (x < L.bx - 4 || x > L.bx + L.bw + 4) return;
    var m = Math.floor((y - L.by + 4) / L.row);
    if (m >= 0 && m < 3 && y >= L.by - 4) setMethod(m);
  });

  // ---- Controls ----

  function setMethod(m) {
    method = m;
    V.setSegmented(methodSeg, String(m));
    latest = kept[m].length ? kept[m][kept[m].length - 1] : null;
    if (latest) latest.t = 1;
    changed = true;
  }

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    stepping = false;
    setPlaying(!playing);
  });

  V.ctl(section, 'one').addEventListener('click', function () {
    setPlaying(false);
    addChords();
    stepping = true;
  });

  V.ctl(section, 'reset').addEventListener('click', clearAll);

  V.segmented(methodSeg, function (v) { setMethod(parseInt(v, 10)); });

  V.segmented(V.ctl(section, 'draw'), function (v) {
    drawMode = v;
    changed = true;
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) {
      var r = Math.pow(10, v);
      return (r < 10 ? r.toFixed(1) : Math.round(r).toLocaleString()) + ' chords / second';
    },
    function (v) { rate = Math.pow(10, v); });

})();
