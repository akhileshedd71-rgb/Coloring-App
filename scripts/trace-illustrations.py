#!/usr/bin/env python3
"""Turn original 4-by-4 line-art atlases into offline, paintable SVG pages.

Usage: PYTHONPATH=/workspace/.tools/lineart-python python scripts/trace-illustrations.py \
    artwork/manifest.json --review-dir /tmp/lineart-review

Build dependency only: numpy, Pillow, opencv-python-headless. The app needs none
of these libraries. Input images are left untouched. Generated compound paths
must be filled using the even-odd rule, including the separate ink silhouette.
"""

from __future__ import annotations

import argparse
from collections import Counter
import html
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


PALETTE = ["#FF6B79", "#FF9F43", "#FFD35C", "#85CC8C", "#5DC9C5",
           "#73B9EF", "#9A8BE8", "#DB91CD", "#A77B60", "#303F53", "#FFFFFF"]
INK = "#303F53"
SIZE = 800
MARGIN = 40
CATEGORY_COLORS = {
    "Animals": [9, 3, 4, 2, 8], "Ocean": [6, 5, 3, 8, 1],
    "Dinosaurs": [4, 5, 3, 2, 7], "Magic": [8, 7, 5, 3, 1],
    "On the go": [6, 1, 3, 5, 2], "Yummy": [1, 3, 8, 4, 2],
    "Nature": [4, 3, 8, 5, 1], "Space": [6, 7, 3, 2, 5],
    "Adventure": [6, 4, 3, 2, 8],
}


def boundary(projection: np.ndarray, target: float, radius: int) -> int:
    """Find the quietest actual gutter, favoring the middle of white runs."""
    lo, hi = max(1, int(target - radius)), min(len(projection) - 1, int(target + radius))
    segment = projection[lo:hi].astype(float)
    smoothed = np.convolve(segment, np.ones(3) / 3, mode="same")
    candidates = np.flatnonzero(smoothed == smoothed.min())
    # Middle of the longest equally quiet run avoids hugging illustration edges.
    groups = np.split(candidates, np.flatnonzero(np.diff(candidates) > 1) + 1)
    group = max(groups, key=lambda g: (len(g), -abs(np.mean(g) + lo - target)))
    return int(round(float(np.mean(group)))) + lo


def split_sheet(gray: np.ndarray) -> list[np.ndarray]:
    """Group whole ink components, so a tail or ear across a grid line survives.

    The generated atlas is visually a grid but its gutters aren't perfectly
    uniform. Pixel cropping would cut giraffe horns and fine leaves. Connected
    components retain the complete mark; their centers assign them to a page.
    """
    ink = (gray < 165).astype(np.uint8)
    h, w = ink.shape
    rows = [0] + [boundary(ink.sum(axis=1), h * n / 4, round(h * .055))
                  for n in range(1, 4)] + [h]
    columns = [[0] + [boundary(ink[rows[r]:rows[r + 1]].sum(axis=0),
                                  w * n / 4, round(w * .055))
                         for n in range(1, 4)] + [w] for r in range(4)]
    count, labels, stats, centers = cv2.connectedComponentsWithStats(ink, connectivity=8)
    assignments = [[] for _ in range(16)]
    for component in range(1, count):
        if stats[component, cv2.CC_STAT_AREA] < 2:
            continue
        x, y = centers[component]
        row = min(3, max(0, int(np.searchsorted(rows, y, side="right")) - 1))
        col = min(3, max(0, int(np.searchsorted(columns[row], x, side="right")) - 1))
        assignments[row * 4 + col].append(component)
    pages = []
    for ids in assignments:
        mask = np.isin(labels, ids).astype(np.uint8)
        ys, xs = np.nonzero(mask)
        if len(xs) == 0:
            raise ValueError("Atlas has an empty cell")
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        if x1 - x0 > w * .43 or y1 - y0 > h * .43:
            raise ValueError("Ink connects neighboring atlas cells; review the source")
        pages.append(np.pad(mask[y0:y1, x0:x1], 8))
    return pages


def value(n: float) -> str:
    return f"{n:.1f}".rstrip("0").rstrip(".")


def vector_path(mask: np.ndarray, scale: float, offset: tuple[float, float],
                tolerance: float = .4) -> str:
    """Trace all contours and holes; short quadratic curves soften raster steps."""
    contours, _ = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    paths = []
    for contour in contours:
        if cv2.contourArea(contour) < .5:
            continue
        points = cv2.approxPolyDP(contour, tolerance, True).reshape(-1, 2).astype(float)
        if len(points) < 3:
            continue
        points = points * scale + np.array(offset)
        # Round less than one source pixel at each corner. Unbounded midpoint
        # splines can swallow narrow white windows on detailed illustrations.
        previous, following = np.roll(points, 1, axis=0), np.roll(points, -1, axis=0)
        backward, forward = previous - points, following - points
        previous_lengths = np.linalg.norm(backward, axis=1)
        next_lengths = np.linalg.norm(forward, axis=1)
        radii = np.minimum(np.minimum(previous_lengths / 2, next_lengths / 2), .55 * scale)
        entries = points + backward * (radii / previous_lengths)[:, None]
        exits = points + forward * (radii / next_lengths)[:, None]
        path = f"M{value(entries[0, 0])} {value(entries[0, 1])}"
        for i, (p, end) in enumerate(zip(points, exits)):
            if i:
                path += f"L{value(entries[i, 0])} {value(entries[i, 1])}"
            path += f"Q{value(p[0])} {value(p[1])} {value(end[0])} {value(end[1])}"
        paths.append(path + "Z")
    return "".join(paths)


