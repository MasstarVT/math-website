// Pendulum wave: pendulum k makes exactly base + k swings per minute. Seen from
// above, their phases drift apart into waves; at a/b of the minute pendulum k's
// phase depends only on k mod b, so the pattern repeats every b pendulums.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('pendulums');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var timeInput = V.ctl(section, 'time');

  var CYCLE = 60;          // seconds until every pendulum lines up again
  var count = 15;
  var base = 51;
  var speed = 1;
  var t = 0;
  var playing = !V.reducedMotion;
  var join = false;

  function pattern() {
    var f = t / CYCLE;
    if (f < 0.002 || f > 0.998) return 'All in one line';
    for (var b = 2; b <= 8; b++) {
      if (Math.abs(f * b - Math.round(f * b)) < 0.0025 * b) {
        return b === 2 ? 'Two rows, alternating' : 'Repeats every ' + b + ' pendulums';
      }
    }
    return 'Waves';
  }

  function clock(s) {
    var m = Math.floor(s / 60), r = s - m * 60;
    return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1);
  }

  function frame(dt, st) {
    if (playing) {
      t = (t + dt * speed) % CYCLE;
      timeInput.value = t.toFixed(1);
    }

    var W = st.width, H = st.height, ctx = st.ctx;
    var top = 60, bottom = 20; // room at the top for the readout
    var gap = (W - 40) / count;
    var amp = (H - top - bottom) / 2 - 12;
    var mid = top + amp + 12;
    var r = Math.max(4, Math.min(gap * 0.36, 14));

    ctx.clearRect(0, 0, W, H);
    // The bar they hang from, seen from above, and the edges of the swing.
    ctx.strokeStyle = 'rgba(236,232,223,0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, mid);
    ctx.lineTo(W - 14, mid);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236,232,223,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(14, mid - amp);
    ctx.lineTo(W - 14, mid - amp);
    ctx.moveTo(14, mid + amp);
    ctx.lineTo(W - 14, mid + amp);
    ctx.stroke();

    var pts = [];
    for (var k = 0; k < count; k++) {
      var x = 20 + gap * (k + 0.5);
      var y = mid - amp * Math.cos(2 * Math.PI * (base + k) * t / CYCLE);
      pts.push([x, y]);
      ctx.strokeStyle = 'rgba(236,232,223,0.12)';
      ctx.beginPath();
      ctx.moveTo(x, mid);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    if (join) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.stroke();
    }
    pts.forEach(function (p, i) {
      ctx.fillStyle = V.gradient(V.SPECTRUM, count > 1 ? i / (count - 1) : 0);
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fill();
    });

    V.setText(readout, clock(t) + ' of ' + clock(CYCLE) + '\n' + pattern());
  }

  V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  timeInput.addEventListener('input', function () {
    setPlaying(false);
    t = parseFloat(timeInput.value);
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    t = 0;
    timeInput.value = 0;
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return '×' + Math.round(Math.pow(2, v) * 100) / 100; },
    function (v) { speed = Math.pow(2, v); });

  V.segmented(V.ctl(section, 'count'), function (v) {
    count = parseInt(v, 10);
    base = 66 - count;
  });

  V.toggle(V.ctl(section, 'join'), function (on) { join = on; });
})();
