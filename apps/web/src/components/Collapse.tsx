import type { ReactNode } from "react";

/**
 * Reveals its children by animating height, so a section appearing doesn't make the panel jump.
 *
 * Height cannot be transitioned to `auto` in CSS, so this uses the grid trick: a single row
 * sized `0fr` collapsed and `1fr` open. The row size is animatable, the child measures itself,
 * and nothing needs to know the content's height in advance — which matters here because these
 * sections hold segmented controls whose height depends on how the labels wrap.
 *
 * `visibility` follows the transition so collapsed content is neither focusable nor read aloud.
 */
export function Collapse({
  open,
  parentGap = 0,
  children,
}: {
  open: boolean;
  /**
   * The flex `gap` of the surrounding stack. A collapsed element is zero-height but still sits
   * between two siblings, so it keeps claiming one gap — which shows up as a mysterious blank
   * strip. Cancelling exactly one gap closes it, and animating the margin keeps that smooth.
   */
  parentGap?: number;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        visibility: open ? "visible" : "hidden",
        marginTop: open ? 0 : -parentGap,
        transition:
          "grid-template-rows .26s cubic-bezier(.4, 0, .2, 1), margin-top .26s cubic-bezier(.4, 0, .2, 1), opacity .2s ease, visibility .26s",
      }}
      aria-hidden={!open}
    >
      <div style={{ minHeight: 0, overflow: "hidden" }}>{children}</div>
    </div>
  );
}
