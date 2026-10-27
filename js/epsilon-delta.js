// The limit as a game: for every tolerance ε there must be a window δ so that
// 0 < |x − a| < δ puts f(x) within ε of L. The game scans outward from a for
// the first x that misses the band; if one turns up at every scale, no δ exists.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('epsilon-delta');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var epsInput = V.ctl(section, 'eps');
  var epsOut = V.ctl(section, 'eps-out');
  var playBtn = V.ctl(section, 'play');
  var zoomBtn = V.ctl(section, 'zoom');

  var STEPS = [0.8, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];
  var HOLD = 1.7;
  var SAMPLES = 3000;
  var TINY = 1e-7;

  var FUNCS = {
    sinc: {
      f: function (x) { return Math.sin(x) / x; }, a: 0, L: 1, hw: 8, hh: 1.4, hole: 1
    },
    wiggle: {
      f: function (x) { return x * Math.sin(1 / x); }, a: 0, L: 0, hw: 0.5, hh: 0.45, hole: 0
    },
    jump: {
      // Defined as the right-hand piece at x = 1 itself.
      f: function (x) { return x >= 1 ? 0.5 * x + 1 : 0.5 * x; }, a: 1, L: 1, hw: 2, hh: 1.4,
      jump: [0.5, 1.5]
    },
    osc: {
      f: function (x) { return Math.sin(1 / x); }, a: 0, L: 0, hw: 0.5, hh: 1.4
    }
  };

  var fn = FUNCS.sinc;
  var L = fn.L;
  var eps = 0.8;
  var delta = null;     // null when no window works
  var zoom = true;
  var playing = !V.reducedMotion;
  var playT = 0;
  var stepIdx = -1;
  var probeT = 0;
  var view = { hx: fn.hw, hy: fn.hh, cy: fn.L };
  var draggingL = false;
  var G = null;

  // Scan outward on each side from just next to a; the window ends just
  // before the first point that misses the band.
  function findDelta() {
    var dmax = fn.hw, dmin = dmax * TINY, best = dmax;
    var ratio = Math.pow(dmax / dmin, 1 / SAMPLES);
    for (var side = -1; side <= 1; side += 2) {
      var d = dmin, prev = 0;
      for (var i = 0; i <= SAMPLES; i++, d *= ratio) {
        var y = fn.f(fn.a + side * d);
        if (!(Math.abs(y - L) < eps)) break;
        prev = d;
      }
      best = Math.min(best, prev);
    }
    delta = best < dmax * 1e-5 ? null : Math.min(dmax, best) * (best >= dmax ? 1 : 0.95);
  }

  function frame(dt, st) {
    if (playing) {
      playT += dt;
      var i = Math.floor(playT / HOLD) % STEPS.length;
      if (i !== stepIdx) {
        stepIdx = i;
        setEps(STEPS[i], false);
      }
    }
    if (!delta && !V.reducedMotion) {
      probeT += dt;
      st.dirty = true;
    }

    // Glide the view toward the box the game is playing in.
    var tx = fn.hw, ty = fn.hh, tc = fn.L;
    // Only zoom while there's a window to look at; a failure is clearest
    // from far away.
    if (zoom && delta) {
      ty = Math.min(fn.hh, Math.max(eps * 2.6, Math.abs(L - fn.L) + eps * 1.6));
      tx = Math.min(fn.hw, delta * 2.6);
      if (ty < fn.hh) tc = L;
    }
    if (!draggingL) {
      var k = 1 - Math.exp(-dt * 5);
      var nx = Math.exp(Math.log(view.hx) + (Math.log(tx) - Math.log(view.hx)) * k);
      var ny = Math.exp(Math.log(view.hy) + (Math.log(ty) - Math.log(view.hy)) * k);
      var nc = view.cy + (tc - view.cy) * k;
      if (Math.abs(nx / view.hx - 1) + Math.abs(ny / view.hy - 1) + Math.abs(nc - view.cy) / view.hy > 1e-4) {
        view.hx = nx;
        view.hy = ny;
        view.cy = nc;
        st.dirty = true;
      }
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    var a = fn.a, hx = view.hx, hy = view.hy, cy = view.cy;
    var pad = 12;
    function X(x) { return W / 2 + (x - a) / hx * (W / 2 - pad); }
    function Y(y) { return H / 2 - (y - cy) / hy * (H / 2 - pad); }
    function inv(px) { return a + (px - W / 2) / (W / 2 - pad) * hx; }
    G = { Y: Y, invY: function (py) { return cy - (py - H / 2) / (H / 2 - pad) * hy; }, knobX: W - pad - 16 };

    ctx.clearRect(0, 0, W, H);

    // The skeptic's band, L ± ε.
    var bt = Y(L + eps), bb = Y(L - eps);
    ctx.fillStyle = 'rgba(255,95,162,0.13)';
    ctx.fillRect(0, bt, W, bb - bt);
    ctx.strokeStyle = 'rgba(255,95,162,0.55)';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(bt) + 0.5);
    ctx.lineTo(W, Math.round(bt) + 0.5);
    ctx.moveTo(0, Math.round(bb) + 0.5);
    ctx.lineTo(W, Math.round(bb) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    // Our window, a ± δ. With no answer, a probe keeps shrinking and failing.
    var d = delta, probing = false;
    if (!d) {
      probing = true;
      d = hx * 0.45 * Math.pow(0.5, (probeT * 1.4) % 6);
    }
    var wl = X(a - d), wr = X(a + d);
    ctx.fillStyle = probing ? 'rgba(236,232,223,0.05)' : 'rgba(236,232,223,0.08)';
    ctx.fillRect(wl, 0, wr - wl, H);
    ctx.strokeStyle = 'rgba(236,232,223,0.4)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(Math.round(wl) + 0.5, 0);
    ctx.lineTo(Math.round(wl) + 0.5, H);
    ctx.moveTo(Math.round(wr) + 0.5, 0);
    ctx.lineTo(Math.round(wr) + 0.5, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = probing ? 'rgba(255,95,162,0.8)' : '#7ee0a1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(wl, bt, wr - wl, bb - bt);

    // Axes, if they're in view.
    ctx.strokeStyle = 'rgba(236,232,223,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    var y0 = Y(0), x0 = X(0);
    if (y0 > 0 && y0 < H) { ctx.moveTo(0, Math.round(y0) + 0.5); ctx.lineTo(W, Math.round(y0) + 0.5); }
    if (x0 > 0 && x0 < W) { ctx.moveTo(Math.round(x0) + 0.5, 0); ctx.lineTo(Math.round(x0) + 0.5, H); }
    ctx.stroke();

    // The curve: plain outside the window, green where it stays in the band,
    // pink where it escapes.
    var plain = new Path2D(), good = new Path2D(), bad = new Path2D();
    var px, lastPx = null, lastPy = 0, lastX = 0, lastY = 0, f = fn.f;
    for (px = 0; px <= W; px += 1) {
      var x = inv(px), y = f(x);
      if (!isFinite(y)) { lastPx = null; continue; }
      var py = Math.max(-20, Math.min(H + 20, Y(y)));
      // Don't join the two sides of a jump.
      if (lastPx !== null && !(fn.jump && (x - a) * (lastX - a) <= 0)) {
        var xm = (x + lastX) / 2, ym = (y + lastY) / 2;
        var path = Math.abs(xm - a) < d ? (Math.abs(ym - L) < eps ? good : bad) : plain;
        path.moveTo(lastPx, lastPy);
        path.lineTo(px, py);
      }
      lastPx = px;
      lastPy = py;
      lastX = x;
      lastY = y;
    }
    // Bevel joins: the wild wiggles of sin(1/x) make round joins expensive.
    ctx.lineJoin = 'bevel';
    ctx.lineCap = 'butt';
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(236,232,223,0.85)';
    ctx.stroke(plain);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#7ee0a1';
    ctx.stroke(good);
    ctx.strokeStyle = '#ff5fa2';
    ctx.stroke(bad);

    // Holes and the jump's endpoints.
    function dot(x, y, filled) {
      ctx.beginPath();
      ctx.arc(X(x), Y(y), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = filled ? '#ece8df' : '#0d0f16';
      ctx.fill();
      ctx.strokeStyle = '#ece8df';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (fn.hole !== undefined) dot(a, fn.hole, false);
    if (fn.jump) {
      dot(a, fn.jump[0], false);
      dot(a, fn.jump[1], true);
    }

    // L, with a knob on the right to drag.
    var ly = Y(L);
    ctx.strokeStyle = 'rgba(255,95,162,0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(ly) + 0.5);
    ctx.lineTo(W, Math.round(ly) + 0.5);
    ctx.stroke();
    ctx.fillStyle = '#ff5fa2';
    ctx.strokeStyle = '#0a0b10';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(G.knobX, ly, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = '#0a0b10';
    ctx.font = '600 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('L', G.knobX, ly + 0.5);

    // How far in we've zoomed.
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    var scale = 'view: x ' + short(a - hx) + ' to ' + short(a + hx) + ', y ' + short(cy - hy) + ' to ' + short(cy + hy);
    var sw = ctx.measureText(scale).width;
    ctx.fillStyle = 'rgba(13,15,22,0.85)';
    ctx.fillRect(W - pad - sw - 6, H - 26, sw + 12, 20);
    ctx.fillStyle = '#6f7286';
    ctx.fillText(scale, W - pad, H - 10);

    V.setText(readout,
      'L = ' + num(L) + ', ε = ' + num(eps) + '\n' +
      (delta ? 'δ = ' + num(delta) + ' works' + (delta >= fn.hw ? ' (so does any δ)' : '') : 'No δ works') + '\n' +
      (delta ? 'Inside the window, f stays in the band' : 'Some x right next to ' + num(a, 0) + ' always escape'));
  }

  function num(v, d) {
    if (d === undefined) d = Math.abs(v) >= 0.0995 || v === 0 ? 3 : Math.abs(v) >= 0.00995 ? 4 : 5;
    var t = Math.abs(v).toFixed(d);
    return (v < 0 && parseFloat(t) !== 0 ? '−' : '') + t;
  }

  function short(v) {
    var m = Math.abs(v);
    var t = m >= 10 ? m.toFixed(1) : m >= 0.1 ? m.toFixed(2) : m >= 0.001 ? m.toPrecision(2) : m.toExponential(0);
    return (v < 0 && parseFloat(t) !== 0 ? '−' : '') + t;
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Drag L ----

  V.drag(canvas, {
    cursor: 'ns-resize',
    hit: function (x, y) {
      if (!G) return null;
      return Math.abs(x - G.knobX) < 20 && Math.abs(y - G.Y(L)) < 20 ? {} : null;
    },
    move: function (h, x, y) {
      setPlaying(false);
      draggingL = true;
      L = G.invY(y);
      findDelta();
      stage.dirty = true;
    },
    end: function () {
      draggingL = false;
    }
  });

  // ---- Controls ----

  function setEps(v, fromInput) {
    eps = v;
    if (!fromInput) epsInput.value = (Math.log(v) / Math.LN10).toFixed(2);
    epsOut.textContent = num(v);
    findDelta();
    probeT = 0;
    stage.dirty = true;
  }

  epsInput.addEventListener('input', function () {
    setPlaying(false);
    setEps(Math.pow(10, parseFloat(epsInput.value)), true);
  });

  function setPlaying(on) {
    if (on && !playing) {
      var i = 0;
      while (i < STEPS.length - 1 && STEPS[i] > eps * 1.001) i++;
      playT = i * HOLD;
      stepIdx = i;
    }
    playing = on;
    playBtn.textContent = on ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.toggle(zoomBtn, function (on) {
    zoom = on;
    stage.dirty = true;
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    L = fn.L;
    findDelta();
    stage.dirty = true;
  });

  V.segmented(V.ctl(section, 'func'), function (v) {
    fn = FUNCS[v];
    L = fn.L;
    view = { hx: fn.hw, hy: fn.hh, cy: fn.L };
    findDelta();
    stage.dirty = true;
  });

  setEps(eps, false);
})();
