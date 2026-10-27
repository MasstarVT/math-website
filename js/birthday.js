// Birthday paradox: fill rooms with people who have random birthdays and
// count how often two of them share one. With 23 people it's better than even.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('birthday');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var MAX_PEOPLE = 70;
  var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var ARRIVE = 0.7;        // fraction of a room spent letting people in
  var ANIMATE_BELOW = 5;   // rooms per second; faster than this, skip arrivals
  var REFRESH = 0.35;      // seconds between redrawn calendars at high speed
  var STEP_TIME = 2.5;
  var MATCH = '#a78bfa';

  // Day of the year -> month and date.
  var monthOf = [], dateOf = [];
  MONTH_DAYS.forEach(function (len, m) {
    for (var d = 1; d <= len; d++) { monthOf.push(m); dateOf.push(d); }
  });

  // The exact chance of at least one shared birthday among k people.
  var exact = [0];
  for (var k = 1, none = 1; k <= MAX_PEOPLE; k++) {
    none *= (365 - (k - 1)) / 365;
    exact.push(1 - none);
  }

  var people = 23;
  var rate = 3;
  var playing = !V.reducedMotion;
  var stepping = false;
  var stats = [];          // per room size: { rooms, matches }
  var room = null;
  var acc = 0;
  var sinceShown = 0;

  function clearStats() {
    stats = [];
    for (var i = 0; i <= MAX_PEOPLE; i++) stats.push({ rooms: 0, matches: 0 });
  }

  function newRoom() {
    var days = [], seen = {}, firstMatch = -1;
    for (var i = 0; i < people; i++) {
      var d = Math.floor(Math.random() * 365);
      if (seen[d] && firstMatch < 0) firstMatch = i;
      seen[d] = (seen[d] || 0) + 1;
      days.push(d);
    }
    return { days: days, firstMatch: firstMatch, t: 0, counted: false };
  }

  function advance(r, dt) {
    r.t = Math.min(1, r.t + dt);
    if (r.t >= ARRIVE && !r.counted) {
      r.counted = true;
      stats[people].rooms++;
      if (r.firstMatch >= 0) stats[people].matches++;
    }
  }

  function frame(dt, st) {
    if (stepping) {
      advance(room, dt / STEP_TIME);
      if (room.t >= 1) stepping = false;
    } else if (playing && rate < ANIMATE_BELOW) {
      if (room.t >= 1) room = newRoom();
      advance(room, dt * rate);
    } else if (playing) {
      acc += dt * rate;
      sinceShown += dt;
      var m = Math.floor(acc);
      acc -= m;
      for (var i = 0; i < m; i++) {
        var r = newRoom();
        advance(r, 1);
        if (sinceShown >= REFRESH) {
          room = r;
          sinceShown = 0;
        }
      }
    }
    draw(st);
  }

  function draw(st) {
    var ctx = st.ctx, W = st.width, H = st.height;
    ctx.clearRect(0, 0, W, H);
    var i;

    // ---- Calendar: one row per month, one square per day ----
    var shown = Math.min(people, Math.ceil(room.t / ARRIVE * people));
    var counts = {};
    for (i = 0; i < shown; i++) counts[room.days[i]] = (counts[room.days[i]] || 0) + 1;

    var calTop = 64, labelW = 30;
    var cell = Math.min((W - labelW - 16) / 31, (H * 0.5 - calTop) / 12);
    var calLeft = labelW + (W - labelW - 16 - cell * 31) / 2;
    var gap = Math.max(1, cell * 0.14);

    ctx.font = '500 ' + Math.min(11, cell * 0.8) + 'px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (var mo = 0; mo < 12; mo++) {
      ctx.fillStyle = '#6f7286';
      ctx.fillText(MONTHS[mo], calLeft - 6, calTop + (mo + 0.5) * cell);
    }
    var matchDay = -1, matchCount = 0;
    for (var day = 0; day < 365; day++) {
      var x = calLeft + (dateOf[day] - 1) * cell + gap / 2;
      var y = calTop + monthOf[day] * cell + gap / 2;
      var c = counts[day] || 0;
      if (c >= 2) {
        ctx.fillStyle = MATCH;
        if (c > matchCount) { matchCount = c; matchDay = day; }
      } else if (c === 1) {
        ctx.fillStyle = '#c4c1ba';
      } else {
        ctx.fillStyle = 'rgba(236,232,223,0.06)';
      }
      ctx.fillRect(x, y, cell - gap, cell - gap);
      if (c >= 2) {
        ctx.strokeStyle = MATCH;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 2, y - 2, cell - gap + 4, cell - gap + 4);
      }
    }

    var statusY = calTop + 12 * cell + 12;
    ctx.font = '500 13px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (matchDay >= 0) {
      ctx.fillStyle = MATCH;
      ctx.fillText(matchCount + ' people share ' + MONTHS[monthOf[matchDay]] + ' ' + dateOf[matchDay] +
        (shown === people ? '' : '…'), W / 2, statusY);
    } else {
      ctx.fillStyle = '#9b9daf';
      ctx.fillText(shown < people ? shown + ' of ' + people + ' people in the room…' : 'No shared birthday this time',
        W / 2, statusY);
    }

    // ---- Chart: the exact chance for every room size, plus what we've seen ----
    var L = { left: 16, right: W - 50, top: statusY + 34, bottom: H - 28 };
    var plotW = L.right - L.left, plotH = L.bottom - L.top;
    function px(k) { return L.left + k / MAX_PEOPLE * plotW; }
    function py(p) { return L.bottom - p * plotH; }

    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.lineWidth = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    [[0, '0%'], [0.5, '50%'], [1, '100%']].forEach(function (t) {
      var ty = Math.round(py(t[0])) + 0.5;
      ctx.strokeStyle = t[0] === 0.5 ? 'rgba(236,232,223,0.35)' : 'rgba(236,232,223,0.08)';
      if (t[0] === 0.5) ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(L.left, ty);
      ctx.lineTo(L.right, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#6f7286';
      ctx.fillText(t[1], L.right + 8, ty);
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (i = 10; i <= MAX_PEOPLE; i += 10) {
      ctx.fillStyle = '#6f7286';
      ctx.fillText(String(i), px(i), L.bottom + 9);
    }

    // Marker for the current room size.
    var mx = Math.round(px(people)) + 0.5;
    ctx.strokeStyle = 'rgba(167,139,250,0.5)';
    ctx.beginPath();
    ctx.moveTo(mx, L.top);
    ctx.lineTo(mx, L.bottom);
    ctx.stroke();

    ctx.strokeStyle = '#ece8df';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (i = 1; i <= MAX_PEOPLE; i++) {
      if (i > 1) ctx.lineTo(px(i), py(exact[i])); else ctx.moveTo(px(i), py(exact[i]));
    }
    ctx.stroke();

    for (i = 2; i <= MAX_PEOPLE; i++) {
      var s = stats[i];
      if (!s.rooms) continue;
      ctx.fillStyle = MATCH;
      ctx.beginPath();
      ctx.arc(px(i), py(s.matches / s.rooms), i === people ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (i === people) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    var cur = stats[people];
    V.setText(readout, 'Rooms of ' + people + ': ' + cur.rooms.toLocaleString() + '\n' +
      'Shared birthday ' + (cur.rooms ? (cur.matches / cur.rooms * 100).toFixed(1) + '%' : '–') +
      '   exact ' + (exact[people] * 100).toFixed(1) + '%');
  }

  clearStats();
  room = newRoom();
  if (!playing) room.t = 1;
  V.createStage(canvas, { frame: frame });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () {
    stepping = false;
    setPlaying(!playing);
  });

  V.ctl(section, 'one').addEventListener('click', function () {
    setPlaying(false);
    room = newRoom();
    stepping = true;
  });

  V.ctl(section, 'reset').addEventListener('click', function () {
    clearStats();
    stepping = false;
    room = newRoom();
  });

  V.range(V.ctl(section, 'people'), V.ctl(section, 'people-out'),
    function (v) { return v + ' people'; },
    function (v) {
      if (v === people) return;
      people = v;
      stepping = false;
      room = newRoom();
      if (!playing) room.t = 1;
    });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) {
      var r = Math.pow(10, v);
      return (r < 10 ? r.toFixed(1) : Math.round(r).toLocaleString()) + ' rooms / second';
    },
    function (v) { rate = Math.pow(10, v); });

})();
