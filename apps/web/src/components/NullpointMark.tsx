/**
 * The app mark: the zero from the icon, on its own.
 *
 * Same geometry as scripts/make-icons.cjs draws — a stadium with a stadium counter, filled
 * even-odd so the hole is real transparency and the mark sits on any background. Kept in sync by
 * hand rather than shared, because the icon generator runs in Electron with no bundler.
 *
 * Takes its colour from `currentColor` so it follows the theme and the user's accent choice.
 */
export function NullpointMark({ size = 15, className }: { size?: number; className?: string }) {
  const W = 180;
  const H = 328;
  const inset = W * 0.375;
  const cw = W - inset * 2;
  const ch = H * 0.6;

  const rounded = (x: number, y: number, w: number, h: number) => {
    const r = Math.min(w, h) / 2;
    return `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;
  };

  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      height={size}
      width={(size * W) / H}
      fill="none"
      aria-hidden="true"
      style={{ flex: "none", display: "block" }}
    >
      <path
        d={`${rounded(0, 0, W, H)} ${rounded(inset, (H - ch) / 2, cw, ch)}`}
        fillRule="evenodd"
        fill="currentColor"
      />
    </svg>
  );
}
