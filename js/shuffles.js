// Perfect riffle shuffles: cut an even deck exactly in half and interleave.
// An out-shuffle sends the card in position i (from 0) to 2i mod (N − 1), the
// last card staying put. The deck comes home after the lcm of the cycle lengths.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('shuffles');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var typeGroup = V.ctl(section, 'type');
  var viewGroup = V.ctl(section, 'view');
  var onceBtn = V.ctl(section, 'once');
  var playBtn = V.ctl(section, 'play');
  var resetBtn = V.ctl(section, 'reset');
  var nInput = V.ctl(section, 'n');
  var nOut = V.ctl(section, 'n-out');

  var N = 52;
  var inShuffle = false;
  var view = 'paths';
  var sigma = [];          // position → new position
  var cycles = [];         // lists of positions
  var cycleOf = [];
  var period = 1;
  var colors = [];
  var deck = [];           // position → card
  var rows = [];           // the deck after 0, 1, 2… shuffles in this round
  var anim = null;         // { t, from }
  var playing = !V.reducedMotion;
  var wait = 0.6;
  var selected = -1;       // a card to follow
  var ringNodes = [];      // [x, y, place] of each dot in the loops view, for tapping
  var stage;

  function gcd(a, b) { return b ? gcd(b, a % b) : a; }

  function build() {
    sigma = [];
    var half = N / 2;
    for (var i = 0; i < N; i++) {
      var j = i < half ? i : i - half;
      // Out: the top half lands on the even places. In: on the odd ones.
      sigma.push(i < half ? 2 * j + (inShuffle ? 1 : 0) : 2 * j + (inShuffle ? 0 : 1));
    }
    cycles = [];
    cycleOf = [];
    var seen = [];
    for (i = 0; i < N; i++) {
      if (seen[i]) continue;
      var c = [], p = i;
      while (!seen[p]) { seen[p] = true; cycleOf[p] = cycles.length; c.push(p); p = sigma[p]; }
      cycles.push(c);
    }
    period = cycles.reduce(function (acc, c) { return acc / gcd(acc, c.length) * c.length; }, 1);
    colors = [];
    for (i = 0; i < N; i++) colors.push(V.gradient(V.SPECTRUM, N > 1 ? i / (N - 1) : 0));
    reset();
  }

  function reset() {
    deck = [];
    for (var i = 0; i < N; i++) deck.push(i);
    rows = [deck.slice()];
    anim = null;
    wait = 0.6;
    if (stage) stage.dirty = true;
  }

  function shuffle() {
    if (anim) finish();
    if (rows.length - 1 >= period) rows = [deck.slice()];
    var next = [];
    for (var i = 0; i < N; i++) next[sigma[i]] = deck[i];
    anim = { t: 0, from: deck };
    deck = next;
    rows.push(deck.slice());
    stage.dirty = true;
  }

  function finish() { anim = null; }

  function home() { return rows.length - 1 === period; }

  function cycleText() {
    var lens = cycles.map(function (c) { return c.length; }).sort(function (a, b) { return b - a; });
    var out = [], k = 0;
    while (k < lens.length) {
      var m = k;
      while (m < lens.length && lens[m] === lens[k]) m++;
      out.push(lens[k] + (m - k > 1 ? ' ×' + (m - k) : ''));
      k = m;
    }
    return out.join(', ');
  }

  function layout(W, H) {
    var deckH = Math.max(40, H * 0.15);
    return {
      top: Math.max(92, H * 0.17),
      bottom: H - deckH - Math.max(36, H * 0.1),
      deckY: H - deckH - Math.max(20, H * 0.055),
      deckH: deckH,
      left: Math.max(14, W * 0.03),
      right: W - Math.max(14, W * 0.03)
    };
  }

  function frame(dt, st) {
    var busy = false;
    if (anim) {
      anim.t += dt / (N > 30 ? 0.9 : 0.75);
      if (anim.t >= 1) finish();
      busy = true;
    } else if (playing) {
      wait -= dt;
      if (wait <= 0) {
        if (home()) {
          setPlaying(false);
        } else {
          shuffle();
          wait = 0.35;
        }
      }
      busy = true;
    }
    if (!busy && !st.dirty) return;
    st.dirty = false;

    var W = st.width, H = st.height, ctx = st.ctx, L = layout(W, H);
    var t = anim ? V.easeInOut(Math.min(1, anim.t)) : 1;
    var slot = (L.right - L.left) / N;
    function xAt(p) { return L.left + (p + 0.5) * slot; }
    ctx.clearRect(0, 0, W, H);

    var done = rows.length - 1;
    if (view === 'paths') {
      // Each card's path through the shuffles, row by row.
      var dy = (L.bottom - L.top) / Math.max(1, period);
      var where = [];      // card → position, per row
      rows.forEach(function (r, k) {
        var w = [];
        r.forEach(function (card, p) { w[card] = p; });
        where[k] = w;
      });
      ctx.lineJoin = 'round';
      var tick = Math.max(2, slot * 0.6);
      for (var card = 0; card < N; card++) {
        var on = selected < 0 || selected === card;
        ctx.strokeStyle = selected === card ? '#ffffff' : colors[card];
        ctx.globalAlpha = on ? (selected === card ? 1 : 0.75) : 0.12;
        ctx.lineWidth = selected === card ? 2.5 : (N > 40 ? 1.2 : 1.6);
        var ex = xAt(where[0][card]), ey = L.top;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        for (var k = 1; k <= done; k++) {
          var f = k === done ? t : 1;
          var xa = xAt(where[k - 1][card]), xb = xAt(where[k][card]);
          ex = xa + (xb - xa) * f;
          ey = L.top + (k - 1 + f) * dy;
          ctx.lineTo(ex, ey);
        }
        ctx.stroke();
        // Where each card started, and where it is now.
        ctx.globalAlpha = on ? 1 : 0.25;
        ctx.fillStyle = colors[card];
        ctx.fillRect(xAt(where[0][card]) - tick / 2, L.top - 3, tick, 6);
        if (done) ctx.fillRect(ex - tick / 2, ey - 3, tick, 6);
      }
      ctx.globalAlpha = 1;
      if (home() && t >= 1) {
        ctx.strokeStyle = 'rgba(255,180,84,0.85)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(L.left - 4, L.top + done * dy - 7, L.right - L.left + 8, 14);
      }
    } else {
      // Each loop of places as its own ring; every shuffle moves each card one
      // step around its ring. Rings are packed in rows, as big as will fit.
      var order = cycles.slice().sort(function (p1, p2) { return p2.length - p1.length; });
      var Wr = L.right - L.left, Hr = L.bottom - L.top + 4;
      function pack(d) {
        var rowsOut = [], row = { items: [], w: 0, h: 0 };
        order.forEach(function (c) {
          var r = Math.max(d * 0.9, c.length * d / (2 * Math.PI)), cell = 2 * r + d * 1.8;
          if (row.items.length && row.w + cell > Wr) { rowsOut.push(row); row = { items: [], w: 0, h: 0 }; }
          row.items.push({ c: c, r: r, cell: cell });
          row.w += cell;
          row.h = Math.max(row.h, cell);
        });
        rowsOut.push(row);
        return rowsOut;
      }
      var lo = 2, hi = 26;
      for (var it = 0; it < 18; it++) {
        var mid = (lo + hi) / 2, pk = pack(mid), tot = 0;
        pk.forEach(function (rw) { tot += rw.h; });
        if (tot <= Hr && pk.every(function (rw) { return rw.w <= Wr + 0.5; })) lo = mid; else hi = mid;
      }
      var d = lo, packed = pack(d), totalH = 0;
      packed.forEach(function (rw) { totalH += rw.h; });
      var nodeR = Math.max(1.6, Math.min(5.5, d * 0.34));
      var selPos = selected >= 0 ? deck.indexOf(selected) : -1;
      var yRow = L.top - 6 + (Hr - totalH) / 2;
      ringNodes = [];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      packed.forEach(function (rw) {
        var xc = L.left + (Wr - rw.w) / 2;
        rw.items.forEach(function (item) {
          var c = item.c, m = c.length, cx0 = xc + item.cell / 2, cy0 = yRow + rw.h / 2;
          var lit = selPos < 0 || c.indexOf(selPos) >= 0;
          ctx.globalAlpha = lit ? 1 : 0.25;
          ctx.strokeStyle = 'rgba(236,232,223,0.22)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx0, cy0, item.r, 0, Math.PI * 2);
          ctx.stroke();
          if (m > 1) {
            // A small arrowhead shows which way the cards travel.
            var ah = -Math.PI / 2 + Math.PI / m, axp = cx0 + Math.cos(ah) * item.r, ayp = cy0 + Math.sin(ah) * item.r;
            var tx = -Math.sin(ah), ty = Math.cos(ah);
            ctx.fillStyle = 'rgba(236,232,223,0.45)';
            ctx.beginPath();
            ctx.moveTo(axp + tx * 4, ayp + ty * 4);
            ctx.lineTo(axp - tx * 3 - ty * 3, ayp - ty * 3 + tx * 3);
            ctx.lineTo(axp - tx * 3 + ty * 3, ayp - ty * 3 - tx * 3);
            ctx.closePath();
            ctx.fill();
          }
          c.forEach(function (p, j) {
            // The card now at place p came from the place before it in the loop.
            var ang = -Math.PI / 2 + 2 * Math.PI * (j - (anim ? 1 - t : 0)) / m;
            var nx = cx0 + Math.cos(ang) * item.r, ny = cy0 + Math.sin(ang) * item.r;
            ringNodes.push([nx, ny, p]);
            ctx.fillStyle = colors[deck[p]];
            ctx.beginPath();
            ctx.arc(nx, ny, nodeR, 0, Math.PI * 2);
            ctx.fill();
            if (p === selPos) {
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 2;
              ctx.stroke();
            }
          });
          if (item.r > 11) {
            ctx.font = '500 ' + Math.min(13, Math.max(9, item.r * 0.4)) + 'px "IBM Plex Mono", monospace';
            ctx.fillStyle = '#9b9daf';
            ctx.fillText(String(m), cx0, cy0);
          }
          ctx.globalAlpha = 1;
          xc += item.cell;
        });
        yRow += rw.h;
      });
    }

    // The deck itself: color shows each card's starting place.
    var gapX = slot > 6 ? 1.5 : slot > 3 ? 0.8 : 0;
    var from = anim ? anim.from : deck;
    var fromPos = [];
    from.forEach(function (c, p) { fromPos[c] = p; });
    var lift = L.deckH * 0.32 * Math.sin(Math.PI * t) * (anim ? 1 : 0);
    deck.forEach(function (c, p) {
      var p0 = fromPos[c], x = xAt(p0) + (xAt(p) - xAt(p0)) * t;
      var y = L.deckY + (p0 < N / 2 ? -lift : lift * 0.4);
      ctx.fillStyle = colors[c];
      ctx.globalAlpha = selected < 0 || selected === c ? 1 : 0.35;
      ctx.fillRect(x - slot / 2 + gapX / 2, y, slot - gapX, L.deckH);
      ctx.globalAlpha = 1;
      if (selected === c) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - slot / 2 - 1, y - 2, slot + 2, L.deckH + 4);
      }
    });
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#6f7286';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('top of deck', L.left, L.deckY + L.deckH + 4);
    ctx.textAlign = 'right';
    ctx.fillText('bottom', L.right, L.deckY + L.deckH + 4);

    var line2 = 'Shuffles: ' + done + (home() ? '. Back in order!' : ' of ' + period + ' to come home');
    var line3;
    if (selected >= 0) {
      var len = cycles[cycleOf[deck.indexOf(selected)]].length;
      line3 = 'Card ' + (selected + 1) + (len === 1 ? ' never moves' : ' visits ' + len + ' places in turn');
    } else {
      line3 = 'Loops: ' + cycleText();
    }
    V.setText(readout, N + ' cards, ' + (inShuffle ? 'in' : 'out') + '-shuffles\n' + line2 + '\n' + line3);
  }

  stage = V.createStage(canvas, { frame: frame });

  // Tap a card to follow it.
  canvas.addEventListener('click', function (e) {
    var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    var L = layout(stage.width, stage.height);
    var near = null, nd = 14;
    if (view === 'cycles') {
      ringNodes.forEach(function (q) {
        var dd = Math.hypot(q[0] - x, q[1] - y);
        if (dd < nd) { nd = dd; near = q; }
      });
    }
    if (near) {
      selected = selected === deck[near[2]] ? -1 : deck[near[2]];
    } else if (y < L.deckY - L.deckH * 0.4 || y > L.deckY + L.deckH * 1.4 || x < L.left || x > L.right) {
      selected = -1;
    } else {
      var p = Math.min(N - 1, Math.floor((x - L.left) / ((L.right - L.left) / N)));
      selected = selected === deck[p] ? -1 : deck[p];
    }
    stage.dirty = true;
  });

  // ---- Controls ----

  function setPlaying(on) {
    playing = on;
    playBtn.textContent = on ? 'Pause' : 'Play';
    if (on && home()) rows = [deck.slice()];
    wait = 0.2;
  }

  onceBtn.addEventListener('click', function () {
    setPlaying(false);
    shuffle();
  });
  playBtn.addEventListener('click', function () { setPlaying(!playing); });
  resetBtn.addEventListener('click', function () {
    selected = -1;
    reset();
  });
  V.segmented(typeGroup, function (v) {
    inShuffle = v === 'in';
    selected = -1;
    build();
  });
  V.segmented(viewGroup, function (v) {
    view = v;
    stage.dirty = true;
  });
  nInput.addEventListener('input', function () {
    N = parseInt(nInput.value, 10);
    nOut.textContent = String(N);
    selected = -1;
    build();
  });
  nOut.textContent = String(N);
  build();
  setPlaying(playing);
  wait = 1;
})();
