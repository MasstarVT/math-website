// Phyllotaxis: seed k sits at angle k·θ and radius ∝ √k, so every seed
// gets the same area. At the golden angle the seeds never line up.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('golden');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var angleInput = V.ctl(section, 'angle');
  var angleOut = V.ctl(section, 'angle-out');
  var presetGroup = V.ctl(section, 'preset');
  var sweepBtn = V.ctl(section, 'sweep');

  var GOLDEN = 180 * (3 - Math.sqrt(5));
  var angle = GOLDEN;
  var seeds = 1200;
  var colorMode = 'order';
  var sweeping = false;
  var sweepT = 0;

  function frame(dt, st) {
    if (sweeping) {
      // Drift slowly through the golden angle and back.
      sweepT += dt;
      setAngle(GOLDEN + 2.6 * Math.sin(sweepT * 0.12), false);
    }
    if (!st.dirty) return;
    st.dirty = false;

    var ctx = st.ctx;
    var W = st.width, H = st.height;
    ctx.clearRect(0, 0, W, H);

    var R = Math.min(W, H) * 0.46;
    var c = R / Math.sqrt(seeds);
    var dot = Math.max(1, c * 0.47);
    var step = angle * Math.PI / 180;
    var cx = W / 2, cy = H / 2;
    var mod = colorMode === 'order' ? 0 : +colorMode;

    for (var k = 1; k <= seeds; k++) {
      var r = c * Math.sqrt(k);
      var a = k * step;
      var t = mod ? (k % mod) / mod : k / seeds;
      ctx.fillStyle = mod ? 'hsl(' + Math.round(t * 360) + ',80%,64%)' : V.gradient(V.SPECTRUM, t);
      ctx.beginPath();
      ctx.arc(cx + r * Math.cos(a), cy + r * Math.sin(a), dot * (0.75 + 0.35 * Math.sqrt(k / seeds)), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function setAngle(a, fromInput) {
    angle = a;
    if (!fromInput) angleInput.value = a.toFixed(2);
    angleOut.textContent = a.toFixed(3) + '°';
    stage.dirty = true;
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  angleInput.addEventListener('input', function () {
    setSweeping(false);
    V.setSegmented(presetGroup, '');
    setAngle(parseFloat(angleInput.value), true);
  });
  setAngle(angle, false);

  V.segmented(presetGroup, function (v) {
    setSweeping(false);
    setAngle(v === 'golden' ? GOLDEN : parseFloat(v), false);
  });

  V.range(V.ctl(section, 'seeds'), V.ctl(section, 'seeds-out'),
    function (v) { return v.toLocaleString(); },
    function (v) { seeds = v; stage.dirty = true; });

  V.segmented(V.ctl(section, 'color'), function (m) {
    colorMode = m;
    stage.dirty = true;
  });

  function setSweeping(on) {
    if (on && !sweeping) sweepT = Math.asin(Math.max(-1, Math.min(1, (angle - GOLDEN) / 2.6))) / 0.12;
    sweeping = on;
    sweepBtn.setAttribute('aria-pressed', String(on));
    if (on) V.setSegmented(presetGroup, '');
  }
  V.toggle(sweepBtn, setSweeping);
})();
