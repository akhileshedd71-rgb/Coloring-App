import type { Drawing } from "../types";

interface DrawingPreviewProps {
  drawing: Drawing;
  colored?: boolean;
  className?: string;
  fills?: Record<string, string>;
}

export function DrawingPreview({
  drawing,
  colored = false,
  className,
  fills,
}: DrawingPreviewProps) {
  return (
    <svg
      viewBox="0 0 800 800"
      className={className}
      role="img"
      aria-label={drawing.title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g
        stroke="#394C50"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {drawing.regions.map((region) => (
          <path
            key={region.id}
            d={region.d}
            fill={fills?.[region.id] ?? (colored ? region.color : "#FFFFFF")}
          />
        ))}
        {drawing.lines?.map((d, i) => (
          <path key={`line-${i}`} d={d} fill="none" />
        ))}
      </g>
    </svg>
  );
}
