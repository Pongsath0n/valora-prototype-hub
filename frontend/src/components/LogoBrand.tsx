import logoIcon from "../../logo/2.png";
import logoWordmark from "../../logo/1.png";

/**
 * LogoBrand — Reusable logo component combining the icon mark + wordmark.
 *
 * Usage:
 *   <LogoBrand />           — icon + wordmark (navbars)
 *   <LogoBrand iconOnly />  — icon only (sidebar, compact spaces)
 *   <LogoBrand size="lg" /> — larger variant (auth pages, hero)
 *   <LogoBrand dark />      — for dark backgrounds
 */
type LogoBrandProps = {
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  dark?: boolean;
};

// Sizing map to balance the layout across different contexts
const sizing = {
  sm: { icon: 42, layoutH: 42, gap: 12 },
  md: { icon: 64, layoutH: 64, gap: 16 },
  lg: { icon: 96, layoutH: 96, gap: 20 },
};

export default function LogoBrand({
  iconOnly = false,
  size = "md",
  className = "",
  dark = false,
}: LogoBrandProps) {
  const config = sizing[size];

  return (
    <div className={`flex items-center ${className}`} style={{ gap: config.gap }}>
      {/* Icon Container - No more complex scaling needed for new assets */}
      <img
        src={logoIcon}
        alt="Valora icon"
        style={{ 
          height: config.layoutH, 
          width: config.layoutH,
          mixBlendMode: dark ? "screen" : "multiply"
        }}
        className={`object-contain flex-shrink-0 transition-all ${
          dark ? "invert brightness-[1.8] contrast-[1.1]" : ""
        }`}
      />

      {!iconOnly && (
        <img
          src={logoWordmark}
          alt="Valora"
          style={{ 
            height: Math.round(config.layoutH * 0.75), // Proportional height for text
            mixBlendMode: dark ? "screen" : "multiply"
          }}
          className={`object-contain transition-all ${
            dark ? "invert brightness-[1.8] contrast-[1.1]" : ""
          }`}
        />
      )}
    </div>
  );
}
