// L-systems: rewrite every letter of a string by a rule, all at once, a few
// rounds over, then read the result as turtle moves. F draws a step, + and −
// turn, [ saves the turtle's place and ] goes back to it. X only steers growth.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('lsystem');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var presetGroup = V.ctl(section, 'preset');
  var roundInput = V.ctl(section, 'round');
  var roundOut = V.ctl(section, 'round-out');
  var angleInput = V.ctl(section, 'angle');
  var angleOut = V.ctl(section, 'angle-out');
  var growBtn = V.ctl(section, 'grow');
  var originalBtn = V.ctl(section, 'original');

  // From Prusinkiewicz and Lindenmayer, The Algorithmic Beauty of Plants.
  var PRESETS = {
    plant: { axiom: 'X', rules: { X: 'F+[[X]-X]-F[-FX]+X', F: 'FF' }, angle: 25, n: 6, max: 7 },
    bush: { axiom: 'X', rules: { X: 'F[+X]F[-X]+X', F: 'FF' }, angle: 20, n: 7, max: 8 },
    tree: { axiom: 'X', rules: { X: 'F[+X][-X]FX', F: 'FF' }, angle: 25.7, n: 7, max: 8 },
    weed: { axiom: 'F', rules: { F: 'F[+F]F[-F]F' }, angle: 25.7, n: 5, max: 6 },
    shrub: { axiom: 'F', rules: { F: 'FF-[-F+F+F]+[+F-F-F]' }, angle: 22.5, n: 4, max: 5 },
    seaweed: { axiom: 'F', rules: { F: 'F[+F]F[-F][F]' }, angle: 20, n: 5, max: 6 }
  };
  var MAX_LETTERS = 300000;
  var GROW_SECONDS = 4.5;
  var TAPE_H = 30;

  var preset = 'plant';
  var rules = null, axiom = 'X', mutated = false;
  var round = 6, angle = 25;
  var word = '';
  var segs = null;          // { xy: Float32Array of x1 y1 x2 y2, depth, at: index in word, n, maxDepth }
  var dirty = true;         // the word or the drawing needs rebuilding
  var drawn = 0;            // segments drawn so far while growing
  var growing = !V.reducedMotion;
  var fit = null;
  var lastKey = '';

  function copyRules(r) {
    var o = {};
    for (var k in r) o[k] = r[k];
    return o;
  }

  // Length after n rounds, from letter counts alone, without building it.
  function lengthAfter(n) {
    var counts = {}, k, c;
    for (k = 0; k < axiom.length; k++) counts[axiom[k]] = (counts[axiom[k]] || 0) + 1;
    for (var r = 0; r < n; r++) {
      var next = {};
      for (c in counts) {
        var out = rules[c] || c;
        for (k = 0; k < out.length; k++) next[out[k]] = (next[out[k]] || 0) + counts[c];
      }
      counts = next;
    }
    var total = 0;
    for (c in counts) total += counts[c];
    return total;
  }

  function maxRound() {
    var cap = PRESETS[preset].max;
    while (cap > 0 && lengthAfter(cap) > MAX_LETTERS) cap--;
    return cap;
  }

  function expand() {
    var s = axiom;
    for (var r = 0; r < round; r++) {
      var parts = [];
      for (var i = 0; i < s.length; i++) parts.push(rules[s[i]] || s[i]);
      s = parts.join('');
    }
    word = s;
  }

  // Walk the turtle with unit steps, heading up.
  function turtle() {
    var count = 0, i;
    for (i = 0; i < word.length; i++) if (word[i] === 'F') count++;
    var xy = new Float32Array(count * 4), depth = new Uint8Array(count), at = new Uint32Array(count);
    var x = 0, y = 0, h = -Math.PI / 2, d = 0, stack = [], k = 0, maxD = 0;
    var turn = angle * Math.PI / 180;
    var minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (i = 0; i < word.length; i++) {
      var ch = word[i];
      if (ch === 'F') {
        var nx = x + Math.cos(h), ny = y + Math.sin(h);
        xy[k * 4] = x; xy[k * 4 + 1] = y; xy[k * 4 + 2] = nx; xy[k * 4 + 3] = ny;
        depth[k] = Math.min(d, 255);
        at[k] = i;
        k++;
        x = nx;
        y = ny;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      } else if (ch === '+') h -= turn;
      else if (ch === '-') h += turn;
      else if (ch === '[') { stack.push(x, y, h, d); d++; if (d > maxD) maxD = d; }
      else if (ch === ']' && stack.length) { d = stack.pop(); h = stack.pop(); y = stack.pop(); x = stack.pop(); }
    }
    segs = { xy: xy, depth: depth, at: at, n: count, maxDepth: maxD, box: [minX, minY, maxX, maxY] };
  }

  function rebuild() {
    expand();
    turtle();
    dirty = false;
    drawn = growing ? 0 : segs.n;
    lastKey = '';
  }

  var TRUNK = [[176, 128, 84], [214, 186, 104], [126, 224, 161], [176, 242, 196]];

  function colorFor(d) {
    return V.gradient(TRUNK, segs.maxDepth ? Math.min(1, d / Math.max(3, segs.maxDepth * 0.75)) : 1);
  }

  function layoutFit(W, H) {
    var b = segs.box, bw = Math.max(b[2] - b[0], 1e-6), bh = Math.max(b[3] - b[1], 1e-6);
    var top = 84, bottom = TAPE_H + 16, side = 16;
    var s = Math.min((W - 2 * side) / bw, (H - top - bottom) / bh);
    return { s: s, ox: W / 2 - (b[0] + b[2]) / 2 * s, oy: H - bottom - b[3] * s };
  }

  // Stroke segments from i0 to i1, one path per bracket depth.
  function strokeRange(ctx, i0, i1) {
    var xy = segs.xy, depth = segs.depth, D = segs.maxDepth, f = fit;
    var base = Math.max(1.6, Math.min(3.2, f.s * 0.5));
    for (var d = 0; d <= D; d++) {
      var any = false;
      ctx.beginPath();
      for (var i = i0; i < i1; i++) {
        if (depth[i] !== d) continue;
        any = true;
        ctx.moveTo(f.ox + xy[i * 4] * f.s, f.oy + xy[i * 4 + 1] * f.s);
        ctx.lineTo(f.ox + xy[i * 4 + 2] * f.s, f.oy + xy[i * 4 + 3] * f.s);
      }
      if (!any) continue;
      ctx.strokeStyle = colorFor(d);
      ctx.lineWidth = Math.max(0.7, base * Math.pow(0.72, d));
      ctx.stroke();
    }
  }

  function frame(dt, st) {
    if (dirty) rebuild();
    var ctx = st.ctx, W = st.width, H = st.height;
    var key = W + 'x' + H;
    var full = key !== lastKey;
    if (full) {
      lastKey = key;
      fit = layoutFit(W, H);
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round';
      strokeRange(ctx, 0, drawn);
    }
    var before = drawn;
    if (growing && drawn < segs.n) {
      drawn = Math.min(segs.n, drawn + Math.max(1, Math.ceil(segs.n * dt / GROW_SECONDS)));
      ctx.lineCap = 'round';
      strokeRange(ctx, before, drawn);
      if (drawn >= segs.n) setGrowing(false);
    }
    if (!full && before === drawn && !st.dirty) return;
    st.dirty = false;
    drawTape(ctx, W, H);
    updateReadout();
  }

  // The string itself, read along a tape while the turtle draws.
  function drawTape(ctx, W, H) {
    var y = H - TAPE_H - 6, cell = 9, n = Math.floor((W - 24) / cell);
    ctx.clearRect(0, y - 4, W, TAPE_H + 10);
    ctx.fillStyle = 'rgba(20,22,33,0.9)';
    ctx.strokeStyle = '#222534';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(10, y, W - 20, TAPE_H, 8); else ctx.rect(10, y, W - 20, TAPE_H);
    ctx.fill();
    ctx.stroke();
    var cur = drawn < segs.n ? segs.at[drawn] : -1;
    var start = cur < 0 ? 0 : Math.max(0, Math.min(cur - (n >> 1), word.length - n));
    var x0 = 12 + (W - 24 - n * cell) / 2;
    ctx.font = '500 12px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < n && start + i < word.length; i++) {
      var ch = word[start + i], cx = x0 + i * cell + cell / 2;
      if (start + i === cur) {
        ctx.fillStyle = '#ffb454';
        ctx.fillRect(cx - cell / 2, y + 4, cell, TAPE_H - 8);
        ctx.fillStyle = '#0a0b10';
      } else {
        ctx.fillStyle = ch === 'F' ? '#ece8df' : ch === 'X' ? '#6f7286' : '#9b9daf';
      }
      ctx.fillText(ch === '-' ? '−' : ch, cx, y + TAPE_H / 2);
    }
  }

  function pretty(s) { return s.replace(/-/g, '−'); }

  function updateReadout() {
    var lines = [];
    for (var k in rules) if (rules[k] !== k) lines.push(k + ' → ' + pretty(rules[k]));
    lines.push('Round ' + round + ': ' + word.length.toLocaleString('en-US') + ' letters, ' +
      segs.n.toLocaleString('en-US') + ' steps');
    V.setText(readout, lines.join('\n'));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function refresh() {
    dirty = true;
    lastKey = '';
    stage.dirty = true;
  }

  function setGrowing(g) {
    growing = g;
    growBtn.textContent = g ? 'Skip to the end' : 'Grow it again';
  }

  function syncRound() {
    var m = maxRound();
    roundInput.max = String(m);
    if (round > m) round = m;
    roundInput.value = String(round);
    roundOut.textContent = String(round);
  }

  function loadPreset(name) {
    preset = name;
    var p = PRESETS[name];
    axiom = p.axiom;
    rules = copyRules(p.rules);
    mutated = false;
    originalBtn.disabled = true;
    round = p.n;
    angle = p.angle;
    angleInput.value = String(angle);
    angleOut.textContent = angle.toFixed(1) + '°';
    syncRound();
    setGrowing(!V.reducedMotion);
    refresh();
  }

  V.segmented(presetGroup, loadPreset);

  roundInput.addEventListener('input', function () {
    round = parseInt(roundInput.value, 10);
    roundOut.textContent = String(round);
    setGrowing(false);
    refresh();
  });

  angleInput.addEventListener('input', function () {
    angle = parseFloat(angleInput.value);
    angleOut.textContent = angle.toFixed(1) + '°';
    setGrowing(false);
    refresh();
  });

  growBtn.addEventListener('click', function () {
    if (growing) {
      setGrowing(false);
      drawn = segs ? segs.n : 0;
      lastKey = '';
    } else {
      setGrowing(true);
      drawn = 0;
      lastKey = '';
    }
    stage.dirty = true;
  });

  // Change the main rule a little: add or drop a branch, flip a turn, or
  // lengthen a stem. Brackets always stay balanced.
  function mutate(rule, main) {
    var r = Math.random(), i, spots = [];
    if (r < 0.35) {
      var branch = '[' + (Math.random() < 0.5 ? '+' : '-') + main + ']';
      i = Math.floor(Math.random() * (rule.length + 1));
      return rule.slice(0, i) + branch + rule.slice(i);
    }
    if (r < 0.6) {
      for (i = 0; i < rule.length; i++) if (rule[i] === '+' || rule[i] === '-') spots.push(i);
      if (spots.length) {
        i = spots[Math.floor(Math.random() * spots.length)];
        return rule.slice(0, i) + (rule[i] === '+' ? '-' : '+') + rule.slice(i + 1);
      }
    }
    if (r < 0.8) {
      // Drop a branch with no branches inside it.
      var re = /\[[^\[\]]*\]/g, m;
      while ((m = re.exec(rule))) spots.push([m.index, m[0].length]);
      if (spots.length > 1) {
        var s = spots[Math.floor(Math.random() * spots.length)];
        return rule.slice(0, s[0]) + rule.slice(s[0] + s[1]);
      }
    }
    for (i = 0; i < rule.length; i++) if (rule[i] === 'F') spots.push(i);
    if (!spots.length) return rule + 'F';
    i = spots[Math.floor(Math.random() * spots.length)];
    return rule.slice(0, i) + 'F' + rule.slice(i);
  }

  V.ctl(section, 'mutate').addEventListener('click', function () {
    var main = rules.X ? 'X' : 'F';
    var before = rules[main], next = before;
    for (var tries = 0; tries < 20; tries++) {
      next = mutate(before, main);
      rules[main] = next;
      if (next !== before && next.length <= 26 && next.indexOf(main) >= 0 && lengthAfter(Math.min(2, round)) < MAX_LETTERS) break;
      rules[main] = before;
      next = before;
    }
    rules[main] = next;
    mutated = true;
    originalBtn.disabled = false;
    V.setSegmented(presetGroup, preset);
    syncRound();
    setGrowing(!V.reducedMotion);
    refresh();
  });

  originalBtn.addEventListener('click', function () { loadPreset(preset); });

  loadPreset('plant');
})();
