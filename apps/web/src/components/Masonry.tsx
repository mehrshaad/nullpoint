import {
  Children,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Columns that pack, which is the thing CSS grid will not do.
 *
 * Grid aligns items into rows, so one tall panel sets the height of everything beside it and the
 * short ones leave a hole underneath. CSS multicol packs correctly but rebalances every column
 * whenever any item changes height — panels visibly jump between columns while a section is
 * collapsing. Independent flex columns keep each animation inside its own column.
 *
 * Each panel goes into whichever column is currently shortest, which is what makes it masonry
 * rather than a fixed set of lists. That needs real heights, so panels are measured after they
 * render and the packing is recomputed from the measurements.
 */
export function Masonry({
  children,
  /** Narrowest a column is allowed to get before dropping to fewer of them. */
  minColumn = 320,
  /**
   * Ceiling on the column count. Three reads better than four here: a fourth column on an
   * ultrawide leaves every panel narrow and the eye with too many places to start.
   */
  maxColumns = 3,
  gap = 14,
}: {
  children: ReactNode;
  minColumn?: number;
  maxColumns?: number;
  gap?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);

  const items = Children.toArray(children);
  const count = items.length;

  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const heights = useRef<number[]>([]);
  // Heights live in a ref because the packing reads them during render; this only exists to ask
  // for that render once they change.
  const [, bump] = useState(0);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const measure = useCallback(() => {
    let changed = false;
    for (let i = 0; i < itemRefs.current.length; i++) {
      const h = itemRefs.current[i]?.offsetHeight ?? 0;
      // Sub-pixel churn from a running transition must not trigger a repack.
      if (Math.abs((heights.current[i] ?? 0) - h) > 1) {
        heights.current[i] = h;
        changed = true;
      }
    }
    if (changed) bump((n) => n + 1);
  }, []);

  // Before the first paint, so the initial packing is the real one rather than a visible reflow.
  useLayoutEffect(measure, [measure, count, columns]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const readWidth = () => {
      // n columns need n*minColumn plus the (n-1) gaps between them.
      const fits = Math.floor((el.clientWidth + gap) / (minColumn + gap));
      setColumns(Math.max(1, Math.min(maxColumns, fits)));
    };
    readWidth();
    const observer = new ResizeObserver(readWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, [gap, minColumn, maxColumns]);

  useEffect(() => {
    // Panels change height when a section collapses, and that animates. Repacking on every frame
    // of it would throw panels between columns mid-transition, so wait for it to finish.
    const observer = new ResizeObserver(() => {
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(measure, 220);
    });
    for (const el of itemRefs.current) if (el) observer.observe(el);
    return () => {
      observer.disconnect();
      if (settle.current) clearTimeout(settle.current);
    };
  }, [measure, count, columns]);

  const measured = heights.current.length >= count && items.every((_, i) => (heights.current[i] ?? 0) > 0);

  const buckets: number[][] = Array.from({ length: columns }, () => []);
  const totals = new Array<number>(columns).fill(0);
  items.forEach((_, i) => {
    let target = 0;
    if (measured) {
      // Shortest column wins; ties go left, which keeps reading order along the top row.
      for (let c = 1; c < columns; c++) {
        if (totals[c]! < totals[target]! - 0.5) target = c;
      }
    } else {
      // Nothing measured yet — deal them out in order so the first paint is still sensible.
      target = i % columns;
    }
    buckets[target]!.push(i);
    totals[target] = (totals[target] ?? 0) + (heights.current[i] ?? 0) + gap;
  });

  return (
    <div ref={ref} style={{ display: "flex", alignItems: "flex-start", gap }}>
      {buckets.map((bucket, c) => (
        <div
          key={c}
          // minWidth:0 so a panel with wide unbreakable content shrinks instead of stretching
          // its column and pushing the page into horizontal scroll.
          style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap }}
        >
          {bucket.map((i) => (
            <div
              key={i}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
            >
              {items[i]}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
