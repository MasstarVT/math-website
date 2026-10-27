// Shared helpers for every visualization: HiDPI canvas sizing, an animation
// loop that only runs while its canvas is on screen, and small UI bindings.
(function () {
  'use strict';

  var reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // opts.frame(dt, stage) runs every animation frame while the canvas is
  // visible. opts.resize(stage) runs after the backing store is resized.
  // opts.context: '2d' (default) or 'none' when the caller makes its own.
  function createStage(canvas, opts) {
    opts = opts || {};
    var stage = {
      canvas: canvas,
      ctx: opts.context === 'none' ? null : canvas.getContext('2d'),
      width: 0,
      height: 0,
      dpr: 1,
      visible: false,
      dirty: true
    };
    var raf = 0;
    var last = 0;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.round(rect.width * dpr);
      var h = Math.round(rect.height * dpr);
      stage.width = rect.width;
      stage.height = rect.height;
      stage.dpr = dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      if (stage.ctx) stage.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stage.dirty = true;
      if (opts.resize) opts.resize(stage);
    }

    function tick(now) {
      raf = 0;
      if (!stage.visible) return;
      var dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      if (stage.width && opts.frame) opts.frame(dt, stage);
      raf = requestAnimationFrame(tick);
    }

    function start() {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver(function (entries) {
      stage.visible = entries[entries.length - 1].isIntersecting;
      if (stage.visible) start(); else stop();
    }, { rootMargin: '120px 0px' }).observe(canvas);

    resize();
    return stage;
  }

  // Drag handles on a canvas. opts.hit(x, y) returns the handle under a point
  // (any truthy value) or null; opts.move(handle, x, y, first) follows the
  // pointer and opts.end(handle) runs on release. Touches that miss every
  // handle still scroll the page.
  function drag(canvas, opts) {
    var active = null;

    function at(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      var p = at(e.touches[0]);
      if (opts.hit(p.x, p.y)) e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      var p = at(e);
      active = opts.hit(p.x, p.y);
      if (!active) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = opts.cursor || '';
      canvas.classList.add('is-grabbing');
      opts.move(active, p.x, p.y, true);
    });

    canvas.addEventListener('pointermove', function (e) {
      var p = at(e);
      if (active) opts.move(active, p.x, p.y, false);
      else if (e.pointerType === 'mouse') canvas.style.cursor = opts.hit(p.x, p.y) ? (opts.cursor || 'grab') : '';
    });

    function release() {
      if (!active) return;
      var h = active;
      active = null;
      canvas.classList.remove('is-grabbing');
      if (opts.end) opts.end(h);
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  // Look up a [data-ctl] element inside a section.
  function ctl(section, name) {
    return section.querySelector('[data-ctl="' + name + '"]');
  }

  // A group of buttons where exactly one is pressed.
  function segmented(group, fn) {
    group.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn || !group.contains(btn)) return;
      setSegmented(group, btn.dataset.value);
      fn(btn.dataset.value);
    });
  }

  function setSegmented(group, value) {
    group.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.value === value));
    });
  }

  // An on/off button using aria-pressed.
  function toggle(btn, fn) {
    btn.addEventListener('click', function () {
      var on = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(on));
      fn(on);
    });
  }

  // A range input with a live <output>. Calls fn once immediately.
  function range(input, output, format, fn) {
    function update() {
      var v = parseFloat(input.value);
      if (output) output.textContent = format(v);
      fn(v);
    }
    input.addEventListener('input', update);
    update();
    return update;
  }

  // Avoid touching the DOM when a readout hasn't changed.
  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  // Sample a list of [r, g, b] stops at t in [0, 1].
  function gradient(stops, t) {
    t = Math.max(0, Math.min(1, t)) * (stops.length - 1);
    var i = Math.min(Math.floor(t), stops.length - 2);
    var f = t - i;
    var a = stops[i];
    var b = stops[i + 1];
    return 'rgb(' +
      Math.round(a[0] + (b[0] - a[0]) * f) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * f) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * f) + ')';
  }

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Highlight the nav link of the section currently in view.
  // The nav scrolls sideways when it doesn't fit, so keep the active link in view.
  function trackNav() {
    var nav = document.querySelector('.topnav');
    var links = {};
    document.querySelectorAll('.topnav a').forEach(function (a) {
      links[a.getAttribute('href').slice(1)] = a;
    });
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = links[entry.target.id];
        if (!link) return;
        link.classList.toggle('is-active', entry.isIntersecting);
        if (entry.isIntersecting && nav.scrollWidth > nav.clientWidth) {
          nav.scrollTo({
            left: link.offsetLeft - nav.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2,
            behavior: reducedMotion ? 'auto' : 'smooth'
          });
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('.viz').forEach(function (s) { observer.observe(s); });
  }

  trackNav();

  window.MathViz = {
    reducedMotion: reducedMotion,
    createStage: createStage,
    drag: drag,
    ctl: ctl,
    segmented: segmented,
    setSegmented: setSegmented,
    toggle: toggle,
    range: range,
    setText: setText,
    gradient: gradient,
    easeInOut: easeInOut,
    // Shared palette, cool to warm.
    SPECTRUM: [
      [110, 231, 255],
      [124, 140, 255],
      [196, 107, 255],
      [255, 95, 162],
      [255, 138, 92],
      [255, 209, 102]
    ]
  };
})();
