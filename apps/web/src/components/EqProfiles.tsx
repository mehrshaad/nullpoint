import { useState } from "react";
import type { EqBands } from "@ssc/core";
import type { EqProfile } from "../state/useSettings.js";

/**
 * Named equalizer curves, stored by the app rather than the headphones.
 *
 * The headset keeps a handful of slots and discards a custom curve the moment a named preset is
 * chosen, so anything you want to keep has to live here. There is no limit on how many.
 *
 * A curve captured on one band layout can't be applied to another — six Clear Bass bands and ten
 * graphic bands describe different frequencies — so profiles from a different layout are listed
 * but not applicable, rather than silently mangled.
 */
export function EqProfiles({
  profiles,
  current,
  onApply,
  onSave,
  onDelete,
}: {
  profiles: EqProfile[];
  /** Null when the headphones haven't reported a curve yet. */
  current: EqBands | null | undefined;
  onApply: (profile: EqProfile) => void;
  onSave: (name: string, bands: EqBands) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed || !current) return;
    onSave(trimmed, current);
    setName("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 2 }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", color: "var(--fg3)" }}>
        SAVED CURVES
      </div>

      {profiles.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {profiles.map((profile) => {
            const usable = !current || profile.layout === current.layout;
            return (
              <div
                key={profile.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  border: "1px solid var(--line)",
                  borderRadius: 7,
                  background: "var(--panel2)",
                  opacity: usable ? 1 : 0.45,
                }}
              >
                <button
                  onClick={() => usable && onApply(profile)}
                  disabled={!usable}
                  title={usable ? `Apply ${profile.name}` : "Saved on a different band layout"}
                  style={{
                    fontWeight: 500,
                    fontSize: 12,
                    color: "var(--fg2)",
                    background: "none",
                    border: "none",
                    padding: "7px 4px 7px 10px",
                    cursor: usable ? "pointer" : "default",
                    maxWidth: 180,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {profile.name}
                </button>
                <button
                  onClick={() => onDelete(profile.id)}
                  aria-label={`Delete ${profile.name}`}
                  title={`Delete ${profile.name}`}
                  style={{
                    fontSize: 14,
                    lineHeight: 1,
                    color: "var(--fg3)",
                    background: "none",
                    border: "none",
                    padding: "7px 9px 7px 4px",
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Name this curve"
          aria-label="Name this curve"
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: "inherit",
            fontSize: 12.5,
            color: "var(--fg)",
            background: "var(--panel2)",
            border: "1px solid var(--line)",
            borderRadius: 7,
            padding: "8px 10px",
            outline: "none",
          }}
        />
        <button
          onClick={save}
          disabled={!name.trim() || !current}
          title={current ? "Save the current curve" : "No curve to save yet"}
          className="mono"
          style={{
            flex: "none",
            fontWeight: 600,
            fontSize: 10.5,
            letterSpacing: "0.08em",
            color: name.trim() && current ? "var(--accent)" : "var(--fg3)",
            background: "none",
            border: `1px solid ${name.trim() && current ? "var(--accent)" : "var(--line)"}`,
            borderRadius: 7,
            padding: "8px 12px",
            cursor: name.trim() && current ? "pointer" : "default",
          }}
        >
          SAVE
        </button>
      </div>
    </div>
  );
}
