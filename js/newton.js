// Newton's method on a polynomial whose roots you can drag. Every pixel is a
// starting guess z, repeatedly replaced by z − a·f(z)/f′(z), where
// f′/f = Σ 1/(z − rᵢ). Color: the root it reaches. Shade: how fast.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('newton');
  if (!section) return;

  var canvas = section.querySelector('canvas:not(.overlay)');
  var overlay = section.querySelector('canvas.overlay');
  var readout = V.ctl(section, 'readout');

  var gl = canvas.getContext('webgl', { antialias: false });
  if (!gl) {
    var msg = document.createElement('p');
    msg.className = 'fallback';
    msg.textContent = 'This one needs WebGL, which your browser has turned off.';
    canvas.parentNode.appendChild(msg);
    return;
  }

  var MAX_ITER = 80;
  var COLORS = [[110, 231, 255], [255, 95, 162], [255, 209, 102], [167, 139, 250], [126, 224, 161]];
  var NAMES = ['blue', 'pink', 'gold', 'violet', 'green'];

  var VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
  var FRAG = [
    'precision highp float;',
    'uniform vec2 uRes;',
    'uniform float uScale;',
    'uniform vec2 uRoots[5];',
    'uniform vec3 uColors[5];',
    'uniform int uCount;',
    'uniform float uStep;',
    'void main() {',
    '  vec2 z = (gl_FragCoord.xy - 0.5 * uRes) * uScale;',
    '  vec3 col = vec3(0.05, 0.06, 0.09);',
    '  float n = 0.0;',
    '  for (int i = 0; i < ' + MAX_ITER + '; i++) {',
    '    vec2 s = vec2(0.0);',
    '    for (int k = 0; k < 5; k++) {',
    '      if (k >= uCount) break;',
    '      vec2 d = z - uRoots[k];',
    '      s += vec2(d.x, -d.y) / max(dot(d, d), 1e-20);',
    '    }',
    // z -= a / s, dividing complex numbers.
    '    z -= uStep * vec2(s.x, -s.y) / max(dot(s, s), 1e-20);',
    '    n += 1.0;',
    '    bool done = false;',
    '    for (int k = 0; k < 5; k++) {',
    '      if (k >= uCount) break;',
    '      if (distance(z, uRoots[k]) < 1e-3) { col = uColors[k]; done = true; }',
    '    }',
    '    if (done) break;',
    '  }',
    '  float shade = 0.18 + 0.82 * exp(-n * 0.09);',
    '  gl_FragColor = vec4(col * shade, 1.0);',
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
  ['uRes', 'uScale', 'uRoots', 'uColors', 'uCount', 'uStep'].forEach(function (n) {
    U[n] = gl.getUniformLocation(prog, n);
  });
  var flat = [];
  COLORS.forEach(function (c) { flat.push(c[0] / 255, c[1] / 255, c[2] / 255); });
  gl.uniform3fv(U.uColors, new Float32Array(flat));

  var roots = [];
  var step = 1;
  var hover = null;  // a starting guess to follow, as a complex number
  var scale = 0;     // complex units per CSS pixel
  var glDirty = true;

  function placeRoots(n) {
    roots = [];
    for (var k = 0; k < n; k++) {
      var a = Math.PI / 2 + k * 2 * Math.PI / n;
      roots.push([Math.cos(a), Math.sin(a)]);
    }
    glDirty = true;
  }

  function toScreen(z, W, H) { return [W / 2 + z[0] / scale, H / 2 - z[1] / scale]; }
  function toPlane(x, y, W, H) { return [(x - W / 2) * scale, -(y - H / 2) * scale]; }

  // The same iteration as the shader, for the path of one guess.
  function follow(z) {
    var path = [z.slice()], hit = -1;
    for (var i = 0; i < MAX_ITER && hit < 0; i++) {
      var sx = 0, sy = 0;
      for (var k = 0; k < roots.length; k++) {
        var dx = z[0] - roots[k][0], dy = z[1] - roots[k][1], q = Math.max(dx * dx + dy * dy, 1e-20);
        sx += dx / q;
        sy -= dy / q;
      }
      var m = Math.max(sx * sx + sy * sy, 1e-20);
      z = [z[0] - step * sx / m, z[1] + step * sy / m];
      path.push(z);
      for (k = 0; k < roots.length; k++) {
        if (Math.hypot(z[0] - roots[k][0], z[1] - roots[k][1]) < 1e-3) hit = k;
      }
    }
    return { path: path, hit: hit, steps: i };
  }

  function frame(dt, st) {
    var W = st.width, H = st.height;
    scale = 3.4 / Math.min(W, H);
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
      var r = new Float32Array(10);
      roots.forEach(function (p, k) { r[k * 2] = p[0]; r[k * 2 + 1] = p[1]; });
      gl.uniform2fv(U.uRoots, r);
      gl.uniform1i(U.uCount, roots.length);
      gl.uniform1f(U.uStep, step);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;

    var ctx = st.ctx;
    ctx.clearRect(0, 0, W, H);

    var line2 = 'Hover or tap to follow one guess';
    if (hover) {
      var F = follow(hover);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      F.path.forEach(function (z, i) {
        var p = toScreen(z, W, H);
        if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
      });
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      F.path.forEach(function (z, i) {
        var p = toScreen(z, W, H);
        ctx.beginPath();
        ctx.arc(p[0], p[1], i ? 2.5 : 4.5, 0, Math.PI * 2);
        ctx.fill();
      });
      line2 = F.hit >= 0
        ? 'This guess reaches the ' + NAMES[F.hit] + ' root in ' + F.steps + ' steps'
        : 'No root after ' + MAX_ITER + ' steps';
    }

    roots.forEach(function (z, k) {
      var p = toScreen(z, W, H), c = COLORS[k];
      ctx.fillStyle = 'rgb(' + c.join(',') + ')';
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    V.setText(readout, roots.length + ' roots   step size ' + step.toFixed(2) + '\n' + line2);
  }

  var stage = V.createStage(overlay, { frame: frame });

  // ---- Pointer: drag roots, hover anywhere else ----

  V.drag(canvas, {
    hit: function (x, y) {
      for (var k = 0; k < roots.length; k++) {
        var p = toScreen(roots[k], stage.width, stage.height);
        if (Math.hypot(p[0] - x, p[1] - y) < 16) return roots[k];
      }
      return null;
    },
    move: function (r, x, y) {
      var z = toPlane(x, y, stage.width, stage.height);
      r[0] = z[0];
      r[1] = z[1];
      glDirty = true;
    }
  });

  function onPoint(e) {
    var b = canvas.getBoundingClientRect();
    hover = toPlane(e.clientX - b.left, e.clientY - b.top, stage.width, stage.height);
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

  V.segmented(V.ctl(section, 'roots'), function (v) { placeRoots(parseInt(v, 10)); });

  V.ctl(section, 'shuffle').addEventListener('click', function () {
    roots.forEach(function (r) {
      var a = Math.random() * Math.PI * 2, d = 0.3 + Math.random() * 0.9;
      r[0] = Math.cos(a) * d;
      r[1] = Math.sin(a) * d;
    });
    glDirty = true;
  });

  V.range(V.ctl(section, 'step'), V.ctl(section, 'step-out'),
    function (v) { return v.toFixed(2); },
    function (v) { step = v; glDirty = true; });

  placeRoots(3);
})();
