// Morley's theorem: next to each side, the two angle trisectors nearest that
// side meet; the three meeting points form an equilateral triangle with side
// 8R·sin(A/3)·sin(B/3)·sin(C/3). Halves meet at the incenter; quarters don't line up.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('morley');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var driftBtn = V.ctl(section, 'drift');

  var AMBER = '#ffb454';
  var LABEL = '600 13px "IBM Plex Mono", ui-monospace, monospace';
  var base = [[0.16, -0.31], [-0.42, 0.33], [0.4, 0.26]];
  var SPEED = [[0.29, 0.41], [0.35, 0.27], [0.43, 0.33]];
  var PHASE = [[1.3, 0.4], [3.2, 2.7], [5.1, 1.1]];
  var AMP = 0.05;

  var parts = 3;
  var frac = 1 / 3;          // eased toward 1 / parts
  var rays = true;
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

  function unit(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, n = Math.hypot(dx, dy) || 1;
    return { x: dx / n, y: dy / n };
  }

  // The direction from p that turns from side pa toward side pb by f of the angle.
  function ray(p, a, b, f) {
    var u = unit(p, a), v = unit(p, b);
    var c = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y));
    var ang = Math.acos(c);
    var wx = v.x - c * u.x, wy = v.y - c * u.y, wn = Math.hypot(wx, wy) || 1;
    var th = ang * f;
    return { x: u.x * Math.cos(th) + wx / wn * Math.sin(th), y: u.y * Math.cos(th) + wy / wn * Math.sin(th), ang: ang };
  }

  function meet(p, d, q, e) {
    var den = d.x * e.y - d.y * e.x;
    if (Math.abs(den) < 1e-12) return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    var s = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / den;
    return { x: p.x + d.x * s, y: p.y + d.y * s };
  }

  // Where a ray from p hits the segment a–b (it always does for an interior ray).
  function hitSide(p, d, a, b) {
    var e = { x: b.x - a.x, y: b.y - a.y };
    return meet(p, d, a, e);
  }

  function angleOf(p, a, b) {
    return ray(p, a, b, 0).ang * 180 / Math.PI;
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
    var goal = 1 / parts;
    if (Math.abs(frac - goal) > 1e-4) {
      frac += (goal - frac) * Math.min(1, dt * 7);
      if (Math.abs(frac - goal) < 1e-4) frac = goal;
      st.dirty = true;
    }
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

    var ctx = st.ctx, k, j;
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Corner k's two cutting lines nearest its neighbors: toward the side to
    // corner k+1 (which pairs with corner k+1) and toward the side to corner k+2.
    var M = [];
    for (k = 0; k < 3; k++) {
      var b = P[(k + 1) % 3], c = P[(k + 2) % 3];
      var db = ray(b, c, P[k], frac), dc = ray(c, b, P[k], frac);
      M.push(meet(b, db, c, dc));    // point next to the side opposite corner k
    }

    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    ctx.lineTo(P[1].x, P[1].y);
    ctx.lineTo(P[2].x, P[2].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(236,232,223,0.045)';
    ctx.fill();

    // Every cutting line, faint, out to the opposite side.
    var settled = Math.abs(frac - 1 / parts) < 0.002;
    if (rays && settled) {
      ctx.strokeStyle = 'rgba(236,232,223,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (k = 0; k < 3; k++) {
        var p = P[k], a1 = P[(k + 1) % 3], a2 = P[(k + 2) % 3];
        for (j = 1; j < parts; j++) {
          var d = ray(p, a1, a2, j / parts), h = hitSide(p, d, a1, a2);
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(h.x, h.y);
        }
      }
      ctx.stroke();
    }

    // Small arcs at each corner, ticked where the angle is cut.
    ctx.strokeStyle = 'rgba(255,180,84,0.55)';
    ctx.lineWidth = 1.25;
    for (k = 0; k < 3; k++) {
      var q = P[k], u1 = unit(q, P[(k + 1) % 3]), u2 = unit(q, P[(k + 2) % 3]);
      var a0 = Math.atan2(u1.y, u1.x), span = angleOf(q, P[(k + 1) % 3], P[(k + 2) % 3]) * Math.PI / 180;
      var ccw = (u1.x * u2.y - u1.y * u2.x) < 0;
      var r = Math.min(30, S * 0.06);
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, a0, a0 + (ccw ? -span : span), ccw);
      ctx.stroke();
      ctx.beginPath();
      for (j = 1; j < parts; j++) {
        var ta = a0 + (ccw ? -1 : 1) * span * j / parts;
        ctx.moveTo(q.x + Math.cos(ta) * (r - 4), q.y + Math.sin(ta) * (r - 4));
        ctx.lineTo(q.x + Math.cos(ta) * (r + 4), q.y + Math.sin(ta) * (r + 4));
      }
      ctx.stroke();
    }

    // The cutting lines that meet: corner k+1 and k+2 both reach M[k].
    ctx.strokeStyle = 'rgba(255,180,84,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (k = 0; k < 3; k++) {
      ctx.moveTo(P[(k + 1) % 3].x, P[(k + 1) % 3].y);
      ctx.lineTo(M[k].x, M[k].y);
      ctx.lineTo(P[(k + 2) % 3].x, P[(k + 2) % 3].y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#ece8df';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    ctx.lineTo(P[1].x, P[1].y);
    ctx.lineTo(P[2].x, P[2].y);
    ctx.closePath();
    ctx.stroke();

    var sides = [Math.hypot(M[1].x - M[2].x, M[1].y - M[2].y),
      Math.hypot(M[2].x - M[0].x, M[2].y - M[0].y),
      Math.hypot(M[0].x - M[1].x, M[0].y - M[1].y)];
    var big = Math.max(sides[0], sides[1], sides[2]);

    if (big > 0.5) {
      ctx.beginPath();
      ctx.moveTo(M[0].x, M[0].y);
      ctx.lineTo(M[1].x, M[1].y);
      ctx.lineTo(M[2].x, M[2].y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,180,84,0.3)';
      ctx.fill();
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.fillStyle = AMBER;
    for (k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(M[k].x, M[k].y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    for (k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(P[k].x, P[k].y, held === k ? 8 : 6.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0a0b10';
      ctx.stroke();
    }

    var cx = (P[0].x + P[1].x + P[2].x) / 3, cy = (P[0].y + P[1].y + P[2].y) / 3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var ang = [];
    for (k = 0; k < 3; k++) {
      ang.push(angleOf(P[k], P[(k + 1) % 3], P[(k + 2) % 3]));
      var ux = P[k].x - cx, uy = P[k].y - cy, un = Math.hypot(ux, uy) || 1;
      label(ctx, Math.round(ang[k]) + '°', P[k].x + ux / un * 24, P[k].y + uy / un * 24, '#ece8df');
    }

    var text = 'triangle ' + Math.round(ang[0]) + '° ' + Math.round(ang[1]) + '° ' + Math.round(ang[2]) + '°';
    if (big < 0.5) {
      text += '\nthe lines meet at one point';
    } else {
      var m = [];
      for (k = 0; k < 3; k++) m.push(angleOf(M[k], M[(k + 1) % 3], M[(k + 2) % 3]).toFixed(1) + '°');
      text += '\nmiddle   ' + m.join(' ');
    }
    V.setText(readout, text);
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Dragging ----

  V.drag(canvas, {
    hit: function (x, y) {
      var best = -1, bd = 22;
      for (var k = 0; k < 3; k++) {
        var d = Math.hypot(P[k].x - x, P[k].y - y);
        if (d < bd) { bd = d; best = k; }
      }
      return best < 0 ? null : { k: best };
    },
    move: function (h, x, y) {
      held = h.k;
      var o = drift ? offset(h.k) : [0, 0];
      var mx = W / 2 / S - 0.03, my = H / 2 / S - 0.03;
      base[h.k][0] = Math.max(-mx, Math.min(mx, (x - W / 2) / S)) - o[0];
      base[h.k][1] = Math.max(-my, Math.min(my, (y - H / 2) / S)) - o[1];
      stage.dirty = true;
    },
    end: function () {
      held = -1;
      stage.dirty = true;
    }
  });

  // ---- Controls ----

  V.segmented(V.ctl(section, 'parts'), function (v) {
    parts = +v;
    stage.dirty = true;
  });

  V.toggle(V.ctl(section, 'rays'), function (on) { rays = on; stage.dirty = true; });

  // Fold the current wobble into the corners so switching drift doesn't jump.
  driftBtn.setAttribute('aria-pressed', String(drift));
  V.toggle(driftBtn, function (on) {
    for (var k = 0; k < 3; k++) {
      var o = offset(k), s = on ? -1 : 1;
      base[k][0] += s * o[0];
      base[k][1] += s * o[1];
    }
    drift = on;
    stage.dirty = true;
  });
})();
