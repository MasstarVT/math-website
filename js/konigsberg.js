// Euler paths: a walk that uses every edge exactly once exists only when zero
// or two vertices have an odd number of edges. With two, it must start at one
// odd vertex and finish at the other. Routes are found by Hierholzer's method.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('konigsberg');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var graphGroup = V.ctl(section, 'graph');
  var riverBtn = V.ctl(section, 'river');
  var degreeBtn = V.ctl(section, 'degrees');
  var extraBtn = V.ctl(section, 'extra');

  var TAU = Math.PI * 2;
  var CYAN = '#6ee7ff', PINK = '#ff5fa2', GREEN = '#7ee0a1';
  var WATER = '#0f2231', LAND = '#0d0f16';

  // Unit-square drawings for the other puzzles: [x, y] corners and [a, b] edges.
  var SHAPES = {
    house: {
      verts: [[0, 1], [1, 1], [0, 0.42], [1, 0.42], [0.5, -0.08]],
      edges: [[0, 1], [0, 2], [1, 3], [2, 3], [0, 3], [1, 2], [2, 4], [3, 4]]
    },
    star: { verts: polygon(5), edges: complete(5) },
    box: {
      verts: [[0, 0], [1, 0], [1, 1], [0, 1]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3]]
    }
  };

  var kind = 'konigsberg';
  var showRiver = true, showDegrees = true, extra = false;
  var G = null;           // { verts, edges, river } laid out in canvas pixels
  var path = [];          // edges in the order crossed
  var start = -1, cur = -1;
  var walk = null;        // { e, from, t } while the walker crosses an edge
  var route = null;       // edges still to animate for "Show a route"
  var note = '';
  var flash = 0;          // pulse on the odd badges
  var leg = {};           // closest approach to each bridge during one drag leg
  var pulse = 0;
  var W = 0, H = 0;

  function polygon(n) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + i * TAU / n;
      out.push([Math.cos(a), Math.sin(a)]);
    }
    return out;
  }

  function complete(n) {
    var e = [];
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) e.push([i, j]);
    return e;
  }

  function smooth(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }

  // An edge is a quadratic curve from a to b that passes through (mx, my).
  function edge(verts, a, b, mx, my, plank) {
    var A = verts[a], B = verts[b];
    if (mx == null) { mx = (A.x + B.x) / 2; my = (A.y + B.y) / 2; }
    return { a: a, b: b, mx: mx, my: my, cx: 2 * mx - (A.x + B.x) / 2, cy: 2 * my - (A.y + B.y) / 2, plank: plank };
  }

  function point(e, t) {
    var A = G.verts[e.a], B = G.verts[e.b], u = 1 - t;
    return { x: u * u * A.x + 2 * u * t * e.cx + t * t * B.x, y: u * u * A.y + 2 * u * t * e.cy + t * t * B.y };
  }

  // ---- Layouts ----

  function layoutKonigsberg() {
    var cy = H * 0.56, xa = W * 0.36, ra = W * 0.13, ha = H * 0.085;
    var arm = Math.max(24, H * 0.075), hd = H * 0.12, xd = xa + ra + W * 0.1;
    var h1 = arm * 0.62, h2 = ha + arm, h3 = hd + arm;
    function half(x) {
      return h1 + (h2 - h1) * smooth((x - (xa - ra - arm * 2)) / (arm * 1.6)) +
        (h3 - h2) * smooth((x - (xa + ra * 0.7)) / (xd - xa - ra * 0.7));
    }
    function islandTop(x) {
      var d = (x - xa) / ra;
      return cy - ha * Math.sqrt(Math.max(0, 1 - d * d));
    }
    var verts = [
      { x: W * 0.56, y: Math.max(H * 0.2, 96), label: 'North bank' },
      { x: xa, y: cy, label: 'Kneiphof', bx: 0, by: -Math.max(17, ha * 0.55) },
      { x: (xd + W) / 2 + W * 0.04, y: cy, label: 'Lomse' },
      { x: W * 0.56, y: H * 0.88, label: 'South bank' }
    ];
    function vertical(x, y0, y1) {
      return { x: x, y: (y0 + y1) / 2, w: 11, h: Math.abs(y1 - y0) + 10 };
    }
    var xn1 = xa - ra * 0.45, xn2 = xa + ra * 0.45, xe1 = xd + (W - xd) * 0.42, xe2 = xd + (W - xd) * 0.5;
    var p = [
      [0, 1, vertical(xn1, cy - half(xn1), islandTop(xn1))],
      [0, 1, vertical(xn2, cy - half(xn2), islandTop(xn2))],
      [3, 1, vertical(xn1, cy + half(xn1), 2 * cy - islandTop(xn1))],
      [3, 1, vertical(xn2, cy + half(xn2), 2 * cy - islandTop(xn2))],
      [1, 2, { x: (xa + ra + xd) / 2, y: cy, w: xd - xa - ra + 10, h: 11 }],
      [0, 2, vertical(xe1, cy - half(xe1), cy - hd)],
      [3, 2, vertical(xe2, cy + half(xe2), cy + hd)]
    ];
    if (extra) {
      var xw = Math.max(W * 0.1, 30);
      p.push([0, 3, vertical(xw, cy - half(xw), cy + half(xw))]);
    }
    var edges = p.map(function (q) { return edge(verts, q[0], q[1], q[2].x, q[2].y, q[2]); });
    return { verts: verts, edges: edges, river: { cy: cy, xa: xa, ra: ra, ha: ha, hd: hd, xd: xd, half: half } };
  }

  function layoutShape(def) {
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    def.verts.forEach(function (p) {
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    });
    var top = 82, bottom = 36, side = 44;
    var s = Math.min((W - 2 * side) / (x1 - x0), (H - top - bottom) / (y1 - y0));
    var ox = (W - s * (x1 - x0)) / 2 - s * x0;
    var oy = top + (H - top - bottom - s * (y1 - y0)) / 2 - s * y0;
    var verts = def.verts.map(function (p) { return { x: ox + s * p[0], y: oy + s * p[1] }; });
    return { verts: verts, edges: def.edges.map(function (e) { return edge(verts, e[0], e[1]); }) };
  }

  function layout() {
    G = kind === 'konigsberg' ? layoutKonigsberg() : layoutShape(SHAPES[kind]);
    G.deg = G.verts.map(function () { return 0; });
    G.edges.forEach(function (e) { G.deg[e.a]++; G.deg[e.b]++; });
  }

  // ---- Walking ----

  function used(i) { return path.indexOf(i) >= 0; }
  function other(e, v) { return e.a === v ? e.b : e.a; }
  function word() { return kind === 'konigsberg' ? 'bridge' : 'line'; }

  function odds() {
    var list = [];
    G.deg.forEach(function (d, i) { if (d % 2) list.push(i); });
    return list;
  }

  function openAt(v) {
    var list = [];
    G.edges.forEach(function (e, i) { if (!used(i) && (e.a === v || e.b === v)) list.push(i); });
    return list;
  }

  function reset() {
    path = [];
    start = cur = -1;
    walk = null;
    route = null;
    note = '';
    leg = {};
    stage.dirty = true;
  }

  function begin(v) {
    start = cur = v;
    note = '';
    leg = {};
  }

  function cross(i) {
    if (walk) finishWalk();
    var e = G.edges[i];
    walk = { e: i, from: cur, t: V.reducedMotion ? 1 : 0 };
    path.push(i);
    cur = other(e, cur);
    leg = {};
    note = '';
    if (path.length === G.edges.length) {
      note = 'Every ' + word() + ' once!';
    } else if (!openAt(cur).length) {
      var left = G.edges.length - path.length;
      note = 'Stuck: ' + left + ' ' + word() + (left > 1 ? 's' : '') + ' left';
    }
    stage.dirty = true;
  }

  function finishWalk() { walk = null; }

  // Hierholzer: walk until stuck, then back up and splice in side loops.
  function eulerRoute(s) {
    var taken = G.edges.map(function () { return false; });
    var stack = [{ v: s, e: -1 }], out = [];
    while (stack.length) {
      var top = stack[stack.length - 1], next = -1;
      for (var i = 0; i < G.edges.length; i++) {
        var e = G.edges[i];
        if (!taken[i] && (e.a === top.v || e.b === top.v)) { next = i; break; }
      }
      if (next < 0) {
        out.push(top.e);
        stack.pop();
      } else {
        taken[next] = true;
        stack.push({ v: other(G.edges[next], top.v), e: next });
      }
    }
    out.pop();
    return out.reverse();
  }

  function showRoute() {
    var odd = odds();
    if (odd.length > 2) {
      reset();
      note = odd.length + ' odd places: no route';
      flash = 1;
      if (!showDegrees) { showDegrees = true; degreeBtn.setAttribute('aria-pressed', 'true'); }
      return;
    }
    var s = odd.length ? (odd.indexOf(start) >= 0 ? start : odd[0]) : (start >= 0 ? start : 0);
    reset();
    begin(s);
    route = eulerRoute(s);
    route.wait = 0.35;
  }

  // ---- Drawing ----

  function curve(ctx, e, t0, t1, reverse) {
    var n = 24;
    for (var k = 0; k <= n; k++) {
      var t = t0 + (t1 - t0) * k / n;
      var p = point(e, reverse ? 1 - t : t);
      if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
    }
  }

  function drawRiver(ctx) {
    var R = G.river, x;
    ctx.beginPath();
    for (x = -10; x <= W + 10; x += 6) ctx.lineTo(x, R.cy - R.half(x));
    for (x = W + 10; x >= -10; x -= 6) ctx.lineTo(x, R.cy + R.half(x));
    ctx.closePath();
    ctx.fillStyle = WATER;
    ctx.fill();
    ctx.strokeStyle = 'rgba(110,231,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Kneiphof island and the land of Lomse between the two arms.
    ctx.fillStyle = LAND;
    ctx.beginPath();
    ctx.ellipse(R.xa, R.cy, R.ra, R.ha, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W + 10, R.cy - R.hd);
    ctx.lineTo(R.xd + R.hd, R.cy - R.hd);
    ctx.arc(R.xd + R.hd, R.cy, R.hd, -Math.PI / 2, Math.PI / 2, true);
    ctx.lineTo(W + 10, R.cy + R.hd);
    ctx.fill();
    ctx.stroke();

    // A few ripples down the middle of each channel.
    ctx.strokeStyle = 'rgba(110,231,255,0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (x = 10; x < W; x += 30) {
      var inner = -1, d = (x - R.xa) / R.ra;
      if (x < R.xa - R.ra * 1.3) inner = 0;
      else if (Math.abs(d) < 0.8) inner = R.ha * Math.sqrt(1 - d * d);
      else if (x > R.xd + R.hd * 0.5) inner = R.hd;
      if (inner < 0) continue;
      if (!inner) {
        ctx.moveTo(x, R.cy); ctx.lineTo(x + 11, R.cy);
        continue;
      }
      var mid = (R.half(x) + inner) / 2;
      ctx.moveTo(x, R.cy - mid); ctx.lineTo(x + 11, R.cy - mid);
      ctx.moveTo(x + 8, R.cy + mid); ctx.lineTo(x + 19, R.cy + mid);
    }
    ctx.stroke();

    // The bridges themselves.
    G.edges.forEach(function (e, i) {
      var b = e.plank, on = used(i);
      ctx.fillStyle = on ? CYAN : '#cfc7b6';
      ctx.globalAlpha = on ? 0.95 : 0.85;
      ctx.beginPath();
      ctx.roundRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(10,11,16,0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  function badge(ctx, v, d, odd, glow) {
    var x = v.x + (v.bx == null ? -20 : v.bx), y = v.y + (v.by == null ? -19 : v.by);
    ctx.beginPath();
    ctx.arc(x, y, 10 + glow * 3, 0, TAU);
    ctx.fillStyle = odd ? 'rgba(255,95,162,' + (0.2 + glow * 0.4) + ')' : 'rgba(126,224,161,0.16)';
    ctx.fill();
    ctx.strokeStyle = odd ? PINK : GREEN;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.fillStyle = odd ? PINK : GREEN;
    ctx.font = '600 12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(d), x, y + 0.5);
  }

  function draw(st) {
    var ctx = st.ctx, river = kind === 'konigsberg' && showRiver;
    ctx.clearRect(0, 0, W, H);
    if (river) drawRiver(ctx);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Edges still to cross.
    ctx.setLineDash(river ? [2, 6] : []);
    ctx.strokeStyle = river ? 'rgba(236,232,223,0.42)' : 'rgba(236,232,223,0.5)';
    ctx.lineWidth = river ? 1.5 : 3;
    ctx.beginPath();
    G.edges.forEach(function (e, i) {
      if (!used(i)) curve(ctx, e, 0, 1, false);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Edges crossed, with the one in progress drawn as far as the walker has got.
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = river ? 3 : 4;
    ctx.shadowColor = 'rgba(110,231,255,0.6)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    path.forEach(function (i) {
      var e = G.edges[i];
      if (walk && walk.e === i) curve(ctx, e, 0, V.easeInOut(walk.t), walk.from === e.b);
      else curve(ctx, e, 0, 1, false);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Order numbers along the crossed edges.
    ctx.font = '600 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    path.forEach(function (i, k) {
      if (walk && walk.e === i && walk.t < 1) return;
      var e = G.edges[i], p = river ? { x: e.mx, y: e.my } : point(e, 0.42);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, TAU);
      ctx.fillStyle = '#0a0b10';
      ctx.fill();
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.fillStyle = CYAN;
      ctx.fillText(String(k + 1), p.x, p.y + 0.5);
    });

    // Vertices.
    var oddList = odds();
    G.verts.forEach(function (v, i) {
      var here = i === cur;
      if (here && note.indexOf('Every') !== 0) {
        var r = 14 + 6 * (0.5 + 0.5 * Math.sin(pulse * 4));
        ctx.beginPath();
        ctx.arc(v.x, v.y, r, 0, TAU);
        ctx.strokeStyle = 'rgba(110,231,255,0.45)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(v.x, v.y, here ? 9 : 7.5, 0, TAU);
      ctx.fillStyle = here ? CYAN : '#ece8df';
      ctx.fill();
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (i === start && start !== cur) {
        ctx.beginPath();
        ctx.arc(v.x, v.y, 13, 0, TAU);
        ctx.strokeStyle = 'rgba(110,231,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (v.label) {
        ctx.font = '500 11px "IBM Plex Mono", monospace';
        ctx.fillStyle = 'rgba(236,232,223,0.72)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.strokeStyle = LAND;
        ctx.lineWidth = 4;
        ctx.strokeText(v.label, v.x, v.y + 13);
        ctx.fillText(v.label, v.x, v.y + 13);
      }
      if (showDegrees) badge(ctx, v, G.deg[i], oddList.indexOf(i) >= 0, flash * (0.5 + 0.5 * Math.sin(pulse * 9)));
    });

    // The walker.
    if (walk && walk.t < 1) {
      var e = G.edges[walk.e], p = point(e, walk.from === e.a ? V.easeInOut(walk.t) : 1 - V.easeInOut(walk.t));
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = CYAN;
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    var total = G.edges.length, w = word();
    var status = note;
    if (!status) {
      if (start < 0) status = kind === 'konigsberg' ? 'Tap a piece of land to start' : 'Tap a corner to start';
      else status = oddList.length + ' odd ' + (kind === 'konigsberg' ? 'places' : 'corners');
    }
    V.setText(readout, (w === 'bridge' ? 'Bridges' : 'Lines') + ' crossed ' + path.length + ' of ' + total + '\n' + status);
  }

  function frame(dt, st) {
    W = st.width;
    H = st.height;
    var busy = false;
    if (walk) {
      walk.t = Math.min(1, walk.t + dt / 0.4);
      if (walk.t >= 1) walk = null;
      busy = true;
    }
    if (route) {
      busy = true;
      route.wait -= dt;
      if (!walk && route.wait <= 0) {
        if (route.length) {
          cross(route.shift());
          route.wait = 0.2;
        } else {
          route = null;
        }
      }
    }
    if (flash > 0) { flash = Math.max(0, flash - dt * 0.4); busy = true; }
    if (start >= 0 && !V.reducedMotion && note.indexOf('Every') !== 0) busy = true;
    pulse += dt;
    if (!busy && !st.dirty) return;
    st.dirty = false;
    draw(st);
  }

  var stage = V.createStage(canvas, {
    frame: frame,
    resize: function (st) { W = st.width; H = st.height; layout(); }
  });

  // ---- Pointer ----

  function nearestEdge(x, y) {
    var best = -1, bd = Infinity;
    G.edges.forEach(function (e, i) {
      for (var k = 0; k <= 16; k++) {
        var p = point(e, k / 16), d = Math.hypot(p.x - x, p.y - y);
        if (d < bd) { bd = d; best = i; }
      }
      if (e.plank && Math.abs(x - e.plank.x) < e.plank.w / 2 + 6 && Math.abs(y - e.plank.y) < e.plank.h / 2 + 6) {
        bd = 0; best = i;
      }
    });
    return { i: best, d: bd };
  }

  function nearestVertex(x, y) {
    var best = -1, bd = Infinity;
    G.verts.forEach(function (v, i) {
      var d = Math.hypot(v.x - x, v.y - y);
      if (d < bd) { bd = d; best = i; }
    });
    return { i: best, d: bd };
  }

  function tapEdge(i, x, y) {
    var e = G.edges[i];
    if (start < 0) {
      var da = Math.hypot(G.verts[e.a].x - x, G.verts[e.a].y - y);
      var db = Math.hypot(G.verts[e.b].x - x, G.verts[e.b].y - y);
      begin(da < db ? e.a : e.b);
    }
    if (used(i)) note = 'Already crossed that one';
    else if (e.a !== cur && e.b !== cur) note = 'That ' + word() + " isn't here";
    else cross(i);
  }

  // Arriving at a neighbor crosses whichever open edge the pointer passed nearest.
  function arrive(v) {
    var best = -1, bd = Infinity;
    openAt(cur).forEach(function (i) {
      if (other(G.edges[i], cur) !== v) return;
      var d = leg[i] == null ? 1e9 : leg[i];
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) cross(best);
  }

  V.drag(canvas, {
    hit: function (x, y) {
      if (!G) return null;
      var nv = nearestVertex(x, y);
      if (nv.d < 24) return { v: nv.i };
      var ne = nearestEdge(x, y);
      if (ne.d < 13) return { e: ne.i };
      return null;
    },
    move: function (h, x, y, first) {
      if (first) {
        route = null;
        if (note.indexOf('Every') === 0 || note.indexOf('odd places') > 0) reset();
        if (h.v != null) {
          if (start < 0) begin(h.v);
          else if (h.v !== cur) {
            leg = {};
            arrive(h.v);
            if (cur !== h.v) note = 'No open ' + word() + ' to there';
          }
        } else {
          tapEdge(h.e, x, y);
        }
        stage.dirty = true;
        return;
      }
      if (start < 0) return;
      openAt(cur).forEach(function (i) {
        var e = G.edges[i], d = Math.hypot(e.mx - x, e.my - y);
        if (leg[i] == null || d < leg[i]) leg[i] = d;
      });
      var nv = nearestVertex(x, y);
      if (nv.d < 22 && nv.i !== cur) arrive(nv.i);
    }
  });

  // ---- Controls ----

  function setKind(k) {
    kind = k;
    riverBtn.hidden = extraBtn.hidden = k !== 'konigsberg';
    if (W) layout();
    reset();
  }

  V.segmented(graphGroup, setKind);
  V.toggle(riverBtn, function (on) { showRiver = on; stage.dirty = true; });
  V.toggle(degreeBtn, function (on) { showDegrees = on; stage.dirty = true; });
  V.toggle(extraBtn, function (on) { extra = on; if (W) layout(); reset(); });

  V.ctl(section, 'route').addEventListener('click', showRoute);
  V.ctl(section, 'undo').addEventListener('click', function () {
    route = null;
    walk = null;
    if (path.length) {
      var i = path.pop();
      cur = other(G.edges[i], cur);
      note = '';
    } else {
      start = cur = -1;
    }
    stage.dirty = true;
  });
  V.ctl(section, 'reset').addEventListener('click', reset);

  if (W) layout();
})();
