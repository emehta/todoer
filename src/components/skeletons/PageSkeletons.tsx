"use client";

import Skeleton, { SkeletonScreen } from "@/components/Skeleton";
import { DOCK_ROOM, HEADER_ROOM, UNDER_DOCK_MARGIN } from "@/lib/styles";

/**
 * The loading shape of the tasks page, in place of a spinner. The point is
 * not decoration: it is laid out to the same geometry as the page it stands
 * in for, so when the data lands nothing moves. A skeleton that does not
 * match its page is worse than a spinner, because it promises a layout and
 * then breaks it.
 */

function Row({ gap = 8, style, children }: { gap?: number; style?: React.CSSProperties; children: React.ReactNode }) {
  return <div style={{ display: "flex", alignItems: "center", gap, ...style }}>{children}</div>;
}

/* ─── Tasks ─── */

export function TasksSkeleton({ phone, columnWidth }: { phone: boolean; columnWidth: number }) {
  return (
    <SkeletonScreen
      label="Loading tasks…"
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        // Matches the page's own bleed and gutters, so the column does not
        // shift sideways when the real list arrives.
        margin: phone
          ? `calc(-16px - ${HEADER_ROOM}) -16px ${UNDER_DOCK_MARGIN}`
          : `calc(-24px - ${HEADER_ROOM}) -32px ${UNDER_DOCK_MARGIN}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          padding: phone
            ? `calc(16px + ${HEADER_ROOM}) 16px calc(24px + ${DOCK_ROOM})`
            : `calc(24px + ${HEADER_ROOM}) 32px calc(24px + ${DOCK_ROOM})`,
        }}
      >
        <div style={{ maxWidth: columnWidth, margin: "0 auto" }}>
          <Row gap={16} style={{ flexWrap: "wrap", marginBottom: 16 }}>
            <Skeleton width={78} height={28} />
            <Skeleton width={84} height={28} radius="var(--ui-radius-md)" />
            <Skeleton width={72} height={28} radius="var(--ui-radius-md)" />
            <Skeleton width={84} height={28} radius="var(--ui-radius-md)" />
            <Skeleton width={84} height={28} radius="var(--ui-radius-md)" style={{ marginLeft: "auto" }} />
          </Row>

          <div style={{ width: "85%", height: 1, background: "var(--c-border)", margin: "12px 0" }} />

          <Row gap={8} style={{ flexWrap: "wrap", marginBottom: 12 }}>
            {[44, 96, 104, 72].map((w, i) => <Skeleton key={i} width={w} height={26} radius="var(--ui-radius-round)" />)}
          </Row>

          <div style={{ width: "85%", height: 1, background: "var(--c-border)", margin: "12px 0" }} />

          <Row gap={8} style={{ marginBottom: 12 }}>
            <Skeleton width={56} height={12} />
            <Skeleton width={104} height={30} />
            <Skeleton width={124} height={30} />
          </Row>

          <div style={{ width: "85%", height: 1, background: "var(--c-border)", margin: "12px 0" }} />

          {[0, 1].map((group) => (
            <div key={group} style={{ marginBottom: 18 }}>
              <Skeleton width={210} height={13} style={{ marginBottom: 10 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[0, 1, 2].map((i) => <Skeleton key={i} height={54} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
