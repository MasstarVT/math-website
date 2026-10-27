// Hamming(7,4): 4 data bits and 3 parity bits, numbered 1 to 7. Parity bit
// 1 checks positions 1, 3, 5, 7; bit 2 checks 2, 3, 6, 7; bit 4 checks 4–7.
// After one flip, the checks that fail add up to the flipped position.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('hamming');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var flipBtn = V.ctl(section, 'flip');
  var fixBtn = V.ctl(section, 'fix');
  var sendBtn = V.ctl(section, 'send');
  var noiseCtl = V.ctl(section, 'noise-control');
  var capA = V.ctl(section, 'cap-a'), capB = V.ctl(section, 'cap-b');
  var CAPS = {
    circles: [capA.textContent, capB.textContent],
    message: ['Pink: a flipped bit. Green: a flip the code found and fixed.', 'Each letter is 8 bits, or two blocks of 7 with the code']
  };

  var CIRCLES = [
    { name: 'A', weight: 1, color: [110, 231, 255] },
    { name: 'B', weight: 2, color: [255, 95, 162] },
    { name: 'C', weight: 4, color: [167, 139, 250] }
  ];
  var PHRASES = ['HELLO WORLD', 'MATH IS FUN', 'SEND MORE TEA', 'ALL IS WELL', 'MEET AT NOON', 'PARITY WINS'];
  var AMBER = '#ffb454';

  var view = 'circles';
  var sent = [0, 0, 0, 0, 0, 0, 0, 0];   // index 1..7 used
  var got = sent.slice();
  var pulse = 0;
  var glow = { bit: 0, t: 0 };
  var regions = [];                       // where each bit sits, for clicks
  // Message view.
  var phrase = 0;
  var noise = 0.05;
  var msg = null;
  var shown = 0;

  function encode(d) {
    var c = [0, 0, 0, d[0], 0, d[1], d[2], d[3]];
    c[1] = c[3] ^ c[5] ^ c[7];
    c[2] = c[3] ^ c[6] ^ c[7];
    c[4] = c[5] ^ c[6] ^ c[7];
    return c;
  }

  // Which circles are odd, and the position they point at.
  function syndrome(c) {
    var s = 0;
    for (var k = 0; k < 3; k++) {
      var w = CIRCLES[k].weight, p = 0;
      for (var i = 1; i <= 7; i++) if (i & w) p ^= c[i];
      if (p) s += w;
    }
    return s;
  }

  function newWord() {
    var d = [];
    for (var i = 0; i < 4; i++) d.push(Math.random() < 0.5 ? 1 : 0);
    sent = encode(d);
    got = sent.slice();
    glow = { bit: 0, t: 0 };
    stage.dirty = true;
  }

  function flip(i) {
    got[i] ^= 1;
    glow = { bit: i, t: 1, fix: false };
    stage.dirty = true;
  }

  function errors() {
    var e = 0;
    for (var i = 1; i <= 7; i++) if (got[i] !== sent[i]) e++;
    return e;
  }

  // ---- Message view: send text with and without the code ----

  function noisy(bit) { return Math.random() < noise ? bit ^ 1 : bit; }

  function send() {
    var text = PHRASES[phrase], chars = [];
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i), raw = [], rawFlip = [], blocks = [];
      var out = 0;
      for (var b = 7; b >= 0; b--) {
        var bit = (code >> b) & 1, r = noisy(bit);
        raw.push(r);
        rawFlip.push(r !== bit);
        out = out * 2 + r;
      }
      // Two blocks of 7 bits, one per half of the byte.
      var dec = 0;
      for (var h = 0; h < 2; h++) {
        var nib = (code >> (4 - h * 4)) & 15;
        var word = encode([(nib >> 3) & 1, (nib >> 2) & 1, (nib >> 1) & 1, nib & 1]);
        var rx = word.slice(), flips = [];
        for (var p = 1; p <= 7; p++) { rx[p] = noisy(word[p]); flips.push(rx[p] !== word[p]); }
        var s = syndrome(rx), fixed = rx.slice();
        if (s) fixed[s] ^= 1;
        blocks.push({ flips: flips, fixedAt: s, ok: fixed.join() === word.join() });
        dec = dec * 16 + (fixed[3] * 8 + fixed[5] * 4 + fixed[6] * 2 + fixed[7]);
      }
      chars.push({ ch: text.charAt(i), raw: raw, rawFlip: rawFlip, rawCh: out, blocks: blocks, decCh: dec });
    }
    msg = { text: text, chars: chars };
    shown = V.reducedMotion ? chars.length : 0;
    stage.dirty = true;
  }

  function printable(code) {
    return code >= 32 && code < 127 ? String.fromCharCode(code) : '·';
  }

  function frame(dt, st) {
    var busy = false;
    if (view === 'circles') {
      if (glow.t > 0) { glow.t = Math.max(0, glow.t - dt * 1.4); busy = true; }
      if (syndrome(got) && !V.reducedMotion) { pulse += dt; busy = true; }
    } else if (msg && shown < msg.chars.length) {
      shown = Math.min(msg.chars.length, shown + dt * 7);
      busy = true;
    }
    if (!busy && !st.dirty) return;
    st.dirty = false;
    if (view === 'circles') drawCircles(st); else drawMessage(st);
  }

  // ---- Drawing: circles ----

  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function drawCircles(st) {
    var ctx = st.ctx, W = st.width, H = st.height, k, i;
    ctx.clearRect(0, 0, W, H);
    var top = 66, bottom = W < 480 ? 92 : 96;
    var R = Math.min((H - top - bottom - 16) / 2.9, W / 3.3);
    var cx = W / 2, cy = top + 8 + R * 1.3;
    var centers = [[cx - R * 0.5, cy - R * 0.29], [cx + R * 0.5, cy - R * 0.29], [cx, cy + R * 0.58]];
    var s = syndrome(got);

    for (k = 0; k < 3; k++) {
      var C = CIRCLES[k], odd = (s & C.weight) !== 0;
      ctx.beginPath();
      ctx.arc(centers[k][0], centers[k][1], R, 0, Math.PI * 2);
      ctx.fillStyle = rgba(C.color, odd ? 0.13 + 0.05 * Math.sin(pulse * 6) : 0.05);
      ctx.fill();
      ctx.lineWidth = odd ? 3 : 1.5;
      ctx.strokeStyle = rgba(C.color, odd ? 1 : 0.55);
      ctx.stroke();
      // Name and parity just outside each circle.
      var lx = k === 0 ? centers[0][0] - R * 0.78 : centers[k][0] + R * 0.78;
      var ly = k === 2 ? centers[2][1] + R * 0.8 : centers[k][1] - R * 0.78;
      ctx.font = '600 13px "IBM Plex Mono", monospace';
      ctx.textAlign = k === 0 ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(C.color, 1);
      ctx.fillText(C.name + (odd ? ' odd' : ' even'), lx, ly);
    }

    // Each position sits in a different set of circles: its own binary digits.
    var at = {
      1: [cx - R * 0.89, cy - R * 0.52], 2: [cx + R * 0.89, cy - R * 0.52], 4: [cx, cy + R * 1.08],
      3: [cx, cy - R * 0.6], 5: [cx - R * 0.5, cy + R * 0.3], 6: [cx + R * 0.5, cy + R * 0.3], 7: [cx, cy]
    };
    var r = Math.max(12, R * 0.16);
    regions = [];
    for (i = 1; i <= 7; i++) {
      var p = at[i];
      regions.push({ bit: i, x: p[0], y: p[1], r: r * 1.5 });
      drawBit(ctx, p[0], p[1], r, i, s);
    }

    drawRow(ctx, W, H, bottom, s);
    updateCirclesReadout(s);
  }

  function drawBit(ctx, x, y, r, i, s) {
    var v = got[i], wrong = got[i] !== sent[i];
    if (s === i) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 + 0.35 * Math.sin(pulse * 6)) + ')';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(x, y, r + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    var g = glow.bit === i ? glow.t : 0;
    ctx.beginPath();
    ctx.arc(x, y, r * (1 + g * 0.25), 0, Math.PI * 2);
    ctx.fillStyle = v ? AMBER : '#141621';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = wrong ? '#ff5fa2' : v ? AMBER : 'rgba(236,232,223,0.45)';
    ctx.stroke();
    ctx.font = '600 ' + Math.round(r * 1.05) + 'px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = v ? '#0a0b10' : '#ece8df';
    ctx.fillText(String(v), x, y + 1);
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#6f7286';
    ctx.fillText(String(i), x + r + 7, y - r + 2);
  }

  // The seven bits in order, with the parity bits in their circles' colors.
  function drawRow(ctx, W, H, bottom, s) {
    var box = Math.min(34, (W - 40) / 7 - 6), gap = 6;
    var total = box * 7 + gap * 6, x0 = (W - total) / 2, y = H - bottom + 26;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 1; i <= 7; i++) {
      var x = x0 + (i - 1) * (box + gap), parity = (i & (i - 1)) === 0;
      var col = parity ? CIRCLES[i === 1 ? 0 : i === 2 ? 1 : 2].color : [236, 232, 223];
      ctx.font = '500 10px "IBM Plex Mono", monospace';
      ctx.fillStyle = '#6f7286';
      ctx.fillText(String(i), x + box / 2, y - 12);
      ctx.fillStyle = got[i] ? rgba(col, parity ? 0.85 : 0.75) : '#141621';
      ctx.fillRect(x, y, box, box);
      ctx.strokeStyle = got[i] !== sent[i] ? '#ff5fa2' : s === i ? '#ffffff' : rgba(col, 0.5);
      ctx.lineWidth = got[i] !== sent[i] || s === i ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, box - 1, box - 1);
      ctx.font = '600 13px "IBM Plex Mono", monospace';
      ctx.fillStyle = got[i] ? '#0a0b10' : '#c4c1ba';
      ctx.fillText(String(got[i]), x + box / 2, y + box / 2 + 1);
      ctx.font = '500 10px "IBM Plex Mono", monospace';
      ctx.fillStyle = parity ? rgba(col, 1) : '#6f7286';
      ctx.fillText(parity ? 'check' : 'data', x + box / 2, y + box + 11);
    }
  }

  function updateCirclesReadout(s) {
    var e = errors(), lines = [];
    if (!s) {
      lines.push('All three circles are even');
      lines.push(e ? e + ' bits flipped, and nobody can tell!' : 'No error found');
    } else {
      var names = [], parts = [];
      for (var k = 0; k < 3; k++) {
        if (s & CIRCLES[k].weight) { names.push(CIRCLES[k].name); parts.push(CIRCLES[k].weight); }
      }
      lines.push('Odd: ' + names.join(' and ') + (parts.length > 1 ? ', so ' + parts.join(' + ') + ' = ' + s : ', so bit ' + s));
      lines.push('Bit ' + s + ' must be the flipped one');
      if (e > 1) lines.push('Really ' + e + ' flips: the circles are fooled');
    }
    V.setText(readout, lines.join('\n'));
  }

  // ---- Drawing: message ----

  function drawMessage(st) {
    var ctx = st.ctx, W = st.width, H = st.height, i, b;
    ctx.clearRect(0, 0, W, H);
    if (!msg) send();
    var n = msg.chars.length, small = W < 480;
    var left = small ? 12 : 92, cw = (W - left - 12) / n;
    var top = 84, rowH = (H - top - 10) / 3;
    var big = Math.min(26, cw * 0.8);
    var labels = ['Sent', 'No code', 'Hamming'];
    var rawWrong = 0, codeWrong = 0, fixedBits = 0;

    for (var row = 0; row < 3; row++) {
      var y = top + row * rowH;
      if (row) {
        ctx.strokeStyle = 'rgba(236,232,223,0.07)';
        ctx.beginPath();
        ctx.moveTo(10, y - 6);
        ctx.lineTo(W - 10, y - 6);
        ctx.stroke();
      }
      ctx.font = '500 11px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#6f7286';
      if (small) ctx.fillText(labels[row], 12, y - 2);
      else ctx.fillText(labels[row], 12, y + 6);
    }

    for (i = 0; i < n; i++) {
      var c = msg.chars[i], x = left + i * cw, cxm = x + cw / 2;
      var here = i < Math.floor(shown);
      ctx.font = '600 ' + Math.round(big) + 'px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ece8df';
      var ty = top + (small ? 22 : rowH * 0.42);
      ctx.fillText(c.ch, cxm, ty);
      if (!here) continue;

      // Without the code: 8 bits, any flip spoils the letter.
      var y1 = top + rowH, sq = Math.min(6, (cw - 4) / 8);
      for (b = 0; b < 8; b++) {
        ctx.fillStyle = c.rawFlip[b] ? '#ff5fa2' : c.raw[b] ? 'rgba(236,232,223,0.6)' : 'rgba(236,232,223,0.16)';
        ctx.fillRect(cxm - 4 * sq + b * sq, y1 + (small ? 16 : 8), sq - 1, sq - 1);
      }
      var bad = c.rawCh !== c.ch.charCodeAt(0);
      if (bad) rawWrong++;
      ctx.font = '600 ' + Math.round(big) + 'px "IBM Plex Mono", monospace';
      ctx.fillStyle = bad ? '#ff5fa2' : '#ece8df';
      ctx.fillText(printable(c.rawCh), cxm, y1 + rowH * (small ? 0.62 : 0.58));

      // With the code: two blocks of 7. Green flips were found and fixed.
      var y2 = top + rowH * 2, sq2 = Math.min(6, (cw - 4) / 7);
      for (var h = 0; h < 2; h++) {
        var B = c.blocks[h];
        for (b = 0; b < 7; b++) {
          var fx = B.flips[b];
          if (fx && B.ok) fixedBits++;
          ctx.fillStyle = fx ? (B.ok ? '#7ee0a1' : '#ff5fa2') : 'rgba(236,232,223,0.22)';
          ctx.fillRect(cxm - 3.5 * sq2 + b * sq2, y2 + (small ? 16 : 8) + h * sq2, sq2 - 1, sq2 - 1);
        }
      }
      var bad2 = c.decCh !== c.ch.charCodeAt(0);
      if (bad2) codeWrong++;
      ctx.fillStyle = bad2 ? '#ff5fa2' : '#7ee0a1';
      ctx.fillText(printable(c.decCh), cxm, y2 + rowH * (small ? 0.62 : 0.58));
    }

    var done = Math.floor(shown);
    V.setText(readout, 'No code: ' + rawWrong + ' of ' + done + ' letters wrong\n' +
      'Hamming: ' + codeWrong + ' of ' + done + ' letters wrong\n' +
      'Flips found and fixed: ' + fixedBits);
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Pointer: tap a bit to flip it ----

  canvas.addEventListener('click', function (e) {
    if (view !== 'circles') return;
    var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (var i = 0; i < regions.length; i++) {
      var g = regions[i];
      if ((x - g.x) * (x - g.x) + (y - g.y) * (y - g.y) < g.r * g.r) { flip(g.bit); return; }
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, on = false;
    if (view === 'circles') {
      for (var i = 0; i < regions.length; i++) {
        var g = regions[i];
        if ((x - g.x) * (x - g.x) + (y - g.y) * (y - g.y) < g.r * g.r) on = true;
      }
    }
    canvas.style.cursor = on ? 'pointer' : '';
  });

  // ---- Controls ----

  function setView(v) {
    view = v;
    flipBtn.hidden = fixBtn.hidden = view !== 'circles';
    sendBtn.hidden = noiseCtl.hidden = view !== 'message';
    V.setText(capA, CAPS[view][0]);
    V.setText(capB, CAPS[view][1]);
    if (view === 'message') send();
    stage.dirty = true;
  }

  flipBtn.addEventListener('click', function () { flip(1 + Math.floor(Math.random() * 7)); });

  fixBtn.addEventListener('click', function () {
    var s = syndrome(got);
    if (!s) return;
    got[s] ^= 1;
    glow = { bit: s, t: 1 };
    stage.dirty = true;
  });

  sendBtn.addEventListener('click', send);

  V.ctl(section, 'new').addEventListener('click', function () {
    if (view === 'circles') newWord();
    else {
      phrase = (phrase + 1) % PHRASES.length;
      send();
    }
  });

  V.segmented(V.ctl(section, 'view'), setView);

  V.range(V.ctl(section, 'noise'), V.ctl(section, 'noise-out'),
    function (v) { return v + '% of bits flip'; },
    function (v) {
      noise = v / 100;
      if (msg) send();
    });

  // A codeword with one bit already flipped, so the circles have work to do.
  sent = encode([1, 0, 1, 1]);
  got = sent.slice();
  got[5] ^= 1;
  setView('circles');
})();
