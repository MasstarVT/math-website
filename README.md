# Unfolded

**Live site: https://masstarvt.github.io/math-website/**

Interactive visualizations of mathematics you can watch move:

1. **The tesseract**: a 4D hypercube (plus the 16-cell and 24-cell) rotating through the fourth dimension, drawn as its 3D shadow.
2. **The dragon curve**: copy the curve, rotate the copy 90° around its end, attach, repeat.
3. **Langton's ant**: two rules that build chaos, then a highway.
4. **The Mandelbrot set**: zoomable, rendered on the GPU with WebGL.
5. **The golden angle**: how sunflowers pack their seeds.
6. **Times tables on a circle**: cardioids, nephroids and friends.

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
