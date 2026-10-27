// Euler characteristic: V − E + F is 2 for a polyhedron without holes and 2 − 2g
// with g holes; splitting faces leaves it alone. The double torus is a slab with
// two holes, rounded by Catmull–Clark subdivision.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('euler-char');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var shapeGroup = V.ctl(section, 'shape');
  var splitBtn = V.ctl(section, 'split');
  var playBtn = V.ctl(section, 'play');

  var TAU = Math.PI * 2;
  var PHI = (1 + Math.sqrt(5)) / 2;
  var D = 7;
  var MAX_FACES = 1000;

  var name = 'cube';
  var mesh = null;           // { verts, faces, edges, holes }
  var cache = {};
  var yaw = 0.6, pitch = 0.45, vyaw = 0;
  var playing = !V.reducedMotion;
  var count = null;          // { t, vOrder, eOrder, fOrder } while counting
  var drag = null;

  // ---- Building meshes ----

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  function centroid(verts, f) {
    var c = [0, 0, 0];
    f.forEach(function (i) { c[0] += verts[i][0]; c[1] += verts[i][1]; c[2] += verts[i][2]; });
    return [c[0] / f.length, c[1] / f.length, c[2] / f.length];
  }

  // Newell's method: a robust normal for any planar-ish polygon.
  function normal(verts, f) {
    var n = [0, 0, 0];
    for (var k = 0; k < f.length; k++) {
      var a = verts[f[k]], b = verts[f[(k + 1) % f.length]];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]);
      n[1] += (a[2] - b[2]) * (a[0] + b[0]);
      n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return n;
  }

  // For solids around the origin: make every face wind outward.
  function outward(verts, faces) {
    return faces.map(function (f) {
      return dot(normal(verts, f), centroid(verts, f)) < 0 ? f.slice().reverse() : f;
    });
  }

  function finish(verts, faces, holes) {
    var r = 0;
    verts.forEach(function (v) { r = Math.max(r, Math.hypot(v[0], v[1], v[2])); });
    verts = verts.map(function (v) { return [v[0] / r, v[1] / r, v[2] / r]; });
    var seen = {}, edges = [];
    faces.forEach(function (f) {
      for (var k = 0; k < f.length; k++) {
        var a = f[k], b = f[(k + 1) % f.length], key = Math.min(a, b) + ',' + Math.max(a, b);
        if (!seen[key]) { seen[key] = 1; edges.push([a, b]); }
      }
    });
    return { verts: verts, faces: faces, edges: edges, holes: holes };
  }

  function cube() {
    var v = [];
    for (var i = 0; i < 8; i++) v.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1]);
    var f = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]];
    return finish(v, outward(v, f), 0);
  }

  function octahedron() {
    var v = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], f = [];
    [0, 1].forEach(function (x) { [2, 3].forEach(function (y) { [4, 5].forEach(function (z) { f.push([x, y, z]); }); }); });
    return finish(v, outward(v, f), 0);
  }

  // Cut each corner off an icosahedron a third of the way along its edges:
  // 12 pentagons and 20 hexagons.
  function soccer() {
    var ico = [];
    [-1, 1].forEach(function (a) {
      [-PHI, PHI].forEach(function (b) {
        ico.push([0, a, b], [a, b, 0], [b, 0, a]);
      });
    });
    var nb = ico.map(function () { return []; }), i, j;
    for (i = 0; i < 12; i++) {
      for (j = 0; j < 12; j++) {
        var d = sub(ico[i], ico[j]);
        if (i !== j && Math.abs(dot(d, d) - 4) < 1e-6) nb[i].push(j);
      }
    }
    var verts = [], id = {};
    function at(a, b) {
      var key = a + ',' + b;
      if (id[key] == null) {
        id[key] = verts.length;
        verts.push([ico[a][0] + (ico[b][0] - ico[a][0]) / 3, ico[a][1] + (ico[b][1] - ico[a][1]) / 3, ico[a][2] + (ico[b][2] - ico[a][2]) / 3]);
      }
      return id[key];
    }
    var faces = [];
    for (i = 0; i < 12; i++) {
      var axis = ico[i], u = cross(axis, Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]), w = cross(axis, u);
      var ring = nb[i].slice().sort(function (p, q) {
        var dp = sub(ico[p], axis), dq = sub(ico[q], axis);
        return Math.atan2(dot(dp, w), dot(dp, u)) - Math.atan2(dot(dq, w), dot(dq, u));
      });
      faces.push(ring.map(function (b) { return at(i, b); }));
    }
    for (i = 0; i < 12; i++) {
      for (j = i + 1; j < 12; j++) {
        if (nb[i].indexOf(j) < 0) continue;
        for (var k = j + 1; k < 12; k++) {
          if (nb[i].indexOf(k) < 0 || nb[j].indexOf(k) < 0) continue;
          faces.push([at(i, j), at(j, i), at(j, k), at(k, j), at(k, i), at(i, k)]);
        }
      }
    }
    return finish(verts, outward(verts, faces), 0);
  }

  // A random rock: the convex hull of scattered points. A triple is a face
  // when every other point lies on one side of its plane.
  function rock() {
    var pts = [], n = 22, i, j, k;
    while (pts.length < n) {
      var p = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1], l = Math.hypot(p[0], p[1], p[2]);
      if (l < 0.2 || l > 1) continue;
      var r = 0.82 + Math.random() * 0.18;
      pts.push([p[0] / l * r * 1.12, p[1] / l * r, p[2] / l * r * 0.88]);
    }
    var faces = [];
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        for (k = j + 1; k < n; k++) {
          var nn = cross(sub(pts[j], pts[i]), sub(pts[k], pts[i])), pos = 0, neg = 0;
          for (var m = 0; m < n && !(pos && neg); m++) {
            if (m === i || m === j || m === k) continue;
            if (dot(nn, sub(pts[m], pts[i])) > 0) pos++; else neg++;
          }
          if (!pos) faces.push([i, j, k]);
          else if (!neg) faces.push([i, k, j]);
        }
      }
    }
    // Drop points hidden inside, and renumber.
    var map = {}, verts = [];
    faces = faces.map(function (f) {
      return f.map(function (q) {
        if (map[q] == null) { map[q] = verts.length; verts.push(pts[q]); }
        return map[q];
      });
    });
    return finish(verts, faces, 0);
  }

  function torus() {
    var NU = 16, NV = 8, R = 1, r = 0.45, verts = [], faces = [], i, j;
    for (i = 0; i < NU; i++) {
      for (j = 0; j < NV; j++) {
        var u = i * TAU / NU, v = j * TAU / NV;
        verts.push([(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v)]);
      }
    }
    function id(a, b) { return (a % NU) * NV + (b % NV); }
    for (i = 0; i < NU; i++) for (j = 0; j < NV; j++) faces.push([id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)]);
    return finish(verts, faces, 1);
  }

  // A thick slab with two square holes, built from unit-ish squares.
  function doubleTorus() {
    var xs = [0, 1, 2.6, 3.6, 5.2, 6.2], ys = [0, 1, 2.6, 3.6];
    var holes = { '1,1': 1, '3,1': 1 };
    function solid(i, j) { return i >= 0 && j >= 0 && i < 5 && j < 3 && !holes[i + ',' + j]; }
    var verts = [], i, j;
    function id(i2, j2, top) { return (j2 * 6 + i2) * 2 + (top ? 1 : 0); }
    for (j = 0; j < 4; j++) {
      for (i = 0; i < 6; i++) {
        verts.push([xs[i] - 3.1, ys[j] - 1.8, -0.5]);
        verts.push([xs[i] - 3.1, ys[j] - 1.8, 0.5]);
      }
    }
    var faces = [];
    for (j = 0; j < 3; j++) {
      for (i = 0; i < 5; i++) {
        if (!solid(i, j)) continue;
        var c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
        faces.push(c.map(function (p) { return id(p[0], p[1], true); }));
        faces.push(c.slice().reverse().map(function (p) { return id(p[0], p[1], false); }));
        // Walls wherever the neighbor across an edge is empty. The square's
        // own corners run counterclockwise, so the solid is on the left.
        var across = [[i, j - 1], [i + 1, j], [i, j + 1], [i - 1, j]];
        for (var k = 0; k < 4; k++) {
          if (solid(across[k][0], across[k][1])) continue;
          var p = c[k], q = c[(k + 1) % 4];
          faces.push([id(p[0], p[1], false), id(q[0], q[1], false), id(q[0], q[1], true), id(p[0], p[1], true)]);
        }
      }
    }
    var m = subdivide(subdivide({ verts: verts, faces: faces }, true), true);
    return finish(m.verts, m.faces, 2);
  }

  // Catmull–Clark when smooth, plain splitting otherwise: every n-gon becomes
  // n quads around a new point in its middle.
  function subdivide(m, smooth) {
    var verts = m.verts, faces = m.faces, nV = verts.length, nF = faces.length;
    var emap = {}, edges = [];
    var vFaces = verts.map(function () { return []; }), vEdges = verts.map(function () { return []; });
    faces.forEach(function (f, fi) {
      for (var k = 0; k < f.length; k++) {
        var a = f[k], b = f[(k + 1) % f.length], key = Math.min(a, b) + ',' + Math.max(a, b);
        if (emap[key] == null) {
          emap[key] = edges.length;
          edges.push({ a: a, b: b, faces: [] });
          vEdges[a].push(emap[key]);
          vEdges[b].push(emap[key]);
        }
        edges[emap[key]].faces.push(fi);
        vFaces[a].push(fi);
      }
    });
    var fp = faces.map(function (f) { return centroid(verts, f); });
    function avg(list) {
      var s = [0, 0, 0];
      list.forEach(function (p) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; });
      return [s[0] / list.length, s[1] / list.length, s[2] / list.length];
    }
    var ep = edges.map(function (e) {
      var ends = [verts[e.a], verts[e.b]];
      if (smooth && e.faces.length === 2) return avg(ends.concat([fp[e.faces[0]], fp[e.faces[1]]]));
      return avg(ends);
    });
    var out = verts.map(function (p, v) {
      if (!smooth) return p;
      var n = vEdges[v].length;
      var F = avg(vFaces[v].map(function (fi) { return fp[fi]; }));
      var R = avg(vEdges[v].map(function (ei) { return avg([verts[edges[ei].a], verts[edges[ei].b]]); }));
      return [(F[0] + 2 * R[0] + (n - 3) * p[0]) / n, (F[1] + 2 * R[1] + (n - 3) * p[1]) / n, (F[2] + 2 * R[2] + (n - 3) * p[2]) / n];
    });
    out = out.concat(fp, ep);
    var nf = [];
    faces.forEach(function (f, fi) {
      var L = f.length;
      for (var k = 0; k < L; k++) {
        var a = f[k], b = f[(k + 1) % L], z = f[(k + L - 1) % L];
        nf.push([a, nV + nF + emap[Math.min(a, b) + ',' + Math.max(a, b)], nV + fi, nV + nF + emap[Math.min(z, a) + ',' + Math.max(z, a)]]);
      }
    });
    return { verts: out, faces: nf };
  }

  var BUILD = { cube: cube, octahedron: octahedron, soccer: soccer, rock: rock, torus: torus, double: doubleTorus };

  function load(n, fresh) {
    name = n;
    if (fresh || !cache[n]) cache[n] = BUILD[n]();
    mesh = cache[n];
    count = null;
    updateSplit();
  }

  function updateSplit() {
    var sides = 0;
    mesh.faces.forEach(function (f) { sides += f.length; });
    splitBtn.disabled = sides > MAX_FACES;
  }

  // ---- Drawing ----

  function frame(dt, st) {
    var W = st.width, H = st.height;
    if (!mesh) load(name);
    if (playing && !drag) yaw += dt * 0.3;
    if (!drag) { yaw += vyaw * dt; vyaw *= Math.exp(-dt * 2.5); }
    if (count) {
      count.t += dt;
      if (count.t > 6.2) count = null;
    }

    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var m = Math.min(W, H), unit = m * (mesh.holes ? 0.4 : 0.34), ox = W / 2, oy = H / 2 + m * 0.03;
    var P = mesh.verts.map(function (v) {
      var x = v[0] * cy - v[1] * sy, y = v[0] * sy + v[1] * cy, z = v[2];
      var y2 = y * cp - z * sp, z2 = y * sp + z * cp, k = D / (D + y2);
      return [ox + x * k * unit, oy - z2 * k * unit, y2];
    });

    var L = [-0.4, -0.75, 0.55], ll = Math.hypot(L[0], L[1], L[2]);
    var vis = [];
    mesh.faces.forEach(function (f, fi) {
      var area = 0, depth = 0;
      for (var k = 0; k < f.length; k++) {
        var a = P[f[k]], b = P[f[(k + 1) % f.length]];
        area += a[0] * b[1] - b[0] * a[1];
        depth += a[2];
      }
      if (area >= 0) return;
      vis.push({ f: fi, depth: depth / f.length });
    });
    vis.sort(function (a, b) { return b.depth - a.depth; });

    var phase = count ? Math.min(3, Math.floor(count.t / 1.6)) : 3;
    var prog = count ? Math.min(1, (count.t % 1.6) / 1.3) : 1;
    var litV = count ? (phase > 0 ? Infinity : Math.floor(prog * mesh.verts.length)) : -1;
    var litE = count ? (phase > 1 ? Infinity : phase === 1 ? Math.floor(prog * mesh.edges.length) : 0) : -1;
    var litF = count ? (phase > 2 ? Infinity : phase === 2 ? Math.floor(prog * mesh.faces.length) : 0) : -1;
    if (count && count.t > 4.8) litV = litE = litF = -1;

    var ctx = st.ctx;
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round';
    var dots = mesh.verts.length <= 260;
    // Each corner is drawn with the nearest face it belongs to, so nearer faces
    // don't paint over it.
    var last = new Int32Array(mesh.verts.length).fill(-1);
    vis.forEach(function (it, n) { mesh.faces[it.f].forEach(function (v) { last[v] = n; }); });
    var vr = Math.max(1.6, Math.min(3.2, 26 / Math.sqrt(mesh.verts.length)));

    vis.forEach(function (it, order) {
      var f = mesh.faces[it.f], wn = worldNormal(f), b = Math.abs(rotDot(wn, cy, sy, cp, sp, L) / ll);
      var light = 0.28 + 0.72 * b, base;
      if (litF >= 0 && count.fRank[it.f] < litF) base = [255, 95, 162];
      else if (name === 'soccer') base = f.length === 5 ? [70, 74, 96] : [205, 210, 228];
      else base = [120, 132, 178];
      ctx.beginPath();
      ctx.moveTo(P[f[0]][0], P[f[0]][1]);
      for (var k = 1; k < f.length; k++) ctx.lineTo(P[f[k]][0], P[f[k]][1]);
      ctx.closePath();
      ctx.fillStyle = 'rgb(' + Math.round(14 + (base[0] - 14) * light) + ',' + Math.round(16 + (base[1] - 16) * light) + ',' + Math.round(26 + (base[2] - 26) * light) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,11,16,0.85)';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      if (litE >= 0) {
        ctx.beginPath();
        for (k = 0; k < f.length; k++) {
          var a = f[k], c = f[(k + 1) % f.length];
          if (count.eRank[edgeKey(a, c)] < litE) {
            ctx.moveTo(P[a][0], P[a][1]);
            ctx.lineTo(P[c][0], P[c][1]);
          }
        }
        ctx.strokeStyle = '#6ee7ff';
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }
      if (dots || litV >= 0) {
        for (k = 0; k < f.length; k++) {
          var v = f[k];
          if (last[v] !== order) continue;
          var on = litV >= 0 && count.vRank[v] < litV;
          if (!on && !dots) continue;
          ctx.beginPath();
          ctx.arc(P[v][0], P[v][1], on ? vr + 1.6 : vr, 0, TAU);
          ctx.fillStyle = on ? '#ffd166' : 'rgba(236,232,223,0.85)';
          ctx.fill();
        }
      }
    });

    updateReadout(litV, litE, litF);
  }

  function worldNormal(f) {
    var n = normal(mesh.verts, f), l = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  }

  function rotDot(n, cy, sy, cp, sp, L) {
    var x = n[0] * cy - n[1] * sy, y = n[0] * sy + n[1] * cy, z = n[2];
    return x * L[0] + (y * cp - z * sp) * L[1] + (y * sp + z * cp) * L[2];
  }

  function edgeKey(a, b) { return Math.min(a, b) + ',' + Math.max(a, b); }

  function updateReadout(litV, litE, litF) {
    var nV = mesh.verts.length, nE = mesh.edges.length, nF = mesh.faces.length;
    var chi = nV - nE + nF, text;
    if (count && count.t <= 4.8) {
      var cv = Math.min(nV, litV), ce = Math.max(0, Math.min(nE, litE)), cf = Math.max(0, Math.min(nF, litF));
      text = 'V ' + cv + (litE > 0 ? '   E ' + ce : '') + (litF > 0 ? '   F ' + cf : '') + '\nCounting ' + ['corners', 'edges', 'faces', 'faces'][Math.min(3, Math.floor(count.t / 1.6))];
    } else {
      var minus = '−';
      text = 'V ' + nV + '   E ' + nE + '   F ' + nF + '\n' + nV + ' ' + minus + ' ' + nE + ' + ' + nF + ' = ' + (chi < 0 ? minus + -chi : chi);
      var g = mesh.holes;
      text += '\n' + (g ? g + (g > 1 ? ' holes' : ' hole') + ': 2 ' + minus + ' 2 × ' + g + ' = ' + (chi < 0 ? minus + -chi : chi) : 'No holes: always 2');
    }
    V.setText(readout, text);
  }

  function startCount() {
    // Count in a sweep from left to right as the shape sits now.
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    function sx(p) { return p[0] * cy - p[1] * sy; }
    function rank(list, key) {
      var idx = list.map(function (x, i) { return i; });
      idx.sort(function (a, b) { return key(a) - key(b); });
      var r = [];
      idx.forEach(function (i, k) { r[i] = k; });
      return r;
    }
    var vr = rank(mesh.verts, function (i) { return sx(mesh.verts[i]); });
    var er = rank(mesh.edges, function (i) { var e = mesh.edges[i]; return sx(mesh.verts[e[0]]) + sx(mesh.verts[e[1]]); });
    var eRank = {};
    mesh.edges.forEach(function (e, i) { eRank[edgeKey(e[0], e[1])] = er[i]; });
    var fr = rank(mesh.faces, function (i) { return sx(centroid(mesh.verts, mesh.faces[i])); });
    count = { t: 0, vRank: vr, eRank: eRank, fRank: fr };
  }

  V.createStage(canvas, { frame: frame });

  // ---- Drag to orbit ----

  canvas.addEventListener('pointerdown', function (e) {
    drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    vyaw = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-grabbing');
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var now = performance.now(), dx = (e.clientX - drag.x) * 0.008, dy = (e.clientY - drag.y) * 0.008;
    yaw += dx;
    pitch = Math.max(-1.4, Math.min(1.4, pitch + dy));
    vyaw = vyaw * 0.5 + dx / Math.max((now - drag.t) / 1000, 0.008) * 0.5;
    drag = { x: e.clientX, y: e.clientY, t: now };
  });
  function endDrag() {
    if (!drag) return;
    if (performance.now() - drag.t > 80) vyaw = 0;
    drag = null;
    canvas.classList.remove('is-grabbing');
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ---- Controls ----

  V.segmented(shapeGroup, function (v) { load(v, v === 'rock'); });
  V.ctl(section, 'count').addEventListener('click', function () { if (mesh) startCount(); });
  splitBtn.addEventListener('click', function () {
    if (!mesh || splitBtn.disabled) return;
    var m = subdivide(mesh, false);
    mesh = finish(m.verts, m.faces, mesh.holes);
    count = null;
    updateSplit();
  });
  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });
})();
