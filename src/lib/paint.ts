import type { Stroke } from "../types";

export const CANVAS_SIZE = 800;

/** A smooth path also handles a single tap, so very young artists get a dot. */
function strokePath(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  width: number,
) {
  const points = stroke.points;
  if (!points.length) return;
  context.beginPath();
  if (points.length === 1) {
    context.arc(points[0][0], points[0][1], width / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }
  context.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    context.quadraticCurveTo(
      current[0],
      current[1],
      (current[0] + next[0]) / 2,
      (current[1] + next[1]) / 2,
    );
  }
  const last = points[points.length - 1];
  context.lineTo(last[0], last[1]);
  context.lineWidth = width;
  context.stroke();
}

/** Stable randomness keeps glitter and crayon marks identical after undo/reload. */
function randomGenerator(stroke: Stroke) {
  const first = stroke.points[0] ?? [0, 0];
  let seed =
    Math.round(first[0] * 131 + first[1] * 937 + stroke.size * 53) | 0 || 1;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

function samples(stroke: Stroke): [number, number][] {
  if (!stroke.points.length) return [];
  const result: [number, number][] = [stroke.points[0]];
  const spacing = Math.max(3, stroke.size * 0.23);
  let remaining = spacing;
  for (let i = 1; i < stroke.points.length; i += 1) {
    const start = stroke.points[i - 1];
    const end = stroke.points[i];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const distance = Math.hypot(dx, dy);
    let offset = remaining;
    while (offset <= distance) {
      result.push([
        start[0] + (dx * offset) / distance,
        start[1] + (dy * offset) / distance,
      ]);
      offset += spacing;
    }
    remaining = offset - distance;
  }
  return result;
}

export function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  glow: boolean,
) {
  if (!stroke.points.length) return;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  if (stroke.tool === "eraser") {
    context.globalCompositeOperation = "destination-out";
    strokePath(context, stroke, stroke.size);
    context.restore();
    return;
  }
  if (glow) {
    context.shadowBlur = stroke.size * 0.85;
    context.shadowColor = stroke.color;
  }
  context.globalAlpha =
    stroke.tool === "crayon" ? 0.56 : stroke.tool === "glitter" ? 0.62 : 1;
  strokePath(context, stroke, stroke.size);
  context.shadowBlur = 0;
  if (glow && stroke.tool === "brush") {
    context.globalAlpha = 0.84;
    context.strokeStyle = "#FFFFFF";
    context.fillStyle = "#FFFFFF";
    strokePath(context, stroke, Math.max(2, stroke.size * 0.21));
  }
  if (stroke.tool === "crayon" || stroke.tool === "glitter") {
    const random = randomGenerator(stroke);
    for (const [x, y] of samples(stroke)) {
      if (stroke.tool === "crayon") {
        for (let grain = 0; grain < 7; grain += 1) {
          const angle = random() * Math.PI * 2;
          const radius = Math.sqrt(random()) * stroke.size * 0.48;
          context.globalAlpha = 0.1 + random() * 0.32;
          context.fillStyle = random() > 0.64 ? "#FFFFFF" : stroke.color;
          context.beginPath();
          context.arc(
            x + Math.cos(angle) * radius,
            y + Math.sin(angle) * radius,
            0.6 + random() * 1.5,
            0,
            Math.PI * 2,
          );
          context.fill();
        }
      } else {
        const angle = random() * Math.PI * 2;
        const radius = Math.sqrt(random()) * stroke.size * 0.54;
        const sparkleX = x + Math.cos(angle) * radius;
        const sparkleY = y + Math.sin(angle) * radius;
        const sparkleSize = 1.5 + random() * Math.min(4, stroke.size * 0.2);
        context.globalAlpha = 0.6 + random() * 0.4;
        context.fillStyle = random() > 0.25 ? "#FFFFFF" : "#FFE69A";
        context.beginPath();
        context.moveTo(sparkleX, sparkleY - sparkleSize);
        context.lineTo(
          sparkleX + sparkleSize * 0.3,
          sparkleY - sparkleSize * 0.3,
        );
        context.lineTo(sparkleX + sparkleSize, sparkleY);
        context.lineTo(
          sparkleX + sparkleSize * 0.3,
          sparkleY + sparkleSize * 0.3,
        );
        context.lineTo(sparkleX, sparkleY + sparkleSize);
        context.lineTo(
          sparkleX - sparkleSize * 0.3,
          sparkleY + sparkleSize * 0.3,
        );
        context.lineTo(sparkleX - sparkleSize, sparkleY);
        context.lineTo(
          sparkleX - sparkleSize * 0.3,
          sparkleY - sparkleSize * 0.3,
        );
        context.closePath();
        context.fill();
      }
    }
  }
  context.restore();
}
