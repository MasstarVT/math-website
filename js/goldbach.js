// Goldbach's comet: for every even n, count the ways to write n = p + q with
// primes p ≤ q. The counts climb but split into bands, because primes above 3
// leave remainder 1 or 2 when divided by 3 (and likewise for 5, 7, …).
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('goldbach');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var pickInput = V.ctl(section, 'pick');
  var pickOut = V.ctl(section, 'pick-out');
  var tryGroup = V.ctl(section, 'try');
  var rangeGroup = V.ctl(section, 'range');

  var MAX = 10000;
  var ZERO = [255, 95, 162];   // n is a multiple of the chosen number
  var REST = [124, 140, 255];

  var comp = null;             // comp[k] = 1 when k is not prime
  var ways = null;             // ways[n] for even n
  var range = 10000;
  var mod = 3;
  var pick = 128;
  var grown = 0;               // how far along the comet has been drawn
  var topWays = {};            // highest count in each range, for the axis
  var L = null;

  function compute() {
    comp = new Uint8Array(MAX + 1);
    comp[0] = comp[1] = 1;
    for (var i = 2; i * i <= MAX; i++) {
      if (!comp[i]) for (var j = i * i; j <= MAX; j += i) comp[j] = 1;
    }
    var primes = [];
    for (i = 2; i <= MAX; i++) if (!comp[i]) primes.push(i);
    ways = new Uint16Array(MAX + 1);
    for (var a = 0; a < primes.length; a++) {
      for (var b = a; b < primes.length && primes[a] + primes[b] <= MAX; b++) ways[primes[a] + primes[b]]++;
    }
  }

  function axisTop() {
    if (!topWays[range]) {
      var m = 1;
      for (var n = 4; n <= range; n += 2) if (ways[n] > m) m = ways[n];
      topWays[range] = m * 1.06;
    }
    return topWays[range];
  }

  function commas(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function niceStep(x) {
    var p = Math.pow(10, Math.floor(Math.log(x) / Math.LN10));
    var f = x / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }

  function layout(st) {
    var W = st.width, H = st.height;
    var bottom = Math.round(H * 0.6);
    return {
      W: W, H: H, left: 16, right: W - 46, top: 18, bottom: bottom,
      base: H - 26, arcTop: bottom + 40
    };
  }

  function xOf(n) { return L.left + n / range * (L.right - L.left); }
  function yOf(w, top) { return L.bottom - w / top * (L.bottom - L.top); }

  function frame(dt, st) {
    if (!ways) compute();
    var growing = grown < 1;
    if (growing) grown = V.reducedMotion ? 1 : Math.min(1, grown + dt / 2.4);
    else if (!st.dirty) return;
    st.dirty = false;
    L = layout(st);
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx;
    ctx.clearRect(0, 0, L.W, L.H);
    var top = axisTop();
    var upTo = 4 + Math.floor(V.easeInOut(grown) * (range - 4) / 2) * 2;
    var i, n, y;

    // Gridlines and labels, kept to the right and bottom so the readout covers nothing.
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.lineWidth = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    var ys = niceStep(top / 4);
    for (var v = 0; v <= top + 1e-9; v += ys) {
      y = Math.round(yOf(v, top)) + 0.5;
      ctx.strokeStyle = v ? 'rgba(236,232,223,0.07)' : 'rgba(236,232,223,0.25)';
      ctx.beginPath();
      ctx.moveTo(L.left, y);
      ctx.lineTo(L.right, y);
      ctx.stroke();
      ctx.fillStyle = '#6f7286';
      ctx.fillText(String(v), L.right + 8, y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var xs = niceStep(range / 4);
    for (v = xs; v <= range; v += xs) {
      var gx = Math.round(xOf(v)) + 0.5;
      ctx.fillStyle = '#6f7286';
      ctx.fillText(commas(v), Math.min(gx, L.right - 14), L.bottom + 7);
    }

    // The comet: the other residues first, multiples on top.
    var r = range <= 1000 ? 1.7 : range <= 4000 ? 1.15 : 0.85;
    for (var pass = 0; pass < 2; pass++) {
      var c = pass ? ZERO : REST;
      ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.85)';
      ctx.beginPath();
      for (n = 4; n <= upTo; n += 2) {
        if ((n % mod === 0) !== (pass === 1)) continue;
        ctx.rect(xOf(n) - r, yOf(ways[n], top) - r, 2 * r, 2 * r);
      }
      ctx.fill();
    }

    // The picked number.
    if (pick <= range) {
      var px = xOf(pick), py = yOf(ways[pick], top);
      ctx.strokeStyle = 'rgba(236,232,223,0.3)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(Math.round(px) + 0.5, L.bottom);
      ctx.lineTo(Math.round(px) + 0.5, py + 7);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawPairs(ctx);
    updateReadout();
  }

  // Below the comet: the number line from 0 to n, with each pair p + q joined
  // by an arc. Every arc is centered on n/2, so the primes mirror each other.
  function drawPairs(ctx) {
    var n = pick, x0 = L.left, x1 = L.right, base = L.base;
    var s = (x1 - x0) / n;
    var h = base - L.arcTop;
    var count = ways[n];

    ctx.strokeStyle = 'rgba(236,232,223,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, base + 0.5);
    ctx.lineTo(x1, base + 0.5);
    ctx.stroke();

    ctx.lineWidth = count > 120 ? 0.8 : count > 30 ? 1.1 : 1.6;
    ctx.globalAlpha = count > 120 ? 0.55 : 0.9;
    var k = 0;
    for (var p = 2; p <= n / 2; p++) {
      if (comp[p] || comp[n - p]) continue;
      var rx = (n / 2 - p) * s;
      ctx.strokeStyle = V.gradient(V.SPECTRUM, count > 1 ? k / (count - 1) : 0.6);
      ctx.beginPath();
      if (rx < 0.5) {
        ctx.moveTo(x0 + p * s, base);
        ctx.lineTo(x0 + p * s, base - 6);
      } else {
        ctx.ellipse(x0 + n / 2 * s, base, rx, Math.max(4, (n - 2 * p) / n * h), 0, Math.PI, Math.PI * 2);
      }
      ctx.stroke();
      k++;
    }
    ctx.globalAlpha = 1;

    // Primes below n as ticks; the ones used in a pair brighter.
    for (p = 2; p < n; p++) {
      if (comp[p]) continue;
      var used = !comp[n - p];
      ctx.fillStyle = used ? '#ece8df' : 'rgba(236,232,223,0.28)';
      var tw = n > 3000 ? 0.8 : 1.4;
      ctx.fillRect(x0 + p * s - tw / 2, base - (used ? 4 : 2.5), tw, used ? 8 : 5);
    }

    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#6f7286';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('0', x0, base + 8);
    ctx.textAlign = 'center';
    ctx.fillText(String(n / 2), x0 + n / 2 * s, base + 8);
    ctx.textAlign = 'right';
    ctx.fillText(String(n), x1, base + 8);
  }

  function updateReadout() {
    var n = pick, count = ways[n];
    var list = [];
    for (var p = 2; p <= n / 2; p++) if (!comp[p] && !comp[n - p]) list.push(p + ' + ' + (n - p));
    var line = '';
    for (var i = 0; i < list.length; i++) {
      var next = (line ? line + ', ' : '') + list[i];
      if (next.length > (i < list.length - 1 ? 33 : 38)) { line += ', …'; break; }
      line = next;
    }
    V.setText(readout, commas(n) + ' = p + q in ' + count + (count === 1 ? ' way' : ' ways') + '\n' + line);
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Picking a number ----

  function setPick(n, fromInput) {
    pick = Math.max(4, Math.min(MAX, Math.round(n / 2) * 2));
    if (pick > range) setRange(pick <= 1000 ? 1000 : pick <= 4000 ? 4000 : 10000);
    if (!fromInput) pickInput.value = pick;
    pickOut.textContent = commas(pick);
    stage.dirty = true;
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (!L || !ways) return;
    var b = canvas.getBoundingClientRect();
    var x = e.clientX - b.left, y = e.clientY - b.top;
    if (y > L.bottom + 4 || x < L.left || x > L.right) return;
    // The nearest point on screen, close to where you tapped.
    var top = axisTop(), best = 0, bestD = Infinity;
    var n0 = Math.max(4, Math.floor((x - 14 - L.left) / (L.right - L.left) * range));
    var n1 = Math.min(range, Math.ceil((x + 14 - L.left) / (L.right - L.left) * range));
    for (var n = n0 + (n0 % 2); n <= n1; n += 2) {
      var d = Math.hypot(xOf(n) - x, yOf(ways[n], top) - y);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (best) {
      V.setSegmented(tryGroup, '');
      setPick(best, false);
    }
  });

  // ---- Controls ----

  function setRange(r) {
    range = r;
    pickInput.max = r;
    if (pick > r) setPick(r, false);
    V.setSegmented(rangeGroup, String(r));
    grown = 0;
    stage.dirty = true;
  }

  pickInput.max = range;
  V.range(pickInput, null, String, function (v) {
    V.setSegmented(tryGroup, '');
    setPick(v, true);
  });
  setPick(pick, false);
  V.setSegmented(tryGroup, String(pick));

  V.segmented(tryGroup, function (v) { setPick(parseInt(v, 10), false); });
  V.segmented(rangeGroup, function (v) { setRange(parseInt(v, 10)); });
  V.segmented(V.ctl(section, 'mod'), function (v) {
    mod = parseInt(v, 10);
    stage.dirty = true;
  });
})();
