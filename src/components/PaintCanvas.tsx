import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { PALETTE } from "../types";
import type { Artwork, Drawing, Stroke, Tool } from "../types";
import { CANVAS_SIZE, drawStroke } from "../lib/paint";

export interface PaintCanvasHandle {
  exportImage: () => string;
  exportThumbnail: () => string;
}

export interface PaintCanvasProps {
  drawing?: Drawing;
  artwork: Artwork;
  tool: Tool;
  color: string;
  size: number;
  sticker: string;
  hints: boolean;
  onChange: (artwork: Artwork) => void;
  onWrongColor?: () => void;
  onPaint?: () => void;
}

interface ActiveStroke {
  pointerId: number;
  stroke: Stroke;
}

interface ColorBloom {
  regionId: string;
  color: string;
  x: number;
  y: number;
  radius: number;
  started: number;
  previous: HTMLCanvasElement;
}

const OUTLINE = "#394C50";
const BLOOM_DURATION = 280;
const SVG_NS = "http://www.w3.org/2000/svg";

function makeLayer(density: number) {
  const layer = document.createElement("canvas");
  layer.width = CANVAS_SIZE * density;
  layer.height = CANVAS_SIZE * density;
  return layer;
}

function clearLayer(layer: HTMLCanvasElement | null, density: number) {
  const context = layer?.getContext("2d");
  if (!context) return null;
  context.setTransform(density, 0, 0, density, 0, 0);
  context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  return context;
}

