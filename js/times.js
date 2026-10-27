// Modular times tables: n points on a circle, a chord from k to m·k (mod n).
// With a non-whole m the chord ends between points, so curves morph smoothly.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('times');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var multInput = V.ctl(section, 'mult');
  var multOut = V.ctl(section, 'mult-out');
  var presetGroup = V.ctl(section, 'preset');
  var animBtn = V.ctl(section, 'animate');

  var points = 200;
  var mult = 2;
  var animating = !V.reducedMotion;
  var MAX_MULT = 100;

  function frame(dt, st) {
    if (animating) {
      // Stop at the end rather than jumping back to the start.
      var m = mult + dt * 0.18;
      if (m >= MAX_MULT) {
        m = MAX_MULT;
        setAnimating(false);
      }
      setMult(m);
    }
    if (!st.dirty) return;
    st.dirty = false;

    var ctx = st.ctx;
    var W = st.width, H = st.height;
    var cx = W / 2, cy = H / 2;
    var R = Math.min(W, H) * 0.44;
    var TAU = Math.PI * 2;
    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(236,232,223,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max(0.6, Math.min(1.4, 260 / points));
    var alpha = Math.max(0.25, Math.min(0.85, 120 / points));
    var bands = 48;
    var per = Math.ceil(points / bands);
    // Batch chords into color bands so we don't stroke each one separately.
    for (var b = 0; b * per < points; b++) {
      ctx.strokeStyle = V.gradient(V.SPECTRUM, b / (bands - 1));
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      for (var k = b * per; k < Math.min((b + 1) * per, points); k++) {
        var a1 = Math.PI + TAU * k / points;
        var a2 = Math.PI + TAU * ((k * mult) % points) / points;
        ctx.moveTo(cx + R * Math.cos(a1), cy + R * Math.sin(a1));
        ctx.lineTo(cx + R * Math.cos(a2), cy + R * Math.sin(a2));
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (points <= 120) {
      ctx.fillStyle = 'rgba(236,232,223,0.7)';
      for (k = 0; k < points; k++) {
        var a = Math.PI + TAU * k / points;
        ctx.beginPath();
        ctx.arc(cx + R * Math.cos(a), cy + R * Math.sin(a), 1.8, 0, TAU);
        ctx.fill();
      }
    }
  }

  function setMult(m, fromInput) {
    mult = m;
    if (!fromInput) multInput.value = m.toFixed(2);
    multOut.textContent = '×' + m.toFixed(2);
    stage.dirty = true;
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setAnimating(on) {
    animating = on;
    animBtn.setAttribute('aria-pressed', String(on));
  }
  setAnimating(animating);
  V.toggle(animBtn, function (on) {
    if (on && mult >= MAX_MULT) setMult(0);
    setAnimating(on);
  });

  // Step to the neighbouring whole-number multiplier.
  function stepWhole(d) {
    setAnimating(false);
    V.setSegmented(presetGroup, '');
    var m = d > 0 ? Math.floor(mult + 1e-6) + 1 : Math.ceil(mult - 1e-6) - 1;
    setMult(Math.max(0, Math.min(MAX_MULT, m)));
  }
  V.ctl(section, 'prev').addEventListener('click', function () { stepWhole(-1); });
  V.ctl(section, 'next').addEventListener('click', function () { stepWhole(1); });

  multInput.addEventListener('input', function () {
    setAnimating(false);
    V.setSegmented(presetGroup, '');
    setMult(parseFloat(multInput.value), true);
  });
  setMult(mult, false);

  V.segmented(presetGroup, function (v) {
    setAnimating(false);
    setMult(parseFloat(v), false);
  });

  V.range(V.ctl(section, 'points'), V.ctl(section, 'points-out'),
    function (v) { return String(v); },
    function (v) { points = v; stage.dirty = true; });
})();
