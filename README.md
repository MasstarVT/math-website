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
