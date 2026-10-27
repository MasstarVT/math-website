// Coupon collector: with k of n stickers already, a new one turns up with
// chance (n − k)/n, so it takes n/(n − k) packs on average. Summed: n·Hₙ packs.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('coupons');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var ANIMATE_BELOW = 40;    // packs per second; faster than this, skip the flashes
  var HOLD = 1.2;            // seconds a full album stays up before the next one
  var GREEN = '#7ee0a1';
  var DUPE = '#ff5fa2';

  var n = 50;
  var rate = 31.6;
  var playing = !V.reducedMotion;
  var have, flash, dupeFlash;
  var got = 0, packs = 0, sinceNew = 0, waits = [];
  var albumNo = 1, done = false, hold = 0;
  var totals = [], totalSum = 0;
  var exact = {};            // per album size: { pmf, from, mean }, worked out on first view
  var acc = 0, clock = 0;
  var changed = true;

  function harmonic(m) {
    var s = 0;
    for (var i = 1; i <= m; i++) s += 1 / i;
    return s;
  }

  // The exact chance that the album fills on pack t: track the chance of
  // having j different stickers after each pack until almost all is spent.
  function exactFor(m) {
    if (exact[m]) return exact[m];
    var prob = new Float64Array(m + 1), pmf = [], t = 0, left = 1;
    prob[0] = 1;
    while (left > 1e-5 && t < 50 * m) {
      t++;
      pmf.push(prob[m - 1] / m);
      left -= prob[m - 1] / m;
      for (var j = m - 1; j >= 1; j--) prob[j] = prob[j] * j / m + prob[j - 1] * (m - j + 1) / m;
      prob[0] = 0;
    }
    exact[m] = { pmf: pmf, mean: m * harmonic(m) };
    return exact[m];
  }

  function newAlbum() {
    have = new Int32Array(n);
    flash = new Float32Array(n).fill(-9);
    dupeFlash = new Float32Array(n).fill(-9);
    got = 0;
    packs = 0;
    sinceNew = 0;
    waits = [];
    done = false;
    hold = 0;
    changed = true;
  }

  function startOver() {
    totals = [];
    totalSum = 0;
    albumNo = 1;
    acc = 0;
    newAlbum();
  }

  function openPack() {
    if (done) {
      albumNo++;
      newAlbum();
    }
    var s = Math.floor(Math.random() * n);
    var show = !playing || rate < ANIMATE_BELOW;   // at high speed the flashes are just noise
    packs++;
    sinceNew++;
    if (have[s]++ === 0) {
      got++;
      waits.push(sinceNew);
      sinceNew = 0;
      if (show) flash[s] = clock;
      if (got === n) {
        done = true;
        hold = HOLD;
        totals.push(packs);
        totalSum += packs;
      }
    } else if (show) {
      dupeFlash[s] = clock;
    }
    changed = true;
  }

  function frame(dt, st) {
    clock += dt;
    exactFor(n);
    if (playing) {
      if (done && hold > 0 && rate < ANIMATE_BELOW * 4) {
        hold -= dt;
      } else {
        acc = Math.min(acc + dt * rate, 2000);
        var m = Math.floor(acc);
        acc -= m;
        for (var i = 0; i < m; i++) {
          openPack();
          if (done && rate < ANIMATE_BELOW * 4) {
            acc = 0;
            break;
          }
        }
      }
    }
    if (rate < ANIMATE_BELOW || !playing) changed = changed || clock - lastFlash() < 0.8;
    if (!changed && !st.dirty) return;
    changed = false;
    st.dirty = false;
    draw(st);
  }

  function lastFlash() {
    var t = -9;
    for (var i = 0; i < n; i++) t = Math.max(t, flash[i], dupeFlash[i]);
    return t;
  }

  function layout(st) {
    var W = st.width, H = st.height;
    var top = W < 480 ? 62 : 76;
    var avail = H - top - 24;
    var albumH = avail * 0.33;
    var waitsTop = top + albumH + 28;
    var waitsH = avail * 0.22;
    return {
      W: W, H: H, left: 16, right: W - 16,
      albumTop: top, albumH: albumH,
      waitsTop: waitsTop, waitsBottom: waitsTop + waitsH,
      histTop: waitsTop + waitsH + 32, histBottom: H - 22
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(st) {
    var ctx = st.ctx, L = layout(st);
    ctx.clearRect(0, 0, L.W, L.H);
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    drawAlbum(ctx, L);
    drawWaits(ctx, L);
    drawHistogram(ctx, L);

    V.setText(readout, 'Album ' + albumNo + ': ' + got + ' of ' + n + ' stickers\n' +
      'Packs opened ' + packs.toLocaleString() + (done ? ', full!' : ''));
  }

  function drawAlbum(ctx, L) {
    var aw = L.right - L.left, ah = L.albumH;
    // Pick the number of columns that makes the slots biggest.
    var best = 0, cols = 1;
    for (var c = 1; c <= n; c++) {
      var size = Math.min(aw / c, ah / Math.ceil(n / c));
      if (size > best) {
        best = size;
        cols = c;
      }
    }
    var rowsN = Math.ceil(n / cols), cell = Math.min(best, 72);
    var x0 = L.left + (aw - cell * cols) / 2, y0 = L.albumTop + (ah - cell * rowsN) / 2;
    var gap = Math.max(1.5, cell * 0.1), r = Math.min(6, cell * 0.18);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var fontSize = Math.min(13, Math.floor(cell * 0.36));
    for (var i = 0; i < n; i++) {
      var x = x0 + (i % cols) * cell + gap / 2, y = y0 + Math.floor(i / cols) * cell + gap / 2;
      var w = cell - gap, fresh = Math.max(0, 1 - (clock - flash[i]) / 0.8);
      var dup = Math.max(0, 1 - (clock - dupeFlash[i]) / 0.6);
      roundRect(ctx, x, y, w, w, r);
      if (have[i]) {
        ctx.fillStyle = GREEN;
        ctx.globalAlpha = 0.82;
        ctx.fill();
        ctx.globalAlpha = 1;
        if (fresh > 0) {
          ctx.fillStyle = 'rgba(255,255,255,' + (fresh * 0.85).toFixed(3) + ')';
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = 'rgba(236,232,223,0.14)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      if (dup > 0) {
        ctx.strokeStyle = DUPE;
        ctx.globalAlpha = dup;
        ctx.lineWidth = 2;
        roundRect(ctx, x - 2, y - 2, w + 4, w + 4, r + 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (fontSize >= 8) {
        ctx.font = '500 ' + fontSize + 'px "IBM Plex Mono", monospace';
        ctx.fillStyle = have[i] ? '#0d2417' : '#6f7286';
        ctx.fillText(String(i + 1), x + w / 2, y + w / 2 + (cell >= 36 && have[i] > 1 ? -4 : 0));
        if (cell >= 36 && have[i] > 1) {
          ctx.font = '500 10px "IBM Plex Mono", monospace';
          ctx.fillText('+' + (have[i] - 1), x + w / 2, y + w / 2 + 10);
        }
      }
    }
    ctx.font = '500 11px "IBM Plex Mono", monospace';
  }

  function drawWaits(ctx, L) {
    var top = L.waitsTop, bottom = L.waitsBottom, plotH = bottom - top;
    var w = (L.right - L.left) / n;
    var yMax = n * 1.2, i;
    for (i = 0; i < waits.length; i++) yMax = Math.max(yMax, waits[i] * 1.05);
    function py(v) { return bottom - Math.min(v, yMax) / yMax * plotH; }

    ctx.fillStyle = '#9b9daf';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    var narrow = L.W < 480;
    ctx.fillText(narrow ? 'Packs per new sticker' : 'Packs it took to find each new sticker', L.left, top - 8);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#6f7286';
    ctx.fillText((narrow ? 'last: ' : 'the last one: ') + n + ' on average', L.right, top - 8);

    ctx.strokeStyle = 'rgba(236,232,223,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L.left, Math.round(bottom) + 0.5);
    ctx.lineTo(L.right, Math.round(bottom) + 0.5);
    ctx.stroke();

    ctx.fillStyle = GREEN;
    for (i = 0; i < waits.length; i++) {
      var h = bottom - py(waits[i]);
      ctx.globalAlpha = i === waits.length - 1 && !done ? 1 : 0.75;
      ctx.fillRect(L.left + i * w + Math.min(1, w * 0.15), bottom - h, Math.max(1, w - Math.min(2, w * 0.3)), h);
    }
    ctx.globalAlpha = 1;
    // Packs since the last new one, still waiting.
    if (!done && sinceNew > 0) {
      ctx.fillStyle = 'rgba(126,224,161,0.3)';
      var hh = bottom - py(sinceNew);
      ctx.fillRect(L.left + got * w + Math.min(1, w * 0.15), bottom - hh, Math.max(1, w - Math.min(2, w * 0.3)), hh);
    }
    // On average the k-th new sticker takes n / (n − k + 1) packs.
    ctx.strokeStyle = '#ece8df';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (i = 0; i < n; i++) {
      var x = L.left + (i + 0.5) * w, y = py(n / (n - i));
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  function drawHistogram(ctx, L) {
    var ex = exactFor(n), pmf = ex.pmf;
    var top = L.histTop, bottom = L.histBottom, plotH = bottom - top;
    // Show packs from n up to where 99.5% of albums are done.
    var cum = 0, hi = n;
    for (var t = 0; t < pmf.length; t++) {
      cum += pmf[t];
      if (cum > 0.995) {
        hi = t + 1;
        break;
      }
    }
    for (var a = 0; a < totals.length; a++) hi = Math.max(hi, totals[a] + 1);
    var lo = n, bins = 36, bw = Math.max(1, Math.ceil((hi - lo) / bins));
    bins = Math.ceil((hi - lo) / bw);
    var counts = new Array(bins).fill(0), i;
    for (i = 0; i < totals.length; i++) {
      var b = Math.floor((totals[i] - lo) / bw);
      counts[Math.min(bins - 1, Math.max(0, b))]++;
    }
    // Exact chance per bin, scaled to the number of albums.
    var probs = new Array(bins).fill(0);
    for (t = 0; t < pmf.length; t++) {
      var bb = Math.floor((t + 1 - lo) / bw);
      if (bb >= 0 && bb < bins) probs[bb] += pmf[t];
    }
    var peak = 0;
    for (i = 0; i < bins; i++) peak = Math.max(peak, probs[i] * Math.max(1, totals.length), counts[i]);
    peak *= 1.1;
    var w = (L.right - L.left) / bins;
    function px(v) { return L.left + (v - lo) / (bins * bw) * (L.right - L.left); }

    ctx.fillStyle = '#9b9daf';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Packs per full album', L.left, top - 8);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#6f7286';
    ctx.fillText((totals.length ? 'avg ' + Math.round(totalSum / totals.length) + ', ' : '') +
      'expect ' + Math.round(ex.mean), L.right, top - 8);

    ctx.fillStyle = GREEN;
    ctx.globalAlpha = 0.75;
    for (i = 0; i < bins; i++) {
      if (!counts[i]) continue;
      var h = counts[i] / peak * plotH;
      ctx.fillRect(L.left + i * w + 1, bottom - h, Math.max(1, w - 2), h);
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(236,232,223,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (i = 0; i < bins; i++) {
      var y = bottom - probs[i] * Math.max(1, totals.length) / peak * plotH;
      if (i) ctx.lineTo(L.left + (i + 0.5) * w, y); else ctx.moveTo(L.left + 0.5 * w, y);
    }
    ctx.stroke();

    var mx = Math.round(px(ex.mean)) + 0.5;
    ctx.strokeStyle = 'rgba(236,232,223,0.5)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(mx, top);
    ctx.lineTo(mx, bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(236,232,223,0.12)';
    ctx.beginPath();
    ctx.moveTo(L.left, Math.round(bottom) + 0.5);
    ctx.lineTo(L.right, Math.round(bottom) + 0.5);
    ctx.stroke();
    ctx.fillStyle = '#6f7286';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(String(lo), L.left, bottom + 5);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ece8df';
    ctx.fillText('n·Hₙ ≈ ' + Math.round(ex.mean), mx, bottom + 5);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#6f7286';
    ctx.fillText(String(lo + bins * bw), L.right, bottom + 5);
  }

  startOver();
  V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'one').addEventListener('click', function () {
    setPlaying(false);
    openPack();
  });

  V.ctl(section, 'finish').addEventListener('click', function () {
    setPlaying(false);
    if (done) openPack();
    while (!done) openPack();
  });

  V.ctl(section, 'reset').addEventListener('click', startOver);

  V.segmented(V.ctl(section, 'size'), function (v) {
    n = parseInt(v, 10);
    startOver();
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) {
      var r = Math.pow(10, v);
      return (r < 10 ? r.toFixed(1) : Math.round(r).toLocaleString()) + ' packs / second';
    },
    function (v) { rate = Math.pow(10, v); });

})();
