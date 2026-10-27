// Bayes' theorem with natural frequencies: P(sick | positive) =
// P(positive | sick) P(sick) / P(positive). A rare illness means most positives are false alarms.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('bayes');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var testBtn = V.ctl(section, 'test');
  var againBtn = V.ctl(section, 'again');

  var N = 1000;
  var SICK = '#ff5fa2';
  var WELL = 'rgba(155,157,175,0.55)';

  var base = 0.01, sens = 0.9, fpr = 0.09;
  var stage = 0;             // 0 everyone, 1 sorted by the test, 2 positives tested again
  var autoSort = !V.reducedMotion;
  var waited = 0;
  var sick = new Uint8Array(N), pos = new Uint8Array(N), pos2 = new Uint8Array(N);
  var px = new Float32Array(N), py = new Float32Array(N), tx = new Float32Array(N), ty = new Float32Array(N);
  var pace = new Float32Array(N);
  var orderSick = [], orderTest = [], orderRetest = [], orderGrid = [];
  var placed = false, moving = true;
  var counts = {};

  // Fixed random orders, so moving a slider only changes a few people.
  function shuffled() {
    var a = [];
    for (var i = 0; i < N; i++) a.push(i);
    for (i = N - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }
  orderSick = shuffled();
  orderTest = shuffled();
  orderRetest = shuffled();
  orderGrid = shuffled();      // each person's seat in the crowd
  for (var q = 0; q < N; q++) pace[q] = 3.5 + Math.random() * 4;

  function assign() {
    var S = Math.round(N * base), i, k;
    var TP = Math.round(S * sens), FP = Math.round((N - S) * fpr);
    sick.fill(0);
    pos.fill(0);
    pos2.fill(0);
    for (i = 0; i < S; i++) sick[orderSick[i]] = 1;
    var tp = 0, fp = 0;
    for (i = 0; i < N; i++) {
      k = orderTest[i];
      if (sick[k] && tp < TP) { pos[k] = 1; tp++; }
      else if (!sick[k] && fp < FP) { pos[k] = 1; fp++; }
    }
    var TP2 = Math.round(TP * sens), FP2 = Math.round(FP * fpr), tp2 = 0, fp2 = 0;
    for (i = 0; i < N; i++) {
      k = orderRetest[i];
      if (!pos[k]) continue;
      if (sick[k] && tp2 < TP2) { pos2[k] = 1; tp2++; }
      else if (!sick[k] && fp2 < FP2) { pos2[k] = 1; fp2++; }
    }
    counts = { S: S, TP: TP, FP: FP, TP2: TP2, FP2: FP2 };
    moving = true;
  }

  function posterior(prior) {
    var d = prior * sens + (1 - prior) * fpr;
    return d > 0 ? prior * sens / d : NaN;
  }

  function layout(st) {
    var W = st.width, H = st.height, narrow = W < 480;
    var top = narrow ? 84 : 100, bottom = H - (narrow ? 14 : 20);
    var split = Math.round(W * (narrow ? 0.6 : 0.6));
    return {
      W: W, H: H, top: top, bottom: bottom, narrow: narrow,
      lx: 16, lw: split - 30, rx: split, rw: W - split - 16
    };
  }

  // Lay n dots out in a box, as big as fit, capped so small groups stay tidy.
  function grid(n, x, y, w, h, cap) {
    var best = 0, cols = 1;
    for (var c = 1; c <= Math.max(1, n); c++) {
      var s = Math.min(w / c, h / Math.ceil(Math.max(1, n) / c));
      if (s > best) {
        best = s;
        cols = c;
      }
    }
    var cell = Math.min(best, cap);
    return { x: x, y: y, cols: cols, cell: cell };
  }

  function place(L) {
    var inRight = [], i, k;
    var lh = L.bottom - L.top, resultH = L.narrow ? 58 : 76;
    var gl = grid(N, L.lx, L.top, L.lw, lh, 26);
    // Everyone keeps a seat on the left; the ones who move right leave a gap.
    for (i = 0; i < N; i++) {
      k = orderGrid[i];
      var right = stage === 1 ? pos[k] : stage === 2 ? pos2[k] : 0;
      if (right) {
        inRight.push(k);
      } else {
        tx[k] = gl.x + (i % gl.cols + 0.5) * gl.cell;
        ty[k] = gl.y + (Math.floor(i / gl.cols) + 0.5) * gl.cell;
      }
    }
    // Sick people first on the right, so they're easy to count.
    inRight.sort(function (a, b) { return sick[b] - sick[a]; });
    var gr = grid(inRight.length, L.rx, L.top, L.rw, lh - resultH, 16);
    inRight.forEach(function (k, j) {
      tx[k] = gr.x + (j % gr.cols + 0.5) * gr.cell;
      ty[k] = gr.y + (Math.floor(j / gr.cols) + 0.5) * gr.cell;
    });
    if (!placed) {
      px.set(tx);
      py.set(ty);
      placed = true;
    }
    return { left: gl, right: gr };
  }

  function frame(dt, st) {
    if (autoSort && stage === 0) {
      waited += dt;
      if (waited > 1.4) {
        autoSort = false;
        setStage(1);
      }
    }
    if (!moving && !st.dirty) return;
    st.dirty = false;
    var L = layout(st), G = place(L);
    var still = true;
    for (var i = 0; i < N; i++) {
      var k = V.reducedMotion ? 1 : 1 - Math.exp(-dt * pace[i]);
      px[i] += (tx[i] - px[i]) * k;
      py[i] += (ty[i] - py[i]) * k;
      if (Math.abs(tx[i] - px[i]) > 0.2 || Math.abs(ty[i] - py[i]) > 0.2) still = false;
    }
    moving = !still;
    draw(st, L, G);
  }

  function draw(st, L, G) {
    var ctx = st.ctx, i;
    ctx.clearRect(0, 0, L.W, L.H);
    var rl = Math.max(1.2, Math.min(G.left.cell, 14) * 0.34);
    var rr = Math.max(1.2, G.right.cell * 0.34);

    // Healthy first, sick on top, then rings for positive tests.
    for (var pass = 0; pass < 2; pass++) {
      ctx.fillStyle = pass ? SICK : WELL;
      ctx.beginPath();
      for (i = 0; i < N; i++) {
        if (sick[i] !== pass) continue;
        var r = px[i] > L.rx - 8 ? rr : rl;
        ctx.moveTo(px[i] + r, py[i]);
        ctx.arc(px[i], py[i], r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (i = 0; i < N; i++) {
      var shown = stage === 2 ? pos2[i] : pos[i];
      if (!shown) continue;
      var rad = (px[i] > L.rx - 8 ? rr : rl) + 1.6;
      ctx.moveTo(px[i] + rad, py[i]);
      ctx.arc(px[i], py[i], rad, 0, Math.PI * 2);
    }
    ctx.stroke();

    // Panel titles.
    var c = counts;
    var nPos = stage === 2 ? c.TP2 + c.FP2 : c.TP + c.FP;
    var nSickPos = stage === 2 ? c.TP2 : c.TP;
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9b9daf';
    ctx.fillText(stage === 0 ? N.toLocaleString() + ' people, ' + c.S + ' sick' :
      'Everyone else: ' + (N - nPos).toLocaleString(), L.lx, L.top - 10);
    ctx.fillText(stage === 0 ? 'Not sorted yet' :
      stage === 1 ? 'Tested positive: ' + nPos : 'Positive twice: ' + nPos, L.rx, L.top - 10);

    // The answer, counted and exact.
    var exact = stage === 2 ? posterior(posterior(base)) : posterior(base);
    var y = L.bottom - (L.narrow ? 46 : 60);
    ctx.fillStyle = '#ece8df';
    ctx.textBaseline = 'top';
    if (stage === 0) {
      ctx.fillStyle = '#6f7286';
      ctx.fillText(c.S + ' sick: ' + c.TP + ' test positive', L.rx, y);
      ctx.fillText((N - c.S) + ' healthy: ' + c.FP + ' do too', L.rx, y + 16);
    } else {
      ctx.fillText(nSickPos + ' of ' + nPos + ' are sick', L.rx, y);
      ctx.fillStyle = SICK;
      ctx.font = '500 ' + (L.narrow ? 20 : 26) + 'px "IBM Plex Mono", monospace';
      ctx.fillText(isNaN(exact) ? '–' : (exact * 100).toFixed(exact < 0.1 ? 1 : 0) + '%', L.rx, y + (L.narrow ? 16 : 20));
    }

    V.setText(readout, stage === 0 ? 'Everyone takes the test' :
      'Chance you\'re sick after ' + (stage === 2 ? 'two positives' : 'a positive') + '\n' +
      (isNaN(exact) ? 'nobody tests positive' : 'exactly ' + (exact * 100).toFixed(1) + '%'));
  }

  // ---- Controls ----

  function setStage(s) {
    stage = s;
    testBtn.textContent = stage ? 'Mix back in' : 'Sort by result';
    againBtn.textContent = stage === 2 ? 'Back to one test' : 'Test positives again';
    moving = true;
  }

  testBtn.addEventListener('click', function () {
    autoSort = false;
    setStage(stage ? 0 : 1);
  });

  againBtn.addEventListener('click', function () {
    autoSort = false;
    setStage(stage === 2 ? 1 : 2);
  });

  assign();
  V.createStage(canvas, { frame: frame, resize: function () { moving = true; } });

  V.range(V.ctl(section, 'base'), V.ctl(section, 'base-out'),
    function (v) {
      var b = Math.min(0.5, Math.pow(10, v / 100));
      var pct = b >= 0.1 ? (b * 100).toFixed(0) : b >= 0.01 ? (b * 100).toFixed(1) : (b * 100).toFixed(2);
      return pct + '% (1 in ' + Math.round(1 / b).toLocaleString() + ')';
    },
    function (v) {
      base = Math.min(0.5, Math.pow(10, v / 100));
      assign();
    });

  V.range(V.ctl(section, 'sens'), V.ctl(section, 'sens-out'),
    function (v) { return Math.round(v * 100) + '%'; },
    function (v) {
      sens = v;
      assign();
    });

  V.range(V.ctl(section, 'fpr'), V.ctl(section, 'fpr-out'),
    function (v) { return (v * 100).toFixed(1) + '%'; },
    function (v) {
      fpr = v;
      assign();
    });

})();
