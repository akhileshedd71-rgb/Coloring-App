# Original illustrated coloring pages

Version 1.2.0 adds 25 sharp line-art illustrations in Flowers, Patterns, Paisley, Doodles, and Cartoons (5 in each category). The complete catalog has 172 pages across 14 categories: 137 generated illustrations and 35 classic vector drawings. The new illustrations use eight 2×2 source sheets with selected cells, giving each drawing more source pixels than the original seven 4×4 atlases. All were generated for Little Color Club.

The source images are preserved in `sources/`. `manifest.json` associates each cell, in row-major order, using each sheet’s `grid: [rows, columns]` (default `[4, 4]`), with a stable ID, title, category, and accent color. The manifest also records reviewed boundary repairs as `seals`. A `null` page skips an unused source cell; only selected illustrations are shipped. Source PNGs are development assets; the app packages only the generated vector thumbnails and paint data.

## Regenerate the pages

Python is needed only to regenerate illustrations. Normal web development, Android builds, and the app itself use the committed generated files and do not need these packages.

The tracing pipeline was run with Python 3.12 and the exact package versions in `requirements.txt`. New sheets marked `tracing: "bezier"` also use the system Potrace 1.16 library to fit smooth cubic curves. On Debian/Ubuntu, install the development-only `libpotrace0` package; macOS users can install `potrace` with Homebrew. This library is already installed in the current cloud environment. It is not bundled into the Android app.

From the repository root:

```bash
python3 -m venv /tmp/little-color-art-venv
/tmp/little-color-art-venv/bin/python -m pip install -r artwork/requirements.txt
/tmp/little-color-art-venv/bin/python scripts/trace-illustrations.py \
  artwork/manifest.json \
  --review-dir /tmp/little-color-art-review
```

The command reads the existing atlases without modifying them and rewrites:

- `public/drawings/<id>.svg`: an uncolored preview for each page.
- `public/drawings/<id>.json`: fill regions, labels, colors, and a separate ink silhouette.
- `src/data/illustrated.json`: compact metadata with asset paths and region counts. Its empty `regions` arrays are intentional; `loadDrawing(id)` reads the bundled detail file when needed.
- `artwork/audit.json`: per-page region counts, computed difficulty, label radii, omitted detail pixels, recovered regions, and reviewed seal counts.

`--review-dir` also produces `report.json`, colored SVGs, and sixteen-page review montages named `sheet-01.png`, `sheet-02.png`, and so on. Keep those working previews outside the checkout. For a trial run that leaves generated repository files untouched, add `--output-root /tmp/little-color-art-preview` while running from the repository root. The output folder uses the same `public/`, `src/`, and `artwork/` structure.

An existing cloud tool environment can be used without reinstalling packages:

```bash
PYTHONPATH=/workspace/.tools/lineart-python python3 scripts/trace-illustrations.py \
  artwork/manifest.json \
  --review-dir /tmp/little-color-art-review
```

## How the tracing works

The script locates atlas gutters and assigns complete connected ink components to cells, helping preserve ears, tails, and leaves near a cell edge. It traces enclosed white regions and keeps the illustration's ink as a separate compound vector path. Small gap closing and selective recovery of larger regions help form usable fill boundaries. Every compound region and ink path must use the **even-odd** fill rule.

The 25 new pages use `scripts/smooth_lineart.py` and Potrace's C API to fit cubic Bezier curves, retaining sharp corners and holes while removing raster stair steps. Original sheets keep the default `legacy` profile so their existing regions and saved artwork remain compatible. The source cells use the same mask for both ink and paint-region tracing. SVG previews contain only a white background and the ink silhouette; suggested palette colors are used only after coloring begins. Colored montages are temporary developer checks for missed regions, not shipped artwork.

Number labels are placed at the deepest point inside each detected region; each label records the available radius. Very small details are omitted from fill detection rather than receiving unusable regions. The generated difficulty is determined by the final fillable-region count: easy has up to 25 regions, medium has 26–70, and hard has more than 70. This computed level overrides the initial difficulty suggestion in the manifest.

The `seals` arrays contain `[x1, y1, x2, y2]` segments for reviewed gaps, in the split cell's source-pixel coordinates including its eight-pixel padding, before normalization to the 800×800 canvas. These targeted repairs become part of the generated boundary and ink. Inspect both the original source and colored preview before adding a seal; decorative open lines should not automatically become closed shapes.

## Review changes before shipping

Inspect the colored montages and individual pages for clipped subjects, neighboring-cell fragments, unfillable bodies, unexpected shared fills, and labels that crowd narrow shapes. The current set includes reviewed boundary repairs, but automatic tracing and generated artwork still benefit from visual inspection. The audit records tracing outcomes; it is not a substitute for checking the pictures in the app.

Preserve existing page and region IDs when making changes: saved artwork uses them. Re-tracing a changed source can reorder detected regions, so check compatibility with existing saved pictures. Review `git diff` for the manifest, index, audit, and generated assets before accepting a regeneration.

```bash
npm run build
npx playwright test tests/illustrations.spec.ts tests/library.spec.ts tests/studio.spec.ts
```

For Android testing, run `npm run android:build` after regeneration so the new local assets are copied into the APK. Try a few easy, medium, and hard pages on a device, including small regions with zoom, number matching, erasing, and reopening saved artwork.
