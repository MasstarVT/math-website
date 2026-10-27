// The five Platonic solids, scaled so their edges touch a unit sphere. The
// morph is the solid cut by its dual's face planes (normals along its corners):
// push those planes in to the edge midpoints, then push its own planes out.
// The corner view folds k regular p-gons around a point: they close up into a
// corner only when k times the polygon's angle is less than 360°.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('platonic');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var morphInput = V.ctl(section, 'morph');
  var morphOut = V.ctl(section, 'morph-out');
  var autoBtn = V.ctl(section, 'auto');
  var spinBtn = V.ctl(section, 'spin');

  var PHI = (1 + Math.sqrt(5)) / 2, IP = 1 / PHI, TAU = Math.PI * 2;
  var AMBER = [255, 180, 84], CYAN = [110, 231, 255];

  function signs(list) {
    var out = [];
    list.forEach(function (v) {
      for (var m = 0; m < 8; m++) {
        var p = [v[0] * (m & 1 ? -1 : 1), v[1] * (m & 2 ? -1 : 1), v[2] * (m & 4 ? -1 : 1)];
        if (!out.some(function (q) { return q[0] === p[0] && q[1] === p[1] && q[2] === p[2]; })) out.push(p);
      }
    });
    return out;
  }

  var SOLIDS = {
    tetra: { name: 'Tetrahedron', dual: 'tetra', poly: 'triangles', k: 3, ang: 60, half: 'octahedron',
      verts: function () { return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]; } },
    cube: { name: 'Cube', dual: 'octa', poly: 'squares', k: 3, ang: 90, half: 'cuboctahedron',
      verts: function () { return signs([[1, 1, 1]]); } },
    octa: { name: 'Octahedron', dual: 'cube', poly: 'triangles', k: 4, ang: 60, half: 'cuboctahedron',
      verts: function () { return signs([[1, 0, 0], [0, 1, 0], [0, 0, 1]]); } },
    dodeca: { name: 'Dodecahedron', dual: 'icosa', poly: 'pentagons', k: 3, ang: 108, half: 'icosidodecahedron',
      verts: function () { return signs([[1, 1, 1], [0, IP, PHI], [IP, PHI, 0], [PHI, 0, IP]]); } },
    icosa: { name: 'Icosahedron', dual: 'dodeca', poly: 'triangles', k: 5, ang: 60, half: 'icosidodecahedron',
      verts: function () { return signs([[0, 1, PHI], [1, PHI, 0], [PHI, 0, 1]]); } }
  };

  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var n = Math.hypot(a[0], a[1], a[2]); return [a[0] / n, a[1] / n, a[2] / n]; }

  // Face normals from the convex hull of the corners, plus the three radii.
  function analyze(key) {
    var S = SOLIDS[key];
    if (S.data) return S.data;
    var v = S.verts(), n = v.length, faces = [], i, j, k, m;
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        for (k = j + 1; k < n; k++) {
          var nr = cross(sub(v[j], v[i]), sub(v[k], v[i])), len = Math.hypot(nr[0], nr[1], nr[2]);
          if (len < 1e-9) continue;
          nr = [nr[0] / len, nr[1] / len, nr[2] / len];
          var d = dot(nr, v[i]);
          if (d < 0) { nr = [-nr[0], -nr[1], -nr[2]]; d = -d; }
          var ok = true;
          for (m = 0; m < n && ok; m++) if (dot(nr, v[m]) > d + 1e-9) ok = false;
          if (ok && !faces.some(function (f) { return dot(f, nr) > 0.99999; })) faces.push(nr);
        }
      }
    }
    var R = Math.hypot(v[0][0], v[0][1], v[0][2]), r = dot(faces[0], v[0]), e = Infinity, mid = 0;
    for (i = 1; i < n; i++) {
      var dd = Math.hypot(v[i][0] - v[0][0], v[i][1] - v[0][1], v[i][2] - v[0][2]);
      if (dd < e - 1e-9) { e = dd; mid = Math.hypot(v[i][0] + v[0][0], v[i][1] + v[0][1], v[i][2] + v[0][2]) / 2; }
    }
    S.data = { faces: faces, corners: v.map(norm), R: R / mid, r: r / mid };
    return S.data;
  }

  // Clip each plane's big square by every other half-space.
  function polyhedron(planes) {
    var out = [];
    for (var i = 0; i < planes.length; i++) {
      var p = planes[i], nrm = p.n;
      var u = norm(Math.abs(nrm[0]) < 0.9 ? cross(nrm, [1, 0, 0]) : cross(nrm, [0, 1, 0])), w = cross(nrm, u);
      var c = [nrm[0] * p.d, nrm[1] * p.d, nrm[2] * p.d], S = 4, poly = [];
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
        poly.push([c[0] + (u[0] * q[0] + w[0] * q[1]) * S, c[1] + (u[1] * q[0] + w[1] * q[1]) * S, c[2] + (u[2] * q[0] + w[2] * q[1]) * S]);
      });
      for (var j = 0; j < planes.length && poly.length; j++) {
        if (j === i) continue;
        var q = planes[j], next = [];
        for (var k = 0; k < poly.length; k++) {
          var a = poly[k], b = poly[(k + 1) % poly.length];
          var da = dot(q.n, a) - q.d, db = dot(q.n, b) - q.d;
          if (da <= 1e-9) next.push(a);
          if ((da < -1e-9 && db > 1e-9) || (da > 1e-9 && db < -1e-9)) {
            var t = da / (da - db);
            next.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
          }
        }
        poly = next;
      }
      // Skip faces shrunk to a point or a sliver.
      var area = 0;
      for (k = 1; k + 1 < poly.length; k++) {
        var cr = cross(sub(poly[k], poly[0]), sub(poly[k + 1], poly[0]));
        area += Math.hypot(cr[0], cr[1], cr[2]) / 2;
      }
      if (area > 1e-5) out.push({ pts: poly, n: nrm, dual: p.dual });
    }
    return out;
  }

  var solid = 'cube';
  var morph = 0;
  var auto = false, autoT = 0;
  var spin = !V.reducedMotion;
  var view = 'solid';
  var shape = null, shapeKey = '';
  var yaw = 0.62, pitch = 0.42, vyaw = 0, vpitch = 0, drag = null;
  var t = 0, cornerT = 0;

  function currentShape() {
    var key = solid + ':' + morph.toFixed(4);
    if (key === shapeKey) return shape;
    var D = analyze(solid), rP = D.r, RP = D.R, rD = 1 / RP, RD = 1 / rP;
    var a = rP, b = rD;
    if (morph <= 0.5) b = RP + (rD - RP) * (morph / 0.5);
    else a = rP + (RD - rP) * ((morph - 0.5) / 0.5);
    // A hair past touching, so faces that only touch at a point drop out.
    if (morph === 0) b = RP * 1.001;
    if (morph === 1) a = RD * 1.001;
    var planes = D.faces.map(function (n) { return { n: n, d: a, dual: false }; })
      .concat(D.corners.map(function (n) { return { n: n, d: b, dual: true }; }));
    shape = polyhedron(planes);
    shapeKey = key;
    return shape;
  }

  // ---- Solid view ----

  function drawSolid(ctx, W, H) {
    var faces = currentShape(), cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var unit = Math.min(W, H) * 0.29, D = 6, cx = W / 2, cyy = H / 2 + 6;
    var L = norm([-0.45, 0.65, 0.65]);
    function rot(p) {
      var x = p[0] * cy + p[2] * sy, z = -p[0] * sy + p[2] * cy, y = p[1];
      return [x, y * cp - z * sp, y * sp + z * cp];
    }
    var list = faces.map(function (f) {
      var pts = f.pts.map(rot), n = rot(f.n), z = 0, scr = [];
      for (var i = 0; i < pts.length; i++) {
        var s = D / (D - pts[i][2]);
        scr.push([cx + pts[i][0] * s * unit, cyy - pts[i][1] * s * unit]);
        z += pts[i][2];
      }
      var p0 = pts[0], front = n[0] * -p0[0] + n[1] * -p0[1] + n[2] * (D - p0[2]) > 0;
      return { scr: scr, z: z / pts.length, n: n, front: front, dual: f.dual };
    });
    list.sort(function (a, b) { return a.z - b.z; });

    ctx.lineJoin = 'round';
    list.forEach(function (f) {
      ctx.beginPath();
      f.scr.forEach(function (q, i) { if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      ctx.closePath();
      var c = f.dual ? CYAN : AMBER;
      if (!f.front) {
        ctx.fillStyle = 'rgba(' + c.join(',') + ',0.05)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(236,232,223,0.14)';
        ctx.lineWidth = 1;
        ctx.stroke();
        return;
      }
      var lam = Math.max(0, dot(f.n, L)), k = 0.3 + 0.7 * lam, spec = Math.pow(lam, 24) * 0.35;
      ctx.fillStyle = 'rgb(' + Math.round(Math.min(255, c[0] * k + 255 * spec)) + ',' +
        Math.round(Math.min(255, c[1] * k + 255 * spec)) + ',' + Math.round(Math.min(255, c[2] * k + 255 * spec)) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,11,16,0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    var S = SOLIDS[solid], T = SOLIDS[S.dual], text;
    if (morph <= 0.001) text = S.name + '\n' + S.k + ' ' + S.poly + ' at each corner\n' + S.k + ' × ' + S.ang + '° = ' + S.k * S.ang + '° < 360°';
    else if (morph >= 0.999) text = T.name + (S.dual === solid ? ' (its own dual)' : ', the dual') + '\n' + T.k + ' ' + T.poly +
      ' at each corner\n' + T.k + ' × ' + T.ang + '° = ' + T.k * T.ang + '° < 360°';
    else if (Math.abs(morph - 0.5) < 0.006) text = 'halfway: the ' + S.half + '\nevery edge cut at its middle';
    else text = (morph < 0.5 ? S.name : T.name) + ' with its corners cut\nmorphing toward the ' + (morph < 0.5 ? T.name : S.name).toLowerCase();
    V.setText(readout, text);
  }

  // ---- Corner view: k regular p-gons around a point ----

  var CORNERS = [
    [3, 3, 'tetrahedron'], [3, 4, 'octahedron'], [3, 5, 'icosahedron'], [4, 3, 'cube'], [5, 3, 'dodecahedron'],
    [3, 6, 'flat'], [4, 4, 'flat'], [6, 3, 'flat'], [5, 4, 'too much'], [7, 3, 'too much']
  ];

  function drawCorner(ctx, cx, cy, size, p, k, fold, phase) {
    var th = Math.PI - TAU / p, sum = k * th, psi = Math.PI / 2;
    if (sum < TAU - 1e-9) {
      var c2 = Math.cos(TAU / k), cf = Math.sqrt((Math.cos(th) - c2) / (1 - c2));
      psi = Math.PI / 2 + (Math.acos(cf) - Math.PI / 2) * fold;
    }
    var sp = Math.sin(psi), cpz = Math.cos(psi);
    var alpha = sp > 1 - 1e-9 ? th : Math.acos(Math.max(-1, Math.min(1, (Math.cos(th) - cpz * cpz) / (sp * sp))));
    var start = phase - (k * alpha) / 2;
    var rays = [];
    for (var j = 0; j <= k; j++) {
      var a = start + j * alpha;
      rays.push([sp * Math.cos(a), sp * Math.sin(a), -cpz]);
    }
    // Tilt so the corner points up out of the page a little.
    var tilt = 0.95, ct = Math.cos(tilt), st = Math.sin(tilt);
    var scale = size * 0.46 * Math.sin(Math.PI / p);
    var faces = [];
    for (j = 0; j < k; j++) {
      var A = rays[j], B = rays[j + 1], ab = dot(A, B);
      var b = norm([B[0] - ab * A[0], B[1] - ab * A[1], B[2] - ab * A[2]]);
      var pts = [], x = 0, y = 0, z = 0;
      for (var m = 0; m < p; m++) {
        var q = [x * A[0] + y * b[0], x * A[1] + y * b[1], x * A[2] + y * b[2]];
        pts.push(q);
        z += -q[1] * st + q[2] * ct;
        x += Math.cos(m * TAU / p);
        y += Math.sin(m * TAU / p);
      }
      var nn = norm(cross(A, b));
      if (nn[2] < 0) nn = [-nn[0], -nn[1], -nn[2]];
      var nv = [nn[0], nn[1] * ct + nn[2] * st, -nn[1] * st + nn[2] * ct];
      faces.push({ pts: pts, z: z / p, n: nv, over: (j + 1) * th > TAU + 1e-6 });
    }
    // Far faces first; a face that overlaps the first goes on top so it shows.
    faces.sort(function (f, g) { return (f.over - g.over) || (f.z - g.z); });
    var light = norm([-0.4, 0.5, 0.75]);
    faces.forEach(function (f) {
      ctx.beginPath();
      f.pts.forEach(function (q, i) {
        var X = cx + q[0] * scale, Y = cy - (q[1] * ct + q[2] * st) * scale;
        if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      });
      ctx.closePath();
      var lam = 0.4 + 0.6 * Math.abs(dot(f.n, light));
      var c = f.over ? [255, 95, 162] : AMBER;
      ctx.fillStyle = 'rgba(' + Math.round(c[0] * lam) + ',' + Math.round(c[1] * lam) + ',' + Math.round(c[2] * lam) + ',' + (f.over ? 0.75 : 0.92) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,11,16,0.85)';
      ctx.lineWidth = 1.25;
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  function drawCorners(ctx, W, H) {
    var top = 66, cols = 5, rows = 2, cw = W / cols, ch = (H - top) / rows, narrow = cw < 110;
    // Fold up, hold, open out, hold.
    var ph = cornerT % 7, fold = ph < 1.5 ? ph / 1.5 : ph < 4.5 ? 1 : ph < 6 ? 1 - (ph - 4.5) / 1.5 : 0;
    fold = V.reducedMotion ? 1 : V.easeInOut(fold);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (var i = 0; i < CORNERS.length; i++) {
      var c = CORNERS[i], p = c[0], k = c[1], ang = 180 - 360 / p, sum = k * ang;
      var col = i % cols, row = Math.floor(i / cols);
      var x = cw * (col + 0.5), y = top + ch * row;
      var labelH = narrow ? 44 : 34, size = Math.min(cw * 0.9, ch - labelH - 8);
      drawCorner(ctx, x, y + (ch - labelH) * 0.52, size, p, k, sum < 360 ? fold : 0, -Math.PI / 2 + t * 0.25);
      var a = Math.round(ang * 10) / 10, sumTxt = Math.round(sum * 10) / 10;
      var good = sum < 360 - 1e-9, flat = Math.abs(sum - 360) < 1e-9;
      ctx.font = '500 ' + (narrow ? 10 : 11) + 'px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillStyle = '#9b9daf';
      var base = y + ch - labelH + 6;
      if (narrow) {
        ctx.fillText(k + ' × ' + a + '°', x, base);
        ctx.fillText('= ' + sumTxt + '°', x, base + 13);
      } else {
        ctx.fillText(k + ' × ' + a + '° = ' + sumTxt + '°', x, base);
      }
      ctx.font = '600 ' + (narrow ? 11 : 12) + 'px "IBM Plex Sans", system-ui, sans-serif';
      ctx.fillStyle = good ? '#ffb454' : flat ? '#9b9daf' : '#ff5fa2';
      ctx.fillText(c[2], x, base + (narrow ? 27 : 16));
    }
    V.setText(readout, 'angles at a corner must\nadd to less than 360°');
  }

  // ---- Loop ----

  function frame(dt, st) {
    // The corner view's folding and turning pause with Spin.
    if (spin) {
      t += dt;
      cornerT += dt;
    }
    if (auto) {
      autoT += dt;
      setMorph(0.5 - 0.5 * Math.cos(autoT * 0.55), true);
    }
    if (!drag) {
      if (spin) yaw += dt * 0.32;
      yaw += vyaw * dt;
      pitch = clampPitch(pitch + vpitch * dt);
      var decay = Math.exp(-dt * 2.5);
      vyaw *= decay;
      vpitch *= decay;
    }
    var moving = auto || drag || spin || Math.abs(vyaw) > 1e-3 || Math.abs(vpitch) > 1e-3;
    if (!moving && !st.dirty) return;
    st.dirty = false;
    var ctx = st.ctx, W = st.width, H = st.height;
    ctx.clearRect(0, 0, W, H);
    if (view === 'solid') drawSolid(ctx, W, H);
    else drawCorners(ctx, W, H);
  }

  function clampPitch(p) { return Math.max(-1.45, Math.min(1.45, p)); }

  var stage = V.createStage(canvas, { frame: frame });
  function touch() { stage.dirty = true; }

  // ---- Controls ----

  function setMorph(m, fromAuto) {
    morph = Math.max(0, Math.min(1, m));
    if (fromAuto) morphInput.value = String(Math.round(morph * 100));
    morphOut.textContent = Math.round(morph * 100) + '%';
    if (stage) touch();
  }

  morphInput.addEventListener('input', function () {
    setAuto(false);
    setMorph(parseFloat(morphInput.value) / 100, false);
  });
  setMorph(0, true);

  function setAuto(on) {
    if (on && !auto) autoT = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * morph))) / 0.55;
    auto = on;
    autoBtn.setAttribute('aria-pressed', String(on));
  }
  V.toggle(autoBtn, setAuto);

  spinBtn.setAttribute('aria-pressed', String(spin));
  V.toggle(spinBtn, function (on) { spin = on; touch(); });

  V.segmented(V.ctl(section, 'solid'), function (v) { solid = v; touch(); });
  V.segmented(V.ctl(section, 'view'), function (v) {
    view = v;
    cornerT = 0;
    // Solid and morph do nothing in the corner view.
    V.ctl(section, 'solid-control').hidden = v !== 'solid';
    V.ctl(section, 'morph-control').hidden = v !== 'solid';
    autoBtn.hidden = v !== 'solid';
    if (v !== 'solid') setAuto(false);
    touch();
  });

  // ---- Drag to orbit ----

  canvas.addEventListener('pointerdown', function (e) {
    drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    vyaw = vpitch = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-grabbing');
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var now = performance.now();
    var dx = (e.clientX - drag.x) * 0.008, dy = (e.clientY - drag.y) * 0.008;
    var dts = Math.max((now - drag.t) / 1000, 0.008);
    yaw += dx;
    pitch = clampPitch(pitch + dy);
    vyaw = vyaw * 0.5 + (dx / dts) * 0.5;
    vpitch = vpitch * 0.5 + (dy / dts) * 0.5;
    drag = { x: e.clientX, y: e.clientY, t: now };
    touch();
  });

  function endDrag() {
    if (!drag) return;
    if (performance.now() - drag.t > 80) vyaw = vpitch = 0;
    drag = null;
    canvas.classList.remove('is-grabbing');
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
})();
