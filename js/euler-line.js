// Triangle centers: centroid G (medians), circumcenter O (perpendicular
// bisectors), orthocenter H (altitudes), incenter I (angle bisectors).
// H = A + B + C − 2·O, so O, G, H share a line with OG : GH = 1 : 2.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('euler-line');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var presetGroup = V.ctl(section, 'preset');
  var driftBtn = V.ctl(section, 'drift');

  var COL = { G: '#7ee0a1', O: '#6ee7ff', H: '#ffb454', I: '#a78bfa', E: '#ff5fa2', T: '#ece8df' };
  var LABEL = '600 13px "IBM Plex Mono", ui-monospace, monospace';

  // Corners in units of the canvas's shorter side, measured from its center.
  var PRESETS = {
    equilateral: [[0, -0.33], [-0.3118, 0.21], [0.3118, 0.21]],
    isosceles: [[0, -0.37], [-0.21, 0.3], [0.21, 0.3]],
    right: [[-0.3, -0.32], [-0.3, 0.3], [0.36, 0.3]],
    obtuse: [[-0.15, -0.05], [-0.48, 0.3], [0.48, 0.3]]
  };
  var base = [[-0.08, -0.36], [-0.42, 0.27], [0.4, 0.21]];
  var SPEED = [[0.31, 0.43], [0.37, 0.29], [0.41, 0.34]];
  var PHASE = [[0.3, 1.9], [2.2, 0.7], [4.1, 3.3]];
  var AMP = 0.045;

  var show = { medians: false, bisectors: false, altitudes: false, angles: false, line: true, nine: true };
  var drift = !V.reducedMotion;
  var t = 0;
  var held = -1;
  var W = 0, H = 0, S = 1;
  var P = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];

  function offset(k) {
    return [AMP * Math.sin(t * SPEED[k][0] + PHASE[k][0]), AMP * Math.sin(t * SPEED[k][1] + PHASE[k][1])];
  }

  function place() {
    for (var k = 0; k < 3; k++) {
      var o = drift ? offset(k) : [0, 0];
      P[k].x = W / 2 + (base[k][0] + o[0]) * S;
      P[k].y = H / 2 + (base[k][1] + o[1]) * S;
    }
  }

  function pt(x, y) { return { x: x, y: y }; }
  function mid(a, b) { return pt((a.x + b.x) / 2, (a.y + b.y) / 2); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function foot(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var s = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
    return { x: a.x + s * dx, y: a.y + s * dy, s: s };
  }

  function angleAt(p, a, b) {
    var ux = a.x - p.x, uy = a.y - p.y, vx = b.x - p.x, vy = b.y - p.y;
    var c = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
    return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
  }

  function centers() {
    var A = P[0], B = P[1], C = P[2];
    var a = dist(B, C), b = dist(C, A), c = dist(A, B);
    var G = pt((A.x + B.x + C.x) / 3, (A.y + B.y + C.y) / 3);
    // Circumcenter, worked out relative to A for precision.
    var bx = B.x - A.x, by = B.y - A.y, cx = C.x - A.x, cy = C.y - A.y;
    var d = 2 * (bx * cy - by * cx);
    var out = { A: A, B: B, C: C, a: a, b: b, c: c, G: G, ok: Math.abs(d) > 1e-6 * S * S };
    if (out.ok) {
      var b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
      out.O = pt(A.x + (cy * b2 - by * c2) / d, A.y + (bx * c2 - cx * b2) / d);
      out.R = dist(out.O, A);
      out.H = pt(A.x + B.x + C.x - 2 * out.O.x, A.y + B.y + C.y - 2 * out.O.y);
      out.N = mid(out.O, out.H);
    }
    var per = a + b + c;
    out.I = pt((a * A.x + b * B.x + c * C.x) / per, (a * A.y + b * B.y + c * C.y) / per);
    out.r = Math.abs(d) / 2 / per;
    return out;
  }

  // ---- Drawing ----

  function line(ctx, a, b) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function fullLine(ctx, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, n = Math.hypot(dx, dy);
    if (n < 1e-9) return;
    var L = (W + H) * 2 / n;
    line(ctx, pt(a.x - dx * L, a.y - dy * L), pt(a.x + dx * L, a.y + dy * L));
  }

  function circle(ctx, c, r) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  function dot(ctx, p, r, fill) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#0a0b10';
    ctx.stroke();
  }

  function label(ctx, text, x, y, color) {
    ctx.font = LABEL;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(13,15,22,0.92)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function frame(dt, st) {
    if (drift && held < 0) {
      t += dt;
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    W = st.width;
    H = st.height;
    S = Math.min(W, H);
    place();

    var ctx = st.ctx, c = centers(), A = c.A, B = c.B, C = c.C;
    var Ma = mid(B, C), Mb = mid(C, A), Mc = mid(A, B);
    var V3 = [A, B, C], M3 = [Ma, Mb, Mc];
    var k;
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.lineTo(C.x, C.y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(236,232,223,0.045)';
    ctx.fill();

    if (show.bisectors && c.ok) {
      ctx.strokeStyle = 'rgba(110,231,255,0.18)';
      ctx.lineWidth = 1;
      for (k = 0; k < 3; k++) {
        var s0 = V3[(k + 1) % 3], s1 = V3[(k + 2) % 3];
        fullLine(ctx, M3[k], pt(M3[k].x - (s1.y - s0.y), M3[k].y + (s1.x - s0.x)));
      }
      ctx.strokeStyle = 'rgba(110,231,255,0.75)';
      ctx.lineWidth = 1.5;
      for (k = 0; k < 3; k++) line(ctx, M3[k], c.O);
      ctx.strokeStyle = 'rgba(110,231,255,0.5)';
      circle(ctx, c.O, c.R);
    }

    if (show.angles) {
      ctx.strokeStyle = 'rgba(167,139,250,0.8)';
      ctx.lineWidth = 1.5;
      var len = [c.a, c.b, c.c];
      for (k = 0; k < 3; k++) {
        var q0 = V3[(k + 1) % 3], q1 = V3[(k + 2) % 3];
        var l0 = len[(k + 2) % 3], l1 = len[(k + 1) % 3];
        // The bisector splits the opposite side in the ratio of the other two.
        line(ctx, V3[k], pt((l1 * q0.x + l0 * q1.x) / (l0 + l1), (l1 * q0.y + l0 * q1.y) / (l0 + l1)));
      }
      ctx.strokeStyle = 'rgba(167,139,250,0.55)';
      circle(ctx, c.I, c.r);
    }

    if (show.medians) {
      ctx.strokeStyle = 'rgba(126,224,161,0.8)';
      ctx.lineWidth = 1.5;
      for (k = 0; k < 3; k++) line(ctx, V3[k], M3[k]);
    }

    var feet = [];
    for (k = 0; k < 3; k++) feet.push(foot(V3[k], V3[(k + 1) % 3], V3[(k + 2) % 3]));

    if (show.altitudes && c.ok) {
      ctx.lineWidth = 1.5;
      for (k = 0; k < 3; k++) {
        var f = feet[k], p = V3[k], e0 = V3[(k + 1) % 3], e1 = V3[(k + 2) % 3];
        ctx.strokeStyle = 'rgba(255,180,84,0.85)';
        ctx.setLineDash([]);
        line(ctx, p, f);
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = 'rgba(255,180,84,0.5)';
        // Feet that miss the side, and an orthocenter outside, get dashed extensions.
        if (f.s < 0) line(ctx, e0, f);
        if (f.s > 1) line(ctx, e1, f);
        var hx = c.H.x - p.x, hy = c.H.y - p.y, fx = f.x - p.x, fy = f.y - p.y;
        var h = (hx * fx + hy * fy) / (fx * fx + fy * fy || 1);
        if (h > 1) line(ctx, f, c.H);
        if (h < 0) line(ctx, p, c.H);
        ctx.setLineDash([]);
      }
    }

    if (show.line && c.ok && dist(c.O, c.H) > 0.5) {
      ctx.strokeStyle = COL.E;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85;
      fullLine(ctx, c.O, c.H);
      ctx.globalAlpha = 1;
    }

    if (show.nine && c.ok) {
      ctx.strokeStyle = 'rgba(255,95,162,0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      circle(ctx, c.N, c.R / 2);
      ctx.setLineDash([]);
      var nine = M3.concat(feet, [mid(A, c.H), mid(B, c.H), mid(C, c.H)]);
      ctx.fillStyle = COL.E;
      for (k = 0; k < 9; k++) {
        ctx.beginPath();
        ctx.arc(nine[k].x, nine[k].y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.strokeStyle = COL.T;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.lineTo(C.x, C.y);
    ctx.closePath();
    ctx.stroke();

    // Centers, with labels nudged so coincident ones stay readable.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    var list = [['I', c.I, 1, 1]];
    if (c.ok) list.push(['O', c.O, 1, -1], ['H', c.H, -1, -1]);
    if (c.ok && show.nine) list.push(['N', c.N, -1, 1]);
    list.push(['G', c.G, 1, -1]);
    for (k = 0; k < list.length; k++) {
      var nm = list[k][0], q = list[k][1];
      var col = nm === 'N' ? COL.E : COL[nm];
      dot(ctx, q, nm === 'N' ? 3.5 : 5, col);
      ctx.textAlign = list[k][2] > 0 ? 'left' : 'right';
      label(ctx, nm, q.x + list[k][2] * 9, q.y + list[k][3] * 10, col);
    }

    ctx.textAlign = 'center';
    for (k = 0; k < 3; k++) {
      var v = V3[k], ux = v.x - c.G.x, uy = v.y - c.G.y, un = Math.hypot(ux, uy) || 1;
      dot(ctx, v, held === k ? 8 : 6.5, '#ffffff');
      label(ctx, 'ABC'[k], v.x + ux / un * 20, v.y + uy / un * 20, COL.T);
    }

    var text = 'angles ' + Math.round(angleAt(A, B, C)) + '° ' + Math.round(angleAt(B, C, A)) + '° ' +
      Math.round(angleAt(C, A, B)) + '°';
    if (c.ok) {
      var og = dist(c.O, c.G), gh = dist(c.G, c.H);
      text += og < 0.5 ? '\nO, G and H meet' : '\nOG : GH = 1 : ' + (gh / og).toFixed(2);
      if (og >= 0.5) {
        var ex = c.H.x - c.O.x, ey = c.H.y - c.O.y;
        var off = Math.abs((c.I.x - c.O.x) * ey - (c.I.y - c.O.y) * ex) / Math.hypot(ex, ey);
        if (off < 0.75) text += '\nI is on the line too';
      }
    }
    V.setText(readout, text);
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Dragging ----

  function nearest(x, y) {
    var best = -1, bd = 22;
    for (var k = 0; k < 3; k++) {
      var d = Math.hypot(P[k].x - x, P[k].y - y);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  V.drag(canvas, {
    hit: function (x, y) {
      var k = nearest(x, y);
      return k < 0 ? null : { k: k };
    },
    move: function (h, x, y) {
      held = h.k;
      var o = drift ? offset(h.k) : [0, 0];
      var mx = W / 2 / S - 0.02, my = H / 2 / S - 0.02;
      base[h.k][0] = Math.max(-mx, Math.min(mx, (x - W / 2) / S)) - o[0];
      base[h.k][1] = Math.max(-my, Math.min(my, (y - H / 2) / S)) - o[1];
      V.setSegmented(presetGroup, '');
      stage.dirty = true;
    },
    end: function () {
      held = -1;
      stage.dirty = true;
    }
  });

  // ---- Controls ----

  ['medians', 'bisectors', 'altitudes', 'angles', 'line', 'nine'].forEach(function (name) {
    var btn = V.ctl(section, name);
    btn.setAttribute('aria-pressed', String(show[name]));
    V.toggle(btn, function (on) { show[name] = on; stage.dirty = true; });
  });

  // Fold the current wobble into the corners so switching drift doesn't jump.
  function setDrift(on) {
    if (on !== drift) {
      for (var k = 0; k < 3; k++) {
        var o = offset(k), s = on ? -1 : 1;
        base[k][0] += s * o[0];
        base[k][1] += s * o[1];
      }
    }
    drift = on;
    driftBtn.setAttribute('aria-pressed', String(on));
    stage.dirty = true;
  }
  driftBtn.setAttribute('aria-pressed', String(drift));
  V.toggle(driftBtn, function () { setDrift(!drift); });

  V.segmented(presetGroup, function (name) {
    setDrift(false);
    base = PRESETS[name].map(function (p) { return p.slice(); });
  });
})();
