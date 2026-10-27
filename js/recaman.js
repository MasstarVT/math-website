// Recamán's sequence: on step n, jump back n if that lands on a positive
// number not visited yet, otherwise jump forward n. Each jump is drawn as a
// half circle, alternating above and below the number line.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('recaman');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var soundBtn = V.ctl(section, 'sound');

  var MAX = 2000;
  var seq = [0];
  var visited = new Set([0]);
  for (var n = 1; n <= MAX; n++) {
    var a = seq[n - 1], back = a - n;
    var next = back > 0 && !visited.has(back) ? back : a + n;
    seq.push(next);
    visited.add(next);
  }

  var steps = 60;      // how far to go
  var shown = 0;       // steps drawn so far, fractional while one is drawing
  var speed = 4;       // steps per second
  var playing = !V.reducedMotion;
  var scale = 0;       // eased pixels per unit
  var sound = false;
  var audio = null;
  var lastNote = 0;

  function frame(dt, st) {
    if (playing && shown < steps) {
      var before = Math.floor(shown);
      shown = Math.min(steps, shown + dt * speed);
      if (sound && Math.floor(shown) > before) note(seq[Math.floor(shown)]);
    }
    if (shown > steps) shown = steps;

    var W = st.width, H = st.height, ctx = st.ctx;
    var done = Math.floor(shown), frac = shown - done;
    var last = Math.min(steps, done + (frac > 0 ? 1 : 0));

    // Fit the largest value and the largest arc reached so far.
    var top = 1, rad = 0.5;
    for (var k = 1; k <= last; k++) {
      if (seq[k] > top) top = seq[k];
      if (k / 2 > rad) rad = k / 2;
    }
    var pad = 20;
    var want = Math.min((W - pad * 2) / top, (H / 2 - pad) / rad);
    scale = scale ? scale + (want - scale) * Math.min(1, dt * 4) : want;
    if (V.reducedMotion || !playing) scale = want;
    var x0 = pad, cy = H / 2;

    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(236,232,223,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy + 0.5);
    ctx.lineTo(W, cy + 0.5);
    ctx.stroke();

    ctx.lineWidth = steps > 400 ? 1 : 1.6;
    for (k = 1; k <= last; k++) {
      var from = seq[k - 1], to = seq[k];
      var t = k <= done ? 1 : frac;
      var mid = (from + to) / 2, r = Math.abs(to - from) / 2;
      // Odd steps arc over the line, even steps under it, always moving from
      // `from` toward `to`.
      var start = from < to ? Math.PI : 0;
      var dir = (k % 2 ? 1 : -1) * (from < to ? 1 : -1);
      ctx.strokeStyle = V.gradient(V.SPECTRUM, k / Math.max(steps, 1));
      ctx.beginPath();
      ctx.arc(x0 + mid * scale, cy, r * scale, start, start + dir * Math.PI * t, dir < 0);
      ctx.stroke();
    }

    // Where the sequence is now.
    var pos = done < last ? seq[done] + (seq[last] - seq[done]) * V.easeInOut(frac) : seq[done];
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x0 + pos * scale, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Smallest whole number not reached yet.
    var seen = new Set(seq.slice(0, done + 1)), missing = 1;
    while (seen.has(missing)) missing++;

    var line1 = done === 0 ? 'Start at 0'
      : 'Step ' + done + ': ' + seq[done - 1] + (seq[done] < seq[done - 1] ? ' − ' : ' + ') + done + ' = ' + seq[done];
    V.setText(readout, line1 + '\nSmallest number not reached yet: ' + missing);
  }

  // A short plucked note whose pitch follows the value.
  function note(v) {
    var now = audio.currentTime;
    if (now - lastNote < 0.04) return;
    lastNote = now;
    var osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 220 * Math.pow(2, (v % 36) / 12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + 0.55);
  }

  V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    if (!playing && shown >= steps) shown = 0;
    setPlaying(!playing);
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    shown = 0;
    scale = 0;
    setPlaying(true);
  });

  V.range(V.ctl(section, 'steps'), V.ctl(section, 'steps-out'),
    function (v) { return String(v); },
    function (v) {
      steps = v;
      if (shown > steps) shown = steps;
    });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return Math.round(Math.pow(2, v)) + ' / second'; },
    function (v) { speed = Math.pow(2, v); });

  V.toggle(soundBtn, function (on) {
    sound = on;
    if (on && !audio) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { sound = false; soundBtn.setAttribute('aria-pressed', 'false'); return; }
      audio = new AC();
    }
    if (on && audio.state === 'suspended') audio.resume();
  });
})();
