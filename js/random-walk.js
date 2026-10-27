// Pólya's recurrence: walkers step to a random lattice neighbor. On a line or
// a flat grid every walker comes home eventually; on a 3D lattice only ~34% do.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('random-walk');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var WALKERS = 200;
  var MAX_STEPS = 100000;
  var DECADES = 5;
  var MIN_RATE = 4;          // steps per second at the very start
  var SMOOTH_BELOW = 12;     // steps per second; slower than this, glide between sites
  var TRAIL_POINTS = 3000;   // most vertices of walker 1's trail drawn per frame
  var MAX_PER_FRAME = 2000;  // steps per walker per frame, to keep frames short
  var WANDER = '#6ee7ff';
  var HOME = '#ffb454';

  // Exact chance of having been home within n steps, from the renewal
  // equation u(n) = sum f(k) u(n - k), worked out offline for n up to 10^5.
  var EXACT_N = [2, 4, 6, 8, 10, 14, 18, 22, 30, 40, 52, 68, 88, 116, 152, 198, 260, 340,
    446, 586, 768, 1006, 1318, 1728, 2264, 2968, 3890, 5100, 6684, 8760, 11482, 15048,
    19724, 25852, 33884, 44412, 58210, 76296, 100000];
  var EXACT = {
    1: [0.5, 0.625, 0.6875, 0.7266, 0.7539, 0.7905, 0.8145, 0.8318, 0.8555, 0.8746, 0.8899,
      0.9036, 0.9152, 0.9261, 0.9354, 0.9434, 0.9506, 0.9568, 0.9622, 0.9671, 0.9712, 0.9749,
      0.978, 0.9808, 0.9832, 0.9854, 0.9872, 0.9888, 0.9902, 0.9915, 0.9926, 0.9935, 0.9943,
      0.995, 0.9957, 0.9962, 0.9967, 0.9971, 0.9975],
    2: [0.25, 0.3281, 0.3711, 0.3997, 0.4208, 0.4505, 0.4713, 0.4869, 0.5097, 0.5293, 0.546,
      0.562, 0.5764, 0.5909, 0.6042, 0.6165, 0.6284, 0.6395, 0.65, 0.6601, 0.6695, 0.6784,
      0.6869, 0.6949, 0.7026, 0.7099, 0.7168, 0.7235, 0.7298, 0.7358, 0.7416, 0.7472, 0.7525,
      0.7576, 0.7625, 0.7672, 0.7717, 0.7761, 0.7803],
    3: [0.1667, 0.2083, 0.2297, 0.2432, 0.2528, 0.2657, 0.2741, 0.2803, 0.2887, 0.2955, 0.301,
      0.3059, 0.3101, 0.314, 0.3173, 0.3202, 0.3228, 0.325, 0.327, 0.3287, 0.3302, 0.3315,
      0.3326, 0.3336, 0.3345, 0.3353, 0.3359, 0.3365, 0.337, 0.3375, 0.3379, 0.3382, 0.3385,
      0.3388, 0.339, 0.3392, 0.3393, 0.3395, 0.3396]
  };
  // Where the share ends up after forever. 0.3405 is Pólya's constant for 3D.
  var LIMIT = { 1: 1, 2: 1, 3: 0.3405 };

  var dim = 2;
  var tenfold = 2.5;         // seconds for 10× more steps
  var playing = !V.reducedMotion;
  var n = 0, acc = 0, rate = 0;
  var pos = new Int32Array(WALKERS * 3);
  var prev = new Int32Array(WALKERS * 3);
  var home = new Uint8Array(WALKERS);
  var homeCount = 0, visits = 0;
  var trail = null;          // walker 1's path, allocated on first use
  var checkN = [], checkS = [], nextCheck = 1;
  var extent = 5;
  var yaw = 0.7, pitch = 0.5, spinning = !V.reducedMotion, grab = null;
  var changed = true;

  function reset() {
    if (!trail) trail = new Int16Array(3 * (MAX_STEPS + 1));
    n = 0;
    acc = 0;
    pos.fill(0);
    prev.fill(0);
    home.fill(0);
    homeCount = 0;
    visits = 0;
    checkN = [0];
    checkS = [0];
    nextCheck = 1;
    extent = 5;
    changed = true;
  }

  // Take m more steps with every walker, saving a chart point about every 1%.
  function walk(m) {
    m = Math.min(m, MAX_STEPS - n);
    var sides = 2 * dim;
    prev.set(pos);
    while (m > 0) {
      var chunk = Math.min(m, nextCheck - n);
      for (var w = 0; w < WALKERS; w++) {
        var o = w * 3, x = pos[o], y = pos[o + 1], z = pos[o + 2], h = home[w];
        for (var i = 0; i < chunk; i++) {
          var r = Math.random() * sides | 0;
          var s = (r & 1) ? 1 : -1;
          if (r < 2) x += s; else if (r < 4) y += s; else z += s;
          if (x === 0 && y === 0 && z === 0) {
            h = 1;
            if (w === 0) visits++;
          }
          if (w === 0) {
            var t = (n + i + 1) * 3;
            trail[t] = x;
            trail[t + 1] = y;
            trail[t + 2] = z;
          }
        }
        pos[o] = x;
        pos[o + 1] = y;
        pos[o + 2] = z;
        if (h && !home[w]) {
          home[w] = 1;
          homeCount++;
        }
      }
      n += chunk;
      m -= chunk;
      if (n >= nextCheck || n === MAX_STEPS) {
        checkN.push(n);
        checkS.push(homeCount / WALKERS);
        nextCheck = Math.max(n + 1, Math.ceil(n * 1.01));
      }
    }
    changed = true;
  }

  // Grow the step count by a steady factor per second, so the chart line
  // moves across its log axis at an even pace.
  function grow(dt) {
    return Math.max(MIN_RATE * dt, n * (Math.pow(10, dt / tenfold) - 1));
  }

  function frame(dt, st) {
    if (playing) {
      var g = grow(dt);
      rate = dt ? g / dt : 0;
      acc = Math.min(acc + g, MAX_PER_FRAME);
      var m = Math.floor(acc);
      acc -= m;
      if (m > 0) walk(m);
      if (rate < SMOOTH_BELOW) changed = true;
      if (n >= MAX_STEPS) setPlaying(false);
    }
    if (dim === 3 && spinning && !grab) {
      yaw += dt * 0.25;
      changed = true;
    }

    // Zoom out as the crowd spreads: each coordinate wanders about √(n / d).
    var want = Math.max(5, 2.6 * Math.sqrt(Math.max(n, 1) / dim));
    for (var k = 0; k < dim; k++) want = Math.max(want, Math.abs(pos[k]) * 1.08 + 1);
    if (Math.abs(want - extent) > 0.01) {
      extent += (want - extent) * Math.min(1, dt * 4);
      changed = true;
    }

    if (!changed && !st.dirty) return;
    changed = false;
    st.dirty = false;
    draw(st);
  }

  function layout(st) {
    var W = st.width, H = st.height;
    var picBottom = Math.round(H * 0.6), narrow = W < 480;
    return {
      W: W, H: H, picBottom: picBottom, narrow: narrow,
      cx: W / 2 + (narrow && dim > 1 ? 34 : 0), cy: picBottom / 2 + (narrow ? 14 : 6),
      half: Math.min(W / 2 - 20, picBottom / 2 - 8),
      left: 14, right: W - 46, top: picBottom + 30, bottom: H - 26
    };
  }

  // Fraction of the way through the current step, for gliding at slow speeds.
  function glide() {
    if (!playing || rate >= SMOOTH_BELOW) return 1;
    return V.easeInOut(Math.min(1, acc * 1.6));
  }

  function draw(st) {
    var ctx = st.ctx, L = layout(st);
    ctx.clearRect(0, 0, L.W, L.H);
    drawWalk(ctx, L);
    drawChart(ctx, L);
    updateReadout(L.narrow);
  }

  function drawWalk(ctx, L) {
    var f = glide(), w, o, x, y, z;
    function at(w, c) {
      var o = w * 3 + c;
      return prev[o] + (pos[o] - prev[o]) * f;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, L.W, L.picBottom);
    ctx.clip();

    if (dim === 1) {
      var sx = (L.W / 2 - 24) / extent;
      var bandH = L.picBottom - 96;
      var top = L.cy - bandH / 2;
      // Integer sites, when they're far enough apart to see.
      ctx.strokeStyle = 'rgba(236,232,223,0.07)';
      ctx.lineWidth = 1;
      if (sx >= 7) {
        ctx.beginPath();
        for (var i = -Math.ceil(extent); i <= extent; i++) {
          var gx = Math.round(L.cx + i * sx) + 0.5;
          ctx.moveTo(gx, top);
          ctx.lineTo(gx, top + bandH);
        }
        ctx.stroke();
      }
      homeMark(ctx, L.cx, top - 14, top + bandH + 6);
      for (w = WALKERS - 1; w >= 0; w--) {
        // Walker 1 runs down the middle lane.
        var lane = w === 0 ? 0.5 : ((w * 0.618034) % 1);
        dot(ctx, L.cx + at(w, 0) * sx, top + lane * bandH, w);
      }
    } else if (dim === 2) {
      var s = L.half / extent;
      if (s >= 9) {
        ctx.strokeStyle = 'rgba(236,232,223,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        var lim = Math.ceil(extent) + 1;
        for (var g = -lim; g <= lim; g++) {
          var p = Math.round(L.cx + g * s) + 0.5, q = Math.round(L.cy - g * s) + 0.5;
          ctx.moveTo(p, 0);
          ctx.lineTo(p, L.picBottom);
          ctx.moveTo(0, q);
          ctx.lineTo(L.W, q);
        }
        ctx.stroke();
      }
      drawTrail(ctx, f, function (x, y) { return [L.cx + x * s, L.cy - y * s]; });
      homeRing(ctx, L.cx, L.cy);
      for (w = WALKERS - 1; w >= 0; w--) dot(ctx, L.cx + at(w, 0) * s, L.cy - at(w, 1) * s, w);
    } else {
      var s3 = L.half / extent * 0.82;
      var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      var proj = function (x, y, z) {
        var x1 = x * cy - y * sy, y1 = x * sy + y * cy;
        var depth = y1 * cp + z * sp;
        var k = 1 / (1 + depth / extent * 0.18);
        return [L.cx + x1 * s3 * k, L.cy - (z * cp - y1 * sp) * s3 * k];
      };
      // A box around the crowd and three axes through home, for depth.
      var e = extent;
      ctx.strokeStyle = 'rgba(236,232,223,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      [[-1, -1, -1, 1, -1, -1], [-1, 1, -1, 1, 1, -1], [-1, -1, 1, 1, -1, 1], [-1, 1, 1, 1, 1, 1],
        [-1, -1, -1, -1, 1, -1], [1, -1, -1, 1, 1, -1], [-1, -1, 1, -1, 1, 1], [1, -1, 1, 1, 1, 1],
        [-1, -1, -1, -1, -1, 1], [1, -1, -1, 1, -1, 1], [-1, 1, -1, -1, 1, 1], [1, 1, -1, 1, 1, 1]]
        .forEach(function (c) {
          var a = proj(c[0] * e, c[1] * e, c[2] * e), b = proj(c[3] * e, c[4] * e, c[5] * e);
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
        });
      ctx.stroke();
      ctx.strokeStyle = 'rgba(236,232,223,0.16)';
      ctx.beginPath();
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(function (a) {
        var p1 = proj(-a[0] * e, -a[1] * e, -a[2] * e), p2 = proj(a[0] * e, a[1] * e, a[2] * e);
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
      });
      ctx.stroke();
      drawTrail(ctx, f, proj);
      var c0 = proj(0, 0, 0);
      homeRing(ctx, c0[0], c0[1]);
      for (w = WALKERS - 1; w >= 0; w--) {
        var pp = proj(at(w, 0), at(w, 1), at(w, 2));
        dot(ctx, pp[0], pp[1], w);
      }
    }
    ctx.restore();
  }

  // Walker 1's path so far, thinned out so a long walk stays cheap to draw.
  function drawTrail(ctx, f, proj) {
    if (!n) return;
    var stride = Math.max(1, Math.ceil(n / TRAIL_POINTS));
    ctx.strokeStyle = 'rgba(236,232,223,0.32)';
    ctx.lineWidth = 1.2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    var p = proj(0, 0, 0);
    ctx.moveTo(p[0], p[1]);
    var last = f < 1 ? n - 1 : n;
    for (var i = stride; i <= last; i += stride) {
      p = proj(trail[i * 3], trail[i * 3 + 1], trail[i * 3 + 2]);
      ctx.lineTo(p[0], p[1]);
    }
    p = proj(prev[0] + (pos[0] - prev[0]) * f, prev[1] + (pos[1] - prev[1]) * f,
      prev[2] + (pos[2] - prev[2]) * f);
    ctx.lineTo(p[0], p[1]);
    ctx.stroke();
  }

  function dot(ctx, x, y, w) {
    ctx.fillStyle = home[w] ? HOME : WANDER;
    ctx.globalAlpha = home[w] ? 0.85 : 0.9;
    ctx.beginPath();
    ctx.arc(x, y, w === 0 ? 4 : 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (w === 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 6.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function homeRing(ctx, x, y) {
    ctx.strokeStyle = 'rgba(255,180,84,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = HOME;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('home', x + 13, y - 10);
  }

  function homeMark(ctx, x, y0, y1) {
    ctx.strokeStyle = 'rgba(255,180,84,0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, y0 + 8);
    ctx.lineTo(Math.round(x) + 0.5, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = HOME;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('home', x, y0 + 4);
  }

  function xOf(L, k) {
    return L.left + Math.log(Math.max(k, 1)) / Math.LN10 / DECADES * (L.right - L.left);
  }

  function shortCount(k) {
    return k >= 1e3 ? k / 1e3 + 'k' : String(k);
  }

  function drawChart(ctx, L) {
    var plotH = L.bottom - L.top;
    function yOf(s) { return L.bottom - s * plotH; }
    var i;

    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#9b9daf';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Share of walkers that have been home', L.left, L.top - 8);

    ctx.lineWidth = 1;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    for (var d = 0; d <= DECADES; d++) {
      var gx = Math.round(xOf(L, Math.pow(10, d))) + 0.5;
      ctx.strokeStyle = 'rgba(236,232,223,0.07)';
      ctx.beginPath();
      ctx.moveTo(gx, L.top);
      ctx.lineTo(gx, L.bottom);
      ctx.stroke();
      ctx.fillStyle = '#6f7286';
      ctx.fillText(shortCount(Math.pow(10, d)), gx, L.bottom + 8);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    [0, 0.5, 1].forEach(function (t) {
      var ty = Math.round(yOf(t)) + 0.5;
      ctx.strokeStyle = 'rgba(236,232,223,0.07)';
      ctx.beginPath();
      ctx.moveTo(L.left, ty);
      ctx.lineTo(L.right, ty);
      ctx.stroke();
      if (dim === 3 || t !== 1) {
        ctx.fillStyle = '#6f7286';
        ctx.fillText(Math.round(t * 100) + '%', L.right + 8, ty);
      }
    });

    // Where the share ends up after forever.
    var ly = Math.round(yOf(LIMIT[dim])) + 0.5;
    ctx.strokeStyle = 'rgba(255,180,84,0.6)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(L.left, ly);
    ctx.lineTo(L.right, ly);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = HOME;
    ctx.fillText(dim === 3 ? '34%' : '100%', L.right + 8, ly);
    if (dim === 3) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('in the end, only 34%', L.right - 4, ly - 4);
    } else {
      ctx.textBaseline = 'top';
      ctx.fillText('in the end, everyone', L.left + 4, ly + 5);
    }

    // The exact share, interpolated on the log axis between table points.
    var ex = EXACT[dim];
    ctx.strokeStyle = 'rgba(236,232,223,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xOf(L, 1), yOf(0));
    ctx.lineTo(xOf(L, 2), yOf(0));
    for (i = 0; i < EXACT_N.length; i++) ctx.lineTo(xOf(L, EXACT_N[i]), yOf(ex[i]));
    ctx.stroke();

    // What the 200 walkers here have done.
    if (n) {
      ctx.strokeStyle = HOME;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (i = 1; i < checkN.length; i++) {
        var px = xOf(L, checkN[i]), py = yOf(checkS[i]);
        if (i > 1) ctx.lineTo(px, py); else ctx.moveTo(xOf(L, 1), py);
      }
      ctx.lineTo(xOf(L, n), yOf(homeCount / WALKERS));
      ctx.stroke();
      ctx.fillStyle = HOME;
      ctx.beginPath();
      ctx.arc(xOf(L, n), yOf(homeCount / WALKERS), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function updateReadout(narrow) {
    V.setText(readout, 'Steps ' + n.toLocaleString() + (n >= MAX_STEPS ? ' (done)' : '') + '\n' +
      'Been home ' + homeCount + ' of ' + WALKERS + ' (' + Math.round(homeCount / WALKERS * 100) + '%)' +
      (narrow ? '' : '\nWalker 1 home ' + visits + (visits === 1 ? ' time' : ' times')));
  }

  reset();
  var stage = V.createStage(canvas, { frame: frame });

  // In 3D, drag across the picture to turn the lattice.
  V.drag(canvas, {
    hit: function (x, y) {
      return dim === 3 && y < layout(stage).picBottom ? { x: x, y: y } : null;
    },
    move: function (h, x, y, first) {
      if (first) grab = { x: x, y: y };
      yaw += (x - grab.x) * 0.01;
      pitch = Math.max(-1.45, Math.min(1.45, pitch + (y - grab.y) * 0.01));
      grab.x = x;
      grab.y = y;
      changed = true;
    },
    end: function () { grab = null; }
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    if (!playing && n >= MAX_STEPS) reset();
    setPlaying(!playing);
    changed = true;
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    reset();
    if (!V.reducedMotion) setPlaying(true);
  });

  V.segmented(V.ctl(section, 'dim'), function (v) {
    dim = parseInt(v, 10);
    reset();
    if (!V.reducedMotion) setPlaying(true);
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return '10× more every ' + (10 / v).toFixed(1) + ' s'; },
    function (v) { tenfold = 10 / v; });

})();
