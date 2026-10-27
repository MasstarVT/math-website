// Regular tilings {p, q} of the Poincaré disk: p-gons, q around each corner,
// possible when (p − 2)(q − 2) > 4. A tile's corners sit at Euclidean radius
// √(cos(π/p + π/q) / cos(π/p − π/q)) from its center. Neighbors come from
// reflecting a tile in its edges (inversion in circles square to the rim), and
// sliding the plane is the Möbius map z → (z + a) / (1 + āz).
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('hyperbolic');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var driftBtn = V.ctl(section, 'drift');

  var TAU = Math.PI * 2;
  var NAMES = { 3: 'triangles', 4: 'squares', 5: 'pentagons', 6: 'hexagons', 7: 'heptagons', 8: 'octagons' };
  var MAX_TILES = 1500;

  var P = 7, Q = 3;
  var canon = null;                       // corners and edge middles of the tile at 0
  var anchor = { a: [0, 0], rot: [1, 0], flip: false };
  var drift = !V.reducedMotion;
  var spin = 0;
  var cache = null, cacheCtx = null, stale = true;
  var drag = null;
  var W = 0, H = 0, R = 1, OX = 0, OY = 0;

  // ---- Complex numbers as [re, im] ----

  function mul(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
  function div(a, b) { var d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; }
  function conj(a) { return [a[0], -a[1]]; }
  // The disk motion taking 0 to a.
  function slide(z, a) { return div([z[0] + a[0], z[1] + a[1]], [1 + a[0] * z[0] + a[1] * z[1], a[0] * z[1] - a[1] * z[0]]); }
  function unitOf(z) { var n = Math.hypot(z[0], z[1]) || 1; return [z[0] / n, z[1] / n]; }

  function buildCanon() {
    var a = Math.PI / P, b = Math.PI / Q;
    var r0 = Math.sqrt(Math.cos(a + b) / Math.cos(a - b));
    var ch = Math.cos(b) / Math.sin(a), rm = Math.sqrt((ch - 1) / (ch + 1));
    var v = [], m = [];
    for (var k = 0; k < P; k++) {
      v.push([r0 * Math.cos(TAU * k / P), r0 * Math.sin(TAU * k / P)]);
      m.push([rm * Math.cos(Math.PI * (2 * k + 1) / P), rm * Math.sin(Math.PI * (2 * k + 1) / P)]);
    }
    canon = { v: v, m: m, r0: r0 };
  }

  function place(z) {
    return slide(mul(anchor.rot, anchor.flip ? conj(z) : z), anchor.a);
  }

  function anchorTile() {
    return { v: canon.v.map(place), m: canon.m.map(place), c: anchor.a.slice(), flip: anchor.flip };
  }

  // Reflection in the geodesic through u and w.
  function mirror(u, w) {
    var det = u[0] * w[1] - u[1] * w[0];
    if (Math.abs(det) < 1e-12) return { line: unitOf(Math.hypot(u[0], u[1]) > 1e-9 ? u : w) };
    var k1 = (1 + u[0] * u[0] + u[1] * u[1]) / 2, k2 = (1 + w[0] * w[0] + w[1] * w[1]) / 2;
    var cx = (k1 * w[1] - u[1] * k2) / det, cy = (u[0] * k2 - w[0] * k1) / det;
    return { c: [cx, cy], r2: cx * cx + cy * cy - 1 };
  }

  function reflect(z, g) {
    if (g.line) {
      var d = 2 * (z[0] * g.line[0] + z[1] * g.line[1]);
      return [d * g.line[0] - z[0], d * g.line[1] - z[1]];
    }
    var dx = z[0] - g.c[0], dy = z[1] - g.c[1], f = g.r2 / (dx * dx + dy * dy);
    return [g.c[0] + dx * f, g.c[1] + dy * f];
  }

  // Breadth-first: reflect each tile in its edges until tiles are under a pixel.
  function tiles() {
    var first = anchorTile(), list = [first], seen = new Map(), head = 0, minPx = 2.4 / R;
    seen.set(key(first.c), true);
    while (head < list.length && list.length < MAX_TILES) {
      var T = list[head++];
      if (Math.hypot(T.v[0][0] - T.c[0], T.v[0][1] - T.c[1]) < minPx * 1.6) continue;
      for (var k = 0; k < P; k++) {
        var g = mirror(T.v[k], T.v[(k + 1) % P]);
        var c = reflect(T.c, g), id = key(c);
        if (seen.has(id)) continue;
        seen.set(id, true);
        var N = { v: [], m: [], c: c, flip: !T.flip };
        for (var j = 0; j < P; j++) {
          N.v.push(j === k || j === (k + 1) % P ? T.v[j] : reflect(T.v[j], g));
          N.m.push(j === k ? T.m[j] : reflect(T.m[j], g));
        }
        if (Math.hypot(N.v[0][0] - c[0], N.v[0][1] - c[1]) < minPx) continue;
        list.push(N);
      }
    }
    return list;
  }

  function key(c) { return Math.round(c[0] * 4e5) * 1e7 + Math.round(c[1] * 4e5); }

  // Make the tile nearest the middle the new anchor, so the walk always starts
  // where the detail is. Its map is read back from its center and first corner.
  function reanchor(list) {
    var best = null, bd = Math.hypot(anchor.a[0], anchor.a[1]) - 1e-9;
    for (var i = 1; i < list.length; i++) {
      var d = Math.hypot(list[i].c[0], list[i].c[1]);
      if (d < bd) { bd = d; best = list[i]; }
    }
    if (!best) return;
    var rot = slide(best.v[0], [-best.c[0], -best.c[1]]);
    anchor = { a: best.c, rot: unitOf(rot), flip: best.flip };
  }

  // Move every tile by the Möbius map f, keeping the anchor's map exact.
  function moveBy(f) {
    var a2 = f(anchor.a), probe = f(place([0.5, 0]));
    anchor.a = a2;
    anchor.rot = unitOf(slide(probe, [-a2[0], -a2[1]]));
  }

  // ---- Drawing ----

  function sx(z) { return OX + z[0] * R; }
  function sy(z) { return OY + z[1] * R; }

  // Append the geodesic from u to w to a path already at u.
  function geo(path, u, w) {
    var det = u[0] * w[1] - u[1] * w[0];
    if (Math.abs(det) < 1e-9) { path.lineTo(sx(w), sy(w)); return; }
    var k1 = (1 + u[0] * u[0] + u[1] * u[1]) / 2, k2 = (1 + w[0] * w[0] + w[1] * w[1]) / 2;
    var cx = (k1 * w[1] - u[1] * k2) / det, cy = (u[0] * k2 - w[0] * k1) / det;
    var r = Math.hypot(u[0] - cx, u[1] - cy), ch2 = (w[0] - u[0]) * (w[0] - u[0]) + (w[1] - u[1]) * (w[1] - u[1]);
    // Nearly straight (bulging under half a pixel): a line is cheaper and looks the same.
    if (ch2 / (8 * r) * R < 0.4) { path.lineTo(sx(w), sy(w)); return; }
    var a1 = Math.atan2(u[1] - cy, u[0] - cx), a2 = Math.atan2(w[1] - cy, w[0] - cx), d = a2 - a1;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    path.arc(OX + cx * R, OY + cy * R, r * R, a1, a2, d < 0);
  }

  // Paint the tiling into the cache. Idle drift only turns the disk, which is
  // a plain rotation of this picture, so it is redrawn only after a slide.
  function paint() {
    var list = tiles();
    reanchor(list);
    var ctx = cacheCtx;
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.arc(OX, OY, R, 0, TAU);
    ctx.fillStyle = '#3a3172';
    ctx.fill();

    // Big tiles: true geodesic edges, split into 2p triangles colored in
    // alternation. Small ones: straight edges and one color.
    var dark = new Path2D(), light = new Path2D(), small = new Path2D(), edges = new Path2D(), thin = new Path2D();
    for (var i = 0; i < list.length; i++) {
      var T = list[i], v = T.v, m = T.m, c = T.c, k, size = Math.hypot(v[0][0] - c[0], v[0][1] - c[1]) * R;
      if (size < 9) {
        small.moveTo(sx(v[0]), sy(v[0]));
        for (k = 1; k < P; k++) small.lineTo(sx(v[k]), sy(v[k]));
        small.closePath();
        if (size > 4.5) {
          thin.moveTo(sx(v[0]), sy(v[0]));
          for (k = 1; k < P; k++) thin.lineTo(sx(v[k]), sy(v[k]));
          thin.closePath();
        }
        continue;
      }
      dark.moveTo(sx(v[0]), sy(v[0]));
      for (k = 0; k < P; k++) geo(dark, v[k], v[(k + 1) % P]);
      dark.closePath();
      for (k = 0; k < P; k++) {
        var a = T.flip ? m[k] : v[k], b = T.flip ? v[(k + 1) % P] : m[k];
        light.moveTo(sx(c), sy(c));
        geo(light, c, a);
        geo(light, a, b);
        geo(light, b, c);
        light.closePath();
      }
      edges.moveTo(sx(v[0]), sy(v[0]));
      for (k = 0; k < P; k++) geo(edges, v[k], v[(k + 1) % P]);
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(OX, OY, R, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#2a2356';
    ctx.fill(dark);
    ctx.fillStyle = '#4b3f8f';
    ctx.fill(light);
    ctx.fillStyle = '#3a3172';
    ctx.fill(small);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(214,204,255,0.9)';
    ctx.lineWidth = 1.6;
    ctx.stroke(edges);
    ctx.strokeStyle = 'rgba(214,204,255,0.45)';
    ctx.lineWidth = 0.8;
    ctx.stroke(thin);
    ctx.restore();

  }

  function frame(dt, st) {
    if (drift && !drag) {
      spin += dt * 0.06;
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    if (!canon) buildCanon();
    if (stale) {
      paint();
      stale = false;
    }
    var ctx = st.ctx;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(OX, OY);
    ctx.rotate(spin);
    ctx.drawImage(cache, -OX, -OY, W, H);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(OX, OY, R, 0, TAU);
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    var flat = 180 * (P - 2) / P, here = 360 / Q;
    V.setText(readout, '{' + P + ',' + Q + '}: ' + NAMES[P] + ', ' + Q + ' per corner\neach corner ' +
      (Math.round(here * 10) / 10) + '°\non a flat floor ' + (Math.round(flat * 10) / 10) + '°');
  }

  function resize(st) {
    W = st.width;
    H = st.height;
    R = Math.min(W, H) * 0.47;
    OX = W / 2;
    OY = H / 2;
    cache = document.createElement('canvas');
    cache.width = st.canvas.width;
    cache.height = st.canvas.height;
    cacheCtx = cache.getContext('2d');
    cacheCtx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    stale = true;
  }

  // Fold the current turn into the tiling before sliding or switching.
  function settle() {
    if (!spin) return;
    var c = Math.cos(spin), s = Math.sin(spin);
    moveBy(function (z) { return [z[0] * c - z[1] * s, z[0] * s + z[1] * c]; });
    spin = 0;
    stale = true;
  }

  var stage = V.createStage(canvas, { frame: frame, resize: resize });

  // ---- Drag to slide ----

  function diskPoint(e) {
    var r = canvas.getBoundingClientRect();
    var z = [(e.clientX - r.left - OX) / R, (e.clientY - r.top - OY) / R], n = Math.hypot(z[0], z[1]);
    return n > 0.95 ? [z[0] / n * 0.95, z[1] / n * 0.95] : z;
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    settle();
    drag = diskPoint(e);
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-grabbing');
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var z1 = diskPoint(e), z0 = drag;
    // Carry the point under the pointer from z0 to z1.
    moveBy(function (z) { return slide(slide(z, [-z0[0], -z0[1]]), z1); });
    drag = z1;
    stale = true;
    stage.dirty = true;
  });

  function endDrag() {
    if (!drag) return;
    drag = null;
    canvas.classList.remove('is-grabbing');
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ---- Controls ----

  V.segmented(V.ctl(section, 'tiling'), function (v) {
    var pq = v.split(',');
    P = +pq[0];
    Q = +pq[1];
    canon = null;
    anchor = { a: [0, 0], rot: [1, 0], flip: false };
    spin = 0;
    stale = true;
    stage.dirty = true;
  });

  driftBtn.setAttribute('aria-pressed', String(drift));
  V.toggle(driftBtn, function (on) { drift = on; stage.dirty = true; });

  V.ctl(section, 'center').addEventListener('click', function () {
    anchor = { a: [0, 0], rot: [1, 0], flip: false };
    spin = 0;
    stale = true;
    stage.dirty = true;
  });
})();
