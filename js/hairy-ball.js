// Hairy ball theorem: every continuous tangent field on a sphere has a zero. A
// mesh triangle holds a cowlick when the hair turns once around it (its index);
// the indexes add up to the Euler characteristic, 2 on a sphere, 0 on a torus.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('hairy-ball');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var shapeGroup = V.ctl(section, 'shape');
  var dragGroup = V.ctl(section, 'drag');
  var oneBtn = V.ctl(section, 'one');
  var playBtn = V.ctl(section, 'play');

  var TAU = Math.PI * 2;
  var PHI = (1 + Math.sqrt(5)) / 2;
  var NU = 36, NV = 14, TR = 1, Tr = 0.42;

  var shapes = {};
  var S = null;              // current shape: { pts, normals, tris, nb, field, sphere }
  var kind = 'sphere';
  var mode = 'comb';
  var yaw = 0.3, pitch = 0.38;
  var playing = !V.reducedMotion;
  var spots = [];            // cowlicks: { p, index }
  var dirty = true;
  var brush = null;
  var view = null;

  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function flat(n, d) { var k = dot(d, n); return norm([d[0] - k * n[0], d[1] - k * n[1], d[2] - k * n[2]]); }

  // ---- Meshes ----

  function icosphere(levels) {
    var v = [];
    [-1, 1].forEach(function (a) { [-PHI, PHI].forEach(function (b) { v.push([0, a, b], [a, b, 0], [b, 0, a]); }); });
    v = v.map(norm);
    var f = [], i, j, k;
    for (i = 0; i < 12; i++) {
      for (j = i + 1; j < 12; j++) {
        for (k = j + 1; k < 12; k++) {
          if (dot(v[i], v[j]) > 0.4 && dot(v[j], v[k]) > 0.4 && dot(v[i], v[k]) > 0.4) f.push([i, j, k]);
        }
      }
    }
    for (var L = 0; L < levels; L++) {
      var mid = {}, nf = [];
      var m = function (a, b) {
        var key = Math.min(a, b) + ',' + Math.max(a, b);
        if (mid[key] == null) {
          mid[key] = v.length;
          v.push(norm([v[a][0] + v[b][0], v[a][1] + v[b][1], v[a][2] + v[b][2]]));
        }
        return mid[key];
      };
      f.forEach(function (t) {
        var a = m(t[0], t[1]), b = m(t[1], t[2]), c = m(t[2], t[0]);
        nf.push([t[0], a, c], [t[1], b, a], [t[2], c, b], [a, b, c]);
      });
      f = nf;
    }
    f = f.map(function (t) {
      return dot(cross(sub(v[t[1]], v[t[0]]), sub(v[t[2]], v[t[0]])), v[t[0]]) < 0 ? [t[0], t[2], t[1]] : t;
    });
    return finish({ pts: v, normals: v, tris: f, sphere: true });
  }

  function torus() {
    var pts = [], normals = [], tris = [], i, j;
    for (i = 0; i < NU; i++) {
      for (j = 0; j < NV; j++) {
        var u = i * TAU / NU, w = j * TAU / NV;
        pts.push([(TR + Tr * Math.cos(w)) * Math.cos(u), (TR + Tr * Math.cos(w)) * Math.sin(u), Tr * Math.sin(w)]);
        normals.push([Math.cos(w) * Math.cos(u), Math.cos(w) * Math.sin(u), Math.sin(w)]);
      }
    }
    function id(a, b) { return (a % NU) * NV + (b % NV); }
    for (i = 0; i < NU; i++) {
      for (j = 0; j < NV; j++) {
        tris.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
      }
    }
    var S2 = finish({ pts: pts, normals: normals, tris: tris, sphere: false });
    S2.quad = function (a, b) { return [id(a, b), id(a + 1, b), id(a + 1, b + 1), id(a, b + 1)]; };
    return S2;
  }

  function finish(s) {
    var nb = s.pts.map(function () { return []; });
    s.tris.forEach(function (t) {
      for (var k = 0; k < 3; k++) {
        var a = t[k], b = t[(k + 1) % 3];
        if (nb[a].indexOf(b) < 0) nb[a].push(b);
        if (nb[b].indexOf(a) < 0) nb[b].push(a);
      }
    });
    s.nb = nb;
    s.field = s.pts.map(function () { return [0, 0, 0]; });
    // A flat frame for each triangle, to measure hair directions in.
    s.frames = new Float32Array(s.tris.length * 9);
    s.tris.forEach(function (t, i) {
      var a = s.pts[t[0]], b = s.pts[t[1]], c = s.pts[t[2]];
      var n = norm(cross(sub(b, a), sub(c, a)));
      var e1 = norm(cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), e2 = cross(n, e1);
      s.frames.set([e1[0], e1[1], e1[2], e2[0], e2[1], e2[2], (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3], i * 9);
    });
    return s;
  }

  // ---- Hair styles ----

  var AXIS = norm([0.13, 0.21, 1]);

  function neat() {
    S.field = S.pts.map(function (p, i) {
      return S.sphere ? norm(cross(AXIS, p)) : flat(S.normals[i], [-p[1], p[0], 0]);
    });
    dirty = true;
  }

  // A constant flow on the plane, carried onto the sphere by stereographic
  // projection: one cowlick of index 2.
  function single() {
    var z = AXIS, x = norm(cross([0, 1, 0], z)), y = cross(z, x);
    S.field = S.pts.map(function (p) {
      var a = dot(p, x), b = dot(p, y), c = dot(p, z);
      var f = [1 - c - a * a, -a * b, a * (1 - c)];
      return norm([f[0] * x[0] + f[1] * y[0] + f[2] * z[0], f[0] * x[1] + f[1] * y[1] + f[2] * z[1], f[0] * x[2] + f[1] * y[2] + f[2] * z[2]]);
    });
    dirty = true;
  }

  // A few random swirls and flows, blended smoothly.
  function messy() {
    var blobs = [];
    for (var k = 0; k < 6; k++) {
      var c = S.pts[Math.floor(Math.random() * S.pts.length)];
      blobs.push({ c: c, spin: (Math.random() - 0.5) * 4, flow: (Math.random() - 0.5) * 3 });
    }
    var drift = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5];
    S.field = S.pts.map(function (p, i) {
      var n = S.normals[i], s = [drift[0] * 0.4, drift[1] * 0.4, drift[2] * 0.4];
      blobs.forEach(function (o) {
        var d = sub(o.c, p), r2 = dot(d, d), e = Math.exp(-r2 * 2.2), rot = cross(n, d);
        for (var q = 0; q < 3; q++) s[q] += e * (o.spin * rot[q] + o.flow * d[q]);
      });
      if (!S.sphere) { var t = norm([-p[1], p[0], 0]); for (var q = 0; q < 3; q++) s[q] += t[q] * 0.5; }
      return flat(n, s);
    });
    dirty = true;
  }

  // ---- Cowlicks ----

  // Going round a triangle, the hair turns once exactly when its three
  // directions (flattened into the triangle) surround the origin.
  function findSpots() {
    var raw = [], F = S.frames, fld = S.field;
    for (var i = 0; i < S.tris.length; i++) {
      var t = S.tris[i], o = i * 9, x = [0, 0, 0], y = [0, 0, 0];
      for (var k = 0; k < 3; k++) {
        var f = fld[t[k]];
        x[k] = f[0] * F[o] + f[1] * F[o + 1] + f[2] * F[o + 2];
        y[k] = f[0] * F[o + 3] + f[1] * F[o + 4] + f[2] * F[o + 5];
      }
      var c1 = x[0] * y[1] - y[0] * x[1], c2 = x[1] * y[2] - y[1] * x[2], c3 = x[2] * y[0] - y[2] * x[0];
      var idx = c1 > 0 && c2 > 0 && c3 > 0 ? 1 : c1 < 0 && c2 < 0 && c3 < 0 ? -1 : 0;
      if (idx) raw.push({ p: [F[o + 6], F[o + 7], F[o + 8]], index: idx });
    }
    // Neighboring triangles that share one cowlick are merged; a +1 next to a
    // −1 cancels out.
    var groups = [];
    raw.forEach(function (r) {
      var g = null;
      for (var i = 0; i < groups.length && !g; i++) {
        var d = sub(groups[i].p, r.p);
        if (dot(d, d) < 0.05) g = groups[i];
      }
      if (g) g.index += r.index;
      else groups.push({ p: r.p, index: r.index });
    });
    spots = groups.filter(function (g) { return g.index; });
    dirty = false;
  }

  // ---- Drawing ----

  function makeView(st) {
    var m = Math.min(st.width, st.height);
    return {
      cy: Math.cos(yaw), sy: Math.sin(yaw), cp: Math.cos(pitch), sp: Math.sin(pitch),
      cx: st.width / 2, oy: st.height / 2 + m * 0.06, unit: m * (S.sphere ? 0.34 : 0.3)
    };
  }

  // World to camera: x right, y into the screen, z up. Orthographic.
  function cam(p) {
    var x = p[0] * view.cy - p[1] * view.sy, y = p[0] * view.sy + p[1] * view.cy;
    return [x, y * view.cp - p[2] * view.sp, y * view.sp + p[2] * view.cp];
  }

  function scr(c) { return [view.cx + c[0] * view.unit, view.oy - c[2] * view.unit]; }

  // A hair leans along the field and lifts a little off the surface. The view
  // is orthographic, so it's enough to project its root and its tip.
  function hairPath(paths, i, facing) {
    var p = S.pts[i], n = S.normals[i], f = S.field[i], L = S.sphere ? 0.1 : 0.085, u = view.unit;
    var bx = p[0] * view.cy - p[1] * view.sy, by = p[0] * view.sy + p[1] * view.cy;
    var tx = p[0] + n[0] * 0.035 + f[0] * L, ty = p[1] + n[1] * 0.035 + f[1] * L, tz = p[2] + n[2] * 0.035 + f[2] * L;
    var cx = tx * view.cy - ty * view.sy, cyy = tx * view.sy + ty * view.cy;
    var b = Math.max(0, Math.min(paths.length - 1, Math.floor(facing * paths.length)));
    var path = paths[b];
    path.moveTo(view.cx + bx * u, view.oy - (by * view.sp + p[2] * view.cp) * u);
    path.lineTo(view.cx + cx * u, view.oy - (cyy * view.sp + tz * view.cp) * u);
  }

  var SHADES = ['#3c3170', '#5a4a9c', '#7b68c6', '#9c89e6', '#bcaef5', '#ddd4ff'];

  function strokeHairs(ctx, paths) {
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'butt';
    paths.forEach(function (p, k) {
      ctx.strokeStyle = SHADES[k];
      ctx.stroke(p);
    });
  }

  function newPaths() { return SHADES.map(function () { return new Path2D(); }); }

  function drawSphere(ctx) {
    var R = view.unit, g = ctx.createRadialGradient(view.cx - R * 0.35, view.oy - R * 0.4, R * 0.1, view.cx, view.oy, R * 1.05);
    g.addColorStop(0, '#2b2452');
    g.addColorStop(1, '#0e0c1c');
    ctx.beginPath();
    ctx.arc(view.cx, view.oy, R, 0, TAU);
    ctx.fillStyle = g;
    ctx.fill();
    var paths = newPaths();
    for (var i = 0; i < S.pts.length; i++) {
      var p = S.pts[i], y = p[0] * view.sy + p[1] * view.cy;
      var cy = y * view.cp - p[2] * view.sp;
      if (cy > 0.06) continue;
      var cx = p[0] * view.cy - p[1] * view.sy, cz = y * view.sp + p[2] * view.cp;
      hairPath(paths, i, 0.25 + 0.75 * Math.max(0, -cy) * (0.6 + 0.4 * Math.max(0, cz * 0.6 - cx * 0.4 + 0.6)));
    }
    strokeHairs(ctx, paths);
  }

  function drawTorus(ctx) {
    var P = S.pts.map(function (p) { var c = cam(p); var s = scr(c); return [s[0], s[1], c[1]]; });
    var quads = [];
    for (var i = 0; i < NU; i++) {
      for (var j = 0; j < NV; j++) {
        var q = S.quad(i, j), area = 0, depth = 0;
        for (var k = 0; k < 4; k++) {
          var a = P[q[k]], b = P[q[(k + 1) % 4]];
          area += a[0] * b[1] - b[0] * a[1];
          depth += a[2];
        }
        if (area >= 0) continue;
        quads.push({ q: q, depth: depth, v: q[0] });
      }
    }
    quads.sort(function (a, b) { return b.depth - a.depth; });
    quads.forEach(function (Q) {
      var nc = cam(S.normals[Q.v]), facing = Math.max(0, -nc[1]);
      var light = 0.25 + 0.75 * Math.max(0, -nc[1] * 0.7 + nc[2] * 0.5);
      ctx.beginPath();
      ctx.moveTo(P[Q.q[0]][0], P[Q.q[0]][1]);
      for (var k = 1; k < 4; k++) ctx.lineTo(P[Q.q[k]][0], P[Q.q[k]][1]);
      ctx.closePath();
      ctx.fillStyle = 'rgb(' + Math.round(16 + 30 * light) + ',' + Math.round(14 + 24 * light) + ',' + Math.round(30 + 52 * light) + ')';
      ctx.fill();
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      var paths = [new Path2D()];
      hairPath(paths, Q.v, 0);
      ctx.strokeStyle = SHADES[Math.min(5, Math.floor((0.25 + 0.75 * facing) * 6))];
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      ctx.stroke(paths[0]);
    });
  }

  function drawSpots(ctx, t) {
    spots.forEach(function (s) {
      var c = cam(s.p);
      if (c[1] > 0.02) return;
      var p = scr(c), pos = s.index > 0, color = pos ? '#ff5fa2' : '#6ee7ff';
      var r = 11 + 2.5 * Math.sin(t * 3);
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, TAU);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = '600 12px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      var label = (pos ? '+' : '−') + Math.abs(s.index);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0a0b10';
      ctx.strokeText(label, p[0] + r + 4, p[1] - r * 0.6);
      ctx.fillStyle = color;
      ctx.fillText(label, p[0] + r + 4, p[1] - r * 0.6);
    });
  }

  var clock = 0;

  function frame(dt, st) {
    if (!S) load(kind);
    if (playing && !brush) yaw += dt * 0.22;
    clock += dt;
    if (dirty) findSpots();
    view = makeView(st);
    var ctx = st.ctx;
    ctx.clearRect(0, 0, st.width, st.height);
    if (S.sphere) drawSphere(ctx); else drawTorus(ctx);
    drawSpots(ctx, V.reducedMotion ? 0 : clock);

    var sum = 0;
    spots.forEach(function (s) { sum += s.index; });
    var list = spots.length <= 4 ? ' (' + spots.map(function (s) { return (s.index > 0 ? '+' : '−') + Math.abs(s.index); }).join(', ') + ')' : '';
    V.setText(readout, 'Cowlicks: ' + spots.length + (spots.length ? list : '') + '\nIndexes add up to ' + (sum > 0 ? '+' : sum < 0 ? '−' : '') + Math.abs(sum));
  }

  function load(k) {
    kind = k;
    if (!shapes[k]) {
      shapes[k] = k === 'sphere' ? icosphere(4) : torus();
      S = shapes[k];
      neat();
    }
    S = shapes[k];
    dirty = true;
    oneBtn.hidden = k !== 'sphere';
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Combing and turning ----

  function onShape(x, y) {
    if (!view || !S) return -1;
    var best = -1, bd = S.sphere ? Infinity : 30;
    if (S.sphere) {
      var dx = (x - view.cx) / view.unit, dz = (view.oy - y) / view.unit;
      if (dx * dx + dz * dz > 1.02) return -1;
    }
    for (var i = 0; i < S.pts.length; i++) {
      var c = cam(S.pts[i]);
      if (c[1] > 0) continue;
      var p = scr(c), d = Math.hypot(p[0] - x, p[1] - y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // Bend nearby hairs toward the drag, then let them settle against their neighbors.
  function comb(i, sx, sy) {
    var right = [view.cy, -view.sy, 0];
    var up = [view.sy * view.sp, view.cy * view.sp, view.cp];
    var d = [right[0] * sx - up[0] * sy, right[1] * sx - up[1] * sy, right[2] * sx - up[2] * sy];
    if (Math.hypot(d[0], d[1], d[2]) < 1e-6) return;
    var c = S.pts[i], touched = [], reach = S.sphere ? 0.36 : 0.32;
    for (var k = 0; k < S.pts.length; k++) {
      var e = sub(S.pts[k], c), r2 = dot(e, e);
      if (r2 > reach * reach) continue;
      var w = Math.exp(-r2 / (reach * reach * 0.35)) * 1.6, q = flat(S.normals[k], d), f = S.field[k];
      S.field[k] = flat(S.normals[k], [f[0] + q[0] * w, f[1] + q[1] * w, f[2] + q[2] * w]);
      touched.push(k);
    }
    for (var pass = 0; pass < 2; pass++) {
      touched.forEach(function (k) {
        var s = S.field[k].slice();
        S.nb[k].forEach(function (j) { s[0] += S.field[j][0] * 0.6; s[1] += S.field[j][1] * 0.6; s[2] += S.field[j][2] * 0.6; });
        S.field[k] = flat(S.normals[k], s);
      });
    }
    dirty = true;
  }

  V.drag(canvas, {
    hit: function (x, y) {
      if (mode === 'turn') return { turn: true };
      return onShape(x, y) >= 0 ? { turn: false } : null;
    },
    move: function (h, x, y, first) {
      if (first) { brush = { x: x, y: y }; return; }
      var dx = x - brush.x, dy = y - brush.y;
      if (h.turn) {
        yaw += dx * 0.008;
        pitch = Math.max(-1.3, Math.min(1.3, pitch - dy * 0.008));
      } else {
        var i = onShape(x, y);
        if (i >= 0 && Math.hypot(dx, dy) > 0.5) comb(i, dx, dy);
      }
      brush = { x: x, y: y };
    },
    end: function () { brush = null; }
  });

  // ---- Controls ----

  V.segmented(shapeGroup, function (v) { load(v); });
  V.segmented(dragGroup, function (v) {
    mode = v;
    canvas.classList.toggle('is-draggable', v === 'turn');
  });
  V.ctl(section, 'neat').addEventListener('click', function () { if (S) neat(); });
  oneBtn.addEventListener('click', function () { if (S && S.sphere) single(); });
  V.ctl(section, 'messy').addEventListener('click', function () { if (S) messy(); });
  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });
})();
