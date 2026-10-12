import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** The hand-drawn "M" in a ring, drawn on a 100×100 box. Shared with src/app/icon.svg. */
const RING = "M 50 6 a 44 44 0 1 1 0 88 a 44 44 0 1 1 0 -88";
const FLOURISH = ["M 27 10.2 A 46 46 0 0 1 46 4.2", "M 73 10.2 A 46 46 0 0 1 89.8 27"];
const LETTER = "M 28.5 64 C 29.5 52 31 39 33.8 33.2 C 35.5 30.5 37.5 33 39.5 40 C 41.5 47 43 56 45.3 60 C 47 62.5 49 59 52 51 C 56 40 60.5 30 63.8 28.2 C 65.5 27.5 64.8 34 63.5 44 C 62 56 60 68 58.6 77.6";

function Mark({ x = 0 }: { x?: number }) {
  return (
    <g transform={`translate(${x} 0)`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d={RING} strokeWidth="2.4" />
      {FLOURISH.map((d) => (
        <path key={d} d={d} strokeWidth="1.2" />
      ))}
      <path d={LETTER} strokeWidth="4.5" />
    </g>
  );
}

/**
 * The full Masqani logo — ring mark plus spaced wordmark — as one graphic.
 * "stacked" matches the master artwork; "inline" puts the wordmark beside the mark for short bars.
 * Size it with a height class; the colour follows the --color-logo token.
 */
export function MasqaniLogo({ variant = "stacked", className }: { variant?: "stacked" | "inline"; className?: string }) {
  const stacked = variant === "stacked";
  return (
    <svg
      viewBox={stacked ? "0 0 200 140" : "0 0 335 100"}
      className={cn("w-auto shrink-0 text-logo", className)}
      role="img"
      aria-label={APP_NAME}
    >
      <Mark x={stacked ? 50 : 0} />
      <text
        x={stacked ? 104 : 118}
        y={stacked ? 134 : 50}
        textAnchor={stacked ? "middle" : "start"}
        dominantBaseline={stacked ? "auto" : "central"}
        fill="currentColor"
        fontSize={stacked ? 21 : 34}
        fontWeight={500}
        letterSpacing={stacked ? 8 : 9}
        style={{ fontFamily: "var(--font-sans)" }}
      >
        MASQANI
      </text>
    </svg>
  );
}
