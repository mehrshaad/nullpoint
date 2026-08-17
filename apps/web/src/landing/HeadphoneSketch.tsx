/**
 * A drawn stand-in for the product photograph: over-ear headphones as a schematic elevation.
 *
 * Drawn rather than photographed because the page already speaks in hairlines, mono labels and
 * raw bytes — a lit product render belongs to a different kind of site. A construction drawing
 * belongs to this one, and it carries no one else's copyright.
 *
 * The device is the app's own: noise arrives at the left cup with amplitude and leaves the right
 * one flat. That is the null point, and it is the whole product in one line.
 */

import { useEffect, useRef } from "react";

/**
 * Noise in, silence out. Amplitude decays across the width and is dead flat past the cups.
 *
 * `phase` travels the wave rightwards without moving the envelope: the decay is a function of
 * position, so the shape stays pinned to the drawing while the sound runs through it. Two
 * components rather than one sine, because a single frequency reads as a graph and sound does
 * not look like that.
 */
function noisePath(width: number, y: number, amplitude: number, cycles: number, phase = 0): string {
  const steps = 220;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Squared falloff, so most of the movement happens before the drawing and the tail is
    // convincingly silent rather than merely small.
    const decay = Math.pow(Math.max(0, 1 - t / 0.82), 2);
    const a = t * cycles * Math.PI * 2 - phase;
    const offset = (Math.sin(a) * 0.74 + Math.sin(a * 1.9 + 1.3) * 0.26) * amplitude * decay;
    points.push(`${i === 0 ? "M" : "L"}${(t * width).toFixed(1)},${(y + offset).toFixed(1)}`);
  }
  return points.join(" ");
}

export function HeadphoneSketch({ className }: { className?: string }) {
  const W = 440;
  const H = 480;
  const CUP_Y = 316;
  const waveRef = useRef<SVGPathElement>(null);

  // Driven here rather than declared in CSS: only the phase moves while the decay envelope stays
  // put, which no single transform can express. Idle when it is off-screen, and absent entirely
  // when the reader has asked for less motion.
  useEffect(() => {
    const el = waveRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let onScreen = true;
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
    });
    observer.observe(el);

    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      if (onScreen) {
        // ~0.55 Hz — slow enough to read as a wave passing through rather than a vibration.
        el.setAttribute("d", noisePath(W, CUP_Y, 30, 3.1, ((now - started) / 1000) * 3.4));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      fill="none"
      role="img"
      aria-label="Schematic drawing of over-ear headphones"
    >
      {/* Noise passing through, behind the object. Fades in from the edge so it reads as
          arriving from outside the frame rather than starting at a hard stop. */}
      <defs>
        <linearGradient id="np-noise-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
          <stop offset="0.14" stopColor="var(--accent)" stopOpacity="0.9" />
          <stop offset="0.86" stopColor="var(--accent)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.35" />
        </linearGradient>
      </defs>

      <path
        ref={waveRef}
        d={noisePath(W, CUP_Y, 30, 3.1)}
        stroke="url(#np-noise-fade)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Construction lines: the drawing admits it is a drawing. Kept clear of the labels —
          a datum line ruled straight through its own annotation is just a mistake. */}
      <g stroke="currentColor" strokeOpacity="0.18" strokeWidth="1">
        {/* Centreline, stopped at the extents of the object rather than trailing off. */}
        <path d="M220 150 L220 402" strokeDasharray="2 7" />
        {/* Short ticks that anchor each label to the thing it names. */}
        <path d="M118 104 L118 122 M262 104 L262 122" strokeDasharray="2 5" />
        <path d="M90 122 L90 140 M350 122 L350 140" />
      </g>

      {/* The band. A wide, near-transparent stroke gives it material; the two hairlines are its
          edges, which is how an elevation is drawn. */}
      <g>
        <path d="M90 262 C90 104 350 104 350 262" stroke="currentColor" strokeOpacity="0.07" strokeWidth="26" strokeLinecap="round" />
        <path d="M90 262 C90 104 350 104 350 262" stroke="currentColor" strokeOpacity="0.62" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M90 262 C90 130 350 130 350 262" stroke="currentColor" strokeOpacity="0.42" strokeWidth="1.2" strokeLinecap="round" />
      </g>

      {/* Slider arms, where the band telescopes into each cup. */}
      <g stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.3">
        <rect x="82" y="228" width="16" height="52" rx="7" />
        <rect x="342" y="228" width="16" height="52" rx="7" />
        <path d="M82 252 L98 252 M342 252 L358 252" strokeOpacity="0.3" />
      </g>

      {/* Cups, each with its pad inset. */}
      <g>
        <rect x="42" y="252" width="96" height="132" rx="46" fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeOpacity="0.62" strokeWidth="1.4" />
        <rect x="60" y="270" width="60" height="96" rx="30" stroke="currentColor" strokeOpacity="0.32" strokeWidth="1.1" />

        <rect x="302" y="252" width="96" height="132" rx="46" fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeOpacity="0.62" strokeWidth="1.4" />
        <rect x="320" y="270" width="60" height="96" rx="30" stroke="currentColor" strokeOpacity="0.32" strokeWidth="1.1" />
      </g>

      {/* The touch surface, on the right cup where it actually lives. */}
      <circle cx="350" cy="318" r="30" stroke="var(--accent)" strokeOpacity="0.5" strokeWidth="1.2" strokeDasharray="3 5" />
      <circle cx="350" cy="318" r="3" fill="var(--accent)" fillOpacity="0.75" />

      {/* Where the null point lands, called out the way a drawing calls out a datum. */}
      <g>
        <path d={`M350 ${CUP_Y} L408 ${CUP_Y}`} stroke="var(--accent)" strokeOpacity="0.5" strokeWidth="1" />
        <circle cx="408" cy={CUP_Y} r="2.6" fill="var(--accent)" />
      </g>

      <g fill="currentColor" fillOpacity="0.5" fontFamily="'IBM Plex Mono', monospace" fontSize="9" letterSpacing="1.6">
        <text x="42" y="112">NOISE IN</text>
        <text x="276" y="112">NULL POINT</text>
      </g>
    </svg>
  );
}
