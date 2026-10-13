import { ImageResponse } from "next/og";

/**
 * Todoer's mark: a task's own circle with its tick, in the app's accent on
 * Midnight's page colour. Drawn at build in the two sizes a browser asks of
 * an installed app (the manifest names both), and used for the tab too.
 */

export const contentType = "image/png";

const SIZES = { small: 192, large: 512 } as const;

export function generateImageMetadata() {
  return Object.entries(SIZES).map(([id, px]) => ({ id, size: { width: px, height: px }, contentType }));
}

export default async function Icon({ id }: { id: Promise<string> | string }) {
  const key = (await id) as keyof typeof SIZES;
  const px = SIZES[key] ?? SIZES.large;
  const ring = Math.round(px * 0.56);
  const stroke = Math.max(4, Math.round(px * 0.06));
  return new ImageResponse(
    (
      <div style={{ width: px, height: px, display: "flex", alignItems: "center", justifyContent: "center", background: "#1c1c1c", borderRadius: Math.round(px * 0.22) }}>
        <div
          style={{
            width: ring,
            height: ring,
            borderRadius: ring,
            background: "#2fa97f",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width={ring * 0.6} height={ring * 0.6} viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#ffffff" strokeWidth={(stroke / ring) * 24 * 1.6} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    ),
    { width: px, height: px },
  );
}
