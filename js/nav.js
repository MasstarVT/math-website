// Tabs, search and tags for finding a visualization. Everything here is built
// from the sections themselves: each <section class="viz"> names its tab with
// data-group, its tags with data-tags, and its nav label and index line with
// data-short and data-blurb. Adding a visualization never touches this file
// unless it needs a new tab.
(function () {
  'use strict';
  var V = window.MathViz;

  // The tabs, in order. A section's data-group is one of these ids.
  var GROUPS = [
    { id: 'geometry', label: 'Geometry', about: 'Shapes, tilings and a fourth dimension.' },
    { id: 'fractals', label: 'Fractals', about: 'Shapes with smaller copies of themselves inside, all the way down.' },
    { id: 'dynamics', label: 'Chaos', about: 'Simple rules, repeated, that grow wild or build something nobody planned.' },
    { id: 'chance', label: 'Chance', about: 'Randomness, and the patterns it can’t help making.' },
    { id: 'numbers', label: 'Numbers', about: 'Patterns hiding in primes, sequences and times tables.' },
    { id: 'motion', label: 'Curves & motion', about: 'Spinning circles, swinging pendulums, series, and the curves they trace.' }
  ];
  // Sections with a missing or unknown data-group still show up, here.
  var OTHER = { id: 'other', label: 'More', about: '' };

  var root = document.documentElement;
  var main = document.querySelector('main');
  var bar = document.querySelector('.topbar');
  var hero = document.querySelector('.hero');
  var tabRow = V.ctl(bar, 'tabs');
  var linkRow = bar.querySelector('.topnav');
  var finder = V.ctl(hero, 'finder');
  var search = V.ctl(hero, 'search');
  var countEl = V.ctl(hero, 'count');
  var clearBtn = V.ctl(hero, 'clear');
  var tagRow = V.ctl(hero, 'tags');
  var indexEl = V.ctl(hero, 'index');
  var emptyEl = V.ctl(hero, 'empty');
  var nextEl = V.ctl(main, 'next-tab');

  // Lowercase, drop accents and punctuation, and spell π out, so "recaman"
  // finds Recamán and "pi" finds π.
  function normalize(s) {
    return ' ' + s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/π/g, ' pi ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim() + ' ';
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  var groupById = {};
  GROUPS.forEach(function (g) {
    g.items = [];
    groupById[g.id] = g;
  });
  OTHER.items = [];

  var itemById = {};
  document.querySelectorAll('.viz').forEach(function (section) {
    var group = groupById[section.dataset.group];
    if (!group) {
      console.warn('Section #' + section.id + ' has no known data-group, so it is listed under "' + OTHER.label + '".');
      group = OTHER;
    }
    var title = section.querySelector('h2').textContent;
    var item = {
      id: section.id,
      section: section,
      group: group,
      title: title,
      short: section.dataset.short || title,
      blurb: section.dataset.blurb || '',
      tags: (section.dataset.tags || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean)
    };
    item.text = normalize([
      title, item.short, item.blurb, item.tags.join(' '), group.label,
      section.querySelector('.viz-text').textContent
    ].join(' '));
    group.items.push(item);
    itemById[item.id] = item;

    // The kicker leads with the tab name, in the section's accent color.
    var kicker = section.querySelector('.kicker');
    if (kicker) kicker.prepend(el('b', '', group.label));
  });

  var groups = GROUPS.concat(OTHER).filter(function (g) { return g.items.length; });
  // Display order: tab by tab, and within a tab in the order of the HTML.
  var items = [];
  groups.forEach(function (g) { items = items.concat(g.items); });
  items.forEach(function (it) { main.insertBefore(it.section, nextEl); });

  var state = { group: 'all', tag: '', query: '' };
  var startTab = new URLSearchParams(location.search).get('tab');
  if (groupById[startTab] && groupById[startTab].items.length) state.group = startTab;

  // ---------- Building the pieces ----------

  [{ id: 'all', label: 'All', items: items }].concat(groups).forEach(function (g) {
    var btn = el('button', '', g.label);
    btn.type = 'button';
    btn.dataset.value = g.id;
    btn.setAttribute('aria-pressed', String(g.id === state.group));
    btn.appendChild(el('span', '', g.items.length));
    tabRow.appendChild(btn);
  });
  V.segmented(tabRow, function (id) { selectGroup(id); });

  items.forEach(function (it) {
    it.link = el('a', '', it.short);
    it.link.href = '#' + it.id;
    linkRow.appendChild(it.link);
  });

  groups.forEach(function (g) {
    g.block = el('section', 'index-group');
    var heading = el('h2', 'index-heading', g.label);
    g.countEl = el('span');
    heading.appendChild(g.countEl);
    g.block.appendChild(heading);
    if (g.about) g.block.appendChild(el('p', 'index-about', g.about));
    var list = el('ul', 'toc');
    g.items.forEach(function (it) {
      var a = el('a');
      a.href = '#' + it.id;
      a.style.setProperty('--accent', it.section.style.getPropertyValue('--accent'));
      a.appendChild(el('b', '', it.title));
      if (it.blurb) a.appendChild(el('span', '', it.blurb));
      it.card = el('li');
      it.card.appendChild(a);
      list.appendChild(it.card);
    });
    g.block.appendChild(list);
    indexEl.appendChild(g.block);
  });

  // Tags, most used first.
  var tagCount = {};
  items.forEach(function (it) {
    it.tags.forEach(function (t) { tagCount[t] = (tagCount[t] || 0) + 1; });
  });
  var tagChips = Object.keys(tagCount).sort(function (a, b) {
    return tagCount[b] - tagCount[a] || a.localeCompare(b);
  }).map(function (t) {
    var chip = el('button', 'chip', t);
    chip.type = 'button';
    chip.dataset.value = t;
    chip.setAttribute('aria-pressed', 'false');
    chip.appendChild(el('span'));
    tagRow.appendChild(chip);
    return chip;
  });

  // ---------- Filtering ----------

  function inGroup(it, id) {
    return id === 'all' || it.group.id === id;
  }

  function matches(it, terms) {
    if (!inGroup(it, state.group)) return false;
    if (state.tag && it.tags.indexOf(state.tag) < 0) return false;
    // Every word has to start a word somewhere in the section. Very short
    // ones, like "pi" or "e", have to be the whole word.
    return terms.every(function (t) {
      return it.text.indexOf(t.length < 3 ? ' ' + t + ' ' : ' ' + t) >= 0;
    });
  }

  function render() {
    var terms = normalize(state.query).trim().split(' ').filter(Boolean);
    // "All" is an overview: just the index, however many sections there are.
    // A card or link there opens the section's own tab (see reveal).
    var overview = state.group === 'all';
    var shown = 0;
    items.forEach(function (it) {
      it.on = matches(it, terms);
      it.card.hidden = it.link.hidden = !it.on;
      it.section.hidden = !it.on || overview;
      if (it.on) shown++;
    });

    groups.forEach(function (g) {
      var n = g.items.filter(function (it) { return it.on; }).length;
      g.block.hidden = !n;
      g.countEl.textContent = n;
    });

    // Chips count within the current tab, and only the useful ones show.
    var inTab = items.filter(function (it) { return inGroup(it, state.group); });
    tagChips.forEach(function (chip) {
      var t = chip.dataset.value;
      var n = inTab.filter(function (it) { return it.tags.indexOf(t) >= 0; }).length;
      chip.hidden = !n;
      chip.lastChild.textContent = n;
      chip.setAttribute('aria-pressed', String(t === state.tag));
    });

    countEl.textContent = shown === items.length
      ? items.length + ' visualizations'
      : shown + ' of ' + items.length + ' showing';
    clearBtn.hidden = !state.tag && !state.query;

    emptyEl.hidden = shown > 0;
    if (!shown) {
      var what = [];
      if (state.query) what.push('“' + state.query.trim() + '”');
      if (state.tag) what.push('the tag “' + state.tag + '”');
      var where = state.group === 'all' ? '' : ' in ' + groupById[state.group].label;
      emptyEl.firstElementChild.textContent = 'Nothing' + where + ' matches ' + what.join(' and ') + '.';
    }

    renderNext(shown);
  }

  // At the bottom of a tab, offer the next one so the page never dead-ends.
  function renderNext(shown) {
    nextEl.textContent = '';
    nextEl.hidden = state.group === 'all' || !shown;
    if (nextEl.hidden) return;
    var i = groups.indexOf(groupById[state.group]);
    var next = groups[i + 1];
    var btn = el('button', 'next-tab-btn');
    btn.type = 'button';
    btn.appendChild(el('span', 'next-tab-kicker', next ? 'Next tab' : 'That’s every tab'));
    btn.appendChild(el('b', '', next ? next.label + ' →' : 'See all ' + items.length + ' →'));
    if (next && next.about) btn.appendChild(el('span', 'next-tab-about', next.about));
    btn.addEventListener('click', function () { selectGroup(next ? next.id : 'all', true); });
    nextEl.appendChild(btn);
  }

  // ---------- Moving around ----------

  // Scroll a sideways-scrolling row so one of its children sits in the middle.
  function centerIn(row, child) {
    if (row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({
      left: child.offsetLeft - row.offsetLeft - (row.clientWidth - child.offsetWidth) / 2,
      behavior: V.reducedMotion ? 'auto' : 'smooth'
    });
  }

  function setTab(id) {
    V.setSegmented(tabRow, id);
    centerIn(tabRow, tabRow.querySelector('[data-value="' + id + '"]'));
  }

  function barHeight() {
    return bar.offsetHeight;
  }

  // Jump without the page-wide smooth scrolling, which crawls over long distances.
  function jumpTo(y) {
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, Math.max(0, y));
    root.style.scrollBehavior = '';
  }

  function jumpToSection(section) {
    jumpTo(section.getBoundingClientRect().top + window.scrollY - barHeight());
  }

  function selectGroup(id, toTop) {
    // Readers already down among the sections go to the top of the new tab,
    // or back up to the index for "All". Readers at the index stay put and
    // watch it change.
    var reading = toTop || main.getBoundingClientRect().top < barHeight();
    state.group = id;
    var tabHasTag = items.some(function (it) {
      return inGroup(it, id) && it.tags.indexOf(state.tag) >= 0;
    });
    if (!tabHasTag) state.tag = '';
    setTab(id);
    var linked = itemById[decodeURIComponent(location.hash.slice(1))];
    try {
      history.replaceState(null, '', (id === 'all' ? location.pathname : '?tab=' + id) +
        (linked && linked.group.id === id ? location.hash : ''));
    } catch (e) { /* file:// pages may refuse; the tab still works */ }
    render();
    if (reading && id === 'all') openFinder(true);
    else if (reading) jumpTo(main.getBoundingClientRect().top + window.scrollY - barHeight());
  }

  tagRow.addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    state.tag = state.tag === chip.dataset.value ? '' : chip.dataset.value;
    render();
  });

  // A new search starts from everything, so the answer is never hiding behind
  // a tab or tag picked earlier. Picking one afterwards narrows the results.
  search.addEventListener('input', function () {
    var starting = !state.query.trim() && search.value.trim();
    state.query = search.value;
    if (starting) {
      state.tag = '';
      if (state.group !== 'all') {
        state.group = 'all';
        setTab('all');
        try { history.replaceState(null, '', location.pathname); } catch (e) { /* see above */ }
      }
    }
    render();
  });

  search.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      var first = items.filter(function (it) { return it.on; })[0];
      if (!first) return;
      e.preventDefault();
      search.blur();
      if (location.hash !== '#' + first.id) location.hash = first.id;
      else if (!reveal()) first.section.scrollIntoView();
    } else if (e.key === 'Escape' && !search.value) {
      search.blur();
    }
  });

  function clearFilters() {
    state.tag = '';
    state.query = search.value = '';
    render();
  }
  clearBtn.addEventListener('click', clearFilters);
  V.ctl(emptyEl, 'reset').addEventListener('click', function () {
    clearFilters();
    if (state.group !== 'all') selectGroup('all');
  });

  function openFinder(noFocus) {
    jumpTo(finder.getBoundingClientRect().top + window.scrollY - barHeight() - 24);
    if (noFocus !== true) search.focus({ preventScroll: true });
  }
  V.ctl(bar, 'find').addEventListener('click', openFinder);
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    e.preventDefault();
    openFinder();
  });

  // A link to a section that's hidden, by a filter or by the "All" overview,
  // opens that section's tab and jumps to it.
  function reveal() {
    var it = itemById[decodeURIComponent(location.hash.slice(1))];
    if (!it || !it.section.hidden) return false;
    state.tag = '';
    state.query = search.value = '';
    if (state.group === 'all' || !inGroup(it, state.group)) selectGroup(it.group.id);
    else render();
    jumpToSection(it.section);
    return true;
  }
  window.addEventListener('hashchange', reveal);
  // Clicking a link to the hash already in the URL fires no hashchange.
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (a && a.getAttribute('href') === location.hash && reveal()) e.preventDefault();
  });

  // Keep anchor jumps clear of the sticky bar, whatever height it wraps to.
  new ResizeObserver(function () {
    root.style.setProperty('--bar-h', barHeight() + 'px');
  }).observe(bar);

  // Highlight the nav link of the section currently in view. The link row
  // scrolls sideways when it doesn't fit, so keep the active link in view.
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var link = itemById[entry.target.id].link;
      link.classList.toggle('is-active', entry.isIntersecting);
      if (entry.isIntersecting) centerIn(linkRow, link);
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  items.forEach(function (it) { observer.observe(it.section); });

  // The visualizations set themselves up after this script, against the full
  // page, so hide sections only once they've all run. Opening on a tab moves
  // everything up, so redo the browser's jump to a linked section.
  document.addEventListener('DOMContentLoaded', function () {
    setTab(state.group);
    render();
    var it = itemById[decodeURIComponent(location.hash.slice(1))];
    if (it && !reveal() && state.group !== 'all') {
      requestAnimationFrame(function () { jumpToSection(it.section); });
    }
  });
})();
