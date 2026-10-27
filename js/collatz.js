// Collatz paths: halve an even number, triple an odd one and add 1. Each
// number's path is drawn backwards from 1, bending one way on every even
// step and the other way on every odd one, so shared endings merge.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('collatz');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var followGroup = V.ctl(section, 'follow');

  var count = 5000;
  var evenTurn = 8 * Math.PI / 180;
  var oddTurn = 16 * Math.PI / 180;
  var follow = 27;

  // The tree: one node per number reached. Node 0 is the number 1.
  var X, Y, A, P, depth, index, starts, box, maxSteps;
  var traced = null;
  var layer = document.createElement('canvas');
  var lctx = layer.getContext('2d');
  var shown = 0;   // numbers revealed so far
  var painted = 0; // numbers already on the layer
  var view = null;

  function nextOf(m) { return m % 2 ? 3 * m + 1 : m / 2; }

  function build() {
    X = [0]; Y = [0]; A = [-Math.PI / 2]; P = [-1];
    index = new Map([[1, 0]]);
    starts = [];
    box = { x0: -1, x1: 1, y0: -1, y1: 1 };
    maxSteps = 1;
    depth = [0];
    for (var n = 2; n <= count; n++) {
      var chain = [], m = n;
      while (!index.has(m)) { chain.push(m); m = nextOf(m); }
      var p = index.get(m);
      for (var k = chain.length - 1; k >= 0; k--) {
        var v = chain[k], a = A[p] + (v % 2 ? -oddTurn : evenTurn);
        var id = X.length;
        X.push(X[p] + Math.cos(a));
        Y.push(Y[p] + Math.sin(a));
        A.push(a);
        P.push(p);
        depth.push(depth[p] + 1);
        index.set(v, id);
        if (X[id] < box.x0) box.x0 = X[id];
        if (X[id] > box.x1) box.x1 = X[id];
        if (Y[id] < box.y0) box.y0 = Y[id];
        if (Y[id] > box.y1) box.y1 = Y[id];
        p = id;
      }
      starts.push(index.get(n));
      if (depth[index.get(n)] > maxSteps) maxSteps = depth[index.get(n)];
    }
    shown = Math.min(shown, starts.length);
    painted = 0;
    traced = null;
  }

  // The path of any number, even one outside the tree, as screen points.
  function trace(n) {
    var chain = [], m = n, steps = 0, peak = n;
    while (!index.has(m)) { chain.push(m); m = nextOf(m); if (m > peak) peak = m; }
    var pts = [], id = index.get(m);
    while (id >= 0) { pts.unshift([X[id], Y[id]]); id = P[id]; }
    var a = A[index.get(m)], px = X[index.get(m)], py = Y[index.get(m)];
    for (var k = chain.length - 1; k >= 0; k--) {
      a += chain[k] % 2 ? -oddTurn : evenTurn;
      px += Math.cos(a);
      py += Math.sin(a);
      pts.push([px, py]);
    }
    // Count steps and the peak directly, so they don't depend on the drawing.
    m = n;
    while (m !== 1) { m = nextOf(m); steps++; if (m > peak) peak = m; }
    return { n: n, pts: pts, steps: steps, peak: peak };
  }

  function fit(W, H) {
    var pad = 18;
    var s = Math.min((W - pad * 2) / (box.x1 - box.x0), (H - pad * 2) / (box.y1 - box.y0));
    return {
      s: s,
      ox: W / 2 - (box.x0 + box.x1) / 2 * s,
      oy: H / 2 - (box.y0 + box.y1) / 2 * s
    };
  }

  function paintPath(id, f) {
    lctx.strokeStyle = V.gradient(V.SPECTRUM, depth[id] / maxSteps);
    lctx.beginPath();
    lctx.moveTo(f.ox + X[id] * f.s, f.oy + Y[id] * f.s);
    while (P[id] >= 0) {
      id = P[id];
      lctx.lineTo(f.ox + X[id] * f.s, f.oy + Y[id] * f.s);
    }
    lctx.stroke();
  }

  function frame(dt, st) {
    var W = st.width, H = st.height, ctx = st.ctx;
    if (layer.width !== st.canvas.width || layer.height !== st.canvas.height) {
      layer.width = st.canvas.width;
      layer.height = st.canvas.height;
      painted = 0;
    }
    if (painted === 0) {
      view = fit(W, H);
      lctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      lctx.clearRect(0, 0, W, H);
    }

    var rate = V.reducedMotion ? starts.length : Math.max(8, starts.length / 240);
    shown = Math.min(starts.length, shown + rate);
    var target = Math.floor(shown);
    if (painted < target) {
      lctx.globalCompositeOperation = 'lighter';
      lctx.globalAlpha = Math.max(0.05, Math.min(0.5, 60 / Math.sqrt(count)) * 0.35);
      lctx.lineWidth = 1;
      // Catch up quickly after a resize, without stalling a frame.
      var end = Math.min(target, painted + 1500);
      for (var i = painted; i < end; i++) paintPath(starts[i], view);
      painted = end;
      lctx.globalAlpha = 1;
      lctx.globalCompositeOperation = 'source-over';
    }

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(layer, 0, 0, W, H);

    if (!traced || traced.n !== follow) traced = trace(follow);
    var pts = traced.pts;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var k = 0; k < pts.length; k++) {
      var px = view.ox + pts[k][0] * view.s, py = view.oy + pts[k][1] * view.s;
      if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
    var end2 = pts[pts.length - 1];
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(view.ox + end2[0] * view.s, view.oy + end2[1] * view.s, 4, 0, Math.PI * 2);
    ctx.fill();

    V.setText(readout,
      'Numbers 1 to ' + (target + 1).toLocaleString() + '\n' +
      follow.toLocaleString() + ' takes ' + traced.steps + ' steps, peaks at ' + traced.peak.toLocaleString());
  }

  build();
  var stage = V.createStage(canvas, { frame: frame });

  function rebuild() {
    build();
    shown = starts.length;
    painted = 0;
  }

  // ---- Controls ----

  V.range(V.ctl(section, 'count'), V.ctl(section, 'count-out'),
    function (v) { return v.toLocaleString(); },
    function (v) {
      if (v === count) return;
      count = v;
      rebuild();
    });

  V.range(V.ctl(section, 'even'), V.ctl(section, 'even-out'),
    function (v) { return v.toFixed(1) + '°'; },
    function (v) {
      if (Math.abs(v * Math.PI / 180 - evenTurn) < 1e-9) return;
      evenTurn = v * Math.PI / 180;
      rebuild();
    });

  V.range(V.ctl(section, 'odd'), V.ctl(section, 'odd-out'),
    function (v) { return v.toFixed(1) + '°'; },
    function (v) {
      if (Math.abs(v * Math.PI / 180 - oddTurn) < 1e-9) return;
      oddTurn = v * Math.PI / 180;
      rebuild();
    });

  V.segmented(followGroup, function (v) { follow = parseInt(v, 10); });

  V.ctl(section, 'regrow').addEventListener('click', function () {
    shown = 0;
    painted = 0;
  });

  shown = 0;
})();
