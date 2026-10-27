// A three-state Markov chain: tomorrow's weather depends only on today's.
// From any start the forecast d·Pⁿ settles on the same long-run mix π = πP.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('markov');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var fromSeg = V.ctl(section, 'from');
  var sliders = [V.ctl(section, 'to0'), V.ctl(section, 'to1'), V.ctl(section, 'to2')];
  var outputs = [V.ctl(section, 'to0-out'), V.ctl(section, 'to1-out'), V.ctl(section, 'to2-out')];

  var NAMES = ['Sunny', 'Cloudy', 'Rainy'];
  var COLORS = ['#ffb454', '#b9bccb', '#6ee7ff'];
  var DEFAULT = [[0.7, 0.2, 0.1], [0.3, 0.4, 0.3], [0.2, 0.4, 0.4]];
  var MIN = 0.02, MAX = 0.96;
  var FORECAST_DAYS = 10;
  var ANIMATE_BELOW = 8;     // days per second; faster than this, the token just jumps

  var P = DEFAULT.map(function (r) { return r.slice(); });
  var from = 0;
  var rate = 2.5;
  var playing = !V.reducedMotion;
  var today = 0, yesterday = 0, day = 0;
  var days = [0, 0, 0];
  var hopAt = -9, clock = 0, acc = 0;
  var pi = [1 / 3, 1 / 3, 1 / 3];
  var changed = true;

  function longRun() {
    var d = [1 / 3, 1 / 3, 1 / 3];
    for (var it = 0; it < 500; it++) d = step(d);
    pi = d;
  }

  function step(d) {
    var out = [0, 0, 0];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) out[j] += d[i] * P[i][j];
    return out;
  }

  function startAt(s) {
    today = yesterday = s;
    day = 1;
    days = [0, 0, 0];
    days[s] = 1;
    hopAt = -9;
    acc = 0;
    changed = true;
  }

  function nextDay() {
    var r = Math.random(), row = P[today], j = 0;
    while (j < 2 && r >= row[j]) {
      r -= row[j];
      j++;
    }
    yesterday = today;
    today = j;
    days[j]++;
    day++;
    hopAt = clock;
  }

  function frame(dt, st) {
    clock += dt;
    if (playing) {
      acc = Math.min(acc + dt * rate, 200);
      while (acc >= 1) {
        acc -= 1;
        nextDay();
      }
      changed = true;
    } else if (clock - hopAt < 0.8) {
      changed = true;
    }
    if (!changed && !st.dirty) return;
    changed = false;
    st.dirty = false;
    draw(st);
  }

  function layout(st) {
    var W = st.width, H = st.height;
    if (W >= 480) {
      var R = Math.min(W * 0.18, (H - 150) / 2), cx = W * 0.32, c0 = H / 2 + 24;
      return {
        W: W, H: H, wide: true, node: Math.min(34, R * 0.3),
        nodes: [[cx, c0 - R], [cx - R * 0.95, c0 + R * 0.55], [cx + R * 0.95, c0 + R * 0.55]],
        center: [cx, c0],
        px: W * 0.63, pw: W * 0.37 - 20, barsTop: 96, fTop: H / 2 + 6, fBottom: H - 28
      };
    }
    var r = Math.min(W * 0.15, 52);
    var cy = 62 + r, barsTop = cy + r * 0.6 + 58;
    return {
      W: W, H: H, wide: false, node: Math.min(18, r * 0.36),
      nodes: [[W / 2, cy - r], [W / 2 - r * 1.6, cy + r * 0.6], [W / 2 + r * 1.6, cy + r * 0.6]],
      center: [W / 2, cy],
      px: 16, pw: W - 32, barsTop: barsTop, fTop: barsTop + 3 * 18 + 12, fBottom: H - 12
    };
  }

  // The bend of the arrow from node i to node j, as a quadratic curve.
  function arc(L, i, j) {
    var a = L.nodes[i], b = L.nodes[j];
    var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy);
    var ux = dx / len, uy = dy / len, nx = uy, ny = -ux;
    var bend = len * 0.16, r = L.node + 5;
    var c = [(a[0] + b[0]) / 2 + nx * bend, (a[1] + b[1]) / 2 + ny * bend];
    // Start and end just outside the circles, leaning toward the bend.
    var s0 = norm(c[0] - a[0], c[1] - a[1]), s1 = norm(c[0] - b[0], c[1] - b[1]);
    return {
      p0: [a[0] + s0[0] * r, a[1] + s0[1] * r], c: c,
      p1: [b[0] + s1[0] * (r + 2), b[1] + s1[1] * (r + 2)], n: [nx, ny]
    };
  }

  function norm(x, y) {
    var l = Math.sqrt(x * x + y * y) || 1;
    return [x / l, y / l];
  }

  function bez(A, t) {
    var u = 1 - t;
    return [u * u * A.p0[0] + 2 * u * t * A.c[0] + t * t * A.p1[0],
      u * u * A.p0[1] + 2 * u * t * A.c[1] + t * t * A.p1[1]];
  }

  function loopOf(L, i) {
    var n = L.nodes[i], d = norm(n[0] - L.center[0], n[1] - L.center[1]);
    var lr = L.node * 0.5;
    return { x: n[0] + d[0] * (L.node + lr * 0.9), y: n[1] + d[1] * (L.node + lr * 0.9), r: lr, d: d };
  }

  function pct(v) { return Math.round(v * 100) + '%'; }

  function draw(st) {
    var ctx = st.ctx, L = layout(st), i, j;
    ctx.clearRect(0, 0, L.W, L.H);
    var small = !L.wide;
    ctx.font = '500 ' + (small ? 10 : 11) + 'px "IBM Plex Mono", monospace';
    ctx.lineCap = 'round';

    // Arrows between days, thicker for likelier changes.
    for (i = 0; i < 3; i++) {
      for (j = 0; j < 3; j++) {
        if (i === j) continue;
        var A = arc(L, i, j), w = 1 + P[i][j] * (small ? 5 : 8);
        ctx.strokeStyle = i === from ? 'rgba(255,180,84,0.75)' : 'rgba(236,232,223,0.32)';
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(A.p0[0], A.p0[1]);
        ctx.quadraticCurveTo(A.c[0], A.c[1], A.p1[0], A.p1[1]);
        ctx.stroke();
        var tip = A.p1, back = bez(A, 0.9), dir = norm(tip[0] - back[0], tip[1] - back[1]);
        var hs = 6 + w * 0.6;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(tip[0] + dir[0] * 2, tip[1] + dir[1] * 2);
        ctx.lineTo(tip[0] - dir[0] * hs - dir[1] * hs * 0.6, tip[1] - dir[1] * hs + dir[0] * hs * 0.6);
        ctx.lineTo(tip[0] - dir[0] * hs + dir[1] * hs * 0.6, tip[1] - dir[1] * hs - dir[0] * hs * 0.6);
        ctx.closePath();
        ctx.fill();
        // On a phone the labels sit on the arrows, over a small dark patch.
        var m = bez(A, 0.5), off = small ? 0 : 13, label = pct(P[i][j]);
        var lx0 = m[0] + A.n[0] * off, ly0 = m[1] + A.n[1] * off;
        if (small) {
          var tw = ctx.measureText(label).width + 6;
          ctx.fillStyle = '#0d0f16';
          ctx.fillRect(lx0 - tw / 2, ly0 - 7, tw, 14);
        }
        ctx.fillStyle = i === from ? '#ffb454' : '#9b9daf';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, lx0, ly0);
      }
      // Staying the same.
      var lp = loopOf(L, i);
      ctx.strokeStyle = i === from ? 'rgba(255,180,84,0.75)' : 'rgba(236,232,223,0.32)';
      ctx.lineWidth = 1 + P[i][i] * (small ? 4 : 6);
      ctx.beginPath();
      ctx.arc(lp.x, lp.y, lp.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = i === from ? '#ffb454' : '#9b9daf';
      var lx = lp.x + lp.d[0] * (lp.r + 16), ly = lp.y + lp.d[1] * (lp.r + 12);
      ctx.fillText(pct(P[i][i]), lx, ly);
    }

    // The weather nodes.
    for (i = 0; i < 3; i++) {
      var p = L.nodes[i], on = i === today;
      ctx.fillStyle = '#141621';
      ctx.beginPath();
      ctx.arc(p[0], p[1], L.node, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = on ? COLORS[i] : 'rgba(236,232,223,0.25)';
      ctx.lineWidth = on ? 2.5 : 1.2;
      ctx.stroke();
      icon(ctx, i, p[0], p[1] - (small ? 1 : 4), L.node / 34);
      if (!small) {
        ctx.fillStyle = on ? '#ece8df' : '#9b9daf';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(NAMES[i], p[0], p[1] + L.node * 0.58);
      }
    }

    // The token: today's weather, sliding along the arrow it just took.
    var t = Math.min(1, (clock - hopAt) / Math.min(0.55, 0.75 / rate));
    var tok;
    if (rate < ANIMATE_BELOW && t < 1 && yesterday !== today) {
      tok = bez(arc(L, yesterday, today), V.easeInOut(t));
    } else if (rate < ANIMATE_BELOW && t < 1) {
      var lq = loopOf(L, today), ang = Math.atan2(-lq.d[1], -lq.d[0]) + V.easeInOut(t) * Math.PI * 2;
      tok = [lq.x + Math.cos(ang) * lq.r, lq.y + Math.sin(ang) * lq.r];
    } else {
      var q = L.nodes[today];
      tok = [q[0] + L.node * 0.7, q[1] - L.node * 0.7];
    }
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = COLORS[today];
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(tok[0], tok[1], small ? 4.5 : 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    drawShares(ctx, L);
    drawForecast(ctx, L);
    V.setText(readout, 'Day ' + day.toLocaleString() + ': ' + NAMES[today].toLowerCase());
  }

  function icon(ctx, s, x, y, k) {
    var i;
    if (s === 0) {
      ctx.strokeStyle = COLORS[0];
      ctx.fillStyle = COLORS[0];
      ctx.lineWidth = 2 * k;
      ctx.beginPath();
      ctx.arc(x, y, 7 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      for (i = 0; i < 8; i++) {
        var a = i * Math.PI / 4;
        ctx.moveTo(x + Math.cos(a) * 10.5 * k, y + Math.sin(a) * 10.5 * k);
        ctx.lineTo(x + Math.cos(a) * 14 * k, y + Math.sin(a) * 14 * k);
      }
      ctx.stroke();
      return;
    }
    var cy = s === 2 ? y - 3 * k : y;
    ctx.fillStyle = s === 2 ? '#8f93a6' : COLORS[1];
    ctx.beginPath();
    ctx.arc(x - 6 * k, cy + 2 * k, 6 * k, 0, Math.PI * 2);
    ctx.arc(x + 1 * k, cy - 3 * k, 8 * k, 0, Math.PI * 2);
    ctx.arc(x + 8 * k, cy + 2 * k, 5.5 * k, 0, Math.PI * 2);
    ctx.rect(x - 6 * k, cy + 2 * k, 14 * k, 5.5 * k);
    ctx.fill();
    if (s === 2) {
      ctx.strokeStyle = COLORS[2];
      ctx.lineWidth = 2 * k;
      ctx.beginPath();
      for (i = -1; i <= 1; i++) {
        ctx.moveTo(x + i * 6 * k, cy + 11 * k);
        ctx.lineTo(x + i * 6 * k - 2 * k, cy + 17 * k);
      }
      ctx.stroke();
    }
  }

  // Share of days so far in each weather, against the long-run mix.
  function drawShares(ctx, L) {
    var rowH = L.wide ? 34 : 18, y0 = L.barsTop;
    var labelW = L.wide ? 80 : 52, bx = L.px + labelW, bw = L.pw - labelW - (L.wide ? 40 : 36);
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9b9daf';
    ctx.fillText('Share of days so far', L.px, y0 - 10);
    for (var s = 0; s < 3; s++) {
      var y = y0 + s * rowH, share = day ? days[s] / day : 0, bh = L.wide ? 12 : 8;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS[s];
      ctx.fillText(NAMES[s], L.px, y + bh / 2);
      ctx.fillStyle = 'rgba(236,232,223,0.07)';
      ctx.fillRect(bx, y, bw, bh);
      ctx.fillStyle = COLORS[s];
      ctx.globalAlpha = 0.85;
      ctx.fillRect(bx, y, bw * share, bh);
      ctx.globalAlpha = 1;
      var ex = Math.round(bx + bw * pi[s]) + 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ex, y - 3);
      ctx.lineTo(ex, y + bh + 3);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ece8df';
      ctx.fillText(pct(share), L.px + L.pw, y + bh / 2);
    }
  }

  // Forecasts for the next days from each starting weather: stacked bars
  // that begin pure and end up the same.
  function drawForecast(ctx, L) {
    var labelW = L.wide ? 80 : 52, gx = L.px + labelW, gw = L.pw - labelW;
    var cols = FORECAST_DAYS + 1, colW = gw / (cols + 1.6);
    var rows = 3, rowH = (L.fBottom - L.fTop - (L.wide ? 22 : 0)) / rows;
    var top = L.fTop + (L.wide ? 22 : 0);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#9b9daf';
    if (L.wide) {
      ctx.fillText('Forecast, by first day', L.px, L.fTop + 10);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#6f7286';
      ctx.fillText('long run', L.px + L.pw, L.fTop + 10);
    }
    for (var s = 0; s < rows; s++) {
      var d = [0, 0, 0];
      d[s] = 1;
      var y = top + s * rowH, h = rowH - (L.wide ? 10 : 4);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS[s];
      ctx.fillText(L.wide ? 'from ' + NAMES[s].toLowerCase() : NAMES[s], L.px, y + h / 2);
      for (var c = 0; c <= cols; c++) {
        var col = c === cols ? pi : d;
        var x = gx + (c === cols ? c + 0.6 : c) * colW, yy = y + h;
        for (var k = 0; k < 3; k++) {
          var hh = col[k] * h;
          ctx.fillStyle = COLORS[k];
          ctx.globalAlpha = c === cols ? 1 : 0.8;
          ctx.fillRect(x + 1, yy - hh, colW - 2, hh);
          yy -= hh;
        }
        ctx.globalAlpha = 1;
        if (c < cols) d = step(d);
      }
    }
    if (L.wide) {
      ctx.fillStyle = '#6f7286';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText('today', gx, L.fBottom + 4);
      ctx.textAlign = 'right';
      ctx.fillText('10 days on', gx + colW * cols, L.fBottom + 4);
    }
  }

  longRun();
  startAt(0);
  var stage = V.createStage(canvas, { frame: frame });

  // Click a weather to start the chain there.
  canvas.addEventListener('click', function (e) {
    var r = canvas.getBoundingClientRect(), L = layout(stage);
    var x = e.clientX - r.left, y = e.clientY - r.top;
    for (var i = 0; i < 3; i++) {
      var p = L.nodes[i];
      if ((x - p[0]) * (x - p[0]) + (y - p[1]) * (y - p[1]) < (L.node + 8) * (L.node + 8)) {
        startAt(i);
        return;
      }
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    var r = canvas.getBoundingClientRect(), L = layout(stage);
    var x = e.clientX - r.left, y = e.clientY - r.top, over = false;
    L.nodes.forEach(function (p) {
      if ((x - p[0]) * (x - p[0]) + (y - p[1]) * (y - p[1]) < (L.node + 8) * (L.node + 8)) over = true;
    });
    canvas.style.cursor = over ? 'pointer' : '';
  });

  // ---- Controls ----

  function syncSliders() {
    for (var j = 0; j < 3; j++) {
      sliders[j].value = String(P[from][j]);
      outputs[j].textContent = pct(P[from][j]);
    }
  }

  // Set one chance in the row and share what's left between the other two,
  // keeping their proportions, so the row still adds up to 1.
  function setChance(j, v) {
    var row = P[from], a = (j + 1) % 3, b = (j + 2) % 3;
    v = Math.max(MIN, Math.min(MAX, v));
    var rest = 1 - v, sum = row[a] + row[b];
    var ra = sum > 0 ? rest * row[a] / sum : rest / 2;
    ra = Math.max(MIN, Math.min(rest - MIN, ra));
    row[j] = v;
    row[a] = ra;
    row[b] = rest - ra;
    longRun();
    syncSliders();
    startAt(today);
  }

  sliders.forEach(function (input, j) {
    input.addEventListener('input', function () { setChance(j, parseFloat(input.value)); });
  });

  V.segmented(fromSeg, function (v) {
    from = parseInt(v, 10);
    syncSliders();
    changed = true;
  });

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.ctl(section, 'reset').addEventListener('click', function () { startAt(today); });

  V.ctl(section, 'defaults').addEventListener('click', function () {
    P = DEFAULT.map(function (r) { return r.slice(); });
    longRun();
    syncSliders();
    startAt(today);
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) {
      var r = Math.pow(10, v);
      return (r < 10 ? r.toFixed(1) : Math.round(r).toLocaleString()) + ' days / second';
    },
    function (v) { rate = Math.pow(10, v); });

  syncSliders();

})();
