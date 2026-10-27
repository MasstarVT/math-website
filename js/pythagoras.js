// The Pythagoras tree: a right triangle sits on each square, and a new square
// grows from each of its two shorter sides. Since a² + b² = c², every
// generation of squares adds up to exactly the trunk's area.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('pythagoras');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');

  var COLORS = [[255, 138, 92], [255, 209, 102], [126, 224, 161], [110, 231, 255], [124, 140, 255]];
  var angle = 45;
  var gens = 11;
  var wind = !V.reducedMotion;
  var time = 0;
  var hover = null;    // pointer position in CSS pixels
  var view = null;     // eased fit { s, ox, oy }
  // Square i has its base from (ax, ay) to (bx, by) and grows to the left of
  // that direction. Its children are squares 2i + 1 and 2i + 2.
  var ax, ay, bx, by, depthOf, count;

  function build() {
    count = Math.pow(2, gens + 1) - 1;
    if (!ax || ax.length < count) {
      ax = new Float64Array(count); ay = new Float64Array(count);
      bx = new Float64Array(count); by = new Float64Array(count);
      depthOf = new Uint8Array(count);
    }
    ax[0] = -0.5; ay[0] = 0; bx[0] = 0.5; by[0] = 0; depthOf[0] = 0;
    var parents = Math.pow(2, gens) - 1;
    for (var i = 0; i < parents; i++) {
      var d = depthOf[i];
      var th = (angle + (wind ? 3.5 * Math.sin(time * 0.9 + d * 0.5) : 0)) * Math.PI / 180;
      var dx = bx[i] - ax[i], dy = by[i] - ay[i];
      // Top corners of this square, then the triangle's right-angle corner.
      var lx = ax[i] + dy, ly = ay[i] - dx, rx = bx[i] + dy, ry = by[i] - dx;
      var c = Math.cos(th), s = Math.sin(th);
      var px = lx + (dx * c + dy * s) * c, py = ly + (-dx * s + dy * c) * c;
      var L = 2 * i + 1, R = 2 * i + 2;
      ax[L] = lx; ay[L] = ly; bx[L] = px; by[L] = py; depthOf[L] = d + 1;
      ax[R] = px; ay[R] = py; bx[R] = rx; by[R] = ry; depthOf[R] = d + 1;
    }
  }

  function corners(i) {
    var dx = bx[i] - ax[i], dy = by[i] - ay[i];
    return [ax[i], ay[i], bx[i], by[i], bx[i] + dy, by[i] - dx, ax[i] + dy, ay[i] - dx];
  }

  function areaOf(i) {
    var dx = bx[i] - ax[i], dy = by[i] - ay[i];
    return dx * dx + dy * dy;
  }

  function find(wx, wy) {
    var best = -1;
    for (var i = 0; i < count; i++) {
      var dx = bx[i] - ax[i], dy = by[i] - ay[i], q = dx * dx + dy * dy;
      var u = ((wx - ax[i]) * dx + (wy - ay[i]) * dy) / q;
      var v = ((wx - ax[i]) * dy - (wy - ay[i]) * dx) / q;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) best = i;
    }
    return best;
  }

  function outline(ctx, i, f) {
    var k = corners(i);
    ctx.moveTo(f.ox + k[0] * f.s, f.oy + k[1] * f.s);
    for (var j = 2; j < 8; j += 2) ctx.lineTo(f.ox + k[j] * f.s, f.oy + k[j + 1] * f.s);
    ctx.closePath();
  }

  function frame(dt, st) {
    if (wind) time += dt;
    else if (!st.dirty && !hover) return;
    st.dirty = false;
    build();

    var W = st.width, H = st.height, ctx = st.ctx;
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (var i = 0; i < count; i++) {
      var k = corners(i);
      for (var j = 0; j < 8; j += 2) {
        if (k[j] < x0) x0 = k[j];
        if (k[j] > x1) x1 = k[j];
        if (k[j + 1] < y0) y0 = k[j + 1];
        if (k[j + 1] > y1) y1 = k[j + 1];
      }
    }
    // Leave room at the top for the readout.
    var pad = 18, top = 58;
    var s = Math.min((W - pad * 2) / (x1 - x0), (H - pad - top) / (y1 - y0));
    var want = { s: s, ox: W / 2 - (x0 + x1) / 2 * s, oy: (top + H - pad) / 2 - (y0 + y1) / 2 * s };
    if (!view || !wind) view = want;
    else {
      var e = Math.min(1, dt * 3);
      view = { s: view.s + (want.s - view.s) * e, ox: view.ox + (want.ox - view.ox) * e, oy: view.oy + (want.oy - view.oy) * e };
    }

    ctx.clearRect(0, 0, W, H);
    for (var d = 0, first = 0; d <= gens; d++, first = first * 2 + 1) {
      var last = first * 2;
      ctx.beginPath();
      for (i = first; i <= last; i++) outline(ctx, i, view);
      ctx.fillStyle = V.gradient(COLORS, gens ? d / gens : 0);
      ctx.globalAlpha = 0.88;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (view.s * Math.sqrt(areaOf(first)) > 6) {
        ctx.strokeStyle = 'rgba(10,11,16,0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    var trunk = areaOf(0), line1, line2;
    var picked = hover ? find((hover.x - view.ox) / view.s, (hover.y - view.oy) / view.s) : -1;
    if (picked >= 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      outline(ctx, picked, view);
      ctx.stroke();
      var a = areaOf(picked) / trunk;
      line1 = 'This square: ' + a.toFixed(4) + ' of the trunk';
      if (2 * picked + 2 < count) {
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        outline(ctx, 2 * picked + 1, view);
        outline(ctx, 2 * picked + 2, view);
        ctx.stroke();
        ctx.setLineDash([]);
        var l = areaOf(2 * picked + 1) / trunk, r = areaOf(2 * picked + 2) / trunk;
        line2 = 'Its two squares: ' + l.toFixed(4) + ' + ' + r.toFixed(4) + ' = ' + (l + r).toFixed(4);
      } else {
        line2 = 'Add a generation to see its two squares';
      }
    } else {
      var sum = 0;
      for (i = Math.pow(2, gens) - 1; i < count; i++) sum += areaOf(i);
      line1 = gens + ' generations   ' + count.toLocaleString() + ' squares';
      line2 = 'Generation ' + gens + ' adds up to ' + (sum / trunk).toFixed(4) + ' trunks';
    }
    V.setText(readout, line1 + '\n' + line2);
  }

  var stage = V.createStage(canvas, { frame: frame });

  function onPoint(e) {
    var b = canvas.getBoundingClientRect();
    hover = { x: e.clientX - b.left, y: e.clientY - b.top };
    stage.dirty = true;
  }
  canvas.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') onPoint(e); });
  canvas.addEventListener('pointerdown', onPoint);
  canvas.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse') { hover = null; stage.dirty = true; }
  });

  // ---- Controls ----

  V.range(V.ctl(section, 'angle'), V.ctl(section, 'angle-out'),
    function (v) { return v + '° and ' + (90 - v) + '°'; },
    function (v) { angle = v; stage.dirty = true; });

  V.range(V.ctl(section, 'gens'), V.ctl(section, 'gens-out'),
    function (v) { return String(v); },
    function (v) { gens = v; stage.dirty = true; });

  V.toggle(V.ctl(section, 'wind'), function (on) { wind = on; stage.dirty = true; });
  V.ctl(section, 'wind').setAttribute('aria-pressed', String(wind));
})();
