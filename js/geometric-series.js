// Geometric series: each piece is r times the one before. Cutting a share
// 1 − r off whatever is left fills the square, so (1 − r)(1 + r + r² + …) = 1,
// which is 1 + r + r² + … = 1/(1 − r). Zeno's race is the same sum in disguise.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('geometric-series');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var picGroup = V.ctl(section, 'pic');
  var ratioInput = V.ctl(section, 'ratio');
  var ratioOut = V.ctl(section, 'ratio-out');
  var playBtn = V.ctl(section, 'play');
  var zenoBtn = V.ctl(section, 'zeno');

  var PIECE_TIME = 0.6;
  var MAX_PIECES = 16;
  var TRI_LEVELS = 8;
  var TRI_COLORS = ['110,231,255', '255,95,162', '255,180,84'];

  var pic = 'square';
  var r = 0.5;
  var zeno = false;
  var playing = !V.reducedMotion;
  var t = 0;  // animation clock for the current picture

  function gcd(a, b) { return b ? gcd(b, a % b) : a; }

  // r as p/q with a small q, so pieces can be labeled as fractions.
  function asFraction(v) {
    for (var q = 2; q <= 10; q++) {
      var p = Math.round(v * q);
      if (p > 0 && p < q && Math.abs(v - p / q) < 1e-6 && gcd(p, q) === 1) return [p, q];
    }
    return null;
  }

  // The area of piece k, (1 − r)·r^k, as a short label.
  function pieceLabel(k) {
    var f = asFraction(r);
    if (f) {
      var num = (f[1] - f[0]) * Math.pow(f[0], k), den = Math.pow(f[1], k + 1);
      if (den <= 999) return num + '/' + den;
    }
    var v = (1 - r) * Math.pow(r, k);
    return v >= 0.01 ? v.toFixed(v >= 0.1 ? 2 : 3) : '';
  }

  function rText(v) {
    var f = asFraction(v);
    return f ? f[0] + '/' + f[1] : v.toFixed(2);
  }

  function count() {
    // Pieces shown so far, fractional while the newest one fades in.
    var n = pic === 'triangle' ? TRI_LEVELS : MAX_PIECES;
    return playing || t > 0 ? Math.min(n, t / PIECE_TIME) : n;
  }

  function frame(dt, st) {
    if (playing) {
      t += dt;
      var end = pic === 'achilles' ? raceLength() : (pic === 'triangle' ? TRI_LEVELS : MAX_PIECES) * PIECE_TIME;
      if (t > end + 2.2) t = 0;
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;
    var ctx = st.ctx;
    ctx.clearRect(0, 0, st.width, st.height);
    if (pic === 'square') drawSquare(ctx, st.width, st.height);
    else if (pic === 'triangle') drawTriangles(ctx, st.width, st.height);
    else drawRace(ctx, st.width, st.height);
  }

  // ---- The square ----

  function drawSquare(ctx, W, H) {
    var side = Math.min(H - 104, W - 40);
    var x0 = (W - side) / 2, y0 = 84 + (H - 104 - side) / 2;
    var c = count(), shown = Math.ceil(c);
    var rx = x0, ry = y0, rw = side, rh = side;

    ctx.strokeStyle = 'rgba(236,232,223,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, side - 1, side - 1);

    for (var k = 0; k < shown; k++) {
      var p;
      if (k % 2 === 0) {
        var pw = rw * (1 - r);
        p = [rx, ry, pw, rh];
        rx += pw;
        rw -= pw;
      } else {
        var ph = rh * (1 - r);
        p = [rx, ry, rw, ph];
        ry += ph;
        rh -= ph;
      }
      var a = Math.min(1, c - k);
      ctx.globalAlpha = a;
      ctx.fillStyle = V.gradient(V.SPECTRUM, k / 11);
      ctx.fillRect(p[0], p[1], p[2], p[3]);
      ctx.strokeStyle = '#0d0f16';
      ctx.lineWidth = Math.min(2, p[2] / 6, p[3] / 6);
      ctx.strokeRect(p[0], p[1], p[2], p[3]);
      var small = Math.min(p[2], p[3]);
      var size = Math.min(22, small * 0.28);
      var label = size >= 10 ? pieceLabel(k) : '';
      if (label && label.length * size * 0.62 < p[2] - 6) {
        ctx.fillStyle = 'rgba(10,11,16,0.85)';
        ctx.font = '500 ' + Math.round(size) + 'px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, p[0] + p[2] / 2, p[1] + p[3] / 2);
      }
      ctx.globalAlpha = 1;
    }

    var whole = Math.floor(c + 1e-9);
    var lead = [];
    for (k = 0; k < Math.min(3, whole); k++) lead.push(pieceLabel(k) || ((1 - r) * Math.pow(r, k)).toPrecision(2));
    V.setText(readout,
      (whole ? lead.join(' + ') + (whole > 3 ? ' + …' : '') + '  (' + whole + (whole === 1 ? ' piece)' : ' pieces)') : 'Cutting the square…') + '\n' +
      '= ' + (1 - Math.pow(r, whole)).toFixed(6) + ', closing in on 1\n' +
      'So 1 + r + r² + … = 1/(1 − r) = ' + (1 / (1 - r)).toFixed(3));
  }

  // ---- The triangles ----

  function drawTriangles(ctx, W, H) {
    var side = Math.min(W - 40, (H - 96) * 2 / Math.sqrt(3));
    var h = side * Math.sqrt(3) / 2;
    var cx = W / 2, top = 74 + (H - 96 - h) / 2;
    var A = [cx, top], B = [cx - side / 2, top + h], C = [cx + side / 2, top + h];
    var c = count();

    function tri(p, q, s) {
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(q[0], q[1]);
      ctx.lineTo(s[0], s[1]);
      ctx.closePath();
    }
    function mid(p, q) { return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; }

    tri(A, B, C);
    ctx.strokeStyle = 'rgba(236,232,223,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    for (var k = 0; k < Math.ceil(c); k++) {
      var ab = mid(A, B), ac = mid(A, C), bc = mid(B, C);
      var parts = [[ab, B, bc], [ac, bc, C], [ab, bc, ac]];
      ctx.globalAlpha = Math.min(1, c - k);
      var size = Math.min(18, (B[1] - ab[1]) * 0.3);
      for (var j = 0; j < 3; j++) {
        var P = parts[j];
        tri(P[0], P[1], P[2]);
        ctx.fillStyle = 'rgba(' + TRI_COLORS[j] + ',' + (0.85 - k * 0.04) + ')';
        ctx.fill();
        ctx.strokeStyle = '#0d0f16';
        ctx.lineWidth = Math.max(0.5, 2 - k * 0.3);
        ctx.stroke();
        if (size >= 9) {
          ctx.fillStyle = 'rgba(10,11,16,0.85)';
          ctx.font = '500 ' + Math.round(size) + 'px "IBM Plex Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          var gx = (P[0][0] + P[1][0] + P[2][0]) / 3, gy = (P[0][1] + P[1][1] + P[2][1]) / 3;
          ctx.fillText('1/' + Math.pow(4, k + 1), gx, gy);
        }
      }
      ctx.globalAlpha = 1;
      B = ab;
      C = ac;
    }

    var whole = Math.floor(c + 1e-9);
    var terms = ['1/4', '1/16', '1/64'].slice(0, Math.min(3, whole)).join(' + ');
    V.setText(readout,
      (whole ? 'Each color: ' + terms + (whole > 3 ? ' + …' : '') : 'Cutting the triangle…') + '\n' +
      '= ' + ((1 - Math.pow(0.25, whole)) / 3).toFixed(6) + ', closing in on 1/3\n' +
      'Three equal colors fill it, so each is 1/3');
  }

  // ---- Achilles and the tortoise ----
  // Achilles runs at speed 1 from 0; the tortoise at speed r from 1.

  function meetAt() { return 1 / (1 - r); }

  function raceLength() { return zeno ? 13 * 0.85 : 5.2; }

  function racePositions() {
    var a, s;
    if (zeno) {
      // Every stage gets the same screen time, so he never seems to arrive.
      s = Math.min(13, t / 0.85);
      var k = Math.floor(s), f = s - k;
      a = (1 - Math.pow(r, k)) / (1 - r) + Math.pow(r, k) * f;
    } else {
      a = Math.min(1.25, t / 4) * meetAt();
    }
    return { a: a, t: 1 + r * a };
  }

  function drawRace(ctx, W, H) {
    var M = meetAt(), span = M * 1.28;
    var l = 26, rgt = W - 26;
    function X(v) { return l + v / span * (rgt - l); }
    var yT = Math.round(H * 0.42), yA = Math.round(H * 0.56), yBar = Math.round(H * 0.74);
    var pos = playing || t > 0 ? racePositions() : { a: 0, t: 1 };

    // Lanes.
    ctx.strokeStyle = 'rgba(236,232,223,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(l, yT + 0.5);
    ctx.lineTo(rgt, yT + 0.5);
    ctx.moveTo(l, yA + 0.5);
    ctx.lineTo(rgt, yA + 0.5);
    ctx.stroke();

    // Zeno's checkpoints: where the tortoise was when each stage began.
    var done = 0, k, Sk;
    ctx.setLineDash([3, 4]);
    for (k = 1; k < 40; k++) {
      Sk = (1 - Math.pow(r, k)) / (1 - r);
      if (X(M) - X(Sk) < 1.5) break;
      if (pos.a >= Sk - 1e-9) done = k;
      ctx.strokeStyle = pos.a >= Sk - 1e-9 ? 'rgba(110,231,255,0.45)' : 'rgba(236,232,223,0.14)';
      ctx.beginPath();
      ctx.moveTo(Math.round(X(Sk)) + 0.5, yT - 14);
      ctx.lineTo(Math.round(X(Sk)) + 0.5, yA + 10);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(236,232,223,0.55)';
    ctx.beginPath();
    ctx.moveTo(Math.round(X(M)) + 0.5, yT - 34);
    ctx.lineTo(Math.round(X(M)) + 0.5, yBar + 24);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#9b9daf';
    ctx.fillText('they meet at ' + M.toFixed(3), Math.min(X(M), rgt - 50), yT - 38);

    // The race so far as a sum: 1 + r + r² + …
    ctx.textBaseline = 'top';
    var bh = 16;
    for (k = 0; k < 40; k++) {
      var s0 = (1 - Math.pow(r, k)) / (1 - r), s1 = (1 - Math.pow(r, k + 1)) / (1 - r);
      if (s0 >= pos.a - 1e-12) break;
      var e = Math.min(s1, pos.a);
      ctx.fillStyle = V.gradient(V.SPECTRUM, k / 11);
      ctx.fillRect(X(s0), yBar, Math.max(0.5, X(e) - X(s0) - (X(e) - X(s0) > 3 ? 1 : 0)), bh);
      var w = X(s1) - X(s0);
      if (k < 4 && e >= s1 - 1e-9 && w > 30) {
        ctx.fillStyle = '#6f7286';
        ctx.fillText(k === 0 ? '1' : k === 1 ? 'r' : 'r' + (k === 2 ? '²' : '³'), X(s0) + w / 2, yBar + bh + 6);
      }
    }
    ctx.strokeStyle = 'rgba(236,232,223,0.2)';
    ctx.strokeRect(X(0) + 0.5, yBar + 0.5, X(M) - X(0), bh);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6f7286';
    ctx.fillText('distance Achilles has run', l, yBar - 18);

    // The runners.
    function runner(x, y, rgb, letter) {
      ctx.fillStyle = 'rgb(' + rgb + ')';
      ctx.strokeStyle = '#0d0f16';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
      ctx.fillStyle = '#0a0b10';
      ctx.font = '600 11px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, x, y + 0.5);
    }
    runner(X(pos.t), yT, '126,224,161', 'T');
    runner(X(pos.a), yA, '110,231,255', 'A');
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#6f7286';
    if (X(pos.t) > l + 90) ctx.fillText('tortoise', l, yT - 14);
    if (X(pos.a) > l + 90) ctx.fillText('Achilles', l, yA + 18);

    var caught = pos.a >= M - 1e-9;
    V.setText(readout,
      (zeno ? "Zeno's clock: stage " + Math.min(done + 1, 13) : 'Real clock') + '\n' +
      'Achilles ' + pos.a.toFixed(4) + ', tortoise ' + pos.t.toFixed(4) + '\n' +
      (caught ? 'Caught at 1/(1 − r) = ' : 'Catches it at 1/(1 − r) = ') + M.toFixed(3));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPic(v) {
    pic = v;
    V.setSegmented(picGroup, v);
    t = 0;
    stage.dirty = true;
  }

  V.segmented(picGroup, function (v) { setPic(v); });

  ratioInput.addEventListener('input', function () {
    r = parseFloat(ratioInput.value);
    ratioOut.textContent = rText(r);
    // The triangle picture only works for 1/4, so a new ratio means the square.
    if (pic === 'triangle') setPic('square');
    if (pic === 'achilles') t = Math.min(t, 0.0001);
    stage.dirty = true;
  });
  ratioOut.textContent = rText(r);

  V.toggle(zenoBtn, function (on) {
    zeno = on;
    if (pic !== 'achilles') setPic('achilles');
    t = 0;
    stage.dirty = true;
  });

  function setPlaying(on) {
    playing = on;
    playBtn.textContent = on ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'restart').addEventListener('click', function () {
    t = 0;
    setPlaying(true);
    stage.dirty = true;
  });
})();
