/** design/Dashboard.dc.html `sw()` helper — geometry spec in design doc §1e "NoiseModeSegmented". */
export function Switch({
  checked,
  disabled,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="switch"
      tabIndex={disabled ? -1 : 0}
      aria-checked={checked}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      onClick={() => !disabled && onChange(!checked)}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      style={{
        position: "relative",
        width: 38,
        height: 22,
        flex: "none",
        borderRadius: 11,
        background: checked ? "var(--accent)" : "var(--track)",
        border: `1px solid ${checked ? "var(--accent)" : "var(--line)"}`,
        cursor: disabled ? "not-allowed" : "pointer",
        outline: "none",
        opacity: disabled ? 0.55 : 1,
        transition: "background .16s ease",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: checked ? "var(--knob)" : "var(--fg3)",
          transition: "left .16s cubic-bezier(.32,.72,0,1)",
        }}
      />
    </div>
  );
}
