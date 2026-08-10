import type { ReactElement } from "react";

/**
 * Line-art illustration of the connected device, picked from its model name.
 *
 * Drawn as inline SVG rather than shipped bitmaps: it stays crisp at any size, inherits the
 * design's stroke weight and theme colours, and adds no binary assets. The stroke language
 * (1.5px, rounded caps, --fg3) matches the design system's technical feel.
 */

export type DeviceFamily = "overear" | "earbuds" | "neckband" | "speaker" | "unknown";

/**
 * Sony's model prefixes map cleanly onto product families:
 *   WH- over-ear · WF- true-wireless buds · WI- neckband · MDR- (legacy) over-ear
 *   LinkBuds are WF-L… · INZONE/ULT WEAR are over-ear · SRS-/HT- are speakers
 */
export function deviceFamily(model: string | null | undefined): DeviceFamily {
  if (!model) return "unknown";
  const m = model.toUpperCase().replace(/\s+/g, "");
  if (/^(WF-|LINKBUDS)/.test(m)) return "earbuds";
  if (/^WI-/.test(m)) return "neckband";
  if (/^(SRS-|HT-)/.test(m)) return "speaker";
  if (/^(WH-|MDR-|INZONE)/.test(m) || m.includes("ULTWEAR")) return "overear";
  return "unknown";
}

function OverEar() {
  return (
    <>
      {/* headband */}
      <path d="M11 27v-6a13 9 0 0 1 26 0v6" />
      {/* ear cups */}
      <rect x="6" y="25" width="10" height="16" rx="4.5" />
      <rect x="32" y="25" width="10" height="16" rx="4.5" />
    </>
  );
}

function Earbuds() {
  return (
    <>
      {/* left bud: driver housing + stem */}
      <circle cx="16" cy="19" r="7" />
      <path d="M13.5 25.5 14.5 34a2.5 2.5 0 0 0 5 0l-.6-6" />
      {/* right bud */}
      <circle cx="33" cy="19" r="7" />
      <path d="M30.5 25.5 31.5 34a2.5 2.5 0 0 0 5 0l-.6-6" />
    </>
  );
}

function Neckband() {
  return (
    <>
      {/* neckband collar */}
      <path d="M13 14v12a11 11 0 0 0 22 0V14" />
      {/* earpieces on their cables */}
      <path d="M13 14v-3M35 14v-3" />
      <circle cx="13" cy="8" r="3.5" />
      <circle cx="35" cy="8" r="3.5" />
    </>
  );
}

function Speaker() {
  return (
    <>
      <rect x="12" y="7" width="24" height="34" rx="6" />
      <circle cx="24" cy="18" r="5" />
      <circle cx="24" cy="31" r="3" />
    </>
  );
}

function Unknown() {
  // Same silhouette as over-ear but without cups — reads as "some headphone, model unknown".
  return (
    <>
      <path d="M11 29v-8a13 9 0 0 1 26 0v8" />
      <path d="M11 29a4 4 0 0 0 8 0M29 29a4 4 0 0 0 8 0" />
    </>
  );
}

const ART: Record<DeviceFamily, () => ReactElement> = {
  overear: OverEar,
  earbuds: Earbuds,
  neckband: Neckband,
  speaker: Speaker,
  unknown: Unknown,
};

export function DeviceArt({
  model,
  size = 52,
  color = "var(--fg2)",
}: {
  model: string | null | undefined;
  size?: number;
  color?: string;
}) {
  const family = deviceFamily(model);
  const Art = ART[family];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={model ? `${model} illustration` : "Headphones illustration"}
    >
      <Art />
    </svg>
  );
}
