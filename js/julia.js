// Julia sets of z → z² + c in a WebGL fragment shader. Here c is fixed and
// every pixel is a starting z. A small Mandelbrot set in the corner is the
// map of all c: inside it the Julia set is one piece, outside it is dust.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('julia');
  if (!section) return;

  var canvas = section.querySelector('canvas:not(.overlay)');
  var overlay = section.querySelector('canvas.overlay');
  var readout = V.ctl(section, 'readout');
  var presetGroup = V.ctl(section, 'preset');
  var wanderBtn = V.ctl(section, 'wander');

  var PRESETS = {
    rabbit: [-0.123, 0.745],
    dendrite: [0, 1],
    sanmarco: [-0.75, 0],
    siegel: [-0.390541, -0.586788],
    dust: [-0.75, 0.2]
  };
  // The inset map shows c from −2.25 to 0.75 across.
  var MAP = { x: -0.75, y: 0, w: 3 };
  var ITER = 300;

  var VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
  var FRAG = [
    'precision highp float;',
    'uniform vec2 uRes;',
    'uniform vec2 uCenter;',
    'uniform float uScale;',
    'uniform vec2 uC;',
    'uniform float uAA;',
    'uniform vec4 uInset;',
    'uniform vec3 uMap;',
    'vec2 sq(vec2 z) { return vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y); }',
    'vec2 mul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }',
    'vec3 grad(float t) {',
    '  t = fract(t) * 5.0;',
    '  vec3 c0 = vec3(0.04, 0.05, 0.12);',
    '  vec3 c1 = vec3(0.43, 0.91, 1.00);',
    '  vec3 c2 = vec3(0.49, 0.55, 1.00);',
    '  vec3 c3 = vec3(0.77, 0.42, 1.00);',
    '  vec3 c4 = vec3(1.00, 0.37, 0.64);',
    '  if (t < 1.0) return mix(c0, c1, t);',
    '  if (t < 2.0) return mix(c1, c2, t - 1.0);',
    '  if (t < 3.0) return mix(c2, c3, t - 2.0);',
    '  if (t < 4.0) return mix(c3, c4, t - 3.0);',
    '  return mix(c4, c0, t - 4.0);',
    '}',
    // Escape-time color, dimmed by the distance to the set so its edge glows.
    'vec3 julia(vec2 z) {',
    '  vec2 dz = vec2(1.0, 0.0);',
    '  float n = 0.0;',
    '  for (int i = 0; i < ' + ITER + '; i++) {',
    '    dz = 2.0 * mul(z, dz);',
    '    z = sq(z) + uC;',
    '    if (dot(z, z) > 256.0) break;',
    '    n += 1.0;',
    '  }',
    '  if (n >= ' + ITER + '.0) return vec3(0.07, 0.08, 0.13);',
    '  float r2 = dot(z, z);',
    '  float sn = n + 1.0 - log2(log2(r2) * 0.5);',
    '  float dist = 0.25 * sqrt(r2) * log(r2) / length(dz);',
    '  float glow = clamp(1.0 - log2(1.0 + dist / uScale) / 7.0, 0.0, 1.0);',
    '  vec3 col = grad(sqrt(max(sn, 1.0)) * 0.11 + 0.18);',
    '  return col * (0.04 + 0.96 * glow * glow);',
    '}',
    'vec3 mandel(vec2 c) {',
    '  vec2 z = vec2(0.0), dz = vec2(0.0);',
    '  float n = 0.0;',
    '  for (int i = 0; i < 160; i++) {',
    '    dz = 2.0 * mul(z, dz) + vec2(1.0, 0.0);',
    '    z = sq(z) + c;',
    '    if (dot(z, z) > 256.0) break;',
    '    n += 1.0;',
    '  }',
    '  if (n >= 160.0) return vec3(0.62, 0.64, 0.70);',
    '  float r2 = dot(z, z);',
    '  float dist = 0.25 * sqrt(r2) * log(r2) / length(dz);',
    '  float glow = clamp(1.0 - log2(1.0 + dist / uMap.z) / 6.0, 0.0, 1.0);',
    '  return mix(vec3(0.05, 0.06, 0.09), vec3(0.43, 0.91, 1.0), glow * glow * 0.55);',
    '}',
    'void main() {',
    '  vec2 f = gl_FragCoord.xy;',
    '  if (f.x > uInset.x && f.x < uInset.x + uInset.z && f.y > uInset.y && f.y < uInset.y + uInset.w) {',
    '    gl_FragColor = vec4(mandel(uMap.xy + (f - uInset.xy - 0.5 * uInset.zw) * uMap.z), 1.0);',
    '    return;',
    '  }',
    '  vec2 z = uCenter + (f - 0.5 * uRes) * uScale;',
    '  vec3 col = julia(z);',
    '  if (uAA > 0.5) {',
    '    col += julia(z + vec2(0.5, 0.0) * uScale);',
    '    col += julia(z + vec2(0.0, 0.5) * uScale);',
    '    col += julia(z + vec2(0.5, 0.5) * uScale);',
    '    col *= 0.25;',
    '  }',
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
    ['uRes', 'uCenter', 'uScale', 'uC', 'uAA', 'uInset', 'uMap'].forEach(function (n) {
      U[n] = gl.getUniformLocation(prog, n);
    });
    return true;
  }

  var c = PRESETS.rabbit.slice();
  var inSet = true;
  var wander = false, theta = 0;
  var hover = null;
  var glDirty = true, sharp = false, lastChange = 0;
  var view = { x: 0, y: 0, scale: 0 };   // Julia plane, units per CSS pixel
  var inset = { x: 0, y: 0, w: 0, h: 0 };

  function layout(st) {
    var W = st.width, H = st.height;
    var w = Math.round(Math.max(112, Math.min(200, W * 0.3))), h = Math.round(w * 0.8);
    inset = { x: W - w - 10, y: H - h - 10, w: w, h: h };
    view.scale = 3.25 / Math.min(W, H);
    view.x = W > H * 1.15 ? 0.22 : 0;
  }

  function changed() {
    glDirty = true;
    sharp = false;
    lastChange = performance.now();
  }

  function setC(x, y) {
    c[0] = x;
    c[1] = y;
    var zx = 0, zy = 0, n = 0;
    for (; n < 2000 && zx * zx + zy * zy <= 4; n++) {
      var t = zx * zx - zy * zy + x;
      zy = 2 * zx * zy + y;
      zx = t;
    }
    inSet = n >= 2000;
    changed();
  }

  function frame(dt, st) {
    if (!gl && (gl === false || !init())) { gl = false; return; }
    if (canvas.width !== st.canvas.width || canvas.height !== st.canvas.height) {
      canvas.width = st.canvas.width;
      canvas.height = st.canvas.height;
      changed();
    }
    if (!view.scale) layout(st);
    if (wander) {
      // Walk c around the edge of the main cardioid, a little inside and
      // a little outside, so the Julia set keeps joining up and shattering.
      theta += dt * 0.16;
      var rho = 1 + 0.05 * Math.sin(theta * 3.3);
      setC(0.5 * rho * Math.cos(theta) - 0.25 * rho * rho * Math.cos(2 * theta),
        0.5 * rho * Math.sin(theta) - 0.25 * rho * rho * Math.sin(2 * theta));
      st.dirty = true;
    }
    var settle = !sharp && performance.now() - lastChange > 180;
    if (glDirty || settle) {
      if (settle) sharp = true;
      glDirty = false;
      var d = st.dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform2f(U.uCenter, view.x, view.y);
      gl.uniform1f(U.uScale, view.scale / d);
      gl.uniform2f(U.uC, c[0], c[1]);
      gl.uniform1f(U.uAA, sharp ? 1 : 0);
      gl.uniform4f(U.uInset, inset.x * d, (st.height - inset.y - inset.h) * d, inset.w * d, inset.h * d);
      gl.uniform3f(U.uMap, MAP.x, MAP.y, MAP.w / (inset.w * d));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    drawOverlay(st);
  }

  function fmtC(x, y) {
    return (x < 0 ? '−' : '') + Math.abs(x).toFixed(4) + (y < 0 ? ' − ' : ' + ') + Math.abs(y).toFixed(4) + 'i';
  }

  function mapToScreen(x, y) {
    var s = MAP.w / inset.w;
    return [inset.x + inset.w / 2 + (x - MAP.x) / s, inset.y + inset.h / 2 - (y - MAP.y) / s];
  }

  function drawOverlay(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    ctx.clearRect(0, 0, W, H);

    // The inset frame and the marker for c.
    ctx.strokeStyle = 'rgba(236,232,223,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(inset.x - 0.5, inset.y - 0.5, inset.w + 1, inset.h + 1, 6);
    else ctx.rect(inset.x - 0.5, inset.y - 0.5, inset.w + 1, inset.h + 1);
    ctx.stroke();
    ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(236,232,223,0.6)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('choose c', inset.x + 7, inset.y + 6);
    var m = mapToScreen(c[0], c[1]);
    ctx.save();
    ctx.beginPath();
    ctx.rect(inset.x, inset.y, inset.w, inset.h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(110,231,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(inset.x, m[1]); ctx.lineTo(inset.x + inset.w, m[1]);
    ctx.moveTo(m[0], inset.y); ctx.lineTo(m[0], inset.y + inset.h);
    ctx.stroke();
    ctx.fillStyle = '#6ee7ff';
    ctx.strokeStyle = '#0a0b10';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(m[0], m[1], 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
    ctx.restore();

    var lines = ['c = ' + fmtC(c[0], c[1]),
      inSet ? 'In the Mandelbrot set: one piece' : 'Outside the Mandelbrot set: dust'];

    // The orbit of one starting point.
    if (hover) {
      var zx = hover[0], zy = hover[1], path = [[zx, zy]], n = 0;
      for (; n < 200 && zx * zx + zy * zy <= 16; n++) {
        var t = zx * zx - zy * zy + c[0];
        zy = 2 * zx * zy + c[1];
        zx = t;
        if (path.length < 80) path.push([zx, zy]);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      path.forEach(function (z, i) {
        var p = toScreen(z, W, H);
        if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
      });
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      path.forEach(function (z, i) {
        var p = toScreen(z, W, H);
        ctx.beginPath();
        ctx.arc(p[0], p[1], i ? 2 : 4, 0, Math.PI * 2);
        ctx.fill();
      });
      lines.push(n < 200 ? 'This point escapes after ' + n + (n === 1 ? ' step' : ' steps') : 'This point never escapes');
    } else {
      lines.push('Hover or tap to follow a point');
    }
    V.setText(readout, lines.join('\n'));
  }

  function toScreen(z, W, H) {
    return [W / 2 + (z[0] - view.x) / view.scale, H / 2 - (z[1] - view.y) / view.scale];
  }

  var stage = V.createStage(overlay, {
    frame: frame,
    resize: function (st) { layout(st); changed(); }
  });

  // ---- Pointer: drag on the map to choose c, hover or tap to follow a point ----

  function inInset(x, y) {
    return x >= inset.x && x <= inset.x + inset.w && y >= inset.y && y <= inset.y + inset.h;
  }

  V.drag(canvas, {
    cursor: 'crosshair',
    hit: function (x, y) { return inInset(x, y) ? 'map' : null; },
    move: function (h, x, y) {
      x = Math.max(inset.x, Math.min(inset.x + inset.w, x));
      y = Math.max(inset.y, Math.min(inset.y + inset.h, y));
      var s = MAP.w / inset.w;
      setWander(false);
      V.setSegmented(presetGroup, '');
      setC(MAP.x + (x - inset.x - inset.w / 2) * s, MAP.y - (y - inset.y - inset.h / 2) * s);
      hover = null;
      stage.dirty = true;
    }
  });

  function onPoint(e) {
    var b = canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    if (inInset(x, y)) return;
    hover = [view.x + (x - b.width / 2) * view.scale, view.y - (y - b.height / 2) * view.scale];
    stage.dirty = true;
  }
  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'mouse' && !canvas.classList.contains('is-grabbing')) onPoint(e);
  });
  canvas.addEventListener('pointerdown', function (e) {
    if (!canvas.classList.contains('is-grabbing')) onPoint(e);
  });
  canvas.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse') { hover = null; stage.dirty = true; }
  });

  // ---- Controls ----

  V.segmented(presetGroup, function (name) {
    setWander(false);
    setC(PRESETS[name][0], PRESETS[name][1]);
    stage.dirty = true;
  });

  function setWander(on) {
    if (on && !wander) {
      // Start the walk from the cardioid point nearest the current c.
      var best = 0, bd = Infinity;
      for (var k = 0; k < 360; k++) {
        var a = k * Math.PI / 180;
        var d = Math.hypot(0.5 * Math.cos(a) - 0.25 * Math.cos(2 * a) - c[0], 0.5 * Math.sin(a) - 0.25 * Math.sin(2 * a) - c[1]);
        if (d < bd) { bd = d; best = a; }
      }
      theta = best;
      V.setSegmented(presetGroup, '');
    }
    wander = on;
    wanderBtn.setAttribute('aria-pressed', String(on));
  }
  V.toggle(wanderBtn, setWander);

  setC(c[0], c[1]);
})();
