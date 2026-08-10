import type { KeyboardEvent, PointerEvent } from "react";

/**
 * Ported from design/Dashboard.dc.html `dragLinear`/`keyStep` — pointer-drag and keyboard
 * stepping for the ambient-level and EQ-band sliders (design doc §1e specs both controls
 * against this exact interaction: drag rounds to integers, arrow keys ±1, PageUp/PageDown ±5,
 * Home/End to min/max).
 */
export function useLinearDrag(min: number, max: number, apply: (value: number) => void) {
  const onPointerDown = (e: PointerEvent<HTMLElement>, vertical: boolean) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const calc = (clientX: number, clientY: number) => {
      const frac = vertical ? 1 - (clientY - rect.top) / rect.height : (clientX - rect.left) / rect.width;
      apply(Math.round(min + Math.max(0, Math.min(1, frac)) * (max - min)));
    };
    calc(e.clientX, e.clientY);
    const move = (ev: PointerEvent | globalThis.PointerEvent) => calc(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener("pointermove", move as EventListener);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move as EventListener);
    window.addEventListener("pointerup", up);
    e.preventDefault();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>, current: number, big = 5) => {
    let next: number | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") next = current + 1;
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") next = current - 1;
    else if (e.key === "PageUp") next = current + big;
    else if (e.key === "PageDown") next = current - big;
    else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    if (next === null) return;
    e.preventDefault();
    apply(Math.max(min, Math.min(max, next)));
  };

  return { onPointerDown, onKeyDown };
}
