// Lyapunov fractal: run the logistic map x → r·x·(1 − x) with r switching
// between a and b in a fixed pattern, and average log|r·(1 − 2x)| along the
// way. Negative means nearby starts close up (order), positive means chaos.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('lyapunov');
  if (!section) return;

  var canvas = section.querySelector('canvas:not(.overlay)');
  var overlay = section.querySelector('canvas.overlay');
  var readout = V.ctl(section, 'readout');
  var patternGroup = V.ctl(section, 'pattern');

  // a runs left to right, b bottom to top. Each view is a region to fit.
  var VIEWS = {
    AB: [2.5, 4, 2.5, 4],
    AABAB: [2.5, 4, 2.5, 4],
    ABBAB: [2.5, 4, 2.5, 4],
    BBBBBBAAAAAA: [3.4, 4, 2.5, 3.4]
  };
  var WARM = 120;

  var VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
  var FRAG = [
    'precision highp float;',
    'uniform vec2 uRes;',
    'uniform vec2 uCenter;',
    'uniform float uScale;',
    'uniform float uMask;',
    'uniform float uLen;',
    'uniform float uCount;',
    'float lyap(vec2 ab) {',
    '  float x = 0.5, m = uMask, pos = 0.0, sum = 0.0;',
    '  for (int i = 0; i < 1400; i++) {',
    '    if (float(i) >= ' + WARM + '.0 + uCount) break;',
    // Pattern letters are the bits of uMask, lowest first (0 = a, 1 = b).
    '    float bit = mod(m, 2.0);',
    '    m = floor(m * 0.5);',
    '    pos += 1.0;',
    '    if (pos >= uLen) { pos = 0.0; m = uMask; }',
    '    float r = bit > 0.5 ? ab.y : ab.x;',
    '    if (float(i) >= ' + WARM + '.0) sum += log(max(abs(r * (1.0 - 2.0 * x)), 1e-7));',
    '    x = r * x * (1.0 - x);',
    '  }',
    '  return sum / uCount;',
    '}',
    'vec3 shade(float l) {',
    '  if (l < 0.0) {',
    '    float t = 1.0 - exp(l * 1.6);',
    '    vec3 c = mix(vec3(0.16, 0.07, 0.03), vec3(1.0, 0.62, 0.24), smoothstep(0.0, 0.7, t));',
    '    return mix(c, vec3(1.0, 0.93, 0.74), smoothstep(0.7, 1.0, t));',
    '  }',
    '  float u = 1.0 - exp(-l * 3.0);',
    '  return mix(vec3(0.05, 0.05, 0.10), vec3(0.20, 0.20, 0.46), u);',
    '}',
    'void main() {',
    '  vec2 ab = uCenter + (gl_FragCoord.xy - 0.5 * uRes) * uScale;',
    '  vec3 col = (ab.x < 0.0 || ab.y < 0.0 || ab.x > 4.0 || ab.y > 4.0) ? vec3(0.04, 0.045, 0.065) : shade(lyap(ab));',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var gl = null, U = {};

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  // Set up WebGL on the first visible frame, so page load stays cheap.
  function init() {
    gl = canvas.getContext('webgl', { antialias: false });
    if (!gl) {
      var msg = document.createElement('p');
      msg.className = 'fallback';
      msg.textContent = 'This one needs WebGL, which your browser has turned off.';
      canvas.parentNode.appendChild(msg);
      return false;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['uRes', 'uCenter', 'uScale', 'uMask', 'uLen', 'uCount'].forEach(function (n) {
      U[n] = gl.getUniformLocation(prog, n);
    });
    return true;
  }

  var pattern = 'AB';
  var view = null;        // center a, b and units per CSS pixel
  var glDirty = true;
  var lastChange = 0;
  var sharp = false;
  var hover = null;       // { a, b } under the pointer
  var probe = null;       // the orbit at the hover point

  function mask(p) {
    var m = 0;
    for (var i = 0; i < p.length; i++) if (p[i] === 'B') m += Math.pow(2, i);
    return m;
  }

  function fit(name, st) {
    var v = VIEWS[name] || VIEWS.AB;
    var scale = Math.max((v[1] - v[0]) / st.width, (v[3] - v[2]) / st.height);
    var a = Math.min((v[0] + v[1]) / 2, 4 - st.width / 2 * scale);
    var b = Math.min((v[2] + v[3]) / 2, 4 - st.height / 2 * scale);
    return { a: a, b: b, scale: scale };
  }

  function changed() {
    glDirty = true;
    sharp = false;
    lastChange = performance.now();
  }

  // The same sum in double precision, keeping the orbit to plot.
  function orbit(a, b) {
    var x = 0.5, sum = 0, xs = [], n = pattern.length;
    for (var i = 0; i < WARM + 1200; i++) {
      var r = pattern[i % n] === 'B' ? b : a;
      if (i >= WARM) {
        sum += Math.log(Math.max(Math.abs(r * (1 - 2 * x)), 1e-12));
        if (xs.length < 96) xs.push(x);
      }
      x = r * x * (1 - x);
    }
    // A cycle shows as the orbit returning to where it was, at a multiple of
    // the pattern length so the same letters line up.
    var period = 0;
    for (var p = n; p <= 64 && !period; p += n) {
      var ok = true;
      for (var k = 0; k < 24 && ok; k++) if (Math.abs(xs[k] - xs[k + p]) > 1e-6) ok = false;
      if (ok) period = p;
    }
    return { lambda: sum / 1200, xs: xs, period: period };
  }

  function frame(dt, st) {
    var W = st.width, H = st.height;
    if (!gl && (gl === false || !init())) { gl = false; return; }
    if (!view) view = fit(pattern, st);
    if (canvas.width !== st.canvas.width || canvas.height !== st.canvas.height) {
      canvas.width = st.canvas.width;
      canvas.height = st.canvas.height;
      changed();
    }
    // Fewer iterations while moving, then one careful pass when it settles.
    var settle = !sharp && performance.now() - lastChange > 200;
    if (glDirty || settle) {
      if (settle) sharp = true;
      glDirty = false;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform2f(U.uCenter, view.a, view.b);
      gl.uniform1f(U.uScale, view.scale / st.dpr);
      gl.uniform1f(U.uMask, mask(pattern));
      gl.uniform1f(U.uLen, pattern.length);
      gl.uniform1f(U.uCount, sharp ? 600 : 160);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;

    var ctx = st.ctx;
    ctx.clearRect(0, 0, W, H);
    drawAxes(ctx, W, H);

    var lines = [patternText()];
    if (hover) {
      var p = toScreen(hover.a, hover.b, W, H);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 6, 0, Math.PI * 2);
      ctx.stroke();
      drawOrbit(ctx, W, H);
      lines.push('a = ' + hover.a.toFixed(3) + '   b = ' + hover.b.toFixed(3));
      var l = probe.lambda;
      lines.push('λ = ' + (l < 0 ? '−' : '') + Math.abs(l).toFixed(3) + (l < 0
        ? (probe.period ? ': settles into a ' + probe.period + '-cycle' : ': order')
        : ': chaos'));
    } else {
      lines.push('Hover or tap to watch x');
    }
    V.setText(readout, lines.join('\n'));
  }

  function patternText() {
    var s = 'r: ' + pattern;
    while (s.length + pattern.length < 32) s += ' ' + pattern;
    return s + ' …';
  }

  function toScreen(a, b, W, H) {
    return [W / 2 + (a - view.a) / view.scale, H / 2 - (b - view.b) / view.scale];
  }

  function niceStep(span) {
    var s = Math.pow(10, Math.floor(Math.log(span / 4) / Math.LN10));
    if (span / s > 20) s *= 5; else if (span / s > 8) s *= 2;
    return s;
  }

  // Tick labels along the bottom (a) and the right side (b).
  function drawAxes(ctx, W, H) {
    var a0 = view.a - W / 2 * view.scale, a1 = view.a + W / 2 * view.scale;
    var b0 = view.b - H / 2 * view.scale, b1 = view.b + H / 2 * view.scale;
    var step = niceStep(a1 - a0), dec = Math.max(0, -Math.floor(Math.log(step) / Math.LN10 + 1e-9));
    // Soft shade behind the labels along the bottom and right edges.
    var g = ctx.createLinearGradient(0, H - 30, 0, H);
    g.addColorStop(0, 'rgba(10,11,16,0)');
    g.addColorStop(1, 'rgba(10,11,16,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H - 30, W, 30);
    g = ctx.createLinearGradient(W - 46, 0, W, 0);
    g.addColorStop(0, 'rgba(10,11,16,0)');
    g.addColorStop(1, 'rgba(10,11,16,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(W - 46, 0, 46, H);
    ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(236,232,223,0.75)';
    ctx.strokeStyle = 'rgba(236,232,223,0.45)';
    ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    var v, p;
    for (v = Math.ceil(a0 / step) * step; v <= a1; v += step) {
      p = toScreen(v, 0, W, H)[0];
      if (p < 24 || p > W - 40) continue;
      ctx.beginPath(); ctx.moveTo(p, H); ctx.lineTo(p, H - 5); ctx.stroke();
      label(ctx, v.toFixed(dec), p, H - 7);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (v = Math.ceil(b0 / step) * step; v <= b1; v += step) {
      p = toScreen(0, v, W, H)[1];
      if (p < 60 || p > H - 24) continue;
      ctx.beginPath(); ctx.moveTo(W, p); ctx.lineTo(W - 5, p); ctx.stroke();
      label(ctx, v.toFixed(dec), W - 8, p);
    }
    ctx.fillStyle = '#ece8df';
    ctx.font = 'italic 500 13px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    label(ctx, 'a →', W - 8, H - 7);
    ctx.textBaseline = 'top';
    label(ctx, 'b ↑', W - 8, 10);
  }

  // Text with a dark rim, readable on gold and on blue.
  function label(ctx, text, x, y) {
    ctx.save();
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(10,11,16,0.75)';
    ctx.strokeText(text, x, y);
    ctx.restore();
    ctx.fillText(text, x, y);
  }

  // A strip chart of x over the orbit, in the lower left corner.
  function drawOrbit(ctx, W, H) {
    var w = Math.min(220, W * 0.42), h = 74, x0 = 12, y0 = H - h - 30;
    ctx.fillStyle = 'rgba(10,11,16,0.8)';
    ctx.strokeStyle = 'rgba(52,58,78,1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, 8); else ctx.rect(x0, y0, w, h);
    ctx.fill();
    ctx.stroke();
    var xs = probe.xs, n = Math.min(xs.length, 64);
    var px = function (k) { return x0 + 10 + (w - 20) * k / (n - 1); };
    var py = function (x) { return y0 + h - 18 - (h - 28) * x; };
    ctx.strokeStyle = 'rgba(167,139,250,0.45)';
    ctx.beginPath();
    for (var k = 0; k < n; k++) { if (k) ctx.lineTo(px(k), py(xs[k])); else ctx.moveTo(px(k), py(xs[k])); }
    ctx.stroke();
    ctx.fillStyle = '#ece8df';
    for (k = 0; k < n; k++) {
      ctx.beginPath();
      ctx.arc(px(k), py(xs[k]), 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(155,157,175,1)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('x, step by step', x0 + 10, y0 + h - 3);
  }

  var stage = V.createStage(overlay, { frame: frame });

  // ---- Pointer: drag to pan, wheel or pinch to zoom, hover or tap to probe ----

  function setHover(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    var a = view.a + (clientX - r.left - r.width / 2) * view.scale;
    var b = view.b - (clientY - r.top - r.height / 2) * view.scale;
    if (a < 0 || b < 0 || a > 4 || b > 4) { hover = null; stage.dirty = true; return; }
    hover = { a: a, b: b };
    probe = orbit(a, b);
    stage.dirty = true;
  }

  function clampView() {
    view.scale = Math.max(2e-6, Math.min(5 / stage.height, view.scale));
    view.a = Math.max(0, Math.min(4, view.a));
    view.b = Math.max(0, Math.min(4, view.b));
  }

  function zoomAt(clientX, clientY, f, base) {
    var r = canvas.getBoundingClientRect();
    var ox = clientX - r.left - r.width / 2, oy = clientY - r.top - r.height / 2;
    var a = base.a + ox * base.scale, b = base.b - oy * base.scale;
    view.scale = base.scale * f;
    clampView();
    view.a = a - ox * view.scale;
    view.b = b + oy * view.scale;
    clampView();
    changed();
  }

  var pointers = new Map();
  var pinch = null, press = null;

  canvas.addEventListener('pointerdown', function (e) {
    if (!view) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.classList.add('is-grabbing');
    press = pointers.size === 1 ? { x: e.clientX, y: e.clientY, moved: false } : null;
    if (pointers.size === 2) {
      var p = Array.from(pointers.values());
      pinch = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), base: { a: view.a, b: view.b, scale: view.scale } };
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!view) return;
    var prev = pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse') setHover(e.clientX, e.clientY);
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      var p = Array.from(pointers.values());
      var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      zoomAt((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2, pinch.d / Math.max(d, 1), pinch.base);
    } else if (pointers.size === 1) {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 4) press.moved = true;
      if (!press || press.moved) {
        view.a -= (e.clientX - prev.x) * view.scale;
        view.b += (e.clientY - prev.y) * view.scale;
        clampView();
        changed();
        hover = null;
        stage.dirty = true;
      }
    }
  });

  function release(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) {
      canvas.classList.remove('is-grabbing');
      if (press && !press.moved) setHover(e.clientX, e.clientY);
      press = null;
    }
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse' && !pointers.size) { hover = null; stage.dirty = true; }
  });

  canvas.addEventListener('wheel', function (e) {
    if (!view) return;
    e.preventDefault();
    var delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(e.clientX, e.clientY, Math.exp(delta * 0.0018), { a: view.a, b: view.b, scale: view.scale });
  }, { passive: false });

  // ---- Controls ----

  function setPattern(p) {
    pattern = p;
    if (stage.height) view = fit(VIEWS[p] ? p : 'AB', stage);
    hover = null;
    changed();
    stage.dirty = true;
  }

  V.segmented(patternGroup, setPattern);

  V.ctl(section, 'random').addEventListener('click', function () {
    var p = '';
    var n = 3 + Math.floor(Math.random() * 6);
    while (p.indexOf('A') < 0 || p.indexOf('B') < 0) {
      p = '';
      for (var i = 0; i < n; i++) p += Math.random() < 0.5 ? 'A' : 'B';
    }
    V.setSegmented(patternGroup, '');
    setPattern(p);
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    if (stage.height) view = fit(VIEWS[pattern] ? pattern : 'AB', stage);
    hover = null;
    stage.dirty = true;
    changed();
  });
})();