def trace_page(mask: np.ndarray, metadata: dict, index: int) -> tuple[dict, dict, Image.Image]:
    mask = mask.copy()
    for x1, y1, x2, y2 in metadata.get("seals", []):
        cv2.line(mask, (x1, y1), (x2, y2), 1, 2)
    h, w = mask.shape
    scale = (SIZE - 2 * MARGIN) / max(h - 16, w - 16)
    offset = ((SIZE - w * scale) / 2, (SIZE - h * scale) / 2)
    # Closing is for region detection only. The original generated ink is the
    # displayed illustration; this seals tiny accidental one-pixel gaps.
    closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    white = (1 - closed).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(white, connectivity=8)
    edge = set(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    interiors = [(labels == component).astype(np.uint8) for component in range(1, count)
                 if component not in edge]
    exterior = np.isin(labels, list(edge))
    rescued = np.zeros_like(mask)
    rescued_count = 0
    for kernel_size in (5, 7):
        repair = cv2.morphologyEx(mask, cv2.MORPH_CLOSE,
                                  np.ones((kernel_size, kernel_size), np.uint8))
        total, candidates, candidate_stats, _ = cv2.connectedComponentsWithStats(1 - repair, connectivity=8)
        outside = set(np.concatenate([candidates[0], candidates[-1], candidates[:, 0], candidates[:, -1]]))
        for component in range(1, total):
            area = candidate_stats[component, cv2.CC_STAT_AREA]
            width = candidate_stats[component, cv2.CC_STAT_WIDTH]
            height = candidate_stats[component, cv2.CC_STAT_HEIGHT]
            # Recover substantial bodies, not intentionally open ripples or
            # patches of sky between parallel landscape strokes.
            if (component in outside or area < 600 or area > h * w * .4
                    or min(width, height) < 16 or max(width, height) / min(width, height) > 6):
                continue
            interior = (candidates == component).astype(np.uint8)
            if np.count_nonzero(interior & exterior) < area * .95:
                continue
            if np.count_nonzero(interior & rescued) > area * .1:
                continue
            interiors.append(interior)
            rescued |= interior
            # A one-pixel contour seals only the recovered body's boundary.
            # Existing fine regions retain their original boundaries and ink.
            rim = cv2.dilate(interior, np.ones((3, 3), np.uint8)) - interior
            mask |= rim
            rescued_count += 1
    silhouette = vector_path(mask, scale, offset)
    regions = []
    review = np.full((h, w, 3), 255, dtype=np.uint8)
    region_sizes = []
    omitted_pixels = 0
    interiors.sort(key=lambda region: -int(region.sum()))
    colors = CATEGORY_COLORS.get(metadata["category"], [6, 5, 3, 8, 1])
    for interior in interiors:
        area = int(interior.sum())
        distance = cv2.distanceTransform(interior, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
        _, radius, _, center = cv2.minMaxLoc(distance)
        if area < 20 or radius < 1.5:
            omitted_pixels += area
            continue
        # Paint extends one source pixel underneath the original ink, preventing
        # white halos. Compounds preserve holes such as eyes and leaf interiors.
        expanded = cv2.dilate(interior, np.ones((3, 3), np.uint8))
        d = vector_path(expanded, scale, offset)
        if not d:
            continue
        # The two largest areas share a calm primary color; smaller decorations
        # cycle through a compact category palette for coherent number painting.
        number = colors[0 if len(regions) < 2 else (len(regions) - 1) % len(colors)]
        rgb = tuple(int(PALETTE[number - 1][i:i + 2], 16) for i in (1, 3, 5))
        review[expanded > 0] = rgb
        x, y = center
        label = [round(x * scale + offset[0], 1), round(y * scale + offset[1], 1)]
        regions.append({"id": f"{metadata['id']}-{len(regions)}", "d": d,
                        "number": number, "color": PALETTE[number - 1],
                        "label": label, "labelRadius": round(radius * scale, 1)})
        region_sizes.append(area)
    if len(regions) < 3:
        raise ValueError(f"{metadata['id']}: only {len(regions)} enclosed paint regions")
    review[mask > 0] = (48, 63, 83)
    difficulty = "easy" if len(regions) <= 25 else "medium" if len(regions) <= 70 else "hard"
    drawing = {**{k: v for k, v in metadata.items() if k != "seals"},
               "difficulty": difficulty, "background": "#FFFFFF", "regions": regions,
               "ink": silhouette, "source": "illustrated",
               "thumbnail": f"/drawings/{metadata['id']}.svg"}
    report = {"id": metadata["id"], "title": metadata["title"],
              "difficulty": difficulty, "regions": len(regions),
              "smallest_region_pixels": min(region_sizes),
              "smallest_label_radius": min(r["labelRadius"] for r in regions),
              "omitted_detail_pixels": omitted_pixels,
              "rescued_regions": rescued_count,
              "reviewed_seals": len(metadata.get("seals", [])),
              "ink_bytes": len(silhouette)}
    return drawing, report, Image.fromarray(review)


def svg(drawing: dict, colored: bool = False) -> str:
    layers = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" role="img">',
              f'<title>{html.escape(drawing["title"])}</title>',
              '<rect width="800" height="800" fill="#fff"/>']
    if colored:
        layers.extend(f'<path d="{r["d"]}" fill="{r["color"]}" fill-rule="evenodd"/>'
                      for r in drawing["regions"])
    layers.append(f'<path d="{drawing["ink"]}" fill="{INK}" fill-rule="evenodd"/></svg>')
    return "".join(layers) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--review-dir", type=Path)
    args = parser.parse_args()
    manifest_path = args.manifest.resolve()
    manifest = json.loads(manifest_path.read_text())
    drawings, reports, previews = [], [], []
    ids = set()
    for sheet in manifest["sheets"]:
        source = Path(sheet["path"])
        if not source.is_absolute():
            candidates = [manifest_path.parent / source, args.output_root / source, source]
            source = next((candidate for candidate in candidates if candidate.exists()), candidates[0])
        gray = np.asarray(Image.open(source).convert("L"))
        if len(sheet["pages"]) != 16:
            raise ValueError(f"{source}: expected sixteen pages")
        masks = split_sheet(gray)
        for mask, metadata in zip(masks, sheet["pages"]):
            if metadata["id"] in ids:
                raise ValueError(f"Duplicate page id: {metadata['id']}")
            ids.add(metadata["id"])
            drawing, report, preview = trace_page(mask, metadata, len(drawings))
            drawings.append(drawing)
            reports.append(report)
            previews.append(preview)
    target = args.output_root / "public/drawings"
    target.mkdir(parents=True, exist_ok=True)
    for drawing in drawings:
        (target / f"{drawing['id']}.svg").write_text(svg(drawing))
        (target / f"{drawing['id']}.json").write_text(
            json.dumps(drawing, ensure_ascii=False, separators=(",", ":")) + "\n")
    data_path = args.output_root / "src/data/illustrated.json"
    data_path.parent.mkdir(parents=True, exist_ok=True)
    index = [{**{k: v for k, v in drawing.items() if k not in ("ink", "regions")},
              "regions": [], "regionCount": len(drawing["regions"]),
              "asset": f"/drawings/{drawing['id']}.json"} for drawing in drawings]
    data_path.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n")
    if args.review_dir:
        args.review_dir.mkdir(parents=True, exist_ok=True)
        (args.review_dir / "report.json").write_text(json.dumps(reports, indent=2) + "\n")
        for offset in range(0, len(drawings), 16):
            montage = Image.new("RGB", (1280, 1408), "#f6f5fb")
            pen = ImageDraw.Draw(montage)
            for j, (drawing, preview) in enumerate(zip(drawings[offset:offset + 16], previews[offset:offset + 16])):
                preview.thumbnail((300, 306), Image.Resampling.LANCZOS)
                x, y = (j % 4) * 320, (j // 4) * 352
                montage.paste(preview, (x + (320 - preview.width) // 2, y + 8))
                pen.text((x + 10, y + 318), drawing["title"], fill="#303f53")
                pen.text((x + 10, y + 334), f'{drawing["difficulty"]} / {len(drawing["regions"])} regions', fill="#666")
                (args.review_dir / f'{drawing["id"]}-colored.svg').write_text(svg(drawing, True))
            montage.save(args.review_dir / f"sheet-{offset // 16 + 1:02d}.png")
    summary = {"pages": len(drawings), "regions": sum(len(d["regions"]) for d in drawings),
               "difficulties": dict(Counter(d["difficulty"] for d in drawings)),
               "categories": dict(Counter(d["category"] for d in drawings)),
               "index_bytes": data_path.stat().st_size,
               "rescued_regions": sum(r["rescued_regions"] for r in reports),
               "reviewed_seals": sum(r["reviewed_seals"] for r in reports)}
    audit_path = args.output_root / "artwork/audit.json"
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    audit_path.write_text(json.dumps({"summary": summary, "pages": reports}, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
