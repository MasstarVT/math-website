// Fourier epicycles: sample a closed path, take its discrete Fourier
// transform, then chain the terms as spinning circles, biggest first.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('fourier');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var hint = V.ctl(section, 'hint');
  var shapeGroup = V.ctl(section, 'shape');

  var N = 256;
  var CURVE = 512;
  var PERIOD = 9;
  var TAU = Math.PI * 2;

  function sampleCurve(fn) {
    var pts = [];
    for (var i = 0; i < N; i++) pts.push(fn(TAU * i / N));
    return pts;
  }

  // Resample a closed polyline to N points evenly spaced by arc length.
  function resample(verts) {
    var n = verts.length, lens = [], total = 0, i;
    for (i = 0; i < n; i++) {
      var a = verts[i], b = verts[(i + 1) % n];
      lens.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
      total += lens[i];
    }
    var pts = [], seg = 0, acc = 0;
    for (var k = 0; k < N; k++) {
      var d = total * k / N;
      while (seg < n - 1 && acc + lens[seg] < d) acc += lens[seg++];
      var f = lens[seg] ? (d - acc) / lens[seg] : 0;
      var p = verts[seg], q = verts[(seg + 1) % n];
      pts.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
    }
    return pts;
  }

  // Center on the bounding box and scale the larger half-extent to 1.
  function normalize(pts) {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(function (p) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    });
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    var s = Math.max(maxX - minX, maxY - minY) / 2 || 1;
    return pts.map(function (p) { return [(p[0] - cx) / s, (p[1] - cy) / s]; });
  }

  function star() {
    var v = [];
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? 0.4 : 1, a = Math.PI / 2 + i * Math.PI / 5;
      v.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return v;
  }

  var SHAPES = {
    heart: function () {
      return sampleCurve(function (t) {
        var s = Math.sin(t);
        return [16 * s * s * s, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)];
      });
    },
    star: function () { return resample(star()); },
    square: function () { return resample([[-1, -1], [1, -1], [1, 1], [-1, 1]]); },
    infinity: function () {
      return sampleCurve(function (t) {
        var d = 1 + Math.sin(t) * Math.sin(t);
        return [Math.cos(t) / d, Math.sin(t) * Math.cos(t) / d];
      });
    }
  };

  function dft(pts) {
    var out = [];
    for (var k = -N / 2; k < N / 2; k++) {
      var re = 0, im = 0;
      for (var n = 0; n < N; n++) {
        var a = -TAU * k * n / N, c = Math.cos(a), s = Math.sin(a);
        re += pts[n][0] * c - pts[n][1] * s;
        im += pts[n][0] * s + pts[n][1] * c;
      }
      re /= N;
      im /= N;
      out.push({ k: k, amp: Math.hypot(re, im), phase: Math.atan2(im, re) });
    }
    out.sort(function (a, b) { return b.amp - a.amp; });
    return out;
  }

  var target = [];
  var terms = [];
  var circles = 20;
  var curve = new Float32Array(CURVE * 2);
  var t = 0;
  var speed = 1;
  var playing = !V.reducedMotion;
  var drawing = false;
  var stroke = null;

  function setShape(pts) {
    target = normalize(pts);
    terms = dft(target);
    rebuildCurve();
  }

  // The path traced by the first `circles` terms over one full turn.
  function rebuildCurve() {
    for (var i = 0; i < CURVE; i++) {
      var tt = i / CURVE, x = 0, y = 0;
      for (var j = 0; j < circles; j++) {
        var a = terms[j].phase + TAU * terms[j].k * tt;
        x += terms[j].amp * Math.cos(a);
        y += terms[j].amp * Math.sin(a);
      }
      curve[i * 2] = x;
      curve[i * 2 + 1] = y;
    }
    if (stage) stage.dirty = true;
  }

  function frame(dt, st) {
    if (playing && !stroke) {
      t = (t + dt * speed / PERIOD) % 1;
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
    V.setText(readout, circles + (circles === 1 ? ' circle' : ' circles') + ' of ' + N);
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    var cx = W / 2, cy = H / 2, S = Math.min(W, H) * 0.4;
    var i;
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (stroke) {
      ctx.strokeStyle = '#ece8df';
      ctx.lineWidth = 2;
      ctx.beginPath();
      stroke.forEach(function (p, j) { if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.stroke();
      return;
    }

    function X(x) { return cx + x * S; }
    function Y(y) { return cy - y * S; }

    // The shape we're aiming for, faintly.
    ctx.strokeStyle = 'rgba(236,232,223,0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (i = 0; i <= N; i++) {
      var p = target[i % N];
      if (i) ctx.lineTo(X(p[0]), Y(p[1])); else ctx.moveTo(X(p[0]), Y(p[1]));
    }
    ctx.stroke();

    // Everything these circles can draw, faintly, then a fading trail behind the pen.
    ctx.strokeStyle = 'rgba(110,231,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (i = 0; i <= CURVE; i++) {
      var k = (i % CURVE) * 2;
      if (i) ctx.lineTo(X(curve[k]), Y(curve[k + 1])); else ctx.moveTo(X(curve[k]), Y(curve[k + 1]));
    }
    ctx.stroke();

    var head = Math.floor(t * CURVE);
    var trail = Math.floor(CURVE * 0.8), bands = 24, per = Math.ceil(trail / bands);
    ctx.lineWidth = 2.4;
    for (var b = 0; b < bands; b++) {
      ctx.strokeStyle = V.gradient(V.SPECTRUM, b / (bands - 1));
      ctx.globalAlpha = Math.pow((b + 1) / bands, 1.6);
      ctx.beginPath();
      for (var s = b * per; s <= Math.min((b + 1) * per, trail); s++) {
        var idx = ((head - trail + s) % CURVE + CURVE) % CURVE * 2;
        if (s === b * per) ctx.moveTo(X(curve[idx]), Y(curve[idx + 1]));
        else ctx.lineTo(X(curve[idx]), Y(curve[idx + 1]));
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // The circles themselves, chained tip to tail.
    var x = 0, y = 0, arms = [[X(0), Y(0)]];
    ctx.strokeStyle = 'rgba(236,232,223,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (i = 0; i < circles; i++) {
      var term = terms[i], r = term.amp * S;
      if (r > 0.6) {
        ctx.moveTo(X(x) + r, Y(y));
        ctx.arc(X(x), Y(y), r, 0, TAU);
      }
      var a = term.phase + TAU * term.k * t;
      x += term.amp * Math.cos(a);
      y += term.amp * Math.sin(a);
      arms.push([X(x), Y(y)]);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(236,232,223,0.65)';
    ctx.beginPath();
    arms.forEach(function (q, j) { if (j) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(X(x), Y(y), 3.5, 0, TAU);
    ctx.fill();
  }

  var stage = null;
  setShape(SHAPES.heart());
  stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  function setDrawing(on) {
    drawing = on;
    canvas.classList.toggle('is-draggable', on);
    canvas.classList.toggle('is-drawing', on);
    hint.hidden = !on;
  }

  V.segmented(shapeGroup, function (name) {
    if (name === 'draw') {
      setDrawing(true);
      return;
    }
    setDrawing(false);
    setShape(SHAPES[name]());
  });

  V.range(V.ctl(section, 'circles'), V.ctl(section, 'circles-out'),
    function (v) { return String(v); },
    function (v) { circles = v; rebuildCurve(); });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return v.toFixed(2) + '×'; },
    function (v) { speed = v; });

  // ---- Draw your own ----

  function local(e) {
    var rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (!drawing) return;
    canvas.setPointerCapture(e.pointerId);
    stroke = [local(e)];
    stage.dirty = true;
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!stroke) return;
    var p = local(e), last = stroke[stroke.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 2) {
      stroke.push(p);
      stage.dirty = true;
    }
  });

  function finishStroke() {
    if (!stroke) return;
    var pts = stroke;
    stroke = null;
    if (pts.length > 8) {
      // Flip to y-up so drawings come out the right way round.
      setShape(resample(pts.map(function (p) { return [p[0], -p[1]]; })));
      t = 0;
    }
    stage.dirty = true;
  }
  canvas.addEventListener('pointerup', finishStroke);
  canvas.addEventListener('pointercancel', finishStroke);
})();
