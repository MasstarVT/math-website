// Sorting race: five algorithms sort copies of the same bars. Each one is run
// ahead of time on a hidden copy and records every comparison and swap, then
// all five replay their recordings at one operation per step.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('sorting');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');
  var soundBtn = V.ctl(section, 'sound');

  var CMP = 0, SWAP = 1, WRITE = 2;
  var NAMES = ['Bubble', 'Insertion', 'Merge', 'Quick', 'Heap'];
  var RANKS = ['1st', '2nd', '3rd', '4th', '5th'];

  var size = 50;
  var pattern = 'random';
  var rate = 128;          // steps per second
  var playing = !V.reducedMotion;
  var listen = 3;          // the lane the sound follows
  var sound = false;
  var audio = null;
  var lastNote = 0;
  var lanes = null;        // built lazily on the first visible frame
  var colors = [];
  var steps = 0;
  var finished = 0;
  var acc = 0;
  var layoutCache = null;

  // ---- The five algorithms, each writing a list of operations ----

  function recorder(a) {
    var ops = [];
    return {
      a: a,
      ops: ops,
      // True when a[i] > a[j].
      more: function (i, j) { ops.push(CMP, i, j); return a[i] > a[j]; },
      swap: function (i, j) { ops.push(SWAP, i, j); var t = a[i]; a[i] = a[j]; a[j] = t; },
      write: function (i, v) { ops.push(WRITE, i, v); a[i] = v; },
      note: function (i, j) { ops.push(CMP, i, j); }
    };
  }

  function bubble(R) {
    var a = R.a, end = a.length - 1;
    while (end > 0) {
      var last = 0;
      for (var i = 0; i < end; i++) {
        if (R.more(i, i + 1)) { R.swap(i, i + 1); last = i; }
      }
      end = last;
    }
  }

  function insertion(R) {
    var a = R.a;
    for (var i = 1; i < a.length; i++) {
      for (var j = i; j > 0 && R.more(j - 1, j); j--) R.swap(j - 1, j);
    }
  }

  function merge(R) {
    var a = R.a, aux = a.slice();
    function sort(lo, hi) {
      if (hi <= lo) return;
      var mid = (lo + hi) >> 1;
      sort(lo, mid);
      sort(mid + 1, hi);
      for (var k = lo; k <= hi; k++) aux[k] = a[k];
      var i = lo, j = mid + 1;
      for (k = lo; k <= hi; k++) {
        if (i > mid) R.write(k, aux[j++]);
        else if (j > hi) R.write(k, aux[i++]);
        else {
          // The values sit in aux; their old places are i and j.
          R.note(i, j);
          if (aux[j] < aux[i]) R.write(k, aux[j++]);
          else R.write(k, aux[i++]);
        }
      }
    }
    sort(0, a.length - 1);
  }

  // Hoare's partition around the middle value. p follows the pivot as it
  // gets swapped, so each comparison can point at two real bars.
  function quick(R) {
    var a = R.a;
    function sort(lo, hi) {
      if (lo >= hi) return;
      var p = (lo + hi) >> 1, i = lo, j = hi;
      while (i <= j) {
        while (R.more(p, i)) i++;
        while (R.more(j, p)) j--;
        if (i <= j) {
          if (i !== j) {
            R.swap(i, j);
            if (p === i) p = j; else if (p === j) p = i;
          }
          i++;
          j--;
        }
      }
      sort(lo, j);
      sort(i, hi);
    }
    sort(0, a.length - 1);
  }

  function heap(R) {
    var n = R.a.length;
    function sift(i, end) {
      for (;;) {
        var c = 2 * i + 1;
        if (c >= end) return;
        if (c + 1 < end && R.more(c + 1, c)) c++;
        if (!R.more(c, i)) return;
        R.swap(i, c);
        i = c;
      }
    }
    for (var s = (n >> 1) - 1; s >= 0; s--) sift(s, n);
    for (var e = n - 1; e > 0; e--) {
      R.swap(0, e);
      sift(0, e);
    }
  }

  var ALGOS = [bubble, insertion, merge, quick, heap];

  // ---- Data ----

  function makeData() {
    var a = [], i, j, t;
    for (i = 0; i < size; i++) a.push(i + 1);
    if (pattern === 'reversed') return a.reverse();
    if (pattern === 'nearly') {
      for (var k = 0; k < Math.max(2, Math.round(size / 12)); k++) {
        i = Math.floor(Math.random() * size);
        j = Math.min(size - 1, Math.max(0, i + Math.floor(Math.random() * 7) - 3));
        t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }
    if (pattern === 'few') {
      for (i = 0; i < size; i++) a[i] = Math.round(size * (1 + Math.floor(Math.random() * 4)) / 4);
      return a;
    }
    for (i = size - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function newRace() {
    var data = makeData();
    lanes = [];
    for (var k = 0; k < ALGOS.length; k++) {
      var R = recorder(data.slice());
      ALGOS[k](R);
      lanes.push({
        name: NAMES[k],
        a: data.slice(),
        ops: R.ops,
        pc: 0,
        cmp: 0,
        moves: 0,
        hi: -1,
        hj: -1,
        kind: -1,
        rank: -1,
        doneAt: 0
      });
    }
    colors = [];
    for (var v = 0; v <= size; v++) colors.push(V.gradient(V.SPECTRUM, v / size));
    steps = 0;
    finished = 0;
    acc = 0;
    stage.dirty = true;
  }

  // Replay one operation in every lane that isn't finished yet.
  function step() {
    if (!lanes || finished === lanes.length) return false;
    steps++;
    for (var k = 0; k < lanes.length; k++) {
      var L = lanes[k];
      if (L.rank >= 0) continue;
      var op = L.ops[L.pc], i = L.ops[L.pc + 1], j = L.ops[L.pc + 2];
      L.pc += 3;
      L.kind = op;
      L.hi = i;
      L.hj = op === WRITE ? -1 : j;
      if (op === CMP) L.cmp++;
      else if (op === SWAP) { var t = L.a[i]; L.a[i] = L.a[j]; L.a[j] = t; L.moves++; }
      else { L.a[i] = j; L.moves++; }
      if (sound && k === listen) note(L.a[i]);
      if (L.pc >= L.ops.length) {
        L.rank = finished++;
        L.doneAt = steps;
        L.hi = L.hj = -1;
      }
    }
    return true;
  }

  // A soft blip whose pitch follows the bar's height. Notes closer than
  // 40 ms are dropped so fast replays don't turn into noise.
  function note(v) {
    if (!audio) return;
    var now = audio.currentTime;
    if (now - lastNote < 0.04) return;
    lastNote = now;
    var osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 180 * Math.pow(2, 3 * v / size);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  // ---- Drawing ----

  function layout(st) {
    var W = st.width, H = st.height;
    var top = 64, pad = W < 480 ? 10 : 16, bottom = 10;
    var laneH = (H - top - bottom) / lanes.length;
    return { W: W, H: H, top: top, pad: pad, laneH: laneH, label: W < 480 ? 15 : 17 };
  }

  function frame(dt, st) {
    if (!lanes) newRace();
    var moved = false;
    if (playing) {
      acc += dt * rate;
      var n = Math.min(Math.floor(acc), 4000);
      acc -= Math.floor(acc);
      for (var s = 0; s < n; s++) if (step()) moved = true;
      if (finished === lanes.length) setPlaying(false);
    }
    if (!moved && !st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx, Lo = layout(st);
    layoutCache = Lo;
    ctx.clearRect(0, 0, Lo.W, Lo.H);
    var small = Lo.W < 480;
    var bw = (Lo.W - Lo.pad * 2) / size;
    var gap = bw > 4 ? 1 : 0;

    for (var k = 0; k < lanes.length; k++) {
      var L = lanes[k];
      var y0 = Lo.top + k * Lo.laneH;
      var barTop = y0 + Lo.label + 4, barBottom = y0 + Lo.laneH - 8;
      var bh = barBottom - barTop;

      // Lane background, brighter for the one being listened to.
      ctx.fillStyle = sound && k === listen ? 'rgba(110,231,255,0.07)' : 'rgba(236,232,223,0.025)';
      ctx.fillRect(Lo.pad - 6, y0, Lo.W - Lo.pad * 2 + 12, Lo.laneH - 4);

      ctx.font = '600 ' + (small ? 11 : 12) + 'px "IBM Plex Sans", system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = L.rank >= 0 ? '#7ee0a1' : '#ece8df';
      var ly = y0 + Lo.label / 2 + 2;
      ctx.fillText(L.name, Lo.pad, ly);

      ctx.font = '500 ' + (small ? 10 : 11) + 'px "IBM Plex Mono", monospace';
      ctx.fillStyle = '#9b9daf';
      var counts = L.cmp.toLocaleString() + (small ? ' cmp · ' : ' compares · ') +
        L.moves.toLocaleString() + (k === 2 ? ' writes' : ' swaps');
      ctx.fillText(counts, Lo.pad + (small ? 64 : 78), ly);
      if (L.rank >= 0) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#7ee0a1';
        ctx.fillText(RANKS[L.rank] + (small ? '' : ', step ' + L.doneAt.toLocaleString()), Lo.W - Lo.pad, ly);
      } else if (sound && k === listen) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#6ee7ff';
        ctx.fillText('listening', Lo.W - Lo.pad, ly);
      }

      for (var i = 0; i < size; i++) {
        var v = L.a[i], h = Math.max(1, v / size * bh);
        var hot = i === L.hi || i === L.hj;
        if (hot) ctx.fillStyle = L.kind === CMP ? '#ffffff' : '#ff5fa2';
        else ctx.fillStyle = colors[v];
        ctx.globalAlpha = hot || L.rank >= 0 ? 1 : 0.82;
        ctx.fillRect(Lo.pad + i * bw, barBottom - h, Math.max(1, bw - gap), h);
      }
      ctx.globalAlpha = 1;
    }

    V.setText(readout, 'Step ' + steps.toLocaleString() +
      '\n' + (finished === lanes.length ? 'All five sorted' : 'Sorted ' + finished + ' of 5'));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);

  playBtn.addEventListener('click', function () {
    if (!playing && lanes && finished === lanes.length) newRace();
    setPlaying(!playing);
  });

  V.ctl(section, 'step').addEventListener('click', function () {
    setPlaying(false);
    if (!lanes) newRace();
    step();
    stage.dirty = true;
  });

  V.ctl(section, 'shuffle').addEventListener('click', function () {
    newRace();
    setPlaying(true);
  });

  V.segmented(V.ctl(section, 'data'), function (v) {
    pattern = v;
    newRace();
  });

  V.segmented(V.ctl(section, 'size'), function (v) {
    size = parseInt(v, 10);
    newRace();
  });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return Math.round(Math.pow(2, v)).toLocaleString() + ' steps / s'; },
    function (v) { rate = Math.pow(2, v); });

  V.toggle(soundBtn, function (on) {
    sound = on;
    if (on && !audio) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { sound = false; soundBtn.setAttribute('aria-pressed', 'false'); return; }
      audio = new AC();
    }
    if (on && audio.state === 'suspended') audio.resume();
    stage.dirty = true;
  });

  // Click a lane to listen to it.
  canvas.addEventListener('click', function (e) {
    if (!lanes || !layoutCache) return;
    var r = canvas.getBoundingClientRect();
    var k = Math.floor((e.clientY - r.top - layoutCache.top) / layoutCache.laneH);
    if (k < 0 || k >= lanes.length) return;
    listen = k;
    stage.dirty = true;
  });
})();
