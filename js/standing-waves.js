// A string pinned at both ends vibrates as a sum of modes sin(nπx)·cos(2πn·f·t).
// A pluck at p to height h is a triangle whose mode amounts are
// bₙ = 2h·sin(nπp) ÷ (n²π²·p(1 − p)), so modes with a still point at p vanish.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('standing-waves');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var modeSeg = V.ctl(section, 'mode');
  var soundBtn = V.ctl(section, 'sound');
  var playBtn = V.ctl(section, 'play');

  var N = 30;               // modes in the sum
  var BARS = 16;
  var F1 = 196;             // the sound's lowest note, G below middle C
  var INTERVALS = { 2: 'an octave', 3: 'a fifth', 4: 'a fourth', 5: 'a major third', 6: 'a minor third' };

  var amps = new Float64Array(N + 1);   // bₙ at the start of the motion
  var pure = 0;             // 0 while showing a pluck, else the mode shown
  var pluckAt = 0.3, pluckH = 0.8;
  var t = 0;
  var speed = 1;
  var playing = !V.reducedMotion;
  var held = false;
  var sound = false, audio = null;
  var geo = { x0: 0, x1: 1, y: 0, A: 1, W: 0, H: 0 };

  function setPluck(p, h) {
    pluckAt = p;
    pluckH = h;
    for (var n = 1; n <= N; n++) {
      amps[n] = 2 * h * Math.sin(n * Math.PI * p) / (n * n * Math.PI * Math.PI * p * (1 - p));
    }
  }

  function setMode(n) {
    pure = n;
    for (var k = 1; k <= N; k++) amps[k] = k === n ? 0.8 : 0;
    t = 0;
  }

  // Higher modes die away faster, as on a real string. A pure mode rings on.
  function decay(n) { return pure ? 1 : Math.exp(-t * 0.1 * (1 + 0.18 * n)); }

  function shape(x) {
    if (held) return x < pluckAt ? pluckH * x / pluckAt : pluckH * (1 - x) / (1 - pluckAt);
    var y = 0, w = 2 * Math.PI * 0.45 * t;
    for (var n = 1; n <= N; n++) {
      if (amps[n]) y += amps[n] * decay(n) * Math.sin(n * Math.PI * x) * Math.cos(n * w);
    }
    return y;
  }

  function frame(dt, st) {
    var W = st.width, H = st.height, ctx = st.ctx;
    var stringY = H * 0.36 + 18, A = Math.min(H * 0.22, 120);
    geo = { x0: 28, x1: W - 28, y: stringY, A: A, W: W, H: H };
    // Nothing moves while paused, or once a pluck has rung out.
    var still = !held && (!playing || (!pure && t > 45));
    if (still && !st.dirty) return;
    st.dirty = false;
    if (!held && playing) t += dt * speed;
    ctx.clearRect(0, 0, W, H);
    var i;

    // Pins at the two ends, and the resting line.
    ctx.strokeStyle = 'rgba(236,232,223,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(geo.x0, stringY);
    ctx.lineTo(geo.x1, stringY);
    ctx.stroke();

    // A pure mode's envelope and still points.
    if (pure) {
      ctx.strokeStyle = 'rgba(126,224,161,0.22)';
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      for (var sgn = -1; sgn <= 1; sgn += 2) {
        for (i = 0; i <= 200; i++) {
          var fx = i / 200, ex = geo.x0 + fx * (geo.x1 - geo.x0), ey = stringY - sgn * 0.8 * A * Math.sin(pure * Math.PI * fx);
          if (i) ctx.lineTo(ex, ey); else ctx.moveTo(ex, ey);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // The string.
    ctx.strokeStyle = '#ece8df';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    var steps = Math.max(120, Math.round((geo.x1 - geo.x0) / 3));
    for (i = 0; i <= steps; i++) {
      var x = i / steps, px = geo.x0 + x * (geo.x1 - geo.x0), py = stringY - shape(x) * A;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();

    ctx.fillStyle = '#7ee0a1';
    if (pure) {
      for (i = 1; i < pure; i++) {
        ctx.beginPath();
        ctx.arc(geo.x0 + i / pure * (geo.x1 - geo.x0), stringY, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (held) {
      ctx.beginPath();
      ctx.arc(geo.x0 + pluckAt * (geo.x1 - geo.x0), stringY - pluckH * A, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#9b9daf';
    [geo.x0, geo.x1].forEach(function (x) {
      ctx.fillRect(x - 3, stringY - 12, 6, 24);
    });

    bars(ctx);

    var lines;
    if (pure) {
      lines = pure === 1 ? ['Mode 1: one arch', 'The lowest note, the fundamental']
        : ['Mode ' + pure + ': ' + pure + ' arches, ' + (pure - 1) + (pure === 2 ? ' still point' : ' still points'),
          'Vibrates ' + pure + ' × as fast as mode 1'];
      if (pure > 1) lines.push('Mode ' + pure + ' to mode ' + (pure - 1) + ' is ' + pure + ' : ' + (pure - 1) + ', ' + INTERVALS[pure]);
    } else {
      var missing = [];
      for (var n = 1; n <= 12; n++) if (Math.abs(Math.sin(n * Math.PI * pluckAt)) < 0.03) missing.push(n);
      lines = [(held ? 'Pulled' : 'Plucked') + ' at ' + fraction(pluckAt) + ' of the way along',
        'Missing modes: ' + (missing.length ? missing.join(', ') + (missing.length > 2 ? '…' : '') : 'none')];
    }
    V.setText(readout, lines.join('\n'));
  }

  function fraction(p) {
    var named = [[1 / 2, '1/2'], [1 / 3, '1/3'], [2 / 3, '2/3'], [1 / 4, '1/4'], [3 / 4, '3/4'], [1 / 5, '1/5'], [4 / 5, '4/5']];
    for (var i = 0; i < named.length; i++) if (Math.abs(p - named[i][0]) < 1e-9) return named[i][1];
    return p.toFixed(2);
  }

  // How much of each mode is in the motion right now.
  function bars(ctx) {
    var W = geo.W, H = geo.H, top = geo.y + geo.A + 36, bottom = H - 26;
    var gap = (W - 56) / BARS, bw = Math.max(4, gap * 0.55);
    var max = 0, n, v;
    for (n = 1; n <= BARS; n++) max = Math.max(max, Math.abs(amps[n]));
    if (!max) return;
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (n = 1; n <= BARS; n++) {
      v = held ? Math.abs(amps[n]) : Math.abs(amps[n]) * decay(n);
      var h = Math.sqrt(v / max) * (bottom - top);
      var x = 28 + gap * (n - 0.5);
      ctx.fillStyle = h < 1.5 ? 'rgba(236,232,223,0.25)' : 'rgba(126,224,161,' + (0.35 + 0.6 * Math.min(1, v / max * 3)) + ')';
      ctx.fillRect(x - bw / 2, bottom - Math.max(h, 1.5), bw, Math.max(h, 1.5));
      ctx.fillStyle = '#6f7286';
      ctx.fillText(String(n), x, bottom + 6);
    }
  }

  // ---- Sound: the harmonics added up, dying away ----

  function play() {
    if (!sound || !audio) return;
    var now = audio.currentTime, master = audio.createGain();
    master.gain.value = 0.12;
    master.connect(audio.destination);
    var total = 0, n;
    for (n = 1; n <= 12; n++) total += Math.abs(amps[n]);
    if (!total) return;
    for (n = 1; n <= 12; n++) {
      var a = Math.abs(amps[n]) / total;
      if (a < 0.005) continue;
      var osc = audio.createOscillator(), g = audio.createGain();
      var life = pure ? 1.6 : 2.4 / (1 + 0.25 * n);
      osc.frequency.value = F1 * n;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(a, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + life);
      osc.connect(g).connect(master);
      osc.start(now);
      osc.stop(now + life + 0.05);
    }
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Drag the string to pluck it ----

  V.drag(canvas, {
    hit: function (x, y) {
      if (x < geo.x0 + 6 || x > geo.x1 - 6) return null;
      var f = (x - geo.x0) / (geo.x1 - geo.x0);
      return Math.abs(y - (geo.y - shape(f) * geo.A)) < 26 ? 'string' : null;
    },
    move: function (h, x, y) {
      if (!held) {
        held = true;
        pure = 0;
        V.setSegmented(modeSeg, 'pluck');
      }
      var p = Math.max(0.04, Math.min(0.96, (x - geo.x0) / (geo.x1 - geo.x0)));
      // Snap to the spots where whole families of modes go missing.
      [1 / 2, 1 / 3, 2 / 3, 1 / 4, 3 / 4, 1 / 5, 4 / 5].forEach(function (s) { if (Math.abs(p - s) < 0.012) p = s; });
      var hgt = Math.max(-1, Math.min(1, (geo.y - y) / geo.A));
      if (Math.abs(hgt) < 0.15) hgt = hgt < 0 ? -0.15 : 0.15;
      setPluck(p, hgt);
      stage.dirty = true;
    },
    end: function () {
      held = false;
      t = 0;
      setPlaying(true);
      play();
    }
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
    stage.dirty = true;
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.segmented(modeSeg, function (v) {
    if (v === 'pluck') {
      pure = 0;
      setPluck(pluckAt, pluckH);
      t = 0;
    } else {
      setMode(parseInt(v, 10));
    }
    setPlaying(true);
    play();
  });

  V.ctl(section, 'again').addEventListener('click', function () {
    if (pure) setMode(pure);
    else { setPluck(pluckAt, pluckH); t = 0; }
    setPlaying(true);
    play();
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return '×' + v; },
    function (v) { speed = v; });

  V.toggle(soundBtn, function (on) {
    sound = on;
    if (on && !audio) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { sound = false; soundBtn.setAttribute('aria-pressed', 'false'); return; }
      audio = new AC();
    }
    if (on && audio.state === 'suspended') audio.resume();
  });

  setPluck(0.3, 0.8);
})();
