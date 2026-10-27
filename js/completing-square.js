// Completing the square, as al-Khwarizmi drew it: x² + bx is a square plus a
// strip; halve the strip, move one half, and only a (b/2)² corner is missing.
// So x² + bx = k becomes (x + b/2)² = k + (b/2)², and x = −b/2 + √(k + (b/2)²).
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('completing-square');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var stepGroup = V.ctl(section, 'step');
  var nextBtn = V.ctl(section, 'next');
  var bInput = V.ctl(section, 'b');
  var bOut = V.ctl(section, 'b-out');
  var kInput = V.ctl(section, 'k');
  var kOut = V.ctl(section, 'k-out');

  var CYAN = '#6ee7ff', VIOLET = '#a78bfa', AMBER = '#ffb454', GREEN = '#7ee0a1';
  var b = 10, k = 39;
  var step = 0;            // 0 start, 1 split, 2 complete, 3 solve
  var shown = 0;           // eased toward step
  var auto = !V.reducedMotion;
  var autoT = 0;
  var stage;

  function fmt(v) {
    var r = Math.round(v * 100) / 100;
    var s = Math.abs(r - Math.round(r)) < 1e-9 ? String(Math.round(Math.abs(r))) : Math.abs(r).toFixed(2).replace(/0$/, '');
    return (r < 0 ? '−' : '') + s;
  }

  function lines() {
    var h = b / 2, H2 = h * h, total = k + H2, root = Math.sqrt(total), x = root - h;
    var exact = Math.abs(root - Math.round(root)) < 1e-9;
    var out = [
      { s: 0, t: 'x² + ' + fmt(b) + 'x = ' + fmt(k) },
      { s: 1, t: 'x² + ' + fmt(h) + 'x + ' + fmt(h) + 'x = ' + fmt(k) },
      { s: 2, t: 'x² + ' + fmt(b) + 'x + ' + fmt(H2) + ' = ' + fmt(k) + ' + ' + fmt(H2) },
      { s: 2, t: '(x + ' + fmt(h) + ')² = ' + fmt(total) },
      { s: 3, t: 'x + ' + fmt(h) + ' = ' + (exact ? fmt(root) : '√' + fmt(total) + ' ≈ ' + fmt(root)) },
      { s: 3, t: 'x ' + (exact && Math.abs(x - Math.round(x)) < 1e-9 ? '= ' : '≈ ') + fmt(x) }
    ];
    return { list: out, x: x, h: h, root: root, total: total };
  }

  function frame(dt, st) {
    var busy = false;
    if (auto) {
      autoT += dt;
      if (autoT > 2.4) {
        autoT = 0;
        if (step < 3) setStep(step + 1);
        else auto = false;
      }
      busy = true;
    }
    if (Math.abs(shown - step) > 0.001) {
      shown = V.reducedMotion ? step : shown + Math.sign(step - shown) * Math.min(Math.abs(step - shown), dt * 1.3);
      busy = true;
    }
    if (!busy && !st.dirty) return;
    st.dirty = false;

    var W = st.width, H = st.height, ctx = st.ctx;
    var L = lines(), x = L.x, h = L.h;
    // Wide: picture left, algebra and graph right. Narrow: picture on top.
    var wide = W / H > 1.15;
    var gW = wide ? W * 0.58 : W, gH = wide ? H : H * 0.56;
    ctx.clearRect(0, 0, W, H);

    // ---- The picture ----
    var split = Math.max(0, Math.min(1, shown));          // 0 → 1: move the half strip
    var fill = Math.max(0, Math.min(1, shown - 1));       // 1 → 2: the corner
    var solve = Math.max(0, Math.min(1, shown - 2));      // 2 → 3: the big square
    var e = V.easeInOut(split);
    // Zoom smoothly from the long strip to the near-square as the half moves.
    var bw = x + b - h * e, bh = x + h * e;
    var pad = Math.max(22, W * 0.04);
    var s = Math.min((gW - pad * 2) / bw, (gH - pad * 2 - 24) / bh);
    var ox = (gW - bw * s) / 2, oy = (gH - bh * s) / 2 - (wide ? 8 : 0);
    function px(u) { return ox + u * s; }
    function py(v) { return oy + v * s; }

    function rect(x0, y0, w, hgt, color, alpha) {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(px(x0), py(y0), w * s, hgt * s);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px(x0), py(y0), w * s, hgt * s);
    }
    function text(t, u, v, color, size) {
      ctx.font = '500 ' + size + 'px "IBM Plex Mono", monospace';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, px(u), py(v));
    }
    var big = Math.max(11, Math.min(17, s * Math.min(x, h) * 0.32));
    var small = Math.max(10, Math.min(13, W * 0.019));

    // The finished big square, once the corner is in.
    if (solve > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * solve) + ')';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(px(0) - 3, py(0) - 3, (x + h) * s + 6, (x + h) * s + 6);
    }

    rect(0, 0, x, x, CYAN, 0.2);
    text('x²', x / 2, x / 2, CYAN, big);
    rect(x, 0, h, x, VIOLET, 0.2);

    // The second half strip swings from the right edge down to the bottom.
    var c0x = x + 1.5 * h, c0y = x / 2, c1x = x / 2, c1y = x + h / 2;
    var cxm = c0x + (c1x - c0x) * e, cym = c0y + (c1y - c0y) * e - Math.sin(Math.PI * e) * 0.15 * (x + h);
    ctx.save();
    ctx.translate(px(cxm), py(cym));
    ctx.rotate(e * Math.PI / 2);
    ctx.fillStyle = VIOLET;
    ctx.globalAlpha = 0.2;
    ctx.fillRect(-h * s / 2, -x * s / 2, h * s, x * s);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = VIOLET;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-h * s / 2, -x * s / 2, h * s, x * s);
    ctx.restore();
    if (split < 0.02) {
      // Before splitting, it reads as one strip of area bx.
      ctx.fillStyle = '#0d0f16';
      ctx.fillRect(px(x + h) - 1, py(0) + 1, 2, x * s - 2);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(167,139,250,0.6)';
      ctx.beginPath();
      ctx.moveTo(px(x + h), py(0));
      ctx.lineTo(px(x + h), py(x));
      ctx.stroke();
      ctx.setLineDash([]);
      text(fmt(b) + 'x', x + h, x / 2, VIOLET, big);
    } else {
      text(fmt(h) + 'x', x + h / 2, x / 2, VIOLET, big);
      if (split > 0.98) text(fmt(h) + 'x', x / 2, x + h / 2, VIOLET, big);
    }

    // The missing corner.
    if (split > 0.98) {
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px(x), py(x), h * s, h * s);
      ctx.setLineDash([]);
      if (fill > 0) {
        ctx.fillStyle = AMBER;
        ctx.globalAlpha = 0.35 * fill;
        ctx.fillRect(px(x), py(x), h * s, h * s);
        ctx.globalAlpha = 1;
      }
      text(fill > 0.5 ? fmt(h * h) : '?', x + h / 2, x + h / 2, AMBER, big);
    }

    // Side lengths.
    var gap = 12;
    ctx.font = '500 ' + small + 'px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#9b9daf';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('x', px(x / 2), py(0) - 6);
    if (split < 0.02) ctx.fillText(fmt(b), px(x + h), py(0) - 6);
    else ctx.fillText(fmt(h), px(x + h / 2), py(0) - 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('x', px(0) - gap + 4, py(x / 2));
    if (split > 0.98) ctx.fillText(fmt(h), px(0) - gap + 4, py(x + h / 2));
    if (solve > 0.5) {
      ctx.fillStyle = '#ece8df';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('x + ' + fmt(h) + ' = ' + fmt(L.root), px((x + h) / 2), py(x + h) + 8);
    }

    // ---- The algebra ----
    var rx = wide ? gW + Math.max(8, W * 0.02) : 12, rw = wide ? W - rx - 14 : W * 0.56;
    var fs = Math.max(10, Math.min(14, rw / 19));
    var lh = fs * (wide ? 1.75 : 1.55), ty = wide ? Math.max(20, H * 0.06) : gH + fs;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    L.list.forEach(function (ln, i) {
      if (ln.s > step) return;
      var current = ln.s === step;
      ctx.font = (current ? '600 ' : '400 ') + fs + 'px "IBM Plex Mono", monospace';
      ctx.fillStyle = current ? '#ece8df' : '#6f7286';
      if (ln.s === 3 && i === L.list.length - 1) ctx.fillStyle = GREEN;
      ctx.fillText(ln.t, rx, ty + i * lh);
    });
    if (step === 3) {
      ctx.font = '400 ' + Math.max(9, fs - 2) + 'px "IBM Plex Mono", monospace';
      ctx.fillStyle = '#9b9daf';
      var fy = ty + 6.4 * lh;
      ctx.fillText('With letters, x² + bx + c = 0:', rx, fy);
      ctx.font = '600 ' + Math.max(9, fs - 1) + 'px "IBM Plex Mono", monospace';
      ctx.fillStyle = AMBER;
      ctx.fillText('x = (−b ± √(b² − 4c)) / 2', rx, fy + lh * 0.95);
    }

    // ---- The parabola y = x² + bx − k ----
    var gx0 = wide ? rx : W * 0.62, gx1 = W - 10, gy0 = wide ? H * 0.6 : gH + 26, gy1 = H - 12;
    var r1 = -h - L.root, r2 = -h + L.root, vy = -L.total;
    var m = (r2 - r1) * 0.16, xmin = r1 - m, xmax = r2 + m, ymin = vy * 1.3, ymax = -vy * 0.45;
    function gx(u) { return gx0 + (u - xmin) / (xmax - xmin) * (gx1 - gx0); }
    function gy(v) { return gy1 - (v - ymin) / (ymax - ymin) * (gy1 - gy0); }
    ctx.strokeStyle = 'rgba(236,232,223,0.12)';
    ctx.strokeRect(gx0 + 0.5, gy0 + 0.5, gx1 - gx0, gy1 - gy0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    ctx.clip();
    ctx.strokeStyle = 'rgba(236,232,223,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx0, gy(0));
    ctx.lineTo(gx1, gy(0));
    ctx.moveTo(gx(0), gy0);
    ctx.lineTo(gx(0), gy1);
    ctx.stroke();
    // The vertex sits right below −b/2, as deep as the big square's area.
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(255,180,84,0.5)';
    ctx.beginPath();
    ctx.moveTo(gx(-h), gy(0));
    ctx.lineTo(gx(-h), gy(vy));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i <= 80; i++) {
      var u = xmin + (xmax - xmin) * i / 80, v = u * u + b * u - k;
      if (i) ctx.lineTo(gx(u), gy(v)); else ctx.moveTo(gx(u), gy(v));
    }
    ctx.stroke();
    ctx.restore();
    function gdot(u, v, color) {
      ctx.beginPath();
      ctx.arc(gx(u), gy(v), 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    gdot(-h, vy, AMBER);
    gdot(r2, 0, GREEN);
    gdot(r1, 0, 'rgba(126,224,161,0.6)');
    var gs = Math.max(9, Math.min(11, W * 0.016));
    ctx.font = '500 ' + gs + 'px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = GREEN;
    ctx.fillText(fmt(r2), Math.min(gx1 - 16, gx(r2) + 5), gy(0) + 4);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9b9daf';
    ctx.fillText(fmt(r1), Math.max(gx0 + 26, gx(r1) - 5), gy(0) + 4);
    ctx.fillStyle = AMBER;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillText('(' + fmt(-h) + ', ' + fmt(vy) + ')', Math.max(gx0 + 34, Math.min(gx1 - 34, gx(-h))), gy(vy) + 7);
    ctx.fillStyle = '#6f7286';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('y = x² + ' + fmt(b) + 'x − ' + fmt(k), gx0, gy0 - 5);
  }

  stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setStep(v) {
    step = v;
    V.setSegmented(stepGroup, String(v));
    nextBtn.textContent = step < 3 ? 'Next step' : 'Start again';
    stage.dirty = true;
  }

  V.segmented(stepGroup, function (v) {
    auto = false;
    setStep(parseInt(v, 10));
  });
  nextBtn.addEventListener('click', function () {
    auto = false;
    if (step < 3) {
      setStep(step + 1);
    } else {
      setStep(0);
      shown = 0;
    }
  });
  V.range(bInput, bOut, function (v) { return String(v); }, function (v) {
    b = v;
    stage.dirty = true;
  });
  V.range(kInput, kOut, function (v) { return String(v); }, function (v) {
    k = v;
    stage.dirty = true;
  });
})();
