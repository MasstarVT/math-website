// Continued fractions: the best fractions p/q for a number α are the lattice
// points that come closer to the line p = αq than any before them. Strings
// pulled tight above and below the line turn exactly there (Klein), and the
// number of steps between turns are the terms of the continued fraction.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('continued-fractions');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var zoomInput = V.ctl(section, 'zoom');
  var numberGroup = V.ctl(section, 'number');
  var nextBtn = V.ctl(section, 'next');

  function repeat(a) { var t = []; for (var i = 0; i < 40; i++) t.push(a); return t; }
  var PRESETS = {
    pi: { name: 'π', whole: 3, frac: Math.PI - 3, terms: [7, 15, 1, 292, 1, 1, 1, 2, 1, 3, 1, 14, 2, 1, 1, 2] },
    phi: { name: 'φ', whole: 1, frac: (Math.sqrt(5) - 1) / 2, terms: repeat(1) },
    sqrt2: { name: '√2', whole: 1, frac: Math.SQRT2 - 1, terms: repeat(2) },
    e: { name: 'e', whole: 2, frac: Math.E - 2, terms: [1, 2, 1, 1, 4, 1, 1, 6, 1, 1, 8, 1, 1, 10, 1, 1, 12] }
  };
  var MIN_Q = 3, MAX_Q = 600;
  var LOW = '#a78bfa', HIGH = '#6ee7ff';
  var SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

  var num = PRESETS.pi;
  var conv = [];               // conv[k] = { q, p, a }: k even below the line, odd above
  var logQ = Math.log(MIN_Q);
  var targetLog = Math.log(9.5);
  var viewF = num.frac;        // the slope the view is centered on
  var dragging = false;
  var G = null;

  function setNumber(n) {
    num = n;
    conv = [{ q: 1, p: 0, a: 0 }];
    var q2 = 0, p2 = 1, q1 = 1, p1 = 0;
    for (var i = 0; i < n.terms.length; i++) {
      var a = n.terms[i];
      var q = a * q1 + q2, p = a * p1 + p2;
      conv.push({ q: q, p: p, a: a });
      q2 = q1; p2 = p1; q1 = q; p1 = p;
      if (q > 1e8) break;
    }
  }

  // Terms of the continued fraction of a slope you dragged to, from floats.
  function termsOf(f) {
    var t = [], x = f;
    for (var i = 0; i < 14 && x > 1e-9; i++) {
      x = 1 / x;
      var a = Math.floor(x + 1e-9);
      if (a > 5000) break;
      t.push(Math.max(1, a));
      x -= a;
    }
    return t;
  }

  function frame(dt, st) {
    if (!conv.length) setNumber(num);
    if (Math.abs(targetLog - logQ) > 1e-4) {
      logQ += (targetLog - logQ) * (V.reducedMotion ? 1 : 1 - Math.exp(-dt * 3));
      zoomInput.value = logQ.toFixed(3);
      st.dirty = true;
    } else if (logQ !== targetLog) {
      logQ = targetLog;
      st.dirty = true;
    }
    if (!dragging && Math.abs(viewF - num.frac) > 1e-6) {
      viewF += (num.frac - viewF) * (V.reducedMotion ? 1 : 1 - Math.exp(-dt * 5));
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function vertex(k) { return k < 0 ? { q: 0, p: 1 } : conv[k]; }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    var Q = Math.exp(logQ);
    var x0 = 26, s = (W - x0 - 22) / Q;
    var y0 = H / 2 + viewF * Q * s / 2;
    G = { x0: x0, y0: y0, s: s, Q: Q };
    function X(q) { return x0 + q * s; }
    function Y(p) { return y0 - p * s; }
    var f = num.frac;
    ctx.clearRect(0, 0, W, H);

    // Axes, then every lattice point while they're far enough apart to see.
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(236,232,223,0.14)';
    ctx.beginPath();
    ctx.moveTo(0, Math.round(Y(0)) + 0.5); ctx.lineTo(W, Math.round(Y(0)) + 0.5);
    ctx.moveTo(Math.round(X(0)) + 0.5, 0); ctx.lineTo(Math.round(X(0)) + 0.5, H);
    ctx.stroke();
    var qa = Math.floor(-x0 / s), qb = Math.ceil((W - x0) / s);
    var pa = Math.floor((y0 - H) / s), pb = Math.ceil(y0 / s);
    if (s >= 4.5) {
      var dot = Math.min(2.4, 0.7 + s * 0.05);
      ctx.fillStyle = 'rgba(236,232,223,' + Math.min(0.3, 0.08 + s * 0.006).toFixed(3) + ')';
      ctx.beginPath();
      for (var q = qa; q <= qb; q++) {
        for (var p = pa; p <= pb; p++) ctx.rect(X(q) - dot / 2, Y(p) - dot / 2, dot, dot);
      }
      ctx.fill();
    }

    // The two sails: vertices up to a little past the view, the last edge
    // clipped so coordinates stay small.
    var limit = Q * 4;
    var best = 0;
    for (var k = 0; k < conv.length && conv[k].q <= Q * 0.93; k++) best = k;
    var sides = [[], []];
    for (var side = 0; side < 2; side++) {
      var list = sides[side];
      list.push(side ? vertex(-1) : conv[0]);
      for (k = side ? 1 : 2; k < conv.length; k += 2) {
        var v = conv[k];
        if (v.q > limit) {
          var a = vertex(k - 2), t = (limit - a.q) / (v.q - a.q);
          list.push({ q: limit, p: a.p + t * (v.p - a.p), cut: true });
          break;
        }
        list.push(v);
      }
    }

    // Shade each side's hull faintly.
    [[LOW, 0], [HIGH, 1]].forEach(function (c) {
      var list = sides[c[1]], last = list[list.length - 1];
      ctx.fillStyle = c[0];
      ctx.globalAlpha = 0.07;
      ctx.beginPath();
      ctx.moveTo(X(list[0].q), Y(list[0].p));
      list.forEach(function (v) { ctx.lineTo(X(v.q), Y(v.p)); });
      if (c[1]) { ctx.lineTo(X(last.q), Y(pb + 2)); ctx.lineTo(X(0), Y(pb + 2)); }
      else { ctx.lineTo(X(last.q), Y(0)); }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // The line of slope α.
    ctx.strokeStyle = 'rgba(236,232,223,0.8)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(X(-2), Y(-2 * f));
    ctx.lineTo(X(qb + 2), Y((qb + 2) * f));
    ctx.stroke();

    // Strings, with the lattice points they pass through.
    [[LOW, 0], [HIGH, 1]].forEach(function (c) {
      var list = sides[c[1]];
      ctx.strokeStyle = c[0];
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      list.forEach(function (v, i) { if (i) ctx.lineTo(X(v.q), Y(v.p)); else ctx.moveTo(X(v.q), Y(v.p)); });
      ctx.stroke();
    });
    ctx.fillStyle = 'rgba(236,232,223,0.75)';
    for (k = 1; k < conv.length && vertex(k - 2).q <= qb; k++) {
      var from = vertex(k - 2), dir = vertex(k - 1);
      var j0 = Math.max(1, Math.floor((qa - from.q) / Math.max(dir.q, 1)));
      var j1 = Math.min(conv[k].a - 1, Math.ceil((qb - from.q) / Math.max(dir.q, 1)));
      for (var j = j0; j <= j1; j++) {
        ctx.beginPath();
        ctx.arc(X(from.q + j * dir.q), Y(from.p + j * dir.p), 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Step counts along long edges: these are the continued fraction's terms.
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (k = 1; k < conv.length; k++) {
      var e0 = vertex(k - 2), e1 = conv[k];
      if (e0.q > qb) break;
      // Label the middle of whatever part of the edge is on screen.
      var qs = Math.max(e0.q, 0), qe = Math.min(e1.q, qb - 1);
      if (qe <= qs) continue;
      var qm = (qs + qe) / 2, tm = (qm - e0.q) / (e1.q - e0.q);
      var pm = e0.p + tm * (e1.p - e0.p);
      var len = (qe - qs) * s * Math.hypot(1, (e1.p - e0.p) / (e1.q - e0.q));
      var ex = X(qm), ey = Y(pm) + (k % 2 ? -13 : 13);
      if (len < 70 || ey < 8 || ey > H - 8) continue;
      ctx.fillStyle = k % 2 ? HIGH : LOW;
      ctx.fillText(e1.a + (e1.a === 1 ? ' step' : ' steps'), ex, ey);
    }

    // Corners: the best fractions, labeled newest first so it always shows.
    var placed = [];
    for (k = Math.min(best + 1, conv.length - 1); k >= 0; k--) {
      v = conv[k];
      var px = X(v.q), py = Y(v.p);
      if (px > W + 4) continue;
      var isBest = k === best;
      ctx.fillStyle = k % 2 ? HIGH : LOW;
      ctx.beginPath();
      ctx.arc(px, py, isBest ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fill();
      if (isBest) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (k > best) continue;
      var lx = px, ly = py + (k % 2 ? -16 : 17);
      var clash = placed.some(function (pt) { return Math.abs(pt[0] - lx) < 52 && Math.abs(pt[1] - ly) < 16; });
      if (clash || lx > W - 24) continue;
      placed.push([lx, ly]);
      ctx.fillStyle = isBest ? '#ffffff' : 'rgba(236,232,223,0.75)';
      ctx.textAlign = 'center';
      ctx.fillText(fraction(v), Math.max(24, lx), ly);
    }

    // The handle for tilting the line.
    var hq = Q * 0.8;
    G.handle = { x: X(hq), y: Y(hq * f) };
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(10,11,16,0.85)';
    ctx.beginPath();
    ctx.arc(G.handle.x, G.handle.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    updateReadout(best);
  }

  function fraction(v) {
    var top = v.p + num.whole * v.q;
    return v.q === 1 ? String(top) : top + '/' + v.q;
  }

  function sci(x) {
    if (x >= 0.001) return x.toPrecision(2);
    var e = Math.floor(Math.log(x) / Math.LN10);
    var m = x / Math.pow(10, e);
    var exp = String(-e).split('').map(function (d) { return SUP[+d]; }).join('');
    return m.toFixed(1) + ' × 10⁻' + exp;
  }

  function updateReadout(best) {
    var line1 = num.name + ' = [' + num.whole + '; ';
    var rest = num.terms.slice(0, 10).join(', ');
    line1 += rest;
    if (line1.length > 34) line1 = line1.slice(0, line1.lastIndexOf(',', 33)) + ', …';
    else if (num.terms.length > 10) line1 += ', …';
    line1 += ']';

    var v = conv[best];
    var value = num.whole + num.frac;
    var approx = (v.p + num.whole * v.q) / v.q;
    var err = Math.abs(approx - value);
    var line2 = 'Best so far ' + fraction(v) + (err < 1e-12 ? ' (exact)' : ' ≈ ' + approx.toFixed(Math.min(9, 2 + Math.ceil(-Math.log(err + 1e-15) / Math.LN10))));
    var line3;
    if (err < 1e-12) line3 = 'It ends here: a fraction';
    else {
      var kq = 1 / (err * v.q * v.q);
      line3 = 'Off by ' + sci(err) + ' ≈ 1/(' + (kq < 100 ? kq.toFixed(1) : Math.round(kq)) + ' q²)';
    }
    var nx = conv[best + 1];
    if (nx && nx.q > MAX_Q / 1.3 && Math.exp(logQ) > MAX_Q * 0.9) line3 = 'Next: ' + fraction(nx) + ', too far to show';
    nextBtn.disabled = !nx || nx.q > MAX_Q / 1.3 && Math.exp(targetLog) > MAX_Q * 0.95;
    V.setText(readout, line1 + '\n' + line2 + '\n' + line3);
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Dragging the line ----

  V.drag(canvas, {
    hit: function (x, y) {
      return G && G.handle && Math.hypot(x - G.handle.x, y - G.handle.y) < 20 ? 'line' : null;
    },
    move: function (h, x, y) {
      var q = (x - G.x0) / G.s, p = (G.y0 - y) / G.s;
      if (q < 0.5) return;
      dragging = true;
      var f = Math.max(0.0005, Math.min(0.9995, p / q));
      var whole = num.whole;
      setNumber({ name: 'α', whole: whole, frac: f, terms: termsOf(f) });
      V.setSegmented(numberGroup, '');
      stage.dirty = true;
    },
    end: function () { dragging = false; stage.dirty = true; }
  });

  // ---- Controls ----

  zoomInput.min = Math.log(MIN_Q).toFixed(3);
  zoomInput.max = Math.log(MAX_Q).toFixed(3);
  zoomInput.value = logQ.toFixed(3);
  zoomInput.addEventListener('input', function () {
    logQ = targetLog = parseFloat(zoomInput.value);
    stage.dirty = true;
  });

  nextBtn.addEventListener('click', function () {
    var Q = Math.exp(targetLog), k = 0;
    while (k + 1 < conv.length && conv[k + 1].q <= Q * 0.93) k++;
    var nx = conv[k + 1];
    if (!nx) return;
    targetLog = Math.log(Math.min(MAX_Q, Math.max(MIN_Q, nx.q * 1.3)));
    stage.dirty = true;
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    targetLog = Math.log(MIN_Q);
    stage.dirty = true;
  });

  V.segmented(numberGroup, function (v) {
    setNumber(PRESETS[v]);
    targetLog = Math.log(9.5);
    stage.dirty = true;
  });
})();
