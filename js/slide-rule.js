// A slide rule: on the C and D scales the number x sits at distance log₁₀ x
// from the left end. Sliding C along D adds lengths, so it multiplies numbers:
// log a + log c = log(a × c). Past 10, the far end of C is used and a ×10 dropped.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('slide-rule');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var presetGroup = V.ctl(section, 'preset');
  var ZOOM = 6;
  var GREEN = '#7ee0a1', CYAN = '#6ee7ff', PINK = '#ff5fa2', AMBER = '#ffb454';

  var PRESETS = {
    '2x3': { u: Math.log10(2), c: 3 },
    '2xpi': { u: Math.log10(2), c: Math.PI },
    '1.5x4': { u: Math.log10(1.5), c: 4 },
    '4x3': { u: Math.log10(4) - 1, c: 3 },
    '8/2': { u: Math.log10(4), c: 2 }
  };

  var u = Math.log10(2);   // where C's 1 sits on D, in log units (−1 to 1)
  var p = Math.log10(6);   // the cursor, in log units on D (0 to 1)
  var tween = null;
  var stage;

  function layout(W, H) {
    var m = Math.max(24, W * 0.065);
    var top = Math.max(86, H * 0.2);
    var band = Math.max(40, H * 0.12);
    return {
      x0: m, L: W - 2 * m,
      slideTop: top, yb: top + band, statorBottom: top + band * 2,
      band: band,
      barY: top + band * 2 + Math.max(18, H * 0.05),
      magTop: H * 0.68, magBottom: H - Math.max(14, H * 0.04)
    };
  }

  function fmt(v) { return v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2); }

  // Tick marks for a 1–10 log scale. xOf maps a value to x; dir −1 draws up, +1 down.
  function scale(ctx, xOf, y, dir, len, Lpx, xmin, xmax, labels) {
    var size = Math.max(9, Math.min(12, len * 0.26));
    ctx.font = '500 ' + size + 'px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = dir < 0 ? 'bottom' : 'top';
    ctx.lineWidth = 1;
    for (var k = 1; k < 10; k++) {
      // The finest step that keeps ticks at least 5 px apart near k + 1.
      var steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1], st = 1;
      for (var i = 0; i < steps.length; i++) {
        if (Lpx * steps[i] / ((k + 1) * Math.LN10) >= 5) { st = steps[i]; break; }
      }
      var count = Math.round(1 / st);
      for (var j = 0; j <= count; j++) {
        if (j === count && k < 9) continue;
        var v = k + j * st, x = xOf(v);
        if (x < xmin - 2 || x > xmax + 2) continue;
        var whole = Math.abs(v - Math.round(v)) < 1e-9;
        var half = Math.abs(v * 2 - Math.round(v * 2)) < 1e-9;
        var tenth = Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;
        var h = whole ? 1 : half ? 0.68 : tenth ? 0.5 : 0.3;
        ctx.strokeStyle = whole ? 'rgba(236,232,223,0.9)' : 'rgba(236,232,223,0.55)';
        ctx.beginPath();
        ctx.moveTo(x + 0.5, y);
        ctx.lineTo(x + 0.5, y + dir * len * 0.42 * h);
        ctx.stroke();
        // Label tenths or halves only where there's room for them.
        var gap10 = Lpx * 0.1 / ((k + 1) * Math.LN10);
        if (whole || (labels && tenth && gap10 >= size * 1.9) || (labels && half && gap10 * 5 >= size * 3.2 && k < 4)) {
          ctx.fillStyle = whole ? '#ece8df' : '#9b9daf';
          var text = whole ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
          ctx.fillText(text, x, y + dir * (len * 0.42 * h + 3));
        }
      }
    }
    // π gets its own mark, as on real rules.
    var xp = xOf(Math.PI);
    if (xp > xmin && xp < xmax) {
      ctx.strokeStyle = AMBER;
      ctx.beginPath();
      ctx.moveTo(xp + 0.5, y);
      ctx.lineTo(xp + 0.5, y + dir * len * 0.62);
      ctx.stroke();
      ctx.fillStyle = AMBER;
      ctx.fillText('π', xp, y + dir * (len * 0.62 + 2));
    }
  }

  function drawRule(ctx, xD, xC, cursorX, x1, x2, yTop, band, Lpx, labels) {
    var yb = yTop + band;
    // Stator (D) and slide (C), the slide only as long as its scale.
    ctx.fillStyle = '#141621';
    ctx.fillRect(x1, yb, x2 - x1, band);
    var s0 = Math.max(x1, xC(1) - 10), s1 = Math.min(x2, xC(10) + 10);
    if (s1 > s0) {
      ctx.fillStyle = '#1c2030';
      ctx.fillRect(s0, yTop, s1 - s0, band);
      ctx.strokeStyle = '#343a4e';
      ctx.strokeRect(s0 + 0.5, yTop + 0.5, s1 - s0 - 1, band - 1);
    }
    ctx.strokeStyle = '#343a4e';
    ctx.strokeRect(x1 + 0.5, yb + 0.5, x2 - x1 - 1, band - 1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x1, yTop, x2 - x1, band * 2);
    ctx.clip();
    scale(ctx, xC, yb, -1, band, Lpx, Math.max(x1, s0), Math.min(x2, s1), labels);
    scale(ctx, xD, yb, 1, band, Lpx, x1, x2, labels);
    ctx.restore();
    // The cursor: a glass window with a hairline.
    ctx.fillStyle = 'rgba(126,224,161,0.07)';
    ctx.fillRect(cursorX - 15, yTop - 8, 30, band * 2 + 16);
    ctx.strokeStyle = 'rgba(126,224,161,0.35)';
    ctx.strokeRect(cursorX - 15.5, yTop - 8.5, 31, band * 2 + 17);
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cursorX, yTop - 8);
    ctx.lineTo(cursorX, yb + band + 8);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function frame(dt, st) {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 0.9);
      var e = V.easeInOut(tween.t);
      u = tween.u0 + (tween.u1 - tween.u0) * e;
      p = tween.p0 + (tween.p1 - tween.p0) * e;
      if (tween.t >= 1) tween = null;
    } else if (!st.dirty) {
      return;
    }
    st.dirty = false;

    var W = st.width, H = st.height, ctx = st.ctx, G = layout(W, H);
    ctx.clearRect(0, 0, W, H);
    function xD(v) { return G.x0 + G.L * Math.log10(v); }
    function xC(v) { return G.x0 + G.L * (u + Math.log10(v)); }
    var cx = G.x0 + G.L * p;

    drawRule(ctx, xD, xC, cx, 6, W - 6, G.slideTop, G.band, G.L, true);
    // Scale names, on a dark tab so the slide can pass under them.
    ctx.font = '600 12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    [['C', G.slideTop + G.band * 0.72], ['D', G.yb + G.band * 0.28]].forEach(function (lab) {
      ctx.fillStyle = 'rgba(13,15,22,0.9)';
      ctx.fillRect(8, lab[1] - 9, 16, 18);
      ctx.fillStyle = '#9b9daf';
      ctx.fillText(lab[0], 16, lab[1]);
    });

    // Readings.
    var onC = p - u >= -1e-9 && p - u <= 1 + 1e-9;
    var cVal = Math.pow(10, p - u), dVal = Math.pow(10, p);
    var right = u < 0, a = Math.pow(10, right ? u + 1 : u);

    // Lengths: log a, then log c, end to end.
    var by = G.barY, bh = Math.max(7, G.band * 0.16);
    ctx.font = '500 ' + Math.max(10, Math.min(12, W * 0.018)) + 'px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'top';
    if (!right && onC) {
      var xa = G.x0 + G.L * u;
      ctx.fillStyle = CYAN;
      ctx.fillRect(G.x0, by, xa - G.x0, bh);
      ctx.fillStyle = PINK;
      ctx.fillRect(xa, by, cx - xa, bh);
      ctx.fillStyle = AMBER;
      ctx.fillRect(G.x0, by + bh + 4, cx - G.x0, bh * 0.5);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#c4c1ba';
      var t1 = 'log ' + fmt(a) + ' + log ' + fmt(cVal) + ' = ' + Math.log10(a).toFixed(3) + ' + ' + Math.log10(cVal).toFixed(3) +
        ' = ' + p.toFixed(3) + ' = log ' + fmt(dVal);
      if (ctx.measureText(t1).width > W - G.x0 - 10) t1 = 'log ' + fmt(a) + ' + log ' + fmt(cVal) + ' = log ' + fmt(dVal);
      ctx.fillText(t1, G.x0, by + bh * 1.5 + 10);
    } else if (onC) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9b9daf';
      ctx.fillText('Past 10: the right-hand end of C is in use,', G.x0, by);
      ctx.fillText('so the answer drops a factor of 10.', G.x0, by + 16);
    }

    // The magnifier, centered on the cursor.
    var mt = G.magTop, mb = G.magBottom, mband = (mb - mt) / 2 - 6, mx1 = 6, mx2 = W - 6;
    var Z = G.L * ZOOM;
    function zD(v) { return cx + (Math.log10(v) - p) * Z; }
    function zC(v) { return cx + (u + Math.log10(v) - p) * Z; }
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx1, mt - 2, mx2 - mx1, mb - mt + 4);
    ctx.clip();
    drawRule(ctx, zD, zC, cx, mx1, mx2, mt + 6, mband, Z, true);
    ctx.restore();
    ctx.strokeStyle = 'rgba(236,232,223,0.14)';
    ctx.strokeRect(mx1 + 0.5, mt - 1.5, mx2 - mx1 - 1, mb - mt + 3);
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#6f7286';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('magnified ' + ZOOM + '×', mx2, mt - 6);

    var lines = [];
    lines.push((right ? "C's 10" : "C's 1") + ' is over D ' + fmt(a));
    if (onC) {
      lines.push('Cursor: C ' + fmt(cVal) + ', D ' + fmt(dVal));
      if (right) {
        lines.push(fmt(a) + ' × ' + fmt(cVal) + ' = ' + fmt(a * cVal) + ', read as ' + fmt(dVal));
      } else {
        lines.push(fmt(a) + ' × ' + fmt(cVal) + ' = ' + fmt(dVal));
        lines.push('and ' + fmt(dVal) + ' ÷ ' + fmt(cVal) + ' = ' + fmt(a));
      }
    } else {
      lines.push('Cursor: D ' + fmt(dVal) + ', off the C scale');
    }
    V.setText(readout, lines.join('\n'));
  }

  stage = V.createStage(canvas, { frame: frame });

  // ---- Dragging the slide, the cursor, or the magnified view ----

  // Values snap to hundredths, so readings come out tidy.
  function snapLog(x) {
    var v = Math.pow(10, x), dec = Math.floor(Math.log10(v) + 1e-9);
    var q = Math.pow(10, dec - 2);
    return Math.log10(Math.round(v / q) * q);
  }

  V.drag(canvas, {
    hit: function (x, y) {
      var G = layout(stage.width, stage.height), cx = G.x0 + G.L * p;
      if (y >= G.slideTop - 10 && y <= G.statorBottom + 10 && Math.abs(x - cx) < 20) return { kind: 'cursor' };
      if (y >= G.slideTop && y < G.yb) {
        var s0 = G.x0 + G.L * u - 10, s1 = G.x0 + G.L * (u + 1) + 10;
        if (x >= s0 && x <= s1) return { kind: 'slide' };
      }
      if (y >= G.magTop && y <= G.magBottom) return { kind: 'fine' };
      return null;
    },
    move: function (h, x, y, first) {
      var G = layout(stage.width, stage.height);
      tween = null;
      V.setSegmented(presetGroup, '');
      if (first) { h.x = x; h.u = u; h.p = p; }
      if (h.kind === 'slide') {
        u = Math.max(-1, Math.min(1, snapLog(h.u + (x - h.x) / G.L + 1) - 1));
      } else {
        var np = h.p + (x - h.x) / G.L / (h.kind === 'fine' ? ZOOM : 1);
        np = Math.max(0, Math.min(1, np));
        // Snap whichever reading is on show: C if the cursor is over it, else D.
        if (np - u >= 0 && np - u <= 1) np = u + snapLog(np - u);
        else np = snapLog(np);
        p = Math.max(0, Math.min(1, np));
      }
      stage.dirty = true;
    },
    cursor: 'ew-resize'
  });

  V.segmented(presetGroup, function (v) {
    var P = PRESETS[v];
    tween = { t: 0, u0: u, u1: P.u, p0: p, p1: P.u + Math.log10(P.c) };
    if (V.reducedMotion) tween.t = 1;
  });
})();
