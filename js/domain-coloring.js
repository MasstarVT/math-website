// Domain coloring in a WebGL fragment shader: each point z is painted by the
// value f(z). The hue is the angle of f(z) and the brightness steps every time
// |f(z)| doubles, so zeros (dark) and poles (pale) show as points ringed by every color.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('domain-coloring');
  if (!section) return;

  var canvas = section.querySelector('canvas:not(.overlay)');
  var overlay = section.querySelector('canvas.overlay');
  var readout = V.ctl(section, 'readout');
  var fnGroup = V.ctl(section, 'fn');
  var linesBtn = V.ctl(section, 'lines');

  // Name, view radius, and its zeros and poles to mark.
  var FNS = {
    square: { id: 0, name: 'f(z) = z²', r: 2, zeros: [[0, 0]], poles: [] },
    inverse: { id: 1, name: 'f(z) = 1/z', r: 2, zeros: [], poles: [[0, 0]] },
    rational: { id: 2, name: 'f(z) = (z² − 1)/(z² + 1)', r: 2, zeros: [[1, 0], [-1, 0]], poles: [[0, 1], [0, -1]] },
    exp: { id: 3, name: 'f(z) = e^z', r: 3.6, zeros: [], poles: [] },
    sin: { id: 4, name: 'f(z) = sin z', r: 3.6, zeros: [[0, 0], [Math.PI, 0], [-Math.PI, 0], [2 * Math.PI, 0], [-2 * Math.PI, 0]], poles: [] },
    own: { id: 5, name: 'f(z) = (z − a)(z − b)/(z − p)', r: 2.2, zeros: [], poles: [] }
  };
  // The color wheel, matching the shader: 0° yellow, then orange, pink, violet, blue, cyan, green.
  var WHEEL = [[255, 209, 102], [255, 138, 92], [255, 95, 162], [196, 107, 255], [124, 140, 255], [110, 231, 255], [126, 224, 161]];

  var VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
  var FRAG = [
    'precision highp float;',
    'uniform vec2 uRes;',
    'uniform float uScale;',
    'uniform float uFn;',
    'uniform float uLines;',
    'uniform vec2 uA;',
    'uniform vec2 uB;',
    'uniform vec2 uP;',
    'vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }',
    'vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / max(dot(b, b), 1e-30); }',
    'vec2 f(vec2 z) {',
    '  if (uFn < 0.5) return cmul(z, z);',
    '  if (uFn < 1.5) return cdiv(vec2(1.0, 0.0), z);',
    '  if (uFn < 2.5) { vec2 q = cmul(z, z); return cdiv(q - vec2(1.0, 0.0), q + vec2(1.0, 0.0)); }',
    '  if (uFn < 3.5) return exp(z.x) * vec2(cos(z.y), sin(z.y));',
    // sin(x + iy) = sin x cosh y + i cos x sinh y, with cosh and sinh from exp.
    '  if (uFn < 4.5) { float e = exp(z.y), g = exp(-z.y); return vec2(sin(z.x) * (e + g), cos(z.x) * (e - g)) * 0.5; }',
    '  return cdiv(cmul(z - uA, z - uB), z - uP);',
    '}',
    'vec3 wheel(float t) {',
    '  t = fract(t) * 7.0;',
    '  vec3 c0 = vec3(1.00, 0.82, 0.40);',
    '  vec3 c1 = vec3(1.00, 0.54, 0.36);',
    '  vec3 c2 = vec3(1.00, 0.37, 0.64);',
    '  vec3 c3 = vec3(0.77, 0.42, 1.00);',
    '  vec3 c4 = vec3(0.49, 0.55, 1.00);',
    '  vec3 c5 = vec3(0.43, 0.91, 1.00);',
    '  vec3 c6 = vec3(0.49, 0.88, 0.63);',
    '  if (t < 1.0) return mix(c0, c1, t);',
    '  if (t < 2.0) return mix(c1, c2, t - 1.0);',
    '  if (t < 3.0) return mix(c2, c3, t - 2.0);',
    '  if (t < 4.0) return mix(c3, c4, t - 3.0);',
    '  if (t < 5.0) return mix(c4, c5, t - 4.0);',
    '  if (t < 6.0) return mix(c5, c6, t - 5.0);',
    '  return mix(c6, c0, t - 6.0);',
    '}',
    'void main() {',
    '  vec2 z = (gl_FragCoord.xy - 0.5 * uRes) * uScale;',
    '  vec2 w = f(z);',
    '  float r = length(w);',
    '  float a = atan(w.y, w.x) / 6.2831853;',
    '  vec3 col = wheel(a);',
    '  if (uLines > 0.5) {',
    // A step in brightness each time |f| doubles, and a fainter one every 30°.
    // Offset by half a step so the plain values |f| = 1 and f > 0 sit mid-band.
    '    float band = fract(log2(max(r, 1e-30)) + 0.5);',
    '    float sector = fract(a * 12.0 + 0.5);',
    '    col *= (0.64 + 0.36 * band) * (0.9 + 0.1 * sector);',
    '  }',
    '  float k = atan(r) / 1.5707963;',
    '  col *= 0.2 + 0.8 * smoothstep(0.0, 0.42, k);',
    '  col = mix(col, vec3(0.97, 0.95, 0.91), 0.7 * smoothstep(0.64, 1.0, k));',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var gl = null, failed = false, U = {};
  var fn = FNS.rational;
  var showLines = true;
  var handles = { a: [-1.1, -0.4], b: [1, 0.5], p: [-0.2, 0.9] };
  var hover = null;
  var scale = 0;     // complex units per CSS pixel
  var glDirty = true;
  var stage;

  // Compile lazily on first view, so page load stays cheap.
  function init() {
    gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) {
      failed = true;
      var msg = document.createElement('p');
      msg.className = 'fallback';
      msg.textContent = 'This one needs WebGL, which your browser has turned off.';
      canvas.parentNode.appendChild(msg);
      return;
    }
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
    ['uRes', 'uScale', 'uFn', 'uLines', 'uA', 'uB', 'uP'].forEach(function (n) {
      U[n] = gl.getUniformLocation(prog, n);
    });
  }

  // The same functions in JavaScript, for the readout.
  function cmul(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
  function cdiv(a, b) {
    var d = b[0] * b[0] + b[1] * b[1];
    if (d < 1e-300) return [Infinity, 0];
    return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function evalF(z) {
    switch (fn.id) {
      case 0: return cmul(z, z);
      case 1: return cdiv([1, 0], z);
      case 2: var q = cmul(z, z); return cdiv([q[0] - 1, q[1]], [q[0] + 1, q[1]]);
      case 3: var e = Math.exp(z[0]); return [e * Math.cos(z[1]), e * Math.sin(z[1])];
      case 4: return [Math.sin(z[0]) * Math.cosh(z[1]), Math.cos(z[0]) * Math.sinh(z[1])];
      default: return cdiv(cmul(sub(z, handles.a), sub(z, handles.b)), sub(z, handles.p));
    }
  }

  function cx(a) {
    var re = Math.abs(a[0]) < 0.005 ? 0 : a[0], im = Math.abs(a[1]) < 0.005 ? 0 : a[1];
    return (re < 0 ? '−' : '') + Math.abs(re).toFixed(2) + (im < 0 ? ' − ' : ' + ') + Math.abs(im).toFixed(2) + 'i';
  }

  function toScreen(z, W, H) { return [W / 2 + z[0] / scale, H / 2 - z[1] / scale]; }
  function toPlane(x, y, W, H) { return [(x - W / 2) * scale, -(y - H / 2) * scale]; }

  function frame(dt, st) {
    if (failed) return;
    if (!gl) init();
    if (failed) return;
    var W = st.width, H = st.height;
    var want = fn.r / (Math.min(W, H) / 2);
    if (want !== scale) { scale = want; glDirty = true; }
    if (canvas.width !== st.canvas.width || canvas.height !== st.canvas.height) {
      canvas.width = st.canvas.width;
      canvas.height = st.canvas.height;
      glDirty = true;
    }
    if (glDirty) {
      glDirty = false;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uScale, scale / st.dpr);
      gl.uniform1f(U.uFn, fn.id);
      gl.uniform1f(U.uLines, showLines ? 1 : 0);
      gl.uniform2f(U.uA, handles.a[0], handles.a[1]);
      gl.uniform2f(U.uB, handles.b[0], handles.b[1]);
      gl.uniform2f(U.uP, handles.p[0], handles.p[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;

    var ctx = st.ctx;
    ctx.clearRect(0, 0, W, H);

    // Axes, with ticks at whole numbers.
    var o = toScreen([0, 0], W, H);
    ctx.strokeStyle = 'rgba(10,11,16,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, o[1]);
    ctx.lineTo(W, o[1]);
    ctx.moveTo(o[0], 0);
    ctx.lineTo(o[0], H);
    var n = Math.ceil(Math.max(W, H) / 2 * scale);
    for (var k = -n; k <= n; k++) {
      if (!k) continue;
      ctx.moveTo(o[0] + k / scale, o[1] - 4);
      ctx.lineTo(o[0] + k / scale, o[1] + 4);
      ctx.moveTo(o[0] - 4, o[1] - k / scale);
      ctx.lineTo(o[0] + 4, o[1] - k / scale);
    }
    ctx.stroke();

    function ring(z, r, fill, big) {
      var p = toScreen(z, W, H);
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = big ? 2.5 : 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      return p;
    }
    function cross(p, r) {
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(p[0] - r, p[1] - r);
      ctx.lineTo(p[0] + r, p[1] + r);
      ctx.moveTo(p[0] + r, p[1] - r);
      ctx.lineTo(p[0] - r, p[1] + r);
      ctx.stroke();
    }

    // Zeros: dark rings. Poles: white rings with a cross.
    fn.zeros.forEach(function (z) { ring(z, 4.5, 'rgba(10,11,16,0.6)', false); });
    fn.poles.forEach(function (z) { cross(ring(z, 5, '#ffffff', false), 2.5); });
    if (fn.id === 5) {
      ctx.font = '600 13px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ['a', 'b', 'p'].forEach(function (key) {
        var isPole = key === 'p';
        var p = ring(handles[key], 8, isPole ? '#ffffff' : '#0a0b10', true);
        if (isPole) cross(p, 3.5);
        ctx.fillStyle = 'rgba(10,11,16,0.75)';
        ctx.fillRect(p[0] + 11, p[1] - 9, 16, 18);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(key, p[0] + 15, p[1]);
      });
    }

    // A small key: the color for each angle of f(z).
    var kr = Math.max(16, Math.min(24, W * 0.035)), kx = W - kr - 22, ky = H - kr - 22;
    ctx.fillStyle = 'rgba(10,11,16,0.72)';
    ctx.beginPath();
    ctx.arc(kx, ky, kr + 14, 0, Math.PI * 2);
    ctx.fill();
    for (k = 0; k < 60; k++) {
      ctx.strokeStyle = V.gradient(WHEEL.concat([WHEEL[0]]), k / 60);
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(kx, ky, kr - 3, -(k + 1.1) / 60 * Math.PI * 2, -k / 60 * Math.PI * 2);
      ctx.stroke();
    }
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#c4c1ba';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('1', kx + kr + 7, ky);
    ctx.fillText('i', kx, ky - kr - 7);
    ctx.fillText('−1', kx - kr - 7, ky);
    ctx.fillText('−i', kx, ky + kr + 7);

    if (hover) {
      var hp = toScreen(hover, W, H);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hp[0], hp[1], 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    var lines = [fn.name];
    if (hover) {
      var fz = evalF(hover), mag = Math.hypot(fz[0], fz[1]);
      var ang = Math.atan2(fz[1], fz[0]) * 180 / Math.PI;
      if (ang < 0) ang += 360;
      lines.push('z = ' + cx(hover));
      lines.push(!isFinite(mag) || mag > 1e6 ? 'f(z) is huge: a pole'
        : 'f(z) = ' + (mag < 1000 ? mag.toFixed(2) : mag.toExponential(1)) + ' at ' + ang.toFixed(0) + '°');
    } else {
      lines.push('Point anywhere to read f(z)');
    }
    V.setText(readout, lines.join('\n'));
  }

  stage = V.createStage(overlay, { frame: frame });

  // ---- Pointer: drag a, b and p; point anywhere to read f(z) ----

  V.drag(canvas, {
    hit: function (x, y) {
      if (fn.id !== 5) return null;
      var best = null, bd = 22;
      ['a', 'b', 'p'].forEach(function (key) {
        var p = toScreen(handles[key], stage.width, stage.height);
        var d = Math.hypot(p[0] - x, p[1] - y);
        if (d < bd) { bd = d; best = key; }
      });
      return best;
    },
    move: function (key, x, y) {
      var lim = fn.r * 0.98, z = toPlane(x, y, stage.width, stage.height);
      var lx = lim * Math.max(1, stage.width / stage.height), ly = lim * Math.max(1, stage.height / stage.width);
      handles[key] = [Math.max(-lx, Math.min(lx, z[0])), Math.max(-ly, Math.min(ly, z[1]))];
      hover = handles[key].slice();
      glDirty = true;
      stage.dirty = true;
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!scale) return;
    var b = canvas.getBoundingClientRect();
    hover = toPlane(e.clientX - b.left, e.clientY - b.top, stage.width, stage.height);
    stage.dirty = true;
  });
  canvas.addEventListener('pointerdown', function (e) {
    if (!scale) return;
    var b = canvas.getBoundingClientRect();
    hover = toPlane(e.clientX - b.left, e.clientY - b.top, stage.width, stage.height);
    stage.dirty = true;
  });
  canvas.addEventListener('pointerleave', function (e) {
    if (e.pointerType !== 'mouse') return;
    hover = null;
    stage.dirty = true;
  });

  // ---- Controls ----

  V.segmented(fnGroup, function (v) {
    fn = FNS[v];
    hover = null;
    glDirty = true;
    stage.dirty = true;
  });
  V.toggle(linesBtn, function (on) {
    showLines = on;
    glDirty = true;
  });
})();
