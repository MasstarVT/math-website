// Cyclic pursuit (the mice problem): n bugs on a regular polygon each walk at
// the same speed straight at the next one. The gap to the next bug closes at
// v(1 − cos(2π/n)), so each walks side ÷ (1 − cos(2π/n)) before they meet.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('pursuit');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var NAMES = { 3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon', 8: 'octagon' };
  var SHRINK = 0.93;       // a chase-line snapshot each time the gaps shrink by 7%

  var n = 4;
  var speed = 1;
  var playing = !V.reducedMotion;
  var showLines = true, showTrails = true;
  var custom = false;      // started from a shape dragged by hand
  var start = [];          // starting positions, circumradius 1 for the regular polygon
  var pos = [];
  var walked = [];
  var trails = [];
  var snaps = [];
  var nextSnap = 0;
  var met = false;
  var wait = 0;
  var held = -1;
  var geo = { cx: 0, cy: 0, r: 1, W: 0, H: 0 };

  function side0() { return 2 * Math.sin(Math.PI / n); }

  function regular() {
    start = [];
    var off = n % 2 ? Math.PI / 2 : -Math.PI / 2 + Math.PI / n;   // flat side on top
    for (var i = 0; i < n; i++) {
      var a = off + 2 * Math.PI * i / n;
      start.push([Math.cos(a), Math.sin(a)]);
    }
    custom = false;
  }

  function meanGap(p) {
    var g = 0;
    for (var i = 0; i < n; i++) {
      var q = p[(i + 1) % n];
      g += Math.hypot(q[0] - p[i][0], q[1] - p[i][1]);
    }
    return g / n;
  }

  function restart() {
    pos = start.map(function (p) { return [p[0], p[1]]; });
    walked = [];
    trails = [];
    for (var i = 0; i < n; i++) {
      walked.push(0);
      trails.push([pos[i][0], pos[i][1]]);
    }
    snaps = [pos.map(function (p) { return [p[0], p[1]]; })];
    nextSnap = meanGap(pos) * SHRINK;
    met = false;
    wait = 0;
  }

  // Every bug steps h toward where its target is now (all at once).
  function step(h) {
    var next = [], maxGap = 0, i;
    for (i = 0; i < n; i++) {
      var t = pos[(i + 1) % n], dx = t[0] - pos[i][0], dy = t[1] - pos[i][1], d = Math.hypot(dx, dy);
      if (d <= h) { next.push([t[0], t[1]]); walked[i] += d; }
      else { next.push([pos[i][0] + dx / d * h, pos[i][1] + dy / d * h]); walked[i] += h; }
    }
    pos = next;
    for (i = 0; i < n; i++) {
      var tr = trails[i], lx = tr[tr.length - 2], ly = tr[tr.length - 1];
      if (Math.hypot(pos[i][0] - lx, pos[i][1] - ly) > 0.004) tr.push(pos[i][0], pos[i][1]);
      var q = pos[(i + 1) % n];
      maxGap = Math.max(maxGap, Math.hypot(q[0] - pos[i][0], q[1] - pos[i][1]));
    }
    var g = meanGap(pos);
    if (g < nextSnap) {
      snaps.push(pos.map(function (p) { return [p[0], p[1]]; }));
      nextSnap *= SHRINK;
    }
    if (maxGap < 0.002 * side0()) {
      // What is left of the walk once the gaps are this small.
      var rest = g / (1 - Math.cos(2 * Math.PI / n));
      for (i = 0; i < n; i++) { walked[i] += rest; trails[i].push(pos[i][0], pos[i][1]); }
      met = true;
    }
  }

  function X(p) { return geo.cx + p[0] * geo.r; }
  function Y(p) { return geo.cy + p[1] * geo.r; }

  function frame(dt, st) {
    var W = st.width, H = st.height, ctx = st.ctx;
    geo.W = W; geo.H = H;
    // Fit the polygon's circle below the readout.
    var top = 84;
    geo.r = Math.min((W - 28) / 2, (H - top - 14) / 2);
    geo.cx = W / 2;
    geo.cy = top + (H - top - 14) / 2;

    if (playing && held < 0) {
      if (!met) {
        var dist = 0.16 * side0() * speed * dt, h = 0.0005 * side0();
        var steps = Math.min(400, Math.ceil(dist / h));
        for (var k = 0; k < steps && !met; k++) step(dist / steps);
      } else if ((wait += dt) > 2.5) {
        restart();
      }
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;

    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    var i, j;

    // Snapshots of who is chasing whom: nested, turning polygons.
    if (showLines) {
      ctx.strokeStyle = 'rgba(255,180,84,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (j = 0; j < snaps.length; j++) {
        var sp = snaps[j];
        ctx.moveTo(X(sp[0]), Y(sp[0]));
        for (i = 1; i <= n; i++) ctx.lineTo(X(sp[i % n]), Y(sp[i % n]));
      }
      ctx.stroke();
    }

    if (showTrails) {
      ctx.lineWidth = 2;
      for (i = 0; i < n; i++) {
        var tr = trails[i];
        ctx.strokeStyle = V.gradient(V.SPECTRUM, i / (n - 1));
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(geo.cx + tr[0] * geo.r, geo.cy + tr[1] * geo.r);
        for (j = 2; j < tr.length; j += 2) ctx.lineTo(geo.cx + tr[j] * geo.r, geo.cy + tr[j + 1] * geo.r);
        ctx.lineTo(X(pos[i]), Y(pos[i]));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // The current chase lines.
    ctx.strokeStyle = 'rgba(236,232,223,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    for (i = 0; i < n; i++) {
      ctx.moveTo(X(pos[i]), Y(pos[i]));
      ctx.lineTo(X(pos[(i + 1) % n]), Y(pos[(i + 1) % n]));
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Each bug as an arrowhead pointing at its target.
    var size = Math.max(7, Math.min(11, geo.r * 0.05));
    for (i = 0; i < n; i++) {
      var p = pos[i], t = pos[(i + 1) % n];
      var a = Math.atan2(t[1] - p[1], t[0] - p[0]);
      if (Math.hypot(t[0] - p[0], t[1] - p[1]) < 1e-9) a = 0;
      ctx.save();
      ctx.translate(X(p), Y(p));
      ctx.rotate(a);
      ctx.fillStyle = V.gradient(V.SPECTRUM, i / (n - 1));
      ctx.strokeStyle = i === held ? '#ffffff' : '#0a0b10';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(size * 1.2, 0);
      ctx.lineTo(-size * 0.8, size * 0.75);
      ctx.lineTo(-size * 0.4, 0);
      ctx.lineTo(-size * 0.8, -size * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Distances in sides of the regular polygon.
    var s0 = side0(), lo = Infinity, hi = 0;
    for (i = 0; i < n; i++) {
      lo = Math.min(lo, walked[i] / s0);
      hi = Math.max(hi, walked[i] / s0);
    }
    var total = 1 / (1 - Math.cos(2 * Math.PI / n));
    var deg = Math.round(360 / n);
    var lines;
    if (!custom) {
      lines = [n + ' bugs on a ' + NAMES[n],
        (met ? 'They met after ' : 'Each has walked ') + lo.toFixed(met ? 3 : 2) + (met && Math.abs(lo - 1) < 0.0005 ? ' side' : ' sides'),
        'side ÷ (1 − cos ' + deg + '°) = ' + fmt(total) + (Math.abs(total - 1) < 1e-9 ? ' side' : ' sides')];
    } else {
      lines = [n + ' bugs, placed by hand',
        (met ? 'They met after ' : 'Walked so far: ') + lo.toFixed(2) + ' to ' + hi.toFixed(2) + ' sides',
        '(sides of the regular ' + NAMES[n] + ')'];
    }
    V.setText(readout, lines.join('\n'));
  }

  function fmt(v) {
    var r = Math.round(v * 1000) / 1000;
    return Math.abs(r - Math.round(r)) < 1e-9 ? String(Math.round(r)) : n === 3 ? '2/3' : r.toFixed(3);
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Drag a bug to change the start ----

  V.drag(canvas, {
    hit: function (x, y) {
      var best = -1, bd = 22;
      for (var i = 0; i < pos.length; i++) {
        var d = Math.hypot(x - X(pos[i]), y - Y(pos[i]));
        if (d < bd) { bd = d; best = i; }
      }
      return best >= 0 ? { i: best } : null;
    },
    move: function (h, x, y, first) {
      if (first) {
        // Freeze the bugs where they are: this becomes the new start.
        start = pos.map(function (p) { return [p[0], p[1]]; });
        custom = true;
      }
      held = h.i;
      x = Math.max(14, Math.min(geo.W - 14, x));
      y = Math.max(14, Math.min(geo.H - 14, y));
      start[h.i] = [(x - geo.cx) / geo.r, (y - geo.cy) / geo.r];
      restart();
      stage.dirty = true;
    },
    end: function () {
      held = -1;
      stage.dirty = true;
    }
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    if (!playing && met) restart();
    setPlaying(!playing);
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    regular();
    restart();
    stage.dirty = true;
  });

  V.segmented(V.ctl(section, 'count'), function (v) {
    n = parseInt(v, 10);
    regular();
    restart();
    stage.dirty = true;
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return '×' + v; },
    function (v) { speed = v; });

  V.toggle(V.ctl(section, 'lines'), function (on) { showLines = on; stage.dirty = true; });
  V.toggle(V.ctl(section, 'trails'), function (on) { showTrails = on; stage.dirty = true; });

  regular();
  restart();
})();