export const PaintCanvas = forwardRef<PaintCanvasHandle, PaintCanvasProps>(
  function PaintCanvas(
    {
      drawing,
      artwork,
      tool,
      color,
      size,
      sticker,
      hints,
      onChange,
      onWrongColor,
      onPaint,
    },
    forwardedRef,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const effectsRef = useRef<SVGGElement>(null);
    const pointerRef = useRef<SVGGElement>(null);
    const baseRef = useRef<HTMLCanvasElement | null>(null);
    const inkRef = useRef<HTMLCanvasElement | null>(null);
    const compositeRef = useRef<HTMLCanvasElement | null>(null);
    const outlineRef = useRef<HTMLCanvasElement | null>(null);
    const decorationRef = useRef<HTMLCanvasElement | null>(null);
    const hitContextRef = useRef<CanvasRenderingContext2D | null>(null);
    const activeRef = useRef<ActiveStroke | null>(null);
    const bloomsRef = useRef<ColorBloom[]>([]);
    const reducedMotionRef = useRef(false);
    const frameRef = useRef<number | null>(null);
    const renderRef = useRef<() => void>(() => undefined);
    const exportRef = useRef<(size: number) => string>(() => "");
    const densityRef = useRef(
      Math.min(
        2,
        typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
      ),
    );
    const regions = useMemo(
      () =>
        (drawing?.regions ?? []).map((region) => ({
          ...region,
          path: new Path2D(region.d),
        })),
      [drawing],
    );
    const lines = useMemo(
      () => (drawing?.lines ?? []).map((line) => new Path2D(line)),
      [drawing],
    );
    const illustrationInk = useMemo(
      () => (drawing?.ink ? new Path2D(drawing.ink) : null),
      [drawing],
    );

    const scheduleRender = useCallback(() => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        renderRef.current();
      });
    }, []);

    // The same completed layers drive both the interactive canvas and exports.
    // Only the interactive surface includes an active stroke or a color bloom.
    const drawScene = useCallback(
      (context: CanvasRenderingContext2D, interactive: boolean) => {
        if (baseRef.current)
          context.drawImage(baseRef.current, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

        if (interactive) {
          const now = performance.now();
          bloomsRef.current = bloomsRef.current.filter(
            (bloom) => now - bloom.started < BLOOM_DURATION,
          );
          for (const bloom of bloomsRef.current) {
            const progress = Math.min(
              1,
              (now - bloom.started) / BLOOM_DURATION,
            );
            const eased = 1 - Math.pow(1 - progress, 2);
            const radius = bloom.radius * eased;
            // Show the previous color outside an expanding circle. The previous
            // layer contains only this region's visible area, including holes.
            context.save();
            context.beginPath();
            context.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
            context.moveTo(bloom.x + radius, bloom.y);
            context.arc(bloom.x, bloom.y, radius, 0, Math.PI * 2);
            context.clip("evenodd");
            context.drawImage(bloom.previous, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
            context.restore();
          }
        }

        const active = interactive ? activeRef.current : null;
        if (active && inkRef.current && compositeRef.current) {
          // Erasing affects only the paint layer, never the page or its lines.
          const composite = clearLayer(
            compositeRef.current,
            densityRef.current,
          );
          if (composite) {
            composite.drawImage(inkRef.current, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
            drawStroke(composite, active.stroke, artwork.mode === "glow");
            context.drawImage(
              compositeRef.current,
              0,
              0,
              CANVAS_SIZE,
              CANVAS_SIZE,
            );
          }
        } else if (inkRef.current) {
          context.drawImage(inkRef.current, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
        }

        if (outlineRef.current)
          context.drawImage(outlineRef.current, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
        if (decorationRef.current)
          context.drawImage(
            decorationRef.current,
            0,
            0,
            CANVAS_SIZE,
            CANVAS_SIZE,
          );
      },
      [artwork.mode],
    );

    useLayoutEffect(() => {
      const density = densityRef.current;
      baseRef.current = makeLayer(density);
      inkRef.current = makeLayer(density);
      compositeRef.current = makeLayer(density);
      outlineRef.current = makeLayer(density);
      decorationRef.current = makeLayer(density);
      hitContextRef.current = document.createElement("canvas").getContext("2d");
      const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
      const updatePreference = () => {
        reducedMotionRef.current = preference.matches;
        if (preference.matches) {
          bloomsRef.current = [];
          effectsRef.current?.replaceChildren();
          scheduleRender();
        }
      };
      updatePreference();
      preference.addEventListener("change", updatePreference);
      return () => {
        preference.removeEventListener("change", updatePreference);
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      };
    }, [scheduleRender]);

    useLayoutEffect(() => {
      activeRef.current = null;
      bloomsRef.current = [];
      effectsRef.current?.replaceChildren();
      if (pointerRef.current) pointerRef.current.style.display = "none";
    }, [drawing, artwork.id]);

    // Each cache changes only with its own data. A fill or sticker does not
    // replay hundreds of crayon strokes or rebuild a detailed illustration.
    useLayoutEffect(() => {
      const context = clearLayer(baseRef.current, densityRef.current);
      if (!context) return;
      context.fillStyle = artwork.mode === "glow" ? "#152843" : "#FFFFFF";
      context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      for (const region of regions) {
        context.fillStyle = artwork.fills[region.id] ?? "#FFFFFF";
        context.fill(region.path, "evenodd");
        if (!artwork.fills[region.id] && artwork.mode === "number" && hints) {
          context.fillStyle = `${PALETTE[(region.number - 1) % PALETTE.length]}18`;
          context.fill(region.path, "evenodd");
        }
      }
      // Undo/clear/reopening must immediately discard obsolete animations.
      bloomsRef.current = bloomsRef.current.filter(
        (bloom) => artwork.fills[bloom.regionId] === bloom.color,
      );
    }, [regions, artwork.fills, artwork.mode, hints]);

    useLayoutEffect(() => {
      const context = clearLayer(inkRef.current, densityRef.current);
      if (!context) return;
      for (const stroke of artwork.strokes)
        drawStroke(context, stroke, artwork.mode === "glow");
    }, [artwork.strokes, artwork.mode]);

    useLayoutEffect(() => {
      const outlines = clearLayer(outlineRef.current, densityRef.current);
      if (!outlines) return;
      outlines.fillStyle = OUTLINE;
      if (illustrationInk) {
        outlines.fill(illustrationInk, "evenodd");
        return;
      }
      outlines.lineCap = "round";
      outlines.lineJoin = "round";
      outlines.lineWidth = 9;
      outlines.strokeStyle = OUTLINE;
      // A later vector shape hides earlier borders, like the library preview.
      for (const region of regions) {
        outlines.globalCompositeOperation = "destination-out";
        outlines.fill(region.path, "evenodd");
        outlines.globalCompositeOperation = "source-over";
        outlines.stroke(region.path);
      }
      for (const line of lines) outlines.stroke(line);
    }, [regions, lines, illustrationInk]);

    useLayoutEffect(() => {
      const context = clearLayer(decorationRef.current, densityRef.current);
      if (!context) return;
      context.textAlign = "center";
      context.textBaseline = "middle";
      if (artwork.mode === "number" && hints) {
        for (const region of regions) {
          if (!region.label || artwork.fills[region.id]) continue;
          const [x, y] = region.label;
          const radius = Math.max(
            5,
            Math.min(19, (region.labelRadius ?? 24) * 0.8),
          );
          context.save();
          // Fine illustrated details can have less than 5px of label space.
          // Keep every badge inside its region, including compound-path holes.
          if (region.labelRadius !== undefined)
            context.clip(region.path, "evenodd");
          context.font = `800 ${Math.round(radius * 1.21)}px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`;
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fillStyle = "#FFFFFF";
          context.fill();
          context.lineWidth = Math.min(2, radius * 0.12);
          context.strokeStyle = PALETTE[(region.number - 1) % PALETTE.length];
          context.stroke();
          context.fillStyle = OUTLINE;
          context.fillText(String(region.number), x, y + radius * 0.05);
          context.restore();
        }
      }
      for (const placed of artwork.stickers) {
        context.font = `${placed.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        context.fillText(placed.emoji, placed.x, placed.y);
      }
    }, [regions, artwork.fills, artwork.mode, artwork.stickers, hints]);

    useLayoutEffect(() => {
      if (pointerRef.current) pointerRef.current.style.display = "none";
    }, [tool, color, size]);

    useLayoutEffect(() => {
      renderRef.current = () => {
        const context = canvasRef.current?.getContext("2d");
        if (!context) return;
        const density = densityRef.current;
        context.setTransform(density, 0, 0, density, 0, 0);
        drawScene(context, true);
        if (bloomsRef.current.length) scheduleRender();
      };
      exportRef.current = (resolution: number) => {
        const canvas = document.createElement("canvas");
        canvas.width = resolution;
        canvas.height = resolution;
        const context = canvas.getContext("2d");
        if (!context) return "";
        context.setTransform(
          resolution / CANVAS_SIZE,
          0,
          0,
          resolution / CANVAS_SIZE,
          0,
          0,
        );
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        drawScene(context, false);
        return canvas.toDataURL("image/png");
      };
      renderRef.current();
    });

    useImperativeHandle(
      forwardedRef,
      () => ({
        exportImage: () => exportRef.current(CANVAS_SIZE * densityRef.current),
        exportThumbnail: () => exportRef.current(320),
      }),
      [],
    );

    function position(event: {
      clientX: number;
      clientY: number;
    }): [number, number] {
      const bounds = canvasRef.current!.getBoundingClientRect();
      return [
        Math.max(
          0,
          Math.min(
            CANVAS_SIZE,
            ((event.clientX - bounds.left) * CANVAS_SIZE) / bounds.width,
          ),
        ),
        Math.max(
          0,
          Math.min(
            CANVAS_SIZE,
            ((event.clientY - bounds.top) * CANVAS_SIZE) / bounds.height,
          ),
        ),
      ];
    }

    function publish(next: Artwork) {
      onChange({ ...next, updatedAt: Date.now() });
      onPaint?.();
    }

    // These little celebrations are SVG decorations over the canvas. They can
    // never become part of the saved picture, thumbnail, or exported PNG.
    function tapFeedback(x: number, y: number, expectedNumber?: number) {
      if (reducedMotionRef.current || !effectsRef.current) return;
      const group = document.createElementNS(SVG_NS, "g");
      group.style.transformOrigin = `${x}px ${y}px`;
      group.setAttribute(
        "data-paint-feedback",
        expectedNumber ? "number" : "sparkle",
      );
      const ring = document.createElementNS(SVG_NS, "circle");
      ring.setAttribute("cx", String(x));
      ring.setAttribute("cy", String(y));
      ring.setAttribute("r", expectedNumber ? "24" : "17");
      ring.setAttribute("fill", expectedNumber ? "#FFFFFF" : "none");
      ring.setAttribute(
        "stroke",
        expectedNumber ? PALETTE[(expectedNumber - 1) % PALETTE.length] : color,
      );
      ring.setAttribute("stroke-width", "3");
      group.append(ring);
      if (expectedNumber) {
        const text = document.createElementNS(SVG_NS, "text");
        text.setAttribute("x", String(x));
        text.setAttribute("y", String(y + 8));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", OUTLINE);
        text.setAttribute("font-size", "25");
        text.setAttribute("font-weight", "900");
        text.textContent = String(expectedNumber);
        group.append(text);
      } else {
        for (let i = 0; i < 5; i += 1) {
          const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
          const sx = x + Math.cos(angle) * 29;
          const sy = y + Math.sin(angle) * 29;
          const sparkle = document.createElementNS(SVG_NS, "path");
          sparkle.setAttribute(
            "d",
            `M${sx} ${sy - 5}l1.7 3.3 3.3 1.7-3.3 1.7-1.7 3.3-1.7-3.3-3.3-1.7 3.3-1.7z`,
          );
          sparkle.setAttribute("fill", i % 2 ? "#FFD35C" : color);
          sparkle.setAttribute("stroke", "#FFFFFF");
          sparkle.setAttribute("stroke-width", "1");
          group.append(sparkle);
        }
      }
      effectsRef.current.append(group);
      const animation = group.animate(
        expectedNumber
          ? [
              { transform: "translateX(0)", opacity: 1 },
              { transform: "translateX(-5px)", opacity: 1, offset: 0.16 },
              { transform: "translateX(5px)", opacity: 1, offset: 0.32 },
              { transform: "translateX(0)", opacity: 1, offset: 0.52 },
              { transform: "translateY(-5px)", opacity: 0 },
            ]
          : [
              { transform: "scale(.6)", opacity: 0.9 },
              { transform: "scale(1.35)", opacity: 0.85, offset: 0.35 },
              { transform: "scale(1.8)", opacity: 0 },
            ],
        {
          duration: expectedNumber ? 650 : 460,
          easing: "ease-out",
          fill: "forwards",
        },
      );
      void animation.finished.then(
        () => group.remove(),
        () => group.remove(),
      );
    }

    function regionAt(x: number, y: number) {
      const context = hitContextRef.current;
      if (!context) return -1;
      const exact = (px: number, py: number) => {
        for (let i = regions.length - 1; i >= 0; i -= 1)
          if (context.isPointInPath(regions[i].path, px, py, "evenodd"))
            return i;
        return -1;
      };
      const direct = exact(x, y);
      if (direct >= 0) return direct;
      // Help tiny fingers only when they actually touched an illustration line.
      // A tap in empty page space must never jump to a nearby shape.
      context.lineWidth = 9;
      const onOutline = illustrationInk
        ? context.isPointInPath(illustrationInk, x, y, "evenodd")
        : regions.some((region) =>
            context.isPointInStroke(region.path, x, y),
          ) || lines.some((line) => context.isPointInStroke(line, x, y));
      if (!onOutline) return -1;
      for (const radius of [2, 4, 6, 9, 12]) {
        for (let step = 0; step < 16; step += 1) {
          const angle = (step * Math.PI * 2) / 16;
          const nearby = exact(
            x + Math.cos(angle) * radius,
            y + Math.sin(angle) * radius,
          );
          if (nearby >= 0) return nearby;
        }
      }
      return -1;
    }

    function fillAt(x: number, y: number) {
      const index = regionAt(x, y);
      if (index < 0) return;
      const region = regions[index];
      if (
        artwork.mode === "number" &&
        color.toUpperCase() !==
          PALETTE[(region.number - 1) % PALETTE.length].toUpperCase()
      ) {
        tapFeedback(x, y, region.number);
        onWrongColor?.();
        return;
      }
      if (artwork.fills[region.id] === color) return;
      if (!reducedMotionRef.current) {
        const previous = makeLayer(densityRef.current);
        const context = clearLayer(previous, densityRef.current);
        if (context) {
          context.fillStyle = artwork.fills[region.id] ?? "#FFFFFF";
          context.fill(region.path, "evenodd");
          if (!artwork.fills[region.id] && artwork.mode === "number" && hints) {
            context.fillStyle = `${PALETTE[(region.number - 1) % PALETTE.length]}18`;
            context.fill(region.path, "evenodd");
          }
          context.globalCompositeOperation = "destination-out";
          for (const later of regions.slice(index + 1))
            context.fill(later.path, "evenodd");
          // Measure only the selected path, once per tap. Small spaces should
          // enjoy the same gentle 280ms bloom as a large animal or background.
          let radius = CANVAS_SIZE * Math.SQRT2;
          if (effectsRef.current) {
            const measure = document.createElementNS(SVG_NS, "path");
            measure.setAttribute("d", region.d);
            measure.setAttribute("visibility", "hidden");
            effectsRef.current.append(measure);
            const bounds = measure.getBBox();
            measure.remove();
            radius = Math.hypot(
              Math.max(
                Math.abs(x - bounds.x),
                Math.abs(x - bounds.x - bounds.width),
              ),
              Math.max(
                Math.abs(y - bounds.y),
                Math.abs(y - bounds.y - bounds.height),
              ),
            );
          }
          bloomsRef.current = [
            ...bloomsRef.current
              .filter((bloom) => bloom.regionId !== region.id)
              .slice(-2),
            {
              regionId: region.id,
              color,
              x,
              y,
              radius,
              started: performance.now(),
              previous,
            },
          ];
        }
      }
      tapFeedback(x, y);
      // Persist the final color now; the visual animation does not delay saving.
      publish({ ...artwork, fills: { ...artwork.fills, [region.id]: color } });
    }

    function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
      if (activeRef.current || !event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      if (pointerRef.current) pointerRef.current.style.display = "none";
      const [x, y] = position(event);
      if (artwork.mode === "number" || tool === "fill") {
        fillAt(x, y);
        return;
      }
      if (tool === "sticker") {
        tapFeedback(x, y);
        publish({
          ...artwork,
          stickers: [
            ...artwork.stickers,
            { x, y, emoji: sticker, size: Math.max(52, size * 2) },
          ],
        });
        return;
      }
      activeRef.current = {
        pointerId: event.pointerId,
        stroke: { tool, color, size, points: [[x, y]] },
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      scheduleRender();
    }

    function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
      const active = activeRef.current;
      if (!active) {
        if (
          event.pointerType === "mouse" &&
          tool !== "fill" &&
          tool !== "sticker" &&
          artwork.mode !== "number" &&
          pointerRef.current
        ) {
          const [x, y] = position(event);
          pointerRef.current.setAttribute("transform", `translate(${x} ${y})`);
          pointerRef.current.style.display = "block";
        }
        return;
      }
      if (active.pointerId !== event.pointerId) return;
      event.preventDefault();
      const nativeEvents = event.nativeEvent.getCoalescedEvents?.() ?? [];
      const events = nativeEvents.length ? nativeEvents : [event.nativeEvent];
      for (const sample of events) {
        const point = position(sample);
        const last = active.stroke.points[active.stroke.points.length - 1];
        if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= 0.8)
          active.stroke.points.push(point);
      }
      scheduleRender();
    }

    function finishStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
      const active = activeRef.current;
      if (!active || active.pointerId !== event.pointerId) return;
      activeRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      publish({ ...artwork, strokes: [...artwork.strokes, active.stroke] });
    }

    return (
      <div
        className="paint-surface"
        style={{ position: "relative", width: "100%", aspectRatio: "1" }}
      >
        <canvas
          ref={canvasRef}
          className="paint-canvas"
          width={CANVAS_SIZE * densityRef.current}
          height={CANVAS_SIZE * densityRef.current}
          role="img"
          aria-label="Coloring canvas"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onLostPointerCapture={finishStroke}
          onPointerLeave={() => {
            if (pointerRef.current) pointerRef.current.style.display = "none";
          }}
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            aspectRatio: "1",
            touchAction: "none",
            userSelect: "none",
            cursor:
              tool === "fill" || artwork.mode === "number"
                ? "pointer"
                : "crosshair",
          }}
        />
        <svg
          className="paint-feedback"
          viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          <g ref={effectsRef} />
          <g ref={pointerRef} style={{ display: "none" }}>
            <circle r={size / 2} fill="none" stroke="#FFFFFF" strokeWidth="4" />
            <circle
              r={size / 2}
              fill="none"
              stroke={tool === "eraser" ? OUTLINE : color}
              strokeWidth="2"
              strokeDasharray={tool === "eraser" ? "5 4" : undefined}
            />
          </g>
        </svg>
      </div>
    );
  },
);

export default PaintCanvas;
