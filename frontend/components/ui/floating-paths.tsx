// Floating paths background (21st.dev/@bundui/components/floating-paths),
// adapted for SYNAPSE:
// - fills the whole screen behind the app instead of a hero section
// - animated with plain CSS (stroke-dashoffset) instead of framer-motion,
//   so it costs almost nothing and needs no extra JavaScript per frame
// - lines use the theme's text colour (white in dark mode, black in light)
// - stops moving when Settings → Live background is off or with "reduce motion"

type PathDef = { id: number; d: string; width: number; opacity: number; duration: number; delay: number };

// Deterministic "random" so the server and browser render the same thing.
const rand = (n: number) => {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

function buildPaths(position: number): PathDef[] {
  return Array.from({ length: 36 }, (_, i) => {
    const s = i * 5 * position;
    return {
      id: i,
      d:
        `M-${380 - s} -${189 + i * 6}C-${380 - s} -${189 + i * 6} -${312 - s} ${216 - i * 6} ${152 - s} ${343 - i * 6}` +
        `C${616 - s} ${470 - i * 6} ${684 - s} ${875 - i * 6} ${684 - s} ${875 - i * 6}`,
      width: 0.5 + i * 0.03,
      opacity: 0.1 + i * 0.03,
      duration: 20 + rand(i + position * 100) * 10,
      delay: -rand(i * 7 + position * 31) * 30,
    };
  });
}

const SETS = [buildPaths(1), buildPaths(-1)];

export function FloatingPaths({ className }: { className?: string }) {
  return (
    <svg
      className={["floating-paths", className].filter(Boolean).join(" ")}
      viewBox="0 0 696 316"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden="true"
    >
      {SETS.map((paths, set) => (
        <g key={set}>
          {paths.map((p) => (
            <path
              key={p.id}
              d={p.d}
              pathLength={1}
              stroke="currentColor"
              strokeWidth={p.width}
              strokeOpacity={p.opacity}
              style={{ animationDuration: `${p.duration.toFixed(2)}s, ${(p.duration / 2).toFixed(2)}s`, animationDelay: `${p.delay.toFixed(2)}s` }}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

export default FloatingPaths;
