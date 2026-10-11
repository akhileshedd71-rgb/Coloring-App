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
  if (
    drawing.asset &&
    !drawing.ink &&
    !drawing.regions.length &&
    drawing.thumbnail
  ) {
    return (
      <svg
        viewBox="0 0 800 800"
        className={className}
        role="img"
        aria-label={drawing.title}
      >
        <image href={drawing.thumbnail} width="800" height="800" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 800 800"
      className={className}
      role="img"
      aria-label={drawing.title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g
        stroke={drawing.ink ? "none" : "#394C50"}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {drawing.regions.map((region) => (
          <path
            key={region.id}
            d={region.d}
            fillRule="evenodd"
            fill={fills?.[region.id] ?? (colored ? region.color : "#FFFFFF")}
          />
        ))}
        {drawing.lines?.map((d, i) => (
          <path key={`line-${i}`} d={d} fill="none" />
        ))}
      </g>
      {drawing.ink && (
        <path d={drawing.ink} fill="#394C50" fillRule="evenodd" />
      )}
    </svg>
  );
}
