import { Children, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Columns that pack, which is the thing CSS grid will not do.
 *
 * Grid aligns items into rows, so one tall panel sets the height of everything beside it and the
 * short ones leave a hole underneath. CSS multicol packs correctly but rebalances every column
 * whenever any item changes height — panels visibly jump between columns while a section is
 * collapsing. Independent flex columns keep each animation inside its own column.
 *
 * Children are dealt across the columns in order, so reading order still runs left to right
 * along the top. Columns therefore end at different heights, which is what packing looks like.
 */
export function Masonry({
  children,
  /** Narrowest a column is allowed to get before dropping to fewer of them. */
  minColumn = 320,
  gap = 14,
}: {
  children: ReactNode;
  minColumn?: number;
  gap?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // n columns need n*minColumn plus the (n-1) gaps between them.
      const fits = Math.floor((el.clientWidth + gap) / (minColumn + gap));
      setColumns(Math.max(1, fits));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [gap, minColumn]);

  // toArray drops the nulls a conditional panel renders, so a hidden section doesn't hold a slot.
  const items = Children.toArray(children);
  const buckets: ReactNode[][] = Array.from({ length: columns }, () => []);
  items.forEach((child, i) => buckets[i % columns]!.push(child));

  return (
    <div ref={ref} style={{ display: "flex", alignItems: "flex-start", gap }}>
      {buckets.map((bucket, i) => (
        <div
          key={i}
          // minWidth:0 so a panel with wide unbreakable content shrinks instead of stretching
          // its column and pushing the page into horizontal scroll.
          style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap }}
        >
          {bucket}
        </div>
      ))}
    </div>
  );
}
