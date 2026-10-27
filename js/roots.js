// Roots and coefficients of a monic polynomial zⁿ + aₙ₋₁zⁿ⁻¹ + … + a₀.
// Roots → coefficients is just multiplying out (z − r₁)…(z − rₙ). Coefficients →
// roots uses Durand–Kerner, warm-started from the last roots so each one is tracked.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('roots');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var degGroup = V.ctl(section, 'degree');
  var loopBtn = V.ctl(section, 'loop');
  var resetBtn = V.ctl(section, 'reset');

  var COLORS = ['#6ee7ff', '#ff5fa2', '#ffb454', '#a78bfa', '#7ee0a1'];
  var SUB = '₀₁₂₃₄₅';
  var SUP = ['', '', '²', '³', '⁴', '⁵'];
  var ROOT_R = 2.1;        // complex units in the root panel, center to nearer edge

  var n = 3;
  var roots = [];
  var coef = [];           // a₀ … aₙ₋₁; the leading coefficient is 1
  var trails = [];
  var coefR = 3;           // eased view radius of the coefficient panel
  var dragging = null;
  var loop = null;         // a₀ travelling around a point where two roots meet
  var spots = [];          // values of a₀ that would make a double root
  var note = '';
  var stage;

  // ---- Complex arithmetic ----
  function mul(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
  function div(a, b) {
    var d = b[0] * b[0] + b[1] * b[1];
    return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function abs(a) { return Math.hypot(a[0], a[1]); }

  function expand(rs) {
    var c = [[1, 0]];
    rs.forEach(function (r) {
      var next = [];
      for (var k = 0; k <= c.length; k++) {
        var lo = k > 0 ? c[k - 1] : [0, 0], hi = k < c.length ? mul(c[k], r) : [0, 0];
        next.push(sub(lo, hi));
      }
      c = next;
    });
    return c.slice(0, rs.length);
  }

  // p(z) for a monic polynomial with lower coefficients a.
  function evalP(a, z) {
    var v = [1, 0];
    for (var k = a.length - 1; k >= 0; k--) {
      v = mul(v, z);
      v[0] += a[k][0];
      v[1] += a[k][1];
    }
    return v;
  }

  function durandKerner(a, zs, iters) {
    var m = zs.length;
    for (var it = 0; it < iters; it++) {
      var worst = 0;
      for (var i = 0; i < m; i++) {
        var den = [1, 0];
        for (var j = 0; j < m; j++) {
          if (j === i) continue;
          var d = sub(zs[i], zs[j]);
          if (abs(d) < 1e-12) d = [1e-6, 1e-6];
          den = mul(den, d);
        }
        var step = div(evalP(a, zs[i]), den);
        if (!isFinite(step[0]) || !isFinite(step[1])) step = [1e-3, 1e-3];
        zs[i] = sub(zs[i], step);
        worst = Math.max(worst, abs(step));
      }
      if (worst < 1e-13) break;
    }
    return zs;
  }

  function startRoots() {
    // Starting spots, picked so the coefficients and double-root spots spread out.
    var radii = [1.15, 0.8, 1.3, 1, 0.9];
    var base = [0, 0, 2, 4.45, 5.8, 0.75][n], jit = [0, 0, 0.4, -0.4, 0.4, 0.4][n];
    roots = [];
    for (var k = 0; k < n; k++) {
      var t = base + k * 2 * Math.PI / n + (k % 2 ? jit : -jit * 0.4);
      roots.push([radii[k] * Math.cos(t), radii[k] * Math.sin(t)]);
    }
    coef = expand(roots);
    trails = roots.map(function () { return []; });
    loop = null;
    spots = [];
    note = '';
    stage.dirty = true;
  }

  // Move the coefficients toward a target in small steps so no root jumps tracks.
  function moveCoef(target, maxStep) {
    var gap = 0;
    for (var k = 0; k < n; k++) gap = Math.max(gap, abs(sub(target[k], coef[k])));
    var steps = Math.min(600, Math.max(1, Math.ceil(gap / (maxStep || 0.01))));
    var from = coef.map(function (c) { return c.slice(); });
    for (var s = 1; s <= steps; s++) {
      var f = s / steps;
      coef = from.map(function (c, k) {
        return [c[0] + (target[k][0] - c[0]) * f, c[1] + (target[k][1] - c[1]) * f];
      });
      durandKerner(coef, roots, 40);
    }
    roots.forEach(function (r, i) {
      var tr = trails[i];
      tr.push(r.slice());
      if (tr.length > 900) tr.shift();
    });
  }

  // Where would changing a₀ alone give a double root? At a₀ − p(c) for each
  // critical point c, a root of p′.
  function doubleSpots() {
    if (n < 2) return [];
    var d = [];
    for (var k = 1; k < n; k++) d.push([coef[k][0] * k / n, coef[k][1] * k / n]);
    var cs = [];
    for (k = 0; k < n - 1; k++) cs.push([0.4 * Math.cos(1 + k * 2.4), 0.9 * Math.sin(1 + k * 2.4)]);
    durandKerner(d, cs, 200);
    return cs.map(function (c) { return sub(coef[0], evalP(coef, c)); });
  }

  function startLoop() {
    spots = doubleSpots();
    var a0 = coef[0], best = null, bd = Infinity;
    spots.forEach(function (b) {
      var dd = abs(sub(a0, b));
      if (dd < bd) { bd = dd; best = b; }
    });
    if (!best) return;
    // A keyhole: in toward the spot, once around it, back out. The circle is
    // small enough to leave the other spots outside.
    var rho = bd;
    spots.forEach(function (b) {
      if (b !== best && abs(sub(b, best)) > 1e-9) rho = Math.min(rho, 0.45 * abs(sub(b, best)));
    });
    if (bd < 1e-6) {
      rho = 0.3;
      a0 = [best[0] + rho, best[1]];
    }
    var lead = Math.max(0, abs(sub(a0, best)) - rho);
    loop = {
      b: best, a0: a0.slice(), rho: rho, lead: lead,
      u: abs(sub(a0, best)) > 1e-9 ? div(sub(a0, best), [abs(sub(a0, best)), 0]) : [1, 0],
      total: 2 * lead + 2 * Math.PI * rho, t: 0,
      before: roots.map(function (r) { return r.slice(); })
    };
    trails = roots.map(function () { return []; });
    note = 'a₀ circles a double-root spot';
  }

  function loopPoint(d) {
    var L = loop, u = L.u;
    if (d <= L.lead) return [L.a0[0] - u[0] * d, L.a0[1] - u[1] * d];
    if (d <= L.lead + 2 * Math.PI * L.rho) {
      var th = Math.atan2(u[1], u[0]) + (d - L.lead) / L.rho;
      return [L.b[0] + L.rho * Math.cos(th), L.b[1] + L.rho * Math.sin(th)];
    }
    var back = L.total - d;
    return [L.a0[0] - u[0] * back, L.a0[1] - u[1] * back];
  }

  function finishLoop() {
    var before = loop.before, moved = [];
    roots.forEach(function (r, i) {
      var best = 0, bd = Infinity;
      before.forEach(function (q, j) {
        var dd = abs(sub(r, q));
        if (dd < bd) { bd = dd; best = j; }
      });
      if (best !== i) moved.push(i + 1);
    });
    note = moved.length === 2 ? 'Roots ' + moved[0] + ' and ' + moved[1] + ' traded places'
      : moved.length ? 'Roots ' + moved.join(', ') + ' traded places' : 'Every root came home';
    loop = null;
  }

  function num(v) { return (Math.abs(v) < 0.005 ? 0 : v); }
  function cx(a) {
    var re = num(a[0]), im = num(a[1]);
    return (re < 0 ? '−' : '') + Math.abs(re).toFixed(2) + (im < 0 ? ' − ' : ' + ') + Math.abs(im).toFixed(2) + 'i';
  }

  // ---- Layout: roots on the left, coefficients on the right ----
  function layout(W, H) {
    var pw = W / 2, m = Math.min(pw, H) / 2 * 0.92;
    return {
      pw: pw,
      r: { x: pw / 2, y: H / 2, s: m / ROOT_R, w: pw },
      c: { x: pw + pw / 2, y: H / 2, s: m / coefR, w: pw }
    };
  }

  function frame(dt, st) {
    var busy = false;
    if (loop) {
      loop.t = Math.min(1, loop.t + dt / 4.5);
      var d = V.easeInOut(loop.t) * loop.total;
      var target = coef.map(function (c) { return c.slice(); });
      target[0] = loopPoint(d);
      moveCoef(target, Math.min(0.01, loop.rho / 10));
      if (loop.t >= 1) finishLoop();
      busy = true;
    }
    if (dragging !== 'c') {
      var big = 0;
      coef.forEach(function (c) { big = Math.max(big, abs(c)); });
      spots.forEach(function (c) { big = Math.max(big, abs(c)); });
      var want = Math.max(2, big * 1.3);
      if (Math.abs(want - coefR) > 0.005) {
        coefR = V.reducedMotion ? want : coefR + (want - coefR) * Math.min(1, dt * 4);
        busy = true;
      }
    }
    if (!busy && !st.dirty) return;
    st.dirty = false;

    var W = st.width, H = st.height, ctx = st.ctx, L = layout(W, H);
    ctx.clearRect(0, 0, W, H);

    function grid(P, R) {
      var step = R > 9 ? 5 : R > 4.5 ? 2 : 1;
      ctx.save();
      ctx.beginPath();
      ctx.rect(P.x - P.w / 2, 0, P.w, H);
      ctx.clip();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(236,232,223,0.06)';
      ctx.beginPath();
      var nx = Math.ceil(P.w / 2 / P.s / step), ny = Math.ceil(H / 2 / P.s / step);
      for (var k = -nx; k <= nx; k++) { ctx.moveTo(P.x + k * step * P.s, 0); ctx.lineTo(P.x + k * step * P.s, H); }
      for (k = -ny; k <= ny; k++) { ctx.moveTo(P.x - P.w / 2, P.y + k * step * P.s); ctx.lineTo(P.x + P.w / 2, P.y + k * step * P.s); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(236,232,223,0.2)';
      ctx.beginPath();
      ctx.moveTo(P.x - P.w / 2, P.y);
      ctx.lineTo(P.x + P.w / 2, P.y);
      ctx.moveTo(P.x, 0);
      ctx.lineTo(P.x, H);
      ctx.stroke();
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.fillStyle = '#6f7286';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      if (P.x + step * P.s < P.x + P.w / 2 - 10) ctx.fillText(String(step), P.x + step * P.s, P.y + 5);
      ctx.restore();
    }
    grid(L.r, ROOT_R);
    grid(L.c, coefR);

    // Divider and panel names.
    ctx.strokeStyle = 'rgba(236,232,223,0.14)';
    ctx.beginPath();
    ctx.moveTo(L.pw + 0.5, 0);
    ctx.lineTo(L.pw + 0.5, H);
    ctx.stroke();
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#9b9daf';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('ROOTS', 12, H - 10);
    ctx.fillText('COEFFICIENTS', L.pw + 12, H - 10);

    function P(panel, z) { return [panel.x + z[0] * panel.s, panel.y - z[1] * panel.s]; }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, L.pw, H);
    ctx.clip();
    // Root trails, then roots.
    trails.forEach(function (tr, i) {
      if (tr.length < 2) return;
      ctx.strokeStyle = COLORS[i];
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.beginPath();
      tr.forEach(function (z, k) {
        var p = P(L.r, z);
        if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    ctx.font = '600 11px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    roots.forEach(function (z, i) {
      var p = P(L.r, z);
      ctx.beginPath();
      ctx.arc(p[0], p[1], 10, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[i];
      ctx.fill();
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#0a0b10';
      ctx.fillText(String(i + 1), p[0], p[1] + 0.5);
    });
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(L.pw, 0, W - L.pw, H);
    ctx.clip();
    // Double-root spots for a₀, and the loop around one of them.
    spots.forEach(function (b) {
      var p = P(L.c, b);
      ctx.strokeStyle = 'rgba(236,232,223,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p[0] - 4, p[1] - 4);
      ctx.lineTo(p[0] + 4, p[1] + 4);
      ctx.moveTo(p[0] + 4, p[1] - 4);
      ctx.lineTo(p[0] - 4, p[1] + 4);
      ctx.stroke();
    });
    if (loop) {
      ctx.strokeStyle = 'rgba(126,224,161,0.7)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var k = 0; k <= 120; k++) {
        var q = P(L.c, loopPoint(k / 120 * loop.total));
        if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.font = '600 12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    coef.forEach(function (c, k) {
      var p = P(L.c, c);
      ctx.fillStyle = k === 0 && loop ? '#7ee0a1' : '#ece8df';
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(p[0] - 12, p[1] - 10, 24, 20);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0a0b10';
      ctx.fillText('a' + SUB[k], p[0], p[1] + 0.5);
    });
    ctx.restore();

    // Readout.
    var poly = 'z' + SUP[n];
    for (k = n - 1; k >= 0; k--) poly += ' + a' + SUB[k] + (k > 1 ? 'z' + SUP[k] : k === 1 ? 'z' : '');
    var sum = [0, 0], prod = [1, 0];
    roots.forEach(function (r) { sum[0] += r[0]; sum[1] += r[1]; prod = mul(prod, r); });
    var lines = [poly, 'sum of roots = −a' + SUB[n - 1] + ' = ' + cx(sum)];
    lines.push(note || 'product = ' + (n % 2 ? '−' : '') + 'a₀ = ' + cx(prod));
    V.setText(readout, lines.join('\n'));
  }

  stage = V.createStage(canvas, { frame: frame });

  // ---- Dragging roots or coefficients ----

  V.drag(canvas, {
    hit: function (x, y) {
      var L = layout(stage.width, stage.height), best = null, bd = 20;
      roots.forEach(function (z, i) {
        var d = Math.hypot(L.r.x + z[0] * L.r.s - x, L.r.y - z[1] * L.r.s - y);
        if (d < bd && x < L.pw) { bd = d; best = { kind: 'r', i: i }; }
      });
      coef.forEach(function (z, i) {
        var d = Math.hypot(L.c.x + z[0] * L.c.s - x, L.c.y - z[1] * L.c.s - y);
        if (d < bd && x > L.pw) { bd = d; best = { kind: 'c', i: i }; }
      });
      return best;
    },
    move: function (h, x, y, first) {
      var L = layout(stage.width, stage.height), P = h.kind === 'r' ? L.r : L.c;
      var hx = P.w / 2 / P.s * 0.95, hy = stage.height / 2 / P.s * 0.95;
      var z = [Math.max(-hx, Math.min(hx, (x - P.x) / P.s)), Math.max(-hy, Math.min(hy, (P.y - y) / P.s))];
      if (loop) finishLoop();
      if (first) {
        trails = roots.map(function () { return []; });
        spots = [];
        note = '';
      }
      dragging = h.kind;
      if (h.kind === 'r') {
        roots[h.i] = z;
        coef = expand(roots);
      } else {
        var target = coef.map(function (c) { return c.slice(); });
        target[h.i] = z;
        moveCoef(target);
      }
      stage.dirty = true;
    },
    end: function () {
      dragging = null;
      stage.dirty = true;
    }
  });

  // ---- Controls ----

  V.segmented(degGroup, function (v) {
    n = parseInt(v, 10);
    startRoots();
  });
  loopBtn.addEventListener('click', function () {
    if (loop) return;
    startLoop();
    stage.dirty = true;
  });
  resetBtn.addEventListener('click', startRoots);
  startRoots();
})();
