"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveals streamed text at a steady pace instead of in uneven network chunks.
 * The pace is time-based, so big chunks catch up quickly, small ones type out
 * smoothly, and slow or background tabs never fall behind.
 */
export function useSmoothText(text: string, animate: boolean) {
  const [shown, setShown] = useState(animate ? "" : text);
  const shownRef = useRef(animate ? "" : text);

  useEffect(() => {
    if (!animate) return;

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      let current = shownRef.current;
      if (!text.startsWith(current)) current = ""; // text was replaced (e.g. retry)
      if (current.length >= text.length) return;

      const seconds = Math.min(Math.max(now - last, 0), 1000) / 1000;
      last = now;

      // At least ~120 characters a second, and ~6x the hidden backlog per second.
      const backlog = text.length - current.length;
      const step = Math.max(1, Math.ceil(seconds * 120), Math.ceil(backlog * Math.min(1, seconds * 6)));
      let end = current.length + step;

      // Don't cut an emoji or other two-part character in half.
      const code = text.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff) end += 1;

      current = text.slice(0, end);
      shownRef.current = current;
      setShown(current);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, animate]);

  return animate ? shown : text;
}
