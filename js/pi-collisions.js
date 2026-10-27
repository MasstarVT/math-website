// Galperin's blocks: a big block slides at a small one in front of a wall,
// with perfectly elastic bounces. With a mass ratio of 100ⁿ the bounces number
// the first n + 1 digits of π. Scaled by √mass, the two speeds stay on a circle.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('pi-collisions');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var soundBtn = V.ctl(section, 'sound');
  var playBtn = V.ctl(section, 'play');

  var RATIOS = ['1', '100', '10,000', '1,000,000', '100,000,000'];
  var PI = '3.14159265';

  var power = 2;            // big block = 100^power × small block
  var states = null;        // velocities after each clack: v small, v big
  var total = 0;
  var k = 0;                // clacks so far
  var x1 = 0, x2 = 0;       // left edges of the small and big blocks, track units
  var v1 = 0, v2 = 0;
  var simT = 0, nextT = Infinity;
  var slow = 0.5;
  var playing = !V.reducedMotion;
  var done = 0;             // seconds since the last clack, once there are no more
  var sound = false, audio = null, lastClick = 0, pending = 0;
  var W1 = 0.07;            // small block width, track units (track = 1)
  var phase = null;         // offscreen copy of the phase-circle path
  var drawn = 0;
  var geo = { R: 0, cx: 0, cy: 0, size: 0, dpr: 1 };

  // The whole sequence of velocities, from speeds alone: bounces alternate
  // block-block, block-wall, and stop once the small block can't catch up.
  function build() {
    var m = 1, M = Math.pow(100, power);
    var a = 0, b = -1, list = [[a, b]], wallNext = false;
    for (;;) {
      if (!wallNext) {
        if (!(a > b)) break;
        var na = ((m - M) * a + 2 * M * b) / (m + M), nb = ((M - m) * b + 2 * m * a) / (m + M);
        a = na; b = nb;
      } else {
        if (!(a < 0)) break;
        a = -a;
      }
      list.push([a, b]);
      wallNext = !wallNext;
    }
    states = list;
    total = list.length - 1;
  }

  function bigWidth() { return W1 * (1 + power * 0.4); }

  function reset() {
    if (!states) build();
    k = 0;
    x1 = 0.32;
    x2 = 0.55;
    v1 = states[0][0] * 0.16;
    v2 = states[0][1] * 0.16;
    simT = 0;
    done = 0;
    drawn = 0;
    if (phase) {
      var pc = phase.getContext('2d');
      pc.setTransform(1, 0, 0, 1, 0, 0);
      pc.clearRect(0, 0, phase.width, phase.height);
    }
    schedule();
    // Paused (or reduced motion): skip straight to the final count.
    if (!playing) {
      while (k < total) advance(nextT);
      advance(simT + 0.6);
    }
  }

  // When the next clack happens, from where the blocks are now.
  function schedule() {
    nextT = Infinity;
    if (k >= total) return;
    if (k % 2 === 0) nextT = simT + Math.max(0, (x2 - x1 - W1) / (v1 - v2));
    else nextT = simT + Math.max(0, x1 / -v1);
  }

  function advance(to) {
    var guard = 0;
    while (nextT <= to && guard++ < 50000) {
      var d = nextT - simT;
      x1 += v1 * d;
      x2 += v2 * d;
      simT = nextT;
      k++;
      if (k % 2 === 1) x2 = x1 + W1; else x1 = 0;
      v1 = states[k][0] * 0.16;
      v2 = states[k][1] * 0.16;
      pending++;
      schedule();
    }
    var r = to - simT;
    x1 += v1 * r;
    x2 += v2 * r;
    simT = to;
  }

  function click() {
    if (!sound || !audio || !pending) return;
    pending = 0;
    var now = audio.currentTime;
    if (now - lastClick < 0.03) return;
    lastClick = now;
    var osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 1900;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  function phasePoint(i) {
    // Scaled speeds (√M·v big, √m·v small), on a circle of radius 1.
    var s = states[i], f = Math.sqrt(1 / Math.pow(100, power));
    return [geo.cx + s[1] * geo.R, geo.cy - s[0] * f * geo.R];
  }

  function frame(dt, st) {
    var W = st.width, H = st.height, ctx = st.ctx;
    if (!states) reset();

    if (playing) {
      advance(simT + dt * slow);
      if (k >= total) {
        done += dt;
        if (done > 4) reset();
      }
      click();
    } else if (!st.dirty) {
      return;
    }
    st.dirty = false;

    // Layout: the track on top, the phase circle below.
    var floorY = Math.round(H * 0.42), left = 20, track = W - left - 20;
    var R = Math.max(30, Math.min((H - floorY - 36) / 2, W / 2 - 40));
    var cx = W / 2, cy = floorY + 18 + R + (H - floorY - 36 - 2 * R) / 2;
    if (geo.R !== R || geo.cx !== cx || geo.cy !== cy || geo.dpr !== st.dpr) {
      geo = { R: R, cx: cx, cy: cy, size: 2 * R + 24, dpr: st.dpr };
      phase = phase || document.createElement('canvas');
      phase.width = phase.height = Math.ceil(geo.size * st.dpr);
      drawn = 0;
    }
    var ox = cx - geo.size / 2, oy = cy - geo.size / 2;

    ctx.clearRect(0, 0, W, H);

    // Wall and floor.
    ctx.fillStyle = 'rgba(236,232,223,0.08)';
    ctx.fillRect(0, floorY - 150, left, 150);
    ctx.strokeStyle = 'rgba(236,232,223,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left, floorY - 150);
    ctx.lineTo(left, floorY);
    ctx.lineTo(W, floorY);
    ctx.stroke();

    // Blocks: positions in track units, sizes grow with the mass.
    var s1 = W1 * track, s2 = bigWidth() * track;
    var bx1 = left + x1 * track, bx2 = left + x2 * track;
    ctx.fillStyle = '#ff5fa2';
    ctx.fillRect(bx1, floorY - s1, s1, s1);
    ctx.fillStyle = '#ffb454';
    ctx.fillRect(bx2, floorY - s2, s2, s2);
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#9b9daf';
    if (bx1 < W) ctx.fillText('1', bx1 + s1 / 2, floorY - s1 - 4);
    if (bx2 < W) ctx.fillText(RATIOS[power], Math.min(bx2 + s2 / 2, W - 50), floorY - s2 - 4);

    // The phase circle: every state lies on it.
    ctx.strokeStyle = 'rgba(236,232,223,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.moveTo(cx - R - 8, cy);
    ctx.lineTo(cx + R + 8, cy);
    ctx.moveTo(cx, cy - R - 8);
    ctx.lineTo(cx, cy + R + 8);
    ctx.stroke();

    // Every state is a dot on the circle. New dots go onto an offscreen copy,
    // so 31,415 of them cost nothing to redraw.
    var p, i;
    if (k >= drawn) {
      var pc = phase.getContext('2d');
      pc.setTransform(st.dpr, 0, 0, st.dpr, -ox * st.dpr, -oy * st.dpr);
      pc.fillStyle = 'rgba(255,95,162,0.9)';
      var dsz = power > 2 ? 1.6 : 3;
      for (i = drawn; i <= k; i++) {
        p = phasePoint(i);
        pc.fillRect(p[0] - dsz / 2, p[1] - dsz / 2, dsz, dsz);
      }
      drawn = k + 1;
    }
    ctx.drawImage(phase, ox, oy, geo.size, geo.size);

    // The last few jumps between states, fading out.
    ctx.lineWidth = 1.25;
    for (i = Math.max(1, k - 24); i <= k; i++) {
      var p0 = phasePoint(i - 1);
      p = phasePoint(i);
      ctx.strokeStyle = 'rgba(255,95,162,' + (0.15 + 0.8 * (1 - (k - i) / 25)) + ')';
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    }
    var cur = phasePoint(k);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cur[0], cur[1], 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#6f7286';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    ctx.fillText('big block →', cx + R + 8, cy + 6);
    ctx.textAlign = 'right';
    ctx.fillText('small block ↑', cx - 6, cy - R - 8);

    var digits = String(k);
    V.setText(readout, 'Clacks: ' + digits + (k >= total ? '' : '…') + '\n' +
      'Big block ' + RATIOS[power] + ' × the small one\n' +
      'π = ' + PI + '…');
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
    stage.dirty = true;
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'again').addEventListener('click', function () {
    setPlaying(true);
    reset();
  });

  V.segmented(V.ctl(section, 'ratio'), function (v) {
    power = parseInt(v, 10);
    states = null;
    reset();
    stage.dirty = true;
  });

  V.range(V.ctl(section, 'slow'), V.ctl(section, 'slow-out'),
    function (v) { return '×' + v; },
    function (v) { slow = v; });

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
