import type { CSSProperties } from "react";

/**
 * A shimmering placeholder block.
 *
 * Pages that have to wait on a query draw their own shape out of these rather
 * than showing a spinner and the word "Loading": the silhouette of what is
 * coming says more, and the page does not jump when the data lands.
 */
export default function Skeleton({
  width = "100%",
  height = 16,
  radius = "var(--ui-radius-md)",
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className="vitae-skeleton"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

/**
 * Wrapper for a whole screen of placeholders.
 *
 * The blocks themselves are aria-hidden, so something has to tell a screen
 * reader that the page is still loading — that is this, and it is why the
 * label survived the move away from spinners.
 */
export function SkeletonScreen({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div role="status" aria-live="polite" aria-label={label} style={style}>
      {children}
    </div>
  );
}
