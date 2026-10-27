// Harmonograph: one pendulum moves the pen left and right, another moves it up
// and down, and both slowly run down. With whole-number frequencies and no
// friction you get a closed Lissajous figure; a slight detune makes it turn.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('harmonograph');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var ratio = [2, 3];
  var detune = 0.006;
  var damping = 0.006;
  var paper = true;        // a third pendulum swings the paper in a circle
  var phase = [0, 0, 0];
  var playing = !V.reducedMotion;
  var t = 0;
  var drawnTo = 0;
  var layer = document.createElement('canvas');
  var lctx = layer.getContext('2d');

  function shuffle() {
    phase = [Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2];
  }

  function freqs() {
    return [ratio[0], ratio[1] + detune, ratio[0] + 0.004];
  }

  // Time until the swing has died to 2%, or one loop for a still figure.
  function duration() {
    if (damping > 0) return Math.min(Math.log(50) / damping, 900);
    return detune || paper ? 900 : Math.PI * 2;
  }

  function pos(u) {
    var f = freqs(), e = Math.exp(-damping * u), a = paper ? 0.72 : 1, b = paper ? 0.28 : 0;
    return [
      e * (a * Math.sin(f[0] * u + phase[0]) + b * Math.sin(f[2] * u + phase[2])),
      e * (a * Math.sin(f[1] * u + phase[1]) + b * Math.cos(f[2] * u + phase[2]))
    ];
  }

  function restart() {
    t = 0;
    drawnTo = 0;
  }

  function frame(dt, st) {
    var W = st.width, H = st.height, ctx = st.ctx;
    if (layer.width !== st.canvas.width || layer.height !== st.canvas.height) {
      layer.width = st.canvas.width;
      layer.height = st.canvas.height;
      drawnTo = 0;
    }
    var end = duration();
    if (playing && t < end) t = Math.min(end, t + dt * Math.max(12, end / 14));
    if (V.reducedMotion) t = end;

    var R = Math.min(W, H) * 0.45, cx = W / 2, cy = H / 2;
    if (drawnTo === 0) {
      lctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      lctx.clearRect(0, 0, W, H);
    }
    if (drawnTo < t) {
      var step = 0.02, u = drawnTo, p = pos(u);
      lctx.lineWidth = 1;
      lctx.globalAlpha = 0.75;
      while (u < t) {
        var u2 = Math.min(t, u + 1.2);
        lctx.strokeStyle = V.gradient(V.SPECTRUM, (u + u2) / 2 / end);
        lctx.beginPath();
        lctx.moveTo(cx + p[0] * R, cy + p[1] * R);
        for (var v = u + step; v < u2; v += step) {
          var q = pos(v);
          lctx.lineTo(cx + q[0] * R, cy + q[1] * R);
        }
        p = pos(u2);
        lctx.lineTo(cx + p[0] * R, cy + p[1] * R);
        lctx.stroke();
        u = u2;
      }
      lctx.globalAlpha = 1;
      drawnTo = t;
    }

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(layer, 0, 0, W, H);
    if (t < end) {
      var n = pos(t);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx + n[0] * R, cy + n[1] * R, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    var f = freqs();
    V.setText(readout,
      'Left–right ' + f[0].toFixed(3) + '   up–down ' + f[1].toFixed(3) + '\n' +
      'Swing left: ' + Math.round(Math.exp(-damping * t) * 100) + '%');
  }

  V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    if (!playing && t >= duration()) restart();
    setPlaying(!playing);
  });

  V.ctl(section, 'new').addEventListener('click', function () {
    shuffle();
    restart();
    setPlaying(true);
  });

  V.segmented(V.ctl(section, 'ratio'), function (v) {
    ratio = v.split(':').map(Number);
    restart();
  });

  V.range(V.ctl(section, 'detune'), V.ctl(section, 'detune-out'),
    function (v) { return v ? '+' + v.toFixed(3) : 'none'; },
    function (v) { if (v !== detune) { detune = v; restart(); } });

  V.range(V.ctl(section, 'damping'), V.ctl(section, 'damping-out'),
    function (v) { return v ? v.toFixed(3) : 'none'; },
    function (v) { if (v !== damping) { damping = v; restart(); } });

  V.toggle(V.ctl(section, 'paper'), function (on) { paper = on; restart(); });

  shuffle();
})();
