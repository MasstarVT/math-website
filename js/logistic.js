// The logistic map x → r·x·(1 − x). For each r along the bottom, iterate
// until the transient dies away and plot every value x keeps visiting.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('logistic');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var rInput = V.ctl(section, 'r');
  var rOut = V.ctl(section, 'r-out');
  var presetGroup = V.ctl(section, 'preset');
  var sweepBtn = V.ctl(section, 'sweep');

  var VIEWS = {
    whole: { r0: 2.5, r1: 4, x0: 0, x1: 1, iter: 1200 },
    doubling: { r0: 3.4, r1: 3.6, x0: 0.3, x1: 0.92, iter: 2400 },
    three: { r0: 3.84, r1: 3.858, x0: 0.44, x1: 0.56, iter: 6000 }
  };
  // Density to color: dim violet through amber to white.
  var LUT = [];
  for (var k = 0; k < 256; k++) {
    var s = V.gradient([[70, 60, 150], [167, 139, 250], [255, 95, 162], [255, 209, 102], [255, 250, 235]], k / 255);
    LUT.push(s.slice(4, -1).split(',').map(Number));
  }

  var view = VIEWS.whole;
  var r = 3.2;
  var cycle = 0;       // detected period at r, 0 when none
  var series = [];     // recent values of x at r, for the strip below
  var x = 0.2;
  var tick = 0;
  var sweeping = false;
  var sweepT = 0;
  var layer = document.createElement('canvas');
  var lctx = layer.getContext('2d');
  var drawn = null;    // the view the layer currently holds
  var D = null, T = null;

  function layout(W, H) {
    var left = 40, right = 14;
    var dh = Math.round((H - 56) * 0.68);
    D = { x: left, y: 14, w: W - left - right, h: dh };
    T = { x: left, y: D.y + dh + 44, w: W - left - right, h: H - (D.y + dh + 44) - 14 };
  }

  function renderDiagram(st) {
    var pw = Math.max(1, Math.round(D.w * st.dpr)), ph = Math.max(1, Math.round(D.h * st.dpr));
    layer.width = pw;
    layer.height = ph;
    var counts = new Uint16Array(pw * ph);
    var v = view, max = 0;
    for (var px = 0; px < pw; px++) {
      var rr = v.r0 + (px + 0.5) / pw * (v.r1 - v.r0);
      var xx = 0.5;
      for (var i = 0; i < 600; i++) xx = rr * xx * (1 - xx);
      for (i = 0; i < v.iter; i++) {
        xx = rr * xx * (1 - xx);
        var py = Math.floor((v.x1 - xx) / (v.x1 - v.x0) * ph);
        if (py < 0 || py >= ph) continue;
        var o = py * pw + px;
        if (counts[o] < 65535) counts[o]++;
        if (counts[o] > max) max = counts[o];
      }
    }
    var img = lctx.createImageData(pw, ph), d = img.data;
    var norm = Math.log(1 + Math.min(max, v.iter / 8));
    for (var j = 0; j < counts.length; j++) {
      if (!counts[j]) continue;
      var t = Math.min(1, Math.log(1 + counts[j]) / norm);
      var c = LUT[Math.round(t * 255)];
      d[j * 4] = c[0]; d[j * 4 + 1] = c[1]; d[j * 4 + 2] = c[2];
      d[j * 4 + 3] = Math.round(90 + 165 * t);
    }
    lctx.putImageData(img, 0, 0);
    drawn = view;
  }

  function findCycle(rr) {
    var xx = 0.2;
    for (var i = 0; i < 6000; i++) xx = rr * xx * (1 - xx);
    var start = xx;
    for (var p = 1; p <= 64; p++) {
      xx = rr * xx * (1 - xx);
      if (Math.abs(xx - start) < 1e-7) return p;
    }
    return 0;
  }

  function setR(v, fromInput) {
    r = Math.max(2.5, Math.min(4, v));
    if (!fromInput) rInput.value = r;
    rOut.textContent = r.toFixed(4);
    cycle = findCycle(r);
    x = 0.2;
    series = [x];
    tick = 0;
    stage.dirty = true;
  }

  function frame(dt, st) {
    if (sweeping) {
      sweepT += dt;
      var mid = (view.r0 + view.r1) / 2, half = (view.r1 - view.r0) / 2;
      setR(mid - half * 0.98 * Math.cos(sweepT * 0.18), false);
    }
    // Add a new value to the strip a few times a second.
    tick += dt;
    if (tick > 0.12) {
      tick = 0;
      x = r * x * (1 - x);
      series.push(x);
      if (series.length > 64) series.shift();
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;

    var W = st.width, H = st.height, ctx = st.ctx;
    layout(W, H);
    if (drawn !== view || layer.width !== Math.max(1, Math.round(D.w * st.dpr)) ||
        layer.height !== Math.max(1, Math.round(D.h * st.dpr))) renderDiagram(st);

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(layer, D.x, D.y, D.w, D.h);

    // Axes and labels.
    ctx.strokeStyle = 'rgba(236,232,223,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(D.x + 0.5, D.y + 0.5, D.w - 1, D.h - 1);
    ctx.strokeRect(T.x + 0.5, T.y + 0.5, T.w - 1, T.h - 1);
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#6f7286';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmt(view.x1), D.x - 6, D.y + 6);
    ctx.fillText(fmt(view.x0), D.x - 6, D.y + D.h - 6);
    ctx.fillText('1', T.x - 6, T.y + 6);
    ctx.fillText('0', T.x - 6, T.y + T.h - 6);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('r = ' + view.r0, D.x, D.y + D.h + 6);
    ctx.textAlign = 'right';
    ctx.fillText(String(view.r1), D.x + D.w, D.y + D.h + 6);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('x, one step at a time', T.x + 6, T.y - 4);

    // The current r.
    if (r >= view.r0 && r <= view.r1) {
      var mx = D.x + (r - view.r0) / (view.r1 - view.r0) * D.w;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(Math.round(mx) + 0.5, D.y);
      ctx.lineTo(Math.round(mx) + 0.5, D.y + D.h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(mx, D.y + D.h, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // The strip: x after each step at the current r.
    var n = series.length, dx = T.w / 63;
    ctx.strokeStyle = 'rgba(167,139,250,0.55)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var sx = T.x + T.w - (n - 1 - i) * dx, sy = T.y + T.h - series[i] * T.h;
      if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
    }
    ctx.stroke();
    ctx.fillStyle = '#a78bfa';
    for (i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(T.x + T.w - (n - 1 - i) * dx, T.y + T.h - series[i] * T.h, i === n - 1 ? 4 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // A single settled value solves x = r·x·(1 − x), so it's 1 − 1/r.
    var line2 = cycle === 1 ? 'Settles on one value: ' + (1 - 1 / r).toFixed(4)
      : cycle ? 'Settles into a cycle of ' + cycle
      : 'Never repeats: chaos';
    V.setText(readout, 'r = ' + r.toFixed(4) + '\n' + line2);
  }

  function fmt(v) { return String(Math.round(v * 100) / 100); }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Pointer: drag the marker or click the diagram to pick r ----

  function rAt(px) {
    return view.r0 + (px - D.x) / D.w * (view.r1 - view.r0);
  }

  function inDiagram(px, py) {
    return D && px >= D.x && px <= D.x + D.w && py >= D.y && py <= D.y + D.h + 8;
  }

  V.drag(canvas, {
    cursor: 'ew-resize',
    hit: function (px, py) {
      if (!inDiagram(px, py)) return null;
      var mx = D.x + (r - view.r0) / (view.r1 - view.r0) * D.w;
      return Math.abs(px - mx) < 14 ? {} : null;
    },
    move: function (h, px) {
      setSweeping(false);
      V.setSegmented(presetGroup, '');
      setR(rAt(Math.max(D.x, Math.min(D.x + D.w, px))), false);
    }
  });

  canvas.addEventListener('click', function (e) {
    var b = canvas.getBoundingClientRect(), px = e.clientX - b.left, py = e.clientY - b.top;
    if (!inDiagram(px, py)) return;
    setSweeping(false);
    V.setSegmented(presetGroup, '');
    setR(rAt(px), false);
  });

  // ---- Controls ----

  rInput.addEventListener('input', function () {
    setSweeping(false);
    V.setSegmented(presetGroup, '');
    setR(parseFloat(rInput.value), true);
  });
  setR(r, false);

  V.segmented(presetGroup, function (v) {
    setSweeping(false);
    setR(parseFloat(v), false);
  });

  V.segmented(V.ctl(section, 'view'), function (v) {
    view = VIEWS[v];
    if (r < view.r0 || r > view.r1) setR((view.r0 + view.r1) / 2, false);
    V.setSegmented(presetGroup, '');
    stage.dirty = true;
  });

  function setSweeping(on) {
    if (on && !sweeping) {
      var mid = (view.r0 + view.r1) / 2, half = (view.r1 - view.r0) / 2 * 0.98;
      sweepT = Math.acos(Math.max(-1, Math.min(1, (mid - r) / half))) / 0.18;
      V.setSegmented(presetGroup, '');
    }
    sweeping = on;
    sweepBtn.setAttribute('aria-pressed', String(on));
  }
  V.toggle(sweepBtn, setSweeping);
})();
