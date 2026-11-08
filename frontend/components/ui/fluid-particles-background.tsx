"use client";

// Fluid particles background (21st.dev), adapted for SYNAPSE:
// - monochrome particles (white on black / black on white), as in the original
// - transparent trails, so the glowing live background shows through
// - fewer particles and 30fps on phones; pauses when the tab is hidden,
//   when Settings → Live background is off, or with "reduce motion"
// - fixes the original's restart-on-every-render and missing cleanup

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface FluidParticlesBackgroundProps {
  children?: React.ReactNode;
  particleCount?: number;
  noiseIntensity?: number;
  particleSize?: { min: number; max: number };
  className?: string;
}

// Perlin noise (from the original component)
function createNoise() {
  const permutation = [
    151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240,
    21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88,
    237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83,
    111, 229, 122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216,
    80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3,
    64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17,
    182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129,
    22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238,
    210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184,
    84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195,
    78, 66, 215, 61, 156, 180,
  ];
  const p = new Array(512);
  for (let i = 0; i < 256; i++) p[256 + i] = p[i] = permutation[i];
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (t: number, a: number, b: number) => a + t * (b - a);
  const grad = (hash: number, x: number, y: number, z: number) => {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  };
  return (x: number, y: number, z: number) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(w,
      lerp(v, lerp(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)), lerp(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z))),
      lerp(v, lerp(u, grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1)), lerp(u, grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1))));
  };
}

// Monochrome, like the original component: white particles on black in dark
// mode, black on white in light mode (a few slightly grey ones for depth).
const PALETTE = {
  dark: [[255, 255, 255], [255, 255, 255], [212, 212, 212], [163, 163, 163]],
  light: [[0, 0, 0], [0, 0, 0], [38, 38, 38], [82, 82, 82]],
} as const;
const MIX = [0, 0, 1, 2, 3, 0, 1, 2];

interface Particle {
  x: number; y: number; size: number; life: number; maxLife: number; tint: number;
}

export const FluidParticlesBackground = ({
  children,
  particleCount,
  noiseIntensity = 0.003,
  particleSize = { min: 0.5, max: 2 },
  className,
}: FluidParticlesBackgroundProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeMin = particleSize.min;
  const sizeMax = particleSize.max;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const noise = createNoise();
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const frameGap = coarse ? 1000 / 30 : 0;
    let width = 0, height = 0, dpr = 1, raf = 0, last = 0;
    let particles: Particle[] = [];

    const spawn = (): Particle => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * (sizeMax - sizeMin) + sizeMin,
      life: Math.random() * 100,
      maxLife: 100 + Math.random() * 50,
      tint: MIX[(Math.random() * MIX.length) | 0],
    });

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Scale the count to the screen: about 1 particle per 1,000 px², capped.
      const count = particleCount ?? Math.min(coarse ? 650 : 1600, Math.round((width * height) / 1000));
      particles = Array.from({ length: count }, spawn);
    };

    const enabled = () => document.documentElement.dataset.liveBg !== "off" && !reduceMotion.matches && !document.hidden;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (frameGap && now - last < frameGap) return;
      last = now;
      if (!enabled()) {
        ctx.clearRect(0, 0, width, height);
        return;
      }
      const isDark = document.documentElement.classList.contains("dark");
      const colors = isDark ? PALETTE.dark : PALETTE.light;

      // Fade old frames toward transparent, leaving soft trails.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";

      const z = now * 0.0001;
      const strength = isDark ? 0.34 : 0.3;
      for (const particle of particles) {
        particle.life += 1;
        if (particle.life > particle.maxLife) {
          particle.life = 0;
          particle.x = Math.random() * width;
          particle.y = Math.random() * height;
        }
        const angle = noise(particle.x * noiseIntensity, particle.y * noiseIntensity, z) * Math.PI * 4;
        particle.x += Math.cos(angle) * 2;
        particle.y += Math.sin(angle) * 2;
        if (particle.x < 0) particle.x = width;
        else if (particle.x > width) particle.x = 0;
        if (particle.y < 0) particle.y = height;
        else if (particle.y > height) particle.y = 0;

        const opacity = Math.sin((particle.life / particle.maxLife) * Math.PI) * strength;
        const [r, g, b] = colors[particle.tint];
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    resize();
    raf = requestAnimationFrame(frame);
    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
    };
  }, [particleCount, noiseIntensity, sizeMin, sizeMax]);

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      {children && <div className="relative z-10 flex h-full w-full items-center justify-center">{children}</div>}
    </div>
  );
};

export default FluidParticlesBackground;
