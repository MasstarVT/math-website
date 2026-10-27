// Mandelbrot set in a WebGL fragment shader. Every pixel is a point c; we
// iterate z -> z² + c and color by a smoothed escape count. 32-bit floats
// limit how far in we can go, so zoom is capped before pixels turn blocky.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('mandelbrot');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var presetGroup = V.ctl(section, 'preset');

  // r is the radius, in complex units, that must fit in the shorter side.
  var PRESETS = {
    whole: { x: -0.65, y: 0, r: 1.45 },
    seahorse: { x: -0.7453, y: 0.1127, r: 0.0115 },
    mini: { x: -1.7549, y: 0, r: 0.032 },
    spiral: { x: -0.743643887, y: 0.131825904, r: 0.0013 },
    elephant: { x: 0.2855, y: 0.0115, r: 0.0105 }
  };
  // Smallest complex distance per CSS pixel before float precision shows.
  var MIN_SCALE = 8e-7;
  var MAX_SCALE = 0.02;

  var gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true });
  if (!gl) {
    var msg = document.createElement('p');
    msg.className = 'fallback';
    msg.textContent = 'This one needs WebGL, which your browser has turned off.';
    canvas.parentNode.appendChild(msg);
    return;
  }

  var VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
  var FRAG = [
    'precision highp float;',
    'uniform vec2 uRes;',
    'uniform vec2 uCenter;',
    'uniform float uScale;',
    'uniform float uIter;',
    'uniform float uAA;',
    'vec3 grad(float t) {',
    '  t = fract(t) * 6.0;',
    '  vec3 c0 = vec3(0.04, 0.05, 0.12);',
    '  vec3 c1 = vec3(0.43, 0.91, 1.00);',
    '  vec3 c2 = vec3(0.49, 0.55, 1.00);',
    '  vec3 c3 = vec3(0.77, 0.42, 1.00);',
    '  vec3 c4 = vec3(1.00, 0.37, 0.64);',
    '  vec3 c5 = vec3(1.00, 0.82, 0.40);',
    '  if (t < 1.0) return mix(c0, c1, t);',
    '  if (t < 2.0) return mix(c1, c2, t - 1.0);',
    '  if (t < 3.0) return mix(c2, c3, t - 2.0);',
    '  if (t < 4.0) return mix(c3, c4, t - 3.0);',
    '  if (t < 5.0) return mix(c4, c5, t - 4.0);',
    '  return mix(c5, c0, t - 5.0);',
    '}',
    'vec3 shade(vec2 frag) {',
    '  vec2 c = uCenter + (frag - 0.5 * uRes) * uScale;',
    '  vec2 z = vec2(0.0);',
    '  vec2 dz = vec2(0.0);',
    '  float n = 0.0;',
    '  for (int i = 0; i < 4000; i++) {',
    '    if (n >= uIter) break;',
    '    dz = 2.0 * vec2(z.x * dz.x - z.y * dz.y, z.x * dz.y + z.y * dz.x) + vec2(1.0, 0.0);',
    '    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;',
    '    if (dot(z, z) > 256.0) break;',
    '    n += 1.0;',
    '  }',
    '  if (n >= uIter) return vec3(0.039, 0.043, 0.063);',
    '  float r2 = dot(z, z);',
    '  float sn = n + 1.0 - log2(log2(r2) * 0.5);',
    // Distance estimate to the set, in pixels: points near the edge glow,
    // points far from it fade toward the background.
    '  float dist = 0.25 * sqrt(r2) * log(r2) / length(dz);',
    '  float glow = clamp(1.0 - log2(1.0 + dist / uScale) / 6.5, 0.0, 1.0);',
    '  vec3 col = grad((sqrt(max(sn, 1.0)) - 1.0) * 0.12 + 0.12);',
    '  return col * (0.06 + 0.94 * glow * glow);',
    '}',
    'void main() {',
    '  vec3 col = shade(gl_FragCoord.xy);',
    '  if (uAA > 0.5) {',
    '    col += shade(gl_FragCoord.xy + vec2(0.5, 0.0));',
    '    col += shade(gl_FragCoord.xy + vec2(0.0, 0.5));',
    '    col += shade(gl_FragCoord.xy + vec2(0.5, 0.5));',
    '    col *= 0.25;',
    '  }',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
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

  var U = {};
  ['uRes', 'uCenter', 'uScale', 'uIter', 'uAA'].forEach(function (n) {
    U[n] = gl.getUniformLocation(prog, n);
  });

  // view.scale is complex units per CSS pixel.
  var view = null;
  var target = null;
  var iterations = 400;
  var lastChange = 0;
  var sharp = false;

  function presetView(name, st) {
    var p = PRESETS[name];
    return { x: p.x, y: p.y, scale: p.r / (Math.min(st.width, st.height) / 2) };
  }

  function clampScale(s) {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
  }

  function changed() {
    lastChange = performance.now();
    sharp = false;
    stage.dirty = true;
  }

  function frame(dt, st) {
    if (!view) {
      view = presetView('whole', st);
      target = { x: view.x, y: view.y, scale: view.scale };
    }

    var k = 1 - Math.exp(-dt * 4);
    var far = Math.abs(Math.log(target.scale / view.scale)) > 0.002 ||
      Math.abs(target.x - view.x) / view.scale > 0.2 ||
      Math.abs(target.y - view.y) / view.scale > 0.2;
    if (far) {
      view.scale *= Math.pow(target.scale / view.scale, k);
      view.x += (target.x - view.x) * k;
      view.y += (target.y - view.y) * k;
      changed();
    } else if (view.scale !== target.scale || view.x !== target.x || view.y !== target.y) {
      view.scale = target.scale;
      view.x = target.x;
      view.y = target.y;
      changed();
    }

    // Draw fast while moving, then once more with 4× supersampling.
    var settle = !sharp && performance.now() - lastChange > 180;
    if (!st.dirty && !settle) return;
    st.dirty = false;
    if (settle) sharp = true;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform2f(U.uCenter, view.x, view.y);
    gl.uniform1f(U.uScale, view.scale / st.dpr);
    gl.uniform1f(U.uIter, iterations);
    gl.uniform1f(U.uAA, sharp ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    var zoom = presetView('whole', st).scale / view.scale;
    V.setText(readout,
      'Zoom ' + (zoom < 10 ? zoom.toFixed(1) : Math.round(zoom).toLocaleString()) + '×   c = ' +
      view.x.toFixed(6) + (view.y < 0 ? ' − ' : ' + ') + Math.abs(view.y).toFixed(6) + 'i');
  }

  var stage = V.createStage(canvas, {
    context: 'none',
    frame: frame,
    resize: function () { sharp = false; }
  });

  // ---- Interaction: drag to pan, wheel or pinch to zoom, double-click to dive ----

  // Zoom by factor f keeping the complex point under (clientX, clientY) fixed.
  function zoomAt(clientX, clientY, f, base) {
    base = base || view;
    var rect = canvas.getBoundingClientRect();
    var ox = clientX - rect.left - rect.width / 2;
    var oy = clientY - rect.top - rect.height / 2;
    var px = base.x + ox * base.scale;
    var py = base.y - oy * base.scale;
    var s = clampScale(base.scale * f);
    return { x: px - ox * s, y: py + oy * s, scale: s };
  }

  function clearPreset() {
    V.setSegmented(presetGroup, '');
  }

  var pointers = new Map();
  var pinch = null;

  canvas.addEventListener('pointerdown', function (e) {
    if (!view) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.classList.add('is-grabbing');
    target = { x: view.x, y: view.y, scale: view.scale };
    if (pointers.size === 2) {
      var p = Array.from(pointers.values());
      pinch = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), base: { x: view.x, y: view.y, scale: view.scale } };
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    var prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      var p = Array.from(pointers.values());
      var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      var next = zoomAt((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2, pinch.d / Math.max(d, 1), pinch.base);
      view = next;
      target = { x: next.x, y: next.y, scale: next.scale };
    } else if (pointers.size === 1) {
      view.x -= (e.clientX - prev.x) * view.scale;
      view.y += (e.clientY - prev.y) * view.scale;
      target = { x: view.x, y: view.y, scale: view.scale };
    }
    clearPreset();
    changed();
  });

  function release(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) canvas.classList.remove('is-grabbing');
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  canvas.addEventListener('wheel', function (e) {
    if (!view) return;
    e.preventDefault();
    var delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    target = zoomAt(e.clientX, e.clientY, Math.exp(delta * 0.0018), target);
    clearPreset();
  }, { passive: false });

  canvas.addEventListener('dblclick', function (e) {
    if (!view) return;
    target = zoomAt(e.clientX, e.clientY, e.shiftKey ? 3 : 1 / 3, target);
    clearPreset();
  });

  // ---- Controls ----

  V.segmented(presetGroup, function (name) {
    target = presetView(name, stage);
  });

  V.ctl(section, 'zoom-in').addEventListener('click', function () {
    if (view) target = { x: target.x, y: target.y, scale: clampScale(target.scale / 2.5) };
    clearPreset();
  });

  V.ctl(section, 'zoom-out').addEventListener('click', function () {
    if (view) target = { x: target.x, y: target.y, scale: clampScale(target.scale * 2.5) };
    clearPreset();
  });

  V.range(V.ctl(section, 'iter'), V.ctl(section, 'iter-out'),
    function (v) { return String(v); },
    function (v) { iterations = v; changed(); });

})();
