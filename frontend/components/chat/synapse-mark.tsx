import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Six connections around a core, pre-computed so server and browser render identical SVG.
const SPOKES: [number, number, number, number][] = [
  [16, 11.6, 16, 6.4],
  [19.81, 13.8, 24.31, 11.2],
  [19.81, 18.2, 24.31, 20.8],
  [16, 20.4, 16, 25.6],
  [12.19, 18.2, 7.69, 20.8],
  [12.19, 13.8, 7.69, 11.2],
];

const NODES: [number, number, number][] = [
  [16, 3.8, 2.4],
  [26.57, 9.9, 1.8],
  [26.57, 22.1, 2.4],
  [16, 28.2, 1.8],
  [5.43, 22.1, 2.4],
  [5.43, 9.9, 1.8],
];

type SynapseMarkProps = {
  size?: number;
  /** Spins and pulses while SYNAPSE is working. */
  animate?: boolean;
  className?: string;
  title?: string;
};

export function SynapseMark({ size = 24, animate = false, className, title }: SynapseMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={cn("synapse-mark shrink-0 text-primary", className)}
      data-animate={animate ? "true" : "false"}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g className="synapse-mark__spin">
        {SPOKES.map(([x1, y1, x2, y2], index) => (
          <line
            key={index}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth={1.9}
            strokeLinecap="round"
          />
        ))}
        {NODES.map(([cx, cy, r], index) => (
          <circle
            key={index}
            className="synapse-mark__node"
            cx={cx}
            cy={cy}
            r={r}
            fill="currentColor"
            style={{ "--i": index } as CSSProperties}
          />
        ))}
      </g>
      <circle className="synapse-mark__core" cx={16} cy={16} r={3} fill="currentColor" />
    </svg>
  );
}
