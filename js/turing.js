// Gray-Scott reaction-diffusion on the GPU. Chemical u feeds in everywhere,
// v eats u to make more of itself (u + 2v -> 3v) and slowly dies off. Both
// spread out, u twice as fast as v, and that mismatch is what makes patterns.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('turing');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var presetGroup = V.ctl(section, 'preset');
  var feedIn = V.ctl(section, 'feed');
  var killIn = V.ctl(section, 'kill');

  var PRESETS = {
    spots: { f: 0.025, k: 0.06 },
    stripes: { f: 0.029, k: 0.057 },
    mitosis: { f: 0.0367, k: 0.0649 },
    coral: { f: 0.0545, k: 0.062 }
  };
  var TEXEL = 2.6; // CSS pixels per grid cell, so patterns look the same size on any screen

  var gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, preserveDrawingBuffer: true });
  if (!gl) {
    var msg = document.createElement('p');
    msg.className = 'fallback';
    msg.textContent = 'This one needs WebGL, which your browser has turned off.';
    canvas.parentNode.appendChild(msg);
    return;
  }

  // Store each chemical in a float texture if we can render to one. If not,
  // pack each value into two bytes of an ordinary RGBA texture (16 bits each).
  function floatWorks() {
    if (!gl.getExtension('OES_texture_float')) return false;
    gl.getExtension('WEBGL_color_buffer_float');
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.FLOAT, null);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(t);
    return ok;
  }
  var FLOAT = floatWorks();

  var HEAD = [
    'precision highp float;',
    FLOAT ? '' : '#define PACKED',
    'uniform sampler2D uState;',
    'uniform vec2 uSize;',
    'vec2 dec(vec4 t) {',
    '#ifdef PACKED',
    '  vec4 b = floor(t * 255.0 + 0.5);',
    '  return vec2(b.x * 256.0 + b.y, b.z * 256.0 + b.w) / 65535.0;',
    '#else',
    '  return t.xy;',
    '#endif',
    '}',
    'vec4 enc(vec2 s) {',
    '  s = clamp(s, 0.0, 1.0);',
    '#ifdef PACKED',
    '  vec2 n = floor(s * 65535.0 + 0.5);',
    '  vec2 hi = floor(n / 256.0);',
    '  vec2 lo = n - hi * 256.0;',
    '  return vec4(hi.x, lo.x, hi.y, lo.y) / 255.0;',
    '#else',
    '  return vec4(s, 0.0, 1.0);',
    '#endif',
    '}',
    // The grid wraps around like a torus, so there are no edges.
    'vec2 S(vec2 p) { return dec(texture2D(uState, fract(p / uSize))); }'
  ].join('\n');

  var VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';

  var STEP = HEAD + '\n' + [
    'uniform float uF;',
    'uniform float uK;',
    'uniform float uRun;',
    'uniform vec4 uBrush;',
    'void main() {',
    '  vec2 p = gl_FragCoord.xy;',
    '  vec2 c = S(p);',
    '  vec2 n = c;',
    '  if (uRun > 0.5) {',
    '    vec2 lap = -c',
    '      + 0.2 * (S(p + vec2(1.0, 0.0)) + S(p - vec2(1.0, 0.0)) + S(p + vec2(0.0, 1.0)) + S(p - vec2(0.0, 1.0)))',
    '      + 0.05 * (S(p + vec2(1.0, 1.0)) + S(p + vec2(-1.0, 1.0)) + S(p + vec2(1.0, -1.0)) + S(p - vec2(1.0, 1.0)));',
    '    float uvv = c.x * c.y * c.y;',
    '    n += vec2(lap.x - uvv + uF * (1.0 - c.x), 0.5 * lap.y + uvv - (uF + uK) * c.y);',
    '  }',
    '  if (uBrush.w > 0.0) {',
    '    vec2 d = abs(p - uBrush.xy);',
    '    d = min(d, uSize - d);',
    '    float w = 1.0 - smoothstep(uBrush.z * 0.5, uBrush.z, length(d));',
    '    n = mix(n, vec2(0.45, 0.3), w * uBrush.w);',
    '  }',
    '  gl_FragColor = enc(n);',
    '}'
  ].join('\n');

  var SHOW = HEAD + '\n' + [
    'uniform vec2 uRes;',
    'vec3 ramp(float t) {',
    '  vec3 c0 = vec3(0.051, 0.059, 0.086);',
    '  vec3 c1 = vec3(0.24, 0.08, 0.27);',
    '  vec3 c2 = vec3(1.0, 0.37, 0.64);',
    '  vec3 c3 = vec3(1.0, 0.74, 0.55);',
    '  vec3 c4 = vec3(1.0, 0.96, 0.88);',
    '  if (t < 0.25) return mix(c0, c1, t * 4.0);',
    '  if (t < 0.55) return mix(c1, c2, (t - 0.25) / 0.3);',
    '  if (t < 0.85) return mix(c2, c3, (t - 0.55) / 0.3);',
    '  return mix(c3, c4, (t - 0.85) / 0.15);',
    '}',
    'void main() {',
    '  vec2 q = gl_FragCoord.xy / uRes * uSize - 0.5;',
    '  vec2 i = floor(q);',
    '  vec2 f = q - i;',
    '  i += 0.5;',
    '  float v = mix(mix(S(i).y, S(i + vec2(1.0, 0.0)).y, f.x),',
    '    mix(S(i + vec2(0.0, 1.0)).y, S(i + vec2(1.0, 1.0)).y, f.x), f.y);',
    '  gl_FragColor = vec4(ramp(clamp(v * 2.7, 0.0, 1.0)), 1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function program(frag, names) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    var u = {};
    names.forEach(function (n) { u[n] = gl.getUniformLocation(p, n); });
    return { p: p, u: u };
  }

  var stepProg = program(STEP, ['uState', 'uSize', 'uF', 'uK', 'uRun', 'uBrush']);
  var showProg = program(SHOW, ['uState', 'uSize', 'uRes']);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  var feed = PRESETS.spots.f, kill = PRESETS.spots.k;
  var speed = 16;
  var playing = !V.reducedMotion;
  var steps = 0;
  var sim = null; // { w, h, tex: [a, b], fb: [a, b], cur }
  var brush = null; // { x, y, px, py } in grid cells while painting

  function makeTarget(w, h) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, FLOAT ? gl.FLOAT : gl.UNSIGNED_BYTE, null);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex: t, fb: fb };
  }

  function build(w, h) {
    if (sim) {
      sim.t.forEach(function (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); });
    }
    sim = { w: w, h: h, t: [makeTarget(w, h), makeTarget(w, h)], cur: 0 };
    seed(true);
  }

  // Fill the grid with u = 1, v = 0, plus (if scatter) small squares of v
  // that the pattern grows from.
  function seed(scatter) {
    var w = sim.w, h = sim.h, n = w * h;
    var u = new Float32Array(n), v = new Float32Array(n);
    u.fill(1);
    if (scatter) {
      var count = Math.round(n / 420);
      for (var q = 0; q < count; q++) {
        var cx = Math.floor(Math.random() * w), cy = Math.floor(Math.random() * h);
        for (var dy = -3; dy <= 3; dy++) {
          for (var dx = -3; dx <= 3; dx++) {
            var i = ((cy + dy + h) % h) * w + (cx + dx + w) % w;
            u[i] = 0.5;
            v[i] = 0.25 + 0.05 * Math.random();
          }
        }
      }
    }
    var data;
    if (FLOAT) {
      data = new Float32Array(n * 4);
      for (var j = 0; j < n; j++) { data[j * 4] = u[j]; data[j * 4 + 1] = v[j]; data[j * 4 + 3] = 1; }
    } else {
      data = new Uint8Array(n * 4);
      for (var k = 0; k < n; k++) {
        var a = Math.round(u[k] * 65535), b = Math.round(v[k] * 65535);
        data[k * 4] = a >> 8; data[k * 4 + 1] = a & 255;
        data[k * 4 + 2] = b >> 8; data[k * 4 + 3] = b & 255;
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, sim.t[sim.cur].tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, FLOAT ? gl.FLOAT : gl.UNSIGNED_BYTE, data);
    steps = 0;
    stage.dirty = true;
  }

  function sizeFor(st) {
    var w = Math.max(96, Math.min(300, Math.round(st.width / TEXEL)));
    return { w: w, h: Math.max(64, Math.round(w * st.height / st.width)) };
  }

  function runSteps(n, run) {
    var u = stepProg.u;
    gl.useProgram(stepProg.p);
    gl.viewport(0, 0, sim.w, sim.h);
    gl.uniform2f(u.uSize, sim.w, sim.h);
    gl.uniform1f(u.uF, feed);
    gl.uniform1f(u.uK, kill);
    gl.uniform1f(u.uRun, run ? 1 : 0);
    gl.uniform1i(u.uState, 0);
    gl.activeTexture(gl.TEXTURE0);
    var r = 16 / (stage.width / sim.w);
    for (var s = 0; s < n; s++) {
      if (brush) {
        // Spread the brush along the pointer's path so fast strokes stay solid.
        var f = (s + 1) / n;
        gl.uniform4f(u.uBrush, brush.px + (brush.x - brush.px) * f, brush.py + (brush.y - brush.py) * f, r, 0.6);
      } else {
        gl.uniform4f(u.uBrush, 0, 0, 0, 0);
      }
      var src = sim.t[sim.cur], dst = sim.t[1 - sim.cur];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      sim.cur = 1 - sim.cur;
    }
    if (run) steps += n;
    if (brush) { brush.px = brush.x; brush.py = brush.y; }
  }

  function frame(dt, st) {
    var want = sizeFor(st);
    if (!sim || Math.abs(want.w - sim.w) > 8 || Math.abs(want.h - sim.h) > 8) build(want.w, want.h);

    if (playing) runSteps(speed, true);
    else if (brush) runSteps(2, false);
    else if (!st.dirty) return;
    st.dirty = false;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(showProg.p);
    gl.uniform2f(showProg.u.uSize, sim.w, sim.h);
    gl.uniform2f(showProg.u.uRes, canvas.width, canvas.height);
    gl.uniform1i(showProg.u.uState, 0);
    gl.bindTexture(gl.TEXTURE_2D, sim.t[sim.cur].tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    V.setText(readout, 'Step ' + steps.toLocaleString());
  }

  var stage = V.createStage(canvas, { context: 'none', frame: frame });

  // ---- Painting ----

  function cell(px, py) {
    return { x: px / stage.width * sim.w, y: (1 - py / stage.height) * sim.h };
  }

  V.drag(canvas, {
    cursor: 'crosshair',
    hit: function () { return sim ? {} : null; },
    move: function (h, px, py, first) {
      var c = cell(px, py);
      if (first || !brush) brush = { x: c.x, y: c.y, px: c.x, py: c.y };
      else { brush.x = c.x; brush.y = c.y; }
      stage.dirty = true;
    },
    end: function () { brush = null; }
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'reseed').addEventListener('click', function () { if (sim) seed(true); });
  V.ctl(section, 'clear').addEventListener('click', function () { if (sim) seed(false); });

  var syncing = false;
  var updateFeed = V.range(feedIn, V.ctl(section, 'feed-out'),
    function (v) { return v.toFixed(4); },
    function (v) { feed = v; if (!syncing) V.setSegmented(presetGroup, ''); });
  var updateKill = V.range(killIn, V.ctl(section, 'kill-out'),
    function (v) { return v.toFixed(4); },
    function (v) { kill = v; if (!syncing) V.setSegmented(presetGroup, ''); });

  function usePreset(name) {
    var p = PRESETS[name];
    syncing = true;
    feedIn.value = p.f;
    killIn.value = p.k;
    updateFeed();
    updateKill();
    syncing = false;
    V.setSegmented(presetGroup, name);
    if (sim) seed(true);
  }
  V.segmented(presetGroup, usePreset);
  usePreset('spots');

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return v + ' steps / frame'; },
    function (v) { speed = v; });
})();
