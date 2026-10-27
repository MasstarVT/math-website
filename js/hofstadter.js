// Hofstadter's butterfly: allowed energies of an electron on a square grid
// in a magnetic field with flux α = p/q per square (Harper's equation).
// The energies E form q bands, where |trace of a product of q transfer
// matrices| ≤ 4. Each row is one fraction, computed a few rows per frame.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('hofstadter');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var qInput = V.ctl(section, 'q');
  var gapBtn = V.ctl(section, 'gaps');

  var EMAX = 4.25;
  var qMax = 50;
  var gaps = false;
  var raster = document.createElement('canvas');
  var rctx = raster.getContext('2d');
  var cache = {};
  var rows = null;          // per device row: { p, q }
  var queue = [];           // rows still to draw, simplest fractions first
  var total = 1;
  var growQ = 0;            // while building slowly, only rows with q ≤ growQ
  var growT = 0;
  var box = null;           // plot area in CSS px
  var hover = null;
  var lastDpr = 0;

  function gcd(a, b) { while (b) { var t = a % b; a = b; b = t; } return a; }

  // The on-site energies 2cos(2πnp/q + ν) for n = 1..q, with ν = π/(2q) so
  // that the bands are exactly where |Δ(E)| ≤ 4.
  function sites(p, q) {
    var v = new Float64Array(q + 1), nu = Math.PI / (2 * q);
    for (var n = 1; n <= q; n++) v[n] = 2 * Math.cos(2 * Math.PI * n * p / q + nu);
    return v;
  }

  // Δ(E) = trace of the product of [[E − vₙ, −1], [1, 0]] over one period.
  function delta(E, v, q) {
    var a = 1, b = 0, c = 0, d = 1;
    for (var n = 1; n <= q; n++) {
      var w = E - v[n];
      var na = w * a - c, nb = w * b - d;
      c = a; d = b; a = na; b = nb;
    }
    return a + d;
  }

  // How many bands lie below E: the number of negative pivots of H − E,
  // where H is the q-site Harper matrix with periodic ends (Sylvester's law
  // of inertia). Exact, however thin the bands are.
  function bandsBelow(E, v, q) {
    var neg = 0, n;
    if (q === 1) return v[1] + 2 - E < 0 ? 1 : 0;
    if (q === 2) return (v[1] - E < 0 ? 1 : 0) + (v[2] - E - 4 / (v[1] - E) < 0 ? 1 : 0);
    var d = v[1] - E, f = 1, s = v[q] - E;
    for (n = 1; n <= q - 2; n++) {
      if (d < 0) neg++;
      s -= f * f / d;
      f = (n + 1 === q - 1 ? 1 : 0) - f / d;
      d = v[n + 1] - E - 1 / d;
    }
    if (d < 0) neg++;
    s -= f * f / d;
    return neg + (s < 0 ? 1 : 0);
  }

  // Sort every pixel column of a row into a band, a gap or outside, and
  // for a gap count the bands below it. A band thinner than a pixel still
  // shows, because the count steps up across its column. Flux p/q and
  // 1 − p/q have the same bands, so they share a cache entry.
  function classify(p, q, W) {
    var key = Math.min(p, q - p) + '/' + q + ':' + W;
    if (cache[key]) return cache[key];
    var below = new Int16Array(W), prev = 0, v = sites(p, q);
    for (var i = 0; i < W; i++) {
      var e1 = -EMAX + 2 * EMAX * (i + 1) / W, ec = e1 - EMAX / W;
      var n1 = bandsBelow(e1, v, q);
      if (n1 > prev || Math.abs(delta(ec, v, q)) <= 4) below[i] = -1;
      else below[i] = bandsBelow(ec, v, q);
      prev = n1;
    }
    cache[key] = below;
    return below;
  }

  // The Chern number t of the gap with r bands below solves r = s·q + t·p
  // with |t| ≤ q/2. Zero means outside the spectrum.
  function chern(r, p, q) {
    if (r <= 0 || r >= q) return 0;
    var inv = 0;
    for (var k = 1; k < q; k++) if ((k * p) % q === 1) { inv = k; break; }
    var t = (r * inv) % q;
    return t > q / 2 ? t - q : t;
  }

  // Best fraction with denominator ≤ qMax for every value of α.
  function nearest(a) {
    var best = null, err = 2;
    for (var q = 1; q <= qMax; q++) {
      var p = Math.round(a * q);
      var e = Math.abs(a - p / q);
      if (e < err - 1e-12 && gcd(p, q) === 1) { err = e; best = { p: p, q: q }; }
    }
    return best;
  }

  function layout(st) {
    var left = 36, right = 14, top = 68, bottom = 30;
    box = { x: left, y: top, w: st.width - left - right, h: st.height - top - bottom };
  }

  function restart(st, slow) {
    layout(st);
    var dpr = st.dpr;
    lastDpr = dpr;
    raster.width = Math.round(box.w * dpr);
    raster.height = Math.round(box.h * dpr);
    var R = raster.height, y, q, p;
    rows = [];
    queue = [];
    // Band lines sit exactly at each fraction's row; with gap colors on,
    // every row is also filled using its nearest fraction.
    for (y = 0; y < R; y++) {
      rows.push(nearest(1 - (y + 0.5) / R));
      if (gaps) queue.push({ y: y, p: rows[y].p, q: rows[y].q, gap: true });
    }
    for (q = 1; q <= qMax; q++) {
      for (p = 0; p <= q; p++) {
        if (gcd(p, q) !== 1) continue;
        queue.push({ y: Math.min(R - 1, Math.floor((1 - p / q) * R)), p: p, q: q, gap: false });
      }
    }
    queue.sort(function (a, b) { return a.q - b.q || (b.gap ? 1 : 0) - (a.gap ? 1 : 0) || a.y - b.y; });
    total = queue.length;
    growQ = slow ? 1 : qMax;
    growT = 0;
  }

  // Positive Chern numbers start at pink, negative at cyan, and step
  // around the color wheel as they grow.
  function chernColor(t) {
    var m = Math.abs(t);
    var hue = ((t > 0 ? 334 : 190) + (m - 1) * 47) % 360;
    return 'hsla(' + hue + ',74%,' + (62 - 3 * Math.min(m, 6)) + '%,0.9)';
  }

  // Fill one row: gap colors from its nearest fraction, or the band lines
  // of a fraction that sits exactly on it.
  function drawTask(task) {
    var W = raster.width, y = task.y, below = classify(task.p, task.q, W);
    if (task.gap) rctx.clearRect(0, y, W, 1);
    else rctx.fillStyle = gaps ? '#ffffff' : '#dff3e6';
    for (var i = 0; i < W;) {
      var v = below[i], j = i + 1;
      while (j < W && below[j] === v) j++;
      if (task.gap && v > 0) {
        var t = chern(v, task.p, task.q);
        if (t) {
          rctx.fillStyle = chernColor(t);
          rctx.fillRect(i, y, j - i, 1);
        }
      } else if (!task.gap && v < 0) {
        rctx.fillRect(i, y, j - i, 1);
      }
      i = j;
    }
  }

  function frame(dt, st) {
    if (!rows || st.dpr !== lastDpr) restart(st, !V.reducedMotion);
    var busy = queue.length > 0;
    if (busy) {
      if (growQ < qMax) {
        growT += dt;
        while (growT > 0.07 && growQ < qMax) { growT -= 0.07; growQ++; }
      }
      var t0 = performance.now();
      while (queue.length && queue[0].q <= growQ && performance.now() - t0 < 6) drawTask(queue.shift());
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function fracText(p, q) { return q === 1 ? String(p) : p + '/' + q; }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(raster, box.x, box.y, box.w, box.h);

    // Axes: energy along the bottom, flux up the side.
    ctx.strokeStyle = 'rgba(111,114,134,0.6)';
    ctx.fillStyle = '#6f7286';
    ctx.lineWidth = 1;
    ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    [-4, -2, 0, 2, 4].forEach(function (E) {
      var x = box.x + (E + EMAX) / (2 * EMAX) * box.w;
      ctx.beginPath(); ctx.moveTo(x, box.y + box.h + 2); ctx.lineTo(x, box.y + box.h + 6); ctx.stroke();
      ctx.fillText(E < 0 ? '−' + (-E) : String(E), x, box.y + box.h + 9);
    });
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    [[0, '0'], [0.5, '1/2'], [1, '1']].forEach(function (a) {
      var y = box.y + (1 - a[0]) * box.h;
      ctx.beginPath(); ctx.moveTo(box.x - 6, y); ctx.lineTo(box.x - 2, y); ctx.stroke();
      ctx.fillText(a[1], box.x - 9, y);
    });

    var lines = [];
    if (hover && rows) {
      var R = raster.height, y = Math.min(R - 1, Math.max(0, Math.floor((hover.y - box.y) / box.h * R)));
      var f = rows[y], below = classify(f.p, f.q, raster.width);
      var cy = box.y + (y + 0.5) / R * box.h, sx = box.w / raster.width;
      ctx.fillStyle = '#7ee0a1';
      for (var i = 0; i < below.length;) {
        var j = i + 1;
        if (below[i] < 0) {
          while (j < below.length && below[j] < 0) j++;
          ctx.fillRect(box.x + i * sx - 0.5, cy - 1, (j - i) * sx + 1, 2);
        }
        i = j;
      }
      lines.push('α = ' + fracText(f.p, f.q) + ': ' + f.q + (f.q === 1 ? ' band' : ' bands'));
      var E = (hover.x - box.x) / box.w * 2 * EMAX - EMAX;
      var v = below[Math.min(below.length - 1, Math.max(0, Math.floor((hover.x - box.x) / sx)))];
      var t = v > 0 ? chern(v, f.p, f.q) : 0, where;
      if (v < 0) where = 'allowed';
      else if (!t) where = 'outside the spectrum';
      else where = 'a gap' + (gaps ? ', Chern number ' + (t < 0 ? '−' : '') + Math.abs(t) : '');
      lines.push('E = ' + (E < 0 ? '−' : '') + Math.abs(E).toFixed(2) + ': ' + where);
    } else if (queue.length) {
      lines.push('Fractions p/q with q up to ' + Math.min(growQ, qMax));
      lines.push('Computing ' + Math.round(100 * (1 - queue.length / total)) + '%');
    } else {
      lines.push('Fractions p/q with q up to ' + qMax);
      lines.push('Hover or tap a row to see its bands');
    }
    V.setText(readout, lines.join('\n'));
  }

  var stage = V.createStage(canvas, {
    frame: frame,
    resize: function (st) { if (rows) restart(st, false); }
  });

  // ---- Pointer ----

  function point(e) {
    if (!box) return;
    var r = canvas.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    hover = x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h ? { x: x, y: y } : null;
    stage.dirty = true;
  }
  canvas.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') point(e); });
  canvas.addEventListener('pointerdown', point);
  canvas.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse') { hover = null; stage.dirty = true; }
  });

  // ---- Controls ----

  V.range(qInput, V.ctl(section, 'q-out'), function (v) { return String(v); }, function (v) {
    if (v === qMax) return;
    qMax = v;
    if (rows) restart(stage, false);
    stage.dirty = true;
  });

  V.toggle(gapBtn, function (on) {
    gaps = on;
    if (rows) restart(stage, false);
  });

  V.ctl(section, 'build').addEventListener('click', function () {
    if (stage.width) restart(stage, true);
  });
})();
