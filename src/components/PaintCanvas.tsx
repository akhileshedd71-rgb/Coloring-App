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

const OUTLINE = "#394C50";

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
    const inkRef = useRef<HTMLCanvasElement | null>(null);
    const compositeRef = useRef<HTMLCanvasElement | null>(null);
    const outlineRef = useRef<HTMLCanvasElement | null>(null);
    const hitContextRef = useRef<CanvasRenderingContext2D | null>(null);
    const activeRef = useRef<ActiveStroke | null>(null);
    const frameRef = useRef<number | null>(null);
    const renderRef = useRef<() => void>(() => undefined);
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

    const render = useCallback(() => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      const ink = inkRef.current;
      const composite = compositeRef.current;
      const compositeContext = composite?.getContext("2d");
      if (!canvas || !context || !ink || !composite || !compositeContext)
        return;
      const density = densityRef.current;
      context.setTransform(density, 0, 0, density, 0, 0);
      context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      context.fillStyle = artwork.mode === "glow" ? "#152843" : "#FFFFFF";
      context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      for (const region of regions) {
        const numberColor = PALETTE[(region.number - 1) % PALETTE.length];
        context.fillStyle =
          artwork.fills[region.id] ??
          (artwork.mode === "number" && hints ? `${numberColor}18` : "#FFFFFF");
        context.fill(region.path);
      }

      // Ink has its own transparent layer: erasers reveal the picture underneath.
      compositeContext.setTransform(density, 0, 0, density, 0, 0);
      compositeContext.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      compositeContext.drawImage(ink, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
      if (activeRef.current)
        drawStroke(
          compositeContext,
          activeRef.current.stroke,
          artwork.mode === "glow",
        );
      context.drawImage(composite, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

      if (outlineRef.current)
        context.drawImage(outlineRef.current, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

      if (artwork.mode === "number" && hints) {
        context.font =
          '800 23px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
        context.textAlign = "center";
        context.textBaseline = "middle";
        for (const region of regions) {
          if (!region.label || artwork.fills[region.id]) continue;
          const [x, y] = region.label;
          context.beginPath();
          context.arc(x, y, 19, 0, Math.PI * 2);
          context.fillStyle = "#FFFFFF";
          context.fill();
          context.lineWidth = 2;
          context.strokeStyle = hints
            ? PALETTE[(region.number - 1) % PALETTE.length]
            : "#DDE5E6";
          context.stroke();
          context.fillStyle = OUTLINE;
          context.fillText(String(region.number), x, y + 1);
        }
      }

      context.textAlign = "center";
      context.textBaseline = "middle";
      for (const placed of artwork.stickers) {
        context.font = `${placed.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        context.fillText(placed.emoji, placed.x, placed.y);
      }
    }, [artwork, hints, lines, regions]);

    useLayoutEffect(() => {
      renderRef.current = render;
    }, [render]);

    useLayoutEffect(() => {
      const density = densityRef.current;
      inkRef.current ??= document.createElement("canvas");
      compositeRef.current ??= document.createElement("canvas");
      outlineRef.current ??= document.createElement("canvas");
      hitContextRef.current ??= document
        .createElement("canvas")
        .getContext("2d");
      for (const layer of [
        inkRef.current,
        compositeRef.current,
        outlineRef.current,
      ]) {
        if (layer.width !== CANVAS_SIZE * density) {
          layer.width = CANVAS_SIZE * density;
          layer.height = CANVAS_SIZE * density;
        }
      }
      const context = inkRef.current.getContext("2d");
      if (!context) return;
      context.setTransform(density, 0, 0, density, 0, 0);
      context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      for (const stroke of artwork.strokes)
        drawStroke(context, stroke, artwork.mode === "glow");
      const outlines = outlineRef.current.getContext("2d");
      if (outlines) {
        outlines.setTransform(density, 0, 0, density, 0, 0);
        outlines.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        outlines.lineCap = "round";
        outlines.lineJoin = "round";
        outlines.lineWidth = 9;
        outlines.strokeStyle = OUTLINE;
        // A later shape covers earlier borders, just like the SVG preview.
        // Keep that occlusion while retaining a transparent layer above the ink.
        for (const region of regions) {
          outlines.globalCompositeOperation = "destination-out";
          outlines.fill(region.path);
          outlines.globalCompositeOperation = "source-over";
          outlines.stroke(region.path);
        }
        for (const line of lines) outlines.stroke(line);
      }
      activeRef.current = null;
      render();
    }, [artwork, render]);

    useLayoutEffect(
      () => () => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      },
      [],
    );

    useImperativeHandle(
      forwardedRef,
      () => ({
        exportImage: () => {
          renderRef.current();
          return canvasRef.current?.toDataURL("image/png") ?? "";
        },
        exportThumbnail: () => {
          renderRef.current();
          const source = canvasRef.current;
          if (!source) return "";
          const thumbnail = document.createElement("canvas");
          thumbnail.width = 320;
          thumbnail.height = 320;
          const context = thumbnail.getContext("2d");
          if (!context) return "";
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.drawImage(source, 0, 0, 320, 320);
          return thumbnail.toDataURL("image/png");
        },
      }),
      [],
    );

    function scheduleRender() {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        renderRef.current();
      });
    }

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

    function fillAt(x: number, y: number) {
      const hitContext = hitContextRef.current;
      if (!hitContext) return;
      for (let i = regions.length - 1; i >= 0; i -= 1) {
        const region = regions[i];
        if (!hitContext.isPointInPath(region.path, x, y)) continue;
        if (
          artwork.mode === "number" &&
          color.toUpperCase() !==
            PALETTE[(region.number - 1) % PALETTE.length].toUpperCase()
        ) {
          onWrongColor?.();
          return;
        }
        if (artwork.fills[region.id] !== color)
          publish({
            ...artwork,
            fills: { ...artwork.fills, [region.id]: color },
          });
        return;
      }
    }

    function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
      if (activeRef.current || !event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      const [x, y] = position(event);
      if (artwork.mode === "number") {
        fillAt(x, y);
        return;
      }
      if (tool === "sticker") {
        publish({
          ...artwork,
          stickers: [
            ...artwork.stickers,
            { x, y, emoji: sticker, size: Math.max(52, size * 2) },
          ],
        });
        return;
      }
      if (tool === "fill") {
        fillAt(x, y);
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
      if (!active || active.pointerId !== event.pointerId) return;
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
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          aspectRatio: "1",
          touchAction: "none",
          userSelect: "none",
          cursor: tool === "fill" ? "pointer" : "crosshair",
        }}
      />
    );
  },
);

export default PaintCanvas;
