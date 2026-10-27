// Gaussian primes: whole numbers a + bi that can't be split into smaller ones.
// a + bi with a, b ≠ 0 is prime exactly when a² + b² is an ordinary prime; on
// the axes the primes are the ordinary primes 4k + 3, which never split.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('gaussian-primes');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var zoomInput = V.ctl(section, 'zoom');
  var splitGroup = V.ctl(section, 'split');

  var MAX_R = 160;
  var SPLIT = '#ffb454';   // norm is a prime 4k + 1
  var STAY = '#6ee7ff';    // an ordinary prime 4k + 3, on an axis
  var TWO = '#ff5fa2';     // 1 + i and its partners, norm 2
  var SUP = { 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

  var comp = null;
  var logR = Math.log(8);
  var targetLog = Math.log(20);
  var split = 13;
  var hover = null;
  var G = null;
  var layer = null;
  var layerKey = '';

  function sieve() {
    var n = Math.ceil(MAX_R * MAX_R * 3.2);
    comp = new Uint8Array(n + 1);
    comp[0] = comp[1] = 1;
    for (var i = 2; i * i <= n; i++) {
      if (!comp[i]) for (var j = i * i; j <= n; j += i) comp[j] = 1;
    }
  }

  function isPrime(n) { return n > 1 && !comp[n]; }

  // 0: not prime, 1: split kind, 2: stays prime, 3: norm 2.
  function kind(a, b) {
    if (a === 0 || b === 0) {
      var m = Math.abs(a + b);
      return isPrime(m) && m % 4 === 3 ? 2 : 0;
    }
    var nn = a * a + b * b;
    if (!isPrime(nn)) return 0;
    return nn === 2 ? 3 : 1;
  }

  function frame(dt, st) {
    if (!comp) sieve();
    if (Math.abs(targetLog - logR) > 1e-4) {
      logR += (targetLog - logR) * (V.reducedMotion ? 1 : 1 - Math.exp(-dt * 3));
      zoomInput.value = logR.toFixed(3);
      st.dirty = true;
    } else if (logR !== targetLog) {
      logR = targetLog;
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    var R = Math.exp(logR);
    var s = Math.min(W, H) / 2 / R;
    var cx = Math.round(W / 2), cy = Math.round(H / 2);
    G = { cx: cx, cy: cy, s: s };
    ctx.clearRect(0, 0, W, H);

    // Mirror lines: the picture has the symmetry of a square.
    var far = Math.hypot(W, H);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(236,232,223,0.07)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(cx - far, cy - far); ctx.lineTo(cx + far, cy + far);
    ctx.moveTo(cx - far, cy + far); ctx.lineTo(cx + far, cy - far);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(236,232,223,0.16)';
    ctx.beginPath();
    ctx.moveTo(0, cy + 0.5); ctx.lineTo(W, cy + 0.5);
    ctx.moveTo(cx + 0.5, 0); ctx.lineTo(cx + 0.5, H);
    ctx.stroke();

    // The lattice only changes with the zoom, so it's drawn once into a layer.
    var key = logR + ',' + W + ',' + H + ',' + st.dpr;
    if (key !== layerKey) {
      paintLayer(W, H, st.dpr, s, cx, cy);
      layerKey = key;
    }
    ctx.drawImage(layer, 0, 0, W, H);
    var size = s >= 6 ? s * 0.78 : Math.max(1, s * 0.92);

    // The chosen ordinary prime p: the circle a² + b² = p, and whatever sits on it.
    var pr = Math.sqrt(split) * s;
    ctx.strokeStyle = 'rgba(236,232,223,0.55)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, pr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    var on = onCircle(split);
    if (s < 2.5) {
      // Too small to ring each point; the dashed circle says enough.
    } else if (on.length) {
      on.forEach(function (z) { ring(ctx, z[0], z[1], '#ffffff', 2); });
    } else {
      [[split, 0], [-split, 0], [0, split], [0, -split]].forEach(function (z) { ring(ctx, z[0], z[1], '#ffffff', 2); });
    }

    // Hovered point and its seven mirror images.
    if (hover) {
      images(hover[0], hover[1]).forEach(function (z, i) {
        ring(ctx, z[0], z[1], i ? 'rgba(236,232,223,0.6)' : '#ffffff', i ? 1.2 : 2.2);
      });
    }

    // A few labels along the real axis.
    if (s >= 7) {
      ctx.font = '500 10px "IBM Plex Mono", monospace';
      ctx.fillStyle = '#6f7286';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      var step = s >= 24 ? 1 : s >= 12 ? 5 : 10;
      for (var a = step; a * s < W / 2 - 10; a += step) {
        ctx.fillText(String(a), cx + a * s, cy + size / 2 + 3);
      }
    }

    updateReadout();
  }

  function paintLayer(W, H, dpr, s, cx, cy) {
    if (!layer) layer = document.createElement('canvas');
    layer.width = Math.round(W * dpr);
    layer.height = Math.round(H * dpr);
    var c = layer.getContext('2d');
    var ax = Math.ceil(W / 2 / s) + 1, by = Math.ceil(H / 2 / s) + 1;
    var size = s >= 6 ? s * 0.78 : Math.max(1, s * 0.92);
    var a, b, k;

    // Zoomed far out there are tens of thousands of tiny squares, so they
    // go straight into pixels.
    if (s < 5) {
      var pw = layer.width, ph = layer.height;
      var img = c.createImageData(pw, ph), data = new Uint32Array(img.data.buffer);
      var words = [0, word(255, 180, 84), word(110, 231, 255), word(255, 95, 162)];
      var px = Math.max(1, Math.round(size * dpr));
      for (a = -ax; a <= ax; a++) {
        for (b = -by; b <= by; b++) {
          k = kind(a, b);
          if (!k) continue;
          var x0 = Math.round((cx + a * s) * dpr - px / 2), y0 = Math.round((cy - b * s) * dpr - px / 2);
          for (var yy = Math.max(0, y0); yy < Math.min(ph, y0 + px); yy++) {
            for (var xx = Math.max(0, x0); xx < Math.min(pw, x0 + px); xx++) data[yy * pw + xx] = words[k];
          }
        }
      }
      c.putImageData(img, 0, 0);
      return;
    }

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    var round = s >= 9;
    var paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    for (a = -ax; a <= ax; a++) {
      for (b = -by; b <= by; b++) {
        k = kind(a, b);
        var x = cx + a * s, y = cy - b * s;
        if (!k) {
          if (s >= 9) paths[0].rect(x - 1, y - 1, 2, 2);
        } else if (round) {
          paths[k].roundRect(x - size / 2, y - size / 2, size, size, size * 0.22);
        } else {
          paths[k].rect(x - size / 2, y - size / 2, size, size);
        }
      }
    }
    var colors = ['rgba(236,232,223,0.13)', SPLIT, STAY, TWO];
    for (k = 0; k < 4; k++) {
      c.fillStyle = colors[k];
      c.fill(paths[k]);
    }
  }

  function word(r, g, b) { return (255 << 24 | b << 16 | g << 8 | r) >>> 0; }

  function ring(ctx, a, b, color, width) {
    var r = Math.max(4, G.s * 0.62);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(G.cx + a * G.s, G.cy - b * G.s, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Multiply by 1, i, −1, −i, and flip across the real axis.
  function images(a, b) {
    var out = [], seen = {};
    [[a, b], [a, -b]].forEach(function (z) {
      var x = z[0], y = z[1];
      for (var k = 0; k < 4; k++) {
        var key = x + ',' + y;
        if (!seen[key]) { seen[key] = 1; out.push([x, y]); }
        var t = x; x = -y; y = t;
      }
    });
    return out;
  }

  function onCircle(p) {
    var out = [];
    var m = Math.floor(Math.sqrt(p));
    for (var a = -m; a <= m; a++) {
      var b2 = p - a * a, b = Math.round(Math.sqrt(b2));
      if (b * b === b2) {
        out.push([a, b]);
        if (b) out.push([a, -b]);
      }
    }
    return out;
  }

  // ---- Writing numbers and factorizations ----

  function num(n) { return n < 0 ? '−' + -n : String(n); }
  function sq(n) { return n < 0 ? '(' + num(n) + ')²' : n + '²'; }

  function gauss(a, b) {
    if (!b) return num(a);
    var im = Math.abs(b) === 1 ? 'i' : Math.abs(b) + 'i';
    if (!a) return (b < 0 ? '−' : '') + im;
    return num(a) + (b < 0 ? ' − ' : ' + ') + im;
  }

  // Split a + bi into Gaussian primes times a unit, one ordinary prime of the
  // norm at a time.
  function factorize(a, b) {
    var n = a * a + b * b;
    var out = [];
    var x = a, y = b;
    function divide(p, q) {
      var d = p * p + q * q;
      var re = x * p + y * q, im = y * p - x * q;
      if (re % d || im % d) return false;
      x = re / d;
      y = im / d;
      return true;
    }
    for (var p = 2; p * p <= n || n > 1; p++) {
      if (p * p > n) p = n;
      if (n % p) continue;
      var e = 0;
      while (n % p === 0) { n /= p; e++; }
      if (p === 2) {
        for (var i = 0; i < e; i++) { divide(1, 1); out.push([1, 1]); }
      } else if (p % 4 === 3) {
        for (i = 0; i < e / 2; i++) { divide(p, 0); out.push([p, 0]); }
      } else {
        var c = onCircle(p).filter(function (z) { return z[0] > z[1] && z[1] > 0; })[0];
        for (i = 0; i < e; i++) {
          if (divide(c[0], c[1])) out.push([c[0], c[1]]);
          else { divide(c[0], -c[1]); out.push([c[0], -c[1]]); }
        }
      }
    }
    return { unit: [x, y], factors: out };
  }

  function factorText(f) {
    var parts = [], counts = {};
    f.factors.forEach(function (z) {
      var key = z[0] + ',' + z[1];
      if (counts[key]) counts[key].e++;
      else { counts[key] = { z: z, e: 1 }; parts.push(counts[key]); }
    });
    var text = parts.map(function (c) {
      var t = c.z[1] ? '(' + gauss(c.z[0], c.z[1]) + ')' : String(c.z[0]);
      return t + (c.e > 1 ? (SUP[c.e] || '^' + c.e) : '');
    }).join(' × ');
    var u = f.unit;
    var unit = u[0] === 1 ? '' : u[0] === -1 ? '−' : u[1] === 1 ? 'i × ' : '−i × ';
    if (unit === '−' && /^\d/.test(text)) unit = '−1 × ';
    return unit + text;
  }

  function updateReadout() {
    var line1, line2;
    if (hover) {
      var a = hover[0], b = hover[1], n = a * a + b * b;
      var k = kind(a, b);
      line1 = gauss(a, b) + ':  ' + sq(a) + ' + ' + sq(b) + ' = ' + n;
      if (n === 0) line2 = 'Zero';
      else if (n === 1) line2 = 'A unit: it divides everything';
      else if (k === 2) line2 = 'Prime: ' + Math.abs(a + b) + ' is 4k + 3, it can\'t split';
      else if (k) line2 = 'A Gaussian prime, since ' + n + ' is prime';
      else line2 = '= ' + factorText(factorize(a, b));
      if (line2.length > 38) line2 = line2.slice(0, 36) + ' …';
    } else if (split === 2) {
      line1 = '2 is special: 2 = (1 + i)(1 − i)';
      line2 = 'and 1 − i is just −i × (1 + i)';
    } else if (split % 4 === 1) {
      var c = onCircle(split).filter(function (z) { return z[0] > z[1] && z[1] > 0; })[0];
      line1 = split + ' = 4 × ' + (split - 1) / 4 + ' + 1 splits in two';
      line2 = split + ' = (' + gauss(c[0], c[1]) + ')(' + gauss(c[0], -c[1]) + ')';
    } else {
      line1 = split + ' = 4 × ' + (split - 3) / 4 + ' + 3 stays prime';
      line2 = 'No a² + b² equals ' + split;
    }
    V.setText(readout, line1 + '\n' + line2);
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Hover ----

  function onPoint(e) {
    if (!G) return;
    var r = canvas.getBoundingClientRect();
    var a = Math.round((e.clientX - r.left - G.cx) / G.s);
    var b = Math.round((G.cy - (e.clientY - r.top)) / G.s);
    if (!hover || hover[0] !== a || hover[1] !== b) {
      hover = [a, b];
      stage.dirty = true;
    }
  }
  canvas.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') onPoint(e); });
  canvas.addEventListener('pointerdown', onPoint);
  canvas.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse') { hover = null; stage.dirty = true; }
  });

  // ---- Controls ----

  zoomInput.min = Math.log(4).toFixed(3);
  zoomInput.max = Math.log(MAX_R).toFixed(3);
  zoomInput.value = logR.toFixed(3);
  zoomInput.addEventListener('input', function () {
    logR = targetLog = parseFloat(zoomInput.value);
    stage.dirty = true;
  });

  V.segmented(splitGroup, function (v) {
    split = parseInt(v, 10);
    hover = null;
    // Zoom out far enough to see it.
    var need = Math.log((split % 4 === 3 ? split : Math.sqrt(split)) * 1.5 + 2);
    if (need > targetLog) targetLog = need;
    stage.dirty = true;
  });
})();
