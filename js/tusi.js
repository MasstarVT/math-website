// The Tusi couple: a circle of radius r rolling inside one of radius 2r. A rim
// point at angle α sits at 2r·cos(φ − α/2)·(cos α/2, sin α/2), a straight line
// through the center. Points inside the small circle trace ellipses instead.
(function () {
  'use strict';
  var V = window.MathViz;
  var section = document.getElementById('tusi');
  if (!section) return;

  var canvas = section.querySelector('canvas');
  var readout = V.ctl(section, 'readout');
  var playBtn = V.ctl(section, 'play');

  var dots = 8;
  var reach = 1;          // dot distance from the small circle's center, in radii
  var speed = 1;
  var phi = 0.6;          // where the small circle's center is
  var playing = !V.reducedMotion;
  var showCircle = true;
  var showTracks = true;
  var dragging = false;
  var geo = { cx: 0, cy: 0, R: 1 };

  // Rim point j relative to the big circle's center, in units of the big radius.
  function point(j, f) {
    var a = 2 * Math.PI * j / dots;
    return [
      0.5 * Math.cos(f) + 0.5 * reach * Math.cos(a - f),
      0.5 * Math.sin(f) + 0.5 * reach * Math.sin(a - f)
    ];
  }

  function frame(dt, st) {
    if (playing && !dragging) {
      phi += dt * speed * 0.8;
      st.dirty = true;
    }
    if (!st.dirty) return;
    st.dirty = false;

    var W = st.width, H = st.height, ctx = st.ctx;
    // Keep the big circle below the readout.
    var R = Math.min((W - 32) / 2, (H - 78) / 2);
    var cx = W / 2, cy = 66 + R;
    geo.cx = cx; geo.cy = cy; geo.R = R;
    ctx.clearRect(0, 0, W, H);

    // The fixed circle.
    ctx.strokeStyle = 'rgba(236,232,223,0.32)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // Tracks: diameters when the dots are on the rim, ellipses inside it.
    var j, k, p;
    if (showTracks) {
      ctx.lineWidth = 1.25;
      for (j = 0; j < dots; j++) {
        ctx.strokeStyle = V.gradient(V.SPECTRUM, dots > 1 ? j / (dots - 1) : 0);
        ctx.globalAlpha = 0.28;
        ctx.beginPath();
        if (reach > 0.999) {
          var h = Math.PI * j / dots;
          ctx.moveTo(cx - R * Math.cos(h), cy - R * Math.sin(h));
          ctx.lineTo(cx + R * Math.cos(h), cy + R * Math.sin(h));
        } else {
          for (k = 0; k <= 120; k++) {
            p = point(j, Math.PI * 2 * k / 120);
            if (k) ctx.lineTo(cx + p[0] * R, cy + p[1] * R); else ctx.moveTo(cx + p[0] * R, cy + p[1] * R);
          }
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // The rolling circle and its spokes.
    var sx = cx + 0.5 * R * Math.cos(phi), sy = cy + 0.5 * R * Math.sin(phi);
    if (showCircle) {
      ctx.fillStyle = 'rgba(126,224,161,0.06)';
      ctx.strokeStyle = 'rgba(126,224,161,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, R / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(126,224,161,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (j = 0; j < dots; j++) {
        p = point(j, phi);
        ctx.moveTo(sx, sy);
        ctx.lineTo(cx + p[0] * R, cy + p[1] * R);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(126,224,161,0.9)';
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // The dots.
    var dr = Math.max(4.5, Math.min(9, R * 0.035));
    for (j = 0; j < dots; j++) {
      p = point(j, phi);
      ctx.fillStyle = V.gradient(V.SPECTRUM, dots > 1 ? j / (dots - 1) : 0);
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + p[0] * R, cy + p[1] * R, dr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // The small circle turns backward once for every lap it makes.
    var laps = phi / (Math.PI * 2);
    V.setText(readout, dots + (dots === 1 ? ' dot' : ' dots') + ', each on ' +
      (reach > 0.999 ? 'a straight line' : 'an ellipse') + '\n' +
      'Laps around the big circle: ' + Math.abs(laps).toFixed(1));
  }

  var stage = V.createStage(canvas, { frame: frame });

  // ---- Drag the small circle to roll it by hand ----

  V.drag(canvas, {
    hit: function (x, y) {
      var sx = geo.cx + 0.5 * geo.R * Math.cos(phi), sy = geo.cy + 0.5 * geo.R * Math.sin(phi);
      return Math.hypot(x - sx, y - sy) < geo.R * 0.5 ? 'roll' : null;
    },
    move: function (h, x, y) {
      dragging = true;
      var a = Math.atan2(y - geo.cy, x - geo.cx);
      // Unwrap so the lap count keeps adding up.
      var d = a - phi;
      d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
      phi += d;
      stage.dirty = true;
    },
    end: function () { dragging = false; }
  });

  // ---- Controls ----

  function setPlaying(p) {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  setPlaying(playing);
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  V.segmented(V.ctl(section, 'dots'), function (v) {
    dots = parseInt(v, 10);
    stage.dirty = true;
  });

  V.range(V.ctl(section, 'reach'), V.ctl(section, 'reach-out'),
    function (v) { return v >= 1 ? 'on the rim' : v === 0 ? 'at the center' : Math.round(v * 100) + '% of the way out'; },
    function (v) { reach = v; stage.dirty = true; });

  V.range(V.ctl(section, 'speed'), V.ctl(section, 'speed-out'),
    function (v) { return '×' + v; },
    function (v) { speed = v; });

  V.toggle(V.ctl(section, 'circle'), function (on) { showCircle = on; stage.dirty = true; });
  V.toggle(V.ctl(section, 'tracks'), function (on) { showTracks = on; stage.dirty = true; });
})();
