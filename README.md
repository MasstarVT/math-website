# Unfolded

**Live site: https://masstarvt.github.io/math-website/**

Interactive visualizations of mathematics you can watch move, sorted into tabs. Search by name or idea ("sunflower", "π", "weather"), or filter by tags like recursion, randomness or surprises.

**Geometry**
- **The tesseract**: a 4D hypercube (plus the 16-cell and 24-cell) rotating through the fourth dimension, drawn as its 3D shadow.
- **The golden angle**: how sunflowers pack their seeds.
- **Penrose tiling**: fat and thin rhombuses that never repeat, with a fat-to-thin ratio closing in on the golden ratio.
- **Voronoi diagrams**: nearest-point cells you can drag, with the Delaunay triangulation.

**Fractals**
- **The dragon curve**: copy the curve, rotate the copy 90° around its end, attach, repeat.
- **The Mandelbrot set**: zoomable, rendered on the GPU with WebGL.
- **The chaos game**: random jumps that build the Sierpinski triangle, other fractals and a fern.
- **The Koch snowflake**: infinite perimeter around a finite area, with a magnifier.
- **The Hilbert curve**: a line that fills a square, plus the closed Moore curve.
- **The Pythagoras tree**: squares and right triangles, where every generation adds up to the trunk's area.
- **Newton's fractal**: which root Newton's method finds from each starting guess, with draggable roots (WebGL).
- **The Apollonian gasket**: touching circles whose curvatures are all whole numbers.

**Chaos**
- **Langton's ant**: two rules that build chaos, then a highway.
- **The butterfly effect**: the Lorenz attractor, with paths that start almost together and drift apart.
- **The Game of Life**: Conway's cellular automaton, with a glider gun, other starting patterns and a grid you can draw on.
- **The road to chaos**: the logistic map's bifurcation diagram, period doubling and the window of period 3.
- **The sandpile**: grains that topple at 4, poured at the center, and the pile that acts like zero.
- **Growing crystals**: diffusion-limited aggregation from a seed or from the ground.

**Chance**
- **The bell curve**: a Galton board filling bins that approach the normal distribution.
- **The law of large numbers**: coins flipped up to a million times, closing in on 50% heads while heads minus tails drifts apart.
- **The Monty Hall problem**: staying versus switching, with 3, 10 or 100 doors.
- **Buffon's needle**: estimating π by dropping needles on a lined floor, or darts at a circle in a square.
- **The birthday paradox**: random rooms of people against the exact chance of a shared birthday.
- **Benford's law**: the leading digits of powers of 2, Fibonacci numbers, factorials and random data.

**Numbers**
- **Times tables on a circle**: cardioids, nephroids and friends.
- **Prime spirals**: primes plotted at (n, n) in polar coordinates, making spirals and rays.
- **The Collatz conjecture**: thousands of 3n + 1 paths drawn backwards from 1 so they grow into a plant.
- **Recamán's sequence**: back if you can, forward if you must, drawn as arcs, with optional sound.

**Curves & motion**
- **Fourier circles**: spinning circles that draw any shape, including one you draw.
- **Euler's formula**: (1 + iθ/n)^n walking around the circle to e^(iπ) = −1.
- **Taylor series**: polynomials copying sin x, eˣ, 1/(1 + x²) and ln(1 + x), and where they stop working.
- **The brachistochrone**: beads racing down four tracks, where the cycloid always wins.
- **The spirograph**: gears, pen holes and the greatest common divisor.
- **The harmonograph**: drawings made by damped pendulums, and the Lissajous figures inside them.
- **The pendulum wave**: fifteen pendulums drifting through waves and lining up again each minute.

Plain HTML, CSS and JavaScript. No build step and no dependencies.

## Running it

Open `index.html` in a browser, or serve the folder:

```
python -m http.server 8642
```

then visit http://localhost:8642.

To publish on GitHub Pages, push the folder to a repository and enable Pages for the branch root.

## Layout

- `index.html`: page and copy for every section
- `css/style.css`: styles
- `js/core.js`: shared canvas helper (HiDPI sizing, resize, pauses animations that are off screen) and UI bindings
- `js/nav.js`: tabs, search, tags, the index and the section links, all built from the sections' `data-*` attributes
- `js/*.js`: one file per visualization

## Adding a visualization

1. Add a `<section class="viz">` to `<main>` in `index.html`. Copy an existing one and change its attributes:

   ```html
   <section class="viz" id="dragon" style="--accent: var(--pink)"
     data-group="fractals" data-tags="recursion, simple rules"
     data-short="Dragon" data-blurb="A dragon made of right angles">
   ```

   - `id`: used in links (`#dragon`) and by the script.
   - `data-group`: the tab it goes in. One of `geometry`, `fractals`, `dynamics` (Chaos), `chance`, `numbers` or `motion`.
   - `data-tags`: comma-separated. Reuse existing tags where they fit so the chips stay useful.
   - `data-short`: the label in the bar's section links.
   - `data-blurb`: the one-liner on its index card.

   The section can go anywhere in `<main>`. It's sorted into its tab automatically, after the ones already there.
2. Add `js/<id>.js` and a `<script>` tag for it at the bottom of `index.html`.
3. Add a line for it under its tab in this README.

The tabs, counts, index cards, tag chips, search and section links all update themselves. To add a new tab, add it to `GROUPS` at the top of `js/nav.js`.

Made by MasstarVT.
