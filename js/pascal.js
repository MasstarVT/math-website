// Pascal's triangle: each number is the sum of the two above it. Colored by
// the remainder after dividing by m, the odd numbers (m = 2) make a Sierpinski
// triangle, and any prime m gives a fractal of m triangles along each side.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('pascal');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var rowsInput = V.ctl(section, 'rows');
  var rowsOut = V.ctl(section, 'rows-out');

  var MAX_ROWS = 512;
  var ODD = [110, 231, 255];
  var SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

  var mod = 2;
  var rows = 64;
  var shown = V.reducedMotion ? MAX_ROWS : 0;   // rows revealed so far
  var tri = null;          // remainders, row n starting at n(n + 1)/2
  var triMod = 0;
  var image = null;        // big triangles are painted into this, one pixel row per row
  var imageKey = '';
  var layer = null;        // small triangles, drawn row by row as they grow
  var layerKey = '';
  var layerRows = 0;
  var hover = null;
  var G = null;

  function build() {
    tri = new Uint8Array(MAX_ROWS * (MAX_ROWS + 1) / 2);
    tri[0] = 1 % mod;
    for (var n = 1; n < MAX_ROWS; n++) {
      var at = n * (n + 1) / 2, up = (n - 1) * n / 2;
      tri[at] = tri[at + n] = 1 % mod;
      for (var k = 1; k < n; k++) tri[at + k] = (tri[up + k - 1] + tri[up + k]) % mod;
    }
    triMod = mod;
  }

  function color(r) {
    if (mod === 2) return ODD;
    var c = V.gradient(V.SPECTRUM, (r - 1) / (mod - 2)).match(/\d+/g);
    return [+c[0], +c[1], +c[2]];
  }

  function layout(st) {
    var W = st.width, H = st.height, top = 16, pad = 14;
    var w = Math.min((W - 2 * pad) / rows, (H - top - pad) / (rows * 0.866));
    var h = w * 0.866;
    return { W: W, H: H, w: w, h: h, cx: W / 2, y0: top + (H - top - pad - rows * h) / 2 };
  }

  function frame(dt, st) {
    if (triMod !== mod) build();
    var growing = shown < rows;
    if (growing) shown = Math.min(rows, shown + dt * Math.max(14, rows / 2.2));
    else if (!st.dirty) return;
    st.dirty = false;
    G = layout(st);
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx, W = G.W, H = G.H, w = G.w, h = G.h;
    ctx.clearRect(0, 0, W, H);
    var upTo = Math.min(rows, Math.ceil(shown));
    var y;

    if (rows > 64) {
      paintImage();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, G.y0 + upTo * h);
      ctx.clip();
      ctx.imageSmoothingEnabled = rows * 2 > rows * w;
      ctx.drawImage(image, G.cx - rows * w / 2, G.y0, rows * w, rows * h);
      ctx.restore();
    } else {
      // Rows are drawn once into a layer as they appear, then reused.
      var key = mod + ':' + rows + ':' + W + 'x' + H + '@' + st.dpr;
      if (key !== layerKey || layerRows > upTo) {
        if (!layer) layer = document.createElement('canvas');
        layer.width = Math.round(W * st.dpr);
        layer.height = Math.round(H * st.dpr);
        layerKey = key;
        layerRows = 0;
      }
      if (layerRows < upTo) {
        var lc = layer.getContext('2d');
        lc.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
        drawRows(lc, layerRows, upTo);
        layerRows = upTo;
      }
      ctx.drawImage(layer, 0, 0, W, H);
    }

    // The hovered number, and the row it sits in.
    if (hover && hover.n < upTo) {
      y = G.y0 + (hover.n + 0.5) * h;
      ctx.strokeStyle = 'rgba(236,232,223,0.35)';
      ctx.lineWidth = Math.max(1, Math.min(h * 0.9, 2));
      ctx.beginPath();
      ctx.moveTo(G.cx - (hover.n / 2 + 0.5) * w, y);
      ctx.lineTo(G.cx + (hover.n / 2 + 0.5) * w, y);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(G.cx + (hover.k - hover.n / 2) * w, y, Math.max(4, w * 0.55), 0, Math.PI * 2);
      ctx.stroke();
    }

    updateReadout();
  }

  function drawRows(c, from, upTo) {
    var w = G.w, h = G.h, labels = rows <= 16;
    var rad = w * (labels ? 0.47 : 0.44);
    if (labels) {
      c.font = '500 ' + Math.min(15, w * 0.34).toFixed(1) + 'px "IBM Plex Mono", monospace';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
    }
    var val = [1];
    for (var n = 0; n < upTo; n++) {
      if (n) {
        var next = [1];
        for (var k = 1; k < n; k++) next.push(val[k - 1] + val[k]);
        next.push(1);
        val = next;
      }
      if (n < from) continue;
      var y = G.y0 + (n + 0.5) * h;
      for (k = 0; k <= n; k++) {
        var x = G.cx + (k - n / 2) * w;
        var r = tri[n * (n + 1) / 2 + k];
        var col = r ? color(r) : null;
        c.fillStyle = col ? 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')' : 'rgba(236,232,223,0.07)';
        c.beginPath();
        c.arc(x, y, rad, 0, Math.PI * 2);
        c.fill();
        if (labels) {
          c.fillStyle = col ? '#0a0b10' : 'rgba(236,232,223,0.55)';
          c.fillText(String(val[k]), x, y + 0.5);
        }
      }
    }
  }

  // One pixel row per triangle row, two pixels per number so rows can sit
  // half a number apart.
  function paintImage() {
    var key = mod + ':' + rows;
    if (key === imageKey) return;
    imageKey = key;
    if (!image) image = document.createElement('canvas');
    image.width = rows * 2;
    image.height = rows;
    var c = image.getContext('2d');
    var img = c.createImageData(rows * 2, rows);
    var data = new Uint32Array(img.data.buffer);
    var words = [(255 << 24 | 34 << 16 | 30 << 8 | 28) >>> 0];
    for (var r = 1; r < mod; r++) {
      var col = color(r);
      words.push((255 << 24 | col[2] << 16 | col[1] << 8 | col[0]) >>> 0);
    }
    for (var n = 0; n < rows; n++) {
      var at = n * (n + 1) / 2, x0 = rows - 1 - n, line = n * rows * 2;
      for (var k = 0; k <= n; k++) {
        var word = words[tri[at + k]];
        data[line + x0 + 2 * k] = word;
        data[line + x0 + 2 * k + 1] = word;
      }
    }
    c.putImageData(img, 0, 0);
  }

  function sup(n) { return String(n).split('').map(function (d) { return SUP[+d]; }).join(''); }

  function binomial(n, k) {
    k = Math.min(k, n - k);
    var c = BigInt(1);
    for (var i = 0; i < k; i++) c = c * BigInt(n - i) / BigInt(i + 1);
    return c;
  }

  function updateReadout() {
    var lines;
    if (hover) {
      var n = hover.n, k = hover.k;
      var c = binomial(n, k).toString();
      var r = tri[n * (n + 1) / 2 + k];
      lines = [
        c.length <= 15 ? 'C(' + n + ', ' + k + ') = ' + Number(c).toLocaleString()
          : 'C(' + n + ', ' + k + ') has ' + c.length + ' digits',
        mod === 2 ? (r ? 'Odd' : 'Even') + ', and row ' + n + ' adds up to 2' + sup(n)
          : 'Remainder ' + r + ' when divided by ' + mod
      ];
      if (mod !== 2) lines.push('Row ' + n + ' adds up to 2' + sup(n));
      if (mod === 2) {
        var ones = n.toString(2).replace(/0/g, '').length;
        var line = 'Odd numbers in it: 2' + sup(ones) + ' = ' + Math.pow(2, ones) + ' (' + n.toString(2) + '₂)';
        lines.push(line.length <= 38 ? line : 'Odd numbers in it: 2' + sup(ones) + ' = ' + Math.pow(2, ones));
      }
    } else {
      lines = [
        'Rows 0 to ' + (rows - 1) + ', colored by remainder ÷ ' + mod,
        'Row n always adds up to 2ⁿ'
      ];
    }
    lines = lines.map(function (l) { return l.length > 38 ? l.slice(0, 37) + '…' : l; });
    V.setText(readout, lines.join('\n'));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Hover ----

  function onPoint(e) {
    if (!G) return;
    var b = canvas.getBoundingClientRect();
    var x = e.clientX - b.left, y = e.clientY - b.top;
    var n = Math.floor((y - G.y0) / G.h);
    var k = Math.round((x - G.cx) / G.w + n / 2);
    var h = n >= 0 && n < rows && k >= 0 && k <= n ? { n: n, k: k } : null;
    if (!h !== !hover || h && (h.n !== hover.n || h.k !== hover.k)) {
      hover = h;
      stage.dirty = true;
    }
  }
  canvas.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') onPoint(e); });
  canvas.addEventListener('pointerdown', onPoint);
  canvas.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse' && hover) { hover = null; stage.dirty = true; }
  });

  // ---- Controls ----

  V.range(rowsInput, rowsOut, function (v) { return String(Math.round(Math.pow(2, v))); }, function (v) {
    rows = Math.round(Math.pow(2, v));
    if (shown > rows) shown = rows;
    if (hover && hover.n >= rows) hover = null;
    stage.dirty = true;
  });

  V.segmented(V.ctl(section, 'mod'), function (v) {
    mod = parseInt(v, 10);
    imageKey = '';
    stage.dirty = true;
  });

  V.ctl(section, 'regrow').addEventListener('click', function () {
    shown = 0;
    stage.dirty = true;
  });
})();
