import { useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";
import { Hand, Maximize, Minus, Plus, Pencil } from "lucide-react";
import "./studio-viewport.css";

/** Zoom changes CSS size only; the canvas continues to use its original artwork coordinates. */
export function StudioViewport({
  children,
  resetKey,
  toolbar,
}: {
  children: ReactNode;
  resetKey: string;
  toolbar?: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    pointer: number;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(false);
  useEffect(() => {
    setZoom(1);
    setPan(false);
    viewport.current?.scrollTo(0, 0);
  }, [resetKey]);
  function resize(next: number) {
    const el = viewport.current;
    if (!el) return;
    const centerX = (el.scrollLeft + el.clientWidth / 2) / zoom;
    const centerY = (el.scrollTop + el.clientHeight / 2) / zoom;
    setZoom(next);
    if (next === 1) setPan(false);
    requestAnimationFrame(() => {
      el.scrollLeft = centerX * next - el.clientWidth / 2;
      el.scrollTop = centerY * next - el.clientHeight / 2;
    });
  }
  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (!viewport.current || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      left: viewport.current.scrollLeft,
      top: viewport.current.scrollTop,
      pointer: event.pointerId,
    };
  }
  function movePan(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || !viewport.current || event.pointerId !== start.pointer)
      return;
    viewport.current.scrollLeft = start.left - (event.clientX - start.x);
    viewport.current.scrollTop = start.top - (event.clientY - start.y);
  }
  function endPan(event: PointerEvent<HTMLDivElement>) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return (
    <div className="studio-viewport-shell">
      <div className="canvas-navigation" aria-label="Canvas view controls">
        <div className="canvas-progress-slot">{toolbar}</div>
        <div className="zoom-controls">
          <button
            aria-label="Zoom out"
            onClick={() => resize(Math.max(1, zoom - 0.5))}
            disabled={zoom === 1}
          >
            <Minus size={16} />
          </button>
          <button
            aria-label="Fit picture to canvas"
            className="zoom-fit"
            onClick={() => resize(1)}
            title="Fit picture"
          >
            <Maximize size={13} />
            <span>{Math.round(zoom * 100)}%</span>
          </button>
          <button
            aria-label="Zoom in"
            onClick={() => resize(Math.min(3, zoom + 0.5))}
            disabled={zoom === 3}
          >
            <Plus size={16} />
          </button>
          {zoom > 1 && (
            <button
              aria-label={pan ? "Continue coloring" : "Move picture"}
              aria-pressed={pan}
              className={`pan-toggle ${pan ? "selected" : ""}`}
              onClick={() => setPan((v) => !v)}
            >
              {pan ? <Pencil size={17} /> : <Hand size={17} />}
            </button>
          )}
        </div>
      </div>
      <div
        ref={viewport}
        className={`canvas-viewport ${pan ? "is-panning" : ""}`}
        aria-label="Picture viewport"
      >
        <div className="zoomed-picture" style={{ width: `${zoom * 100}%` }}>
          {children}
          {pan && (
            <div
              className="canvas-pan-layer"
              onPointerDown={startPan}
              onPointerMove={movePan}
              onPointerUp={endPan}
              onPointerCancel={endPan}
              onLostPointerCapture={() => {
                drag.current = null;
              }}
            >
              <span>Drag to explore · tap the pencil to color</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
