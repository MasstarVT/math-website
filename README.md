# Unfolded

**Live site: https://masstarvt.github.io/math-website/**

Interactive visualizations of mathematics you can watch move:

1. **The tesseract**: a 4D hypercube (plus the 16-cell and 24-cell) rotating through the fourth dimension, drawn as its 3D shadow.
2. **The dragon curve**: copy the curve, rotate the copy 90° around its end, attach, repeat.
3. **Langton's ant**: two rules that build chaos, then a highway.
4. **The Mandelbrot set**: zoomable, rendered on the GPU with WebGL.
5. **The golden angle**: how sunflowers pack their seeds.
6. **Times tables on a circle**: cardioids, nephroids and friends.
7. **Fourier circles**: spinning circles that draw any shape, including one you draw.
8. **The butterfly effect**: the Lorenz attractor, with paths that start almost together and drift apart.
9. **Prime spirals**: primes plotted at (n, n) in polar coordinates, making spirals and rays.
10. **The chaos game**: random jumps that build the Sierpinski triangle, other fractals and a fern.
11. **The bell curve**: a Galton board filling bins that approach the normal distribution.
12. **The law of large numbers**: coins flipped up to a million times, closing in on 50% heads while heads minus tails drifts apart.
13. **The Monty Hall problem**: staying versus switching, with 3, 10 or 100 doors.
14. **Buffon's needle**: estimating π by dropping needles on a lined floor, or darts at a circle in a square.
15. **The birthday paradox**: random rooms of people against the exact chance of a shared birthday.
16. **The Game of Life**: Conway's cellular automaton, with a glider gun, other starting patterns and a grid you can draw on.
17. **The road to chaos**: the logistic map's bifurcation diagram, period doubling and the window of period 3.
18. **The Collatz conjecture**: thousands of 3n + 1 paths drawn backwards from 1 so they grow into a plant.
19. **Recamán's sequence**: back if you can, forward if you must, drawn as arcs, with optional sound.
20. **The Koch snowflake**: infinite perimeter around a finite area, with a magnifier.
21. **The Hilbert curve**: a line that fills a square, plus the closed Moore curve.
22. **The Pythagoras tree**: squares and right triangles, where every generation adds up to the trunk's area.
23. **The sandpile**: grains that topple at 4, poured at the center, and the pile that acts like zero.
24. **Penrose tiling**: fat and thin rhombuses that never repeat, with a fat-to-thin ratio closing in on the golden ratio.
25. **Voronoi diagrams**: nearest-point cells you can drag, with the Delaunay triangulation.
26. **Newton's fractal**: which root Newton's method finds from each starting guess, with draggable roots (WebGL).
27. **The spirograph**: gears, pen holes and the greatest common divisor.
28. **The harmonograph**: drawings made by damped pendulums, and the Lissajous figures inside them.
29. **The pendulum wave**: fifteen pendulums drifting through waves and lining up again each minute.
30. **Euler's formula**: (1 + iθ/n)^n walking around the circle to e^(iπ) = −1.
31. **Taylor series**: polynomials copying sin x, eˣ, 1/(1 + x²) and ln(1 + x), and where they stop working.
32. **Benford's law**: the leading digits of powers of 2, Fibonacci numbers, factorials and random data.
33. **Growing crystals**: diffusion-limited aggregation from a seed or from the ground.
34. **The brachistochrone**: beads racing down four tracks, where the cycloid always wins.
35. **The Apollonian gasket**: touching circles whose curvatures are all whole numbers.

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
- `js/*.js`: one file per visualization

Made by MasstarVT.
