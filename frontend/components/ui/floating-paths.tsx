"use client";

// Floating paths background (21st.dev/@bundui/components/floating-paths),
// adapted for SYNAPSE:
// - fills the whole screen behind the app instead of a hero section
// - 16 parallel lines that never cross (the original has 72 crossing lines)
// - drawn on a canvas at 30fps instead of animating 72 SVG paths with
//   framer-motion, which repainted the whole page (and every glass blur)
//   on every frame
// - lines use the theme colour (white in dark mode, black in light)
// - pauses when the tab is hidden, when Settings → Live background is off,
//   or with "reduce motion" (the lines then stay still)

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const VB_W = 696;
const VB_H = 316;

// Deterministic "random" so every visit looks the same.
const rand = (n: number) => {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

// 16 copies of one curve, each shifted up and to the right by the same step.
// The curve only ever moves right and down, so shifted copies can never
// cross (checked: 0 of 120 pairs intersect); they stay >= 12 units apart,
// much more than their width.
const LINES = 16;
const STEP_X = 12;
const STEP_Y = -14;

function pathData(i: number) {
  const x = i * STEP_X;
  const y = i * STEP_Y;
  return (
    `M${-380 + x} ${-189 + y}C${-380 + x} ${-189 + y} ${-312 + x} ${216 + y} ${152 + x} ${343 + y}` +
    `C${616 + x} ${470 + y} ${684 + x} ${875 + y} ${684 + x} ${875 + y}`
  );
}

export function FloatingPaths({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const measure = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const paths = Array.from({ length: LINES }, (_, i) => {
      const d = pathData(i);
      measure.setAttribute("d", d);
      return {
        shape: new Path2D(d),
        length: measure.getTotalLength(),
        width: 0.6 + i * 0.06,
        opacity: 0.15 + i * 0.05,
        duration: (20 + rand(i + 100) * 10) * 1000,
        phase: rand(i * 7 + 31),
      };
    });

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0, height = 0, dpr = 1, scale = 1, ox = 0, oy = 0, last = -1e9, raf = 0, timer = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      scale = Math.max(width / VB_W, height / VB_H); // like preserveAspectRatio="xMidYMid slice"
      ox = (width - VB_W * scale) / 2;
      oy = (height - VB_H * scale) / 2;
      last = -1e9;
    };

    const draw = (now: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
      ctx.strokeStyle = getComputedStyle(canvas).color || "#fff";
      ctx.lineCap = "round";
      for (const p of paths) {
        const t = (now / p.duration + p.phase) % 1;
        const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 4);
        ctx.globalAlpha = Math.min(1, p.opacity) * (0.5 + 0.5 * pulse) * 0.5;
        ctx.lineWidth = p.width;
        ctx.setLineDash([p.length * 0.6, p.length * 0.4]);
        ctx.lineDashOffset = -p.length * t;
        ctx.stroke(p.shape);
      }
    };

    let lastTheme = "";
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const theme = document.documentElement.className;
      if (theme !== lastTheme) { lastTheme = theme; last = -1e9; }
      const still = reduceMotion.matches || document.documentElement.dataset.liveBg === "off";
      if (still ? last > 0 : now - last < 1000 / 30) return;
      last = still ? 1 : now;
      draw(still ? 0 : now);
    };

    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(resize, 150);
    };
    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className={cn("floating-paths", className)} aria-hidden="true" />;
}

export default FloatingPaths;
