"use client";

import Skeleton, { SkeletonScreen } from "@/components/Skeleton";
import { searchFieldHeight } from "@/components/SearchField";
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

/* The page's full-width rule, between the filters, the goals and the days. */
function Rule({ phone }: { phone: boolean }) {
  return <div style={{ width: "100%", height: 1, background: "var(--c-border)", margin: `${phone ? 18 : 12}px 0` }} />;
}

/* ─── Tasks ─── */

export function TasksSkeleton({ phone, columnWidth }: { phone: boolean; columnWidth: number }) {
  const field = searchFieldHeight(phone);
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
          /* The page's scroller keeps its scrollbar's room; so does this. */
          scrollbarGutter: "stable",
          padding: phone
            ? `calc(16px + ${HEADER_ROOM}) 16px calc(24px + ${DOCK_ROOM})`
            : `calc(24px + ${HEADER_ROOM}) 32px calc(24px + ${DOCK_ROOM})`,
        }}
      >
        <div style={{ maxWidth: columnWidth, margin: "0 auto" }}>
          {/* The heading, then Ramble, Add task and Insights at the right. */}
          <Row gap={16} style={{ marginBottom: phone ? 20 : 12 }}>
            <Skeleton width={74} height={32} />
            <Skeleton width={36} height={32} style={{ marginLeft: "auto" }} />
            <Skeleton width={92} height={32} radius="var(--ui-radius-item)" style={{ marginLeft: -8 }} />
            <Skeleton width={88} height={32} radius="var(--ui-radius-item)" style={{ marginLeft: -8 }} />
          </Row>

          {/* Search, and the three filters beside it, or under it on a phone. */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Skeleton width="auto" height={field} style={{ flex: "1 1 200px" }} />
            <div style={{ display: "flex", gap: 8, flex: phone ? "1 1 100%" : "0 0 auto" }}>
              {[96, 104, 118].map((w) => (
                <Skeleton key={w} width={phone ? "auto" : w} height={field} style={phone ? { flex: "1 0 0" } : undefined} />
              ))}
            </div>
          </div>

          <Rule phone={phone} />

          {/* The goals, and + at the end. */}
          <Row gap={6} style={{ marginBottom: 4 }}>
            {[44, 96, 84, 108].map((w) => <Skeleton key={w} width={w} height={32} />)}
            <Skeleton width={32} height={32} style={{ marginLeft: "auto" }} />
          </Row>

          <Rule phone={phone} />

          {/* Days: a heading with Copy at its end, and its tasks. */}
          {[0, 1].map((group) => (
            <div key={group} style={{ marginBottom: 24 }}>
              <Row gap={12} style={{ marginBottom: phone ? 14 : 10 }}>
                <Skeleton width={210} height={23} />
                <Skeleton width={84} height={28} style={{ marginLeft: "auto" }} />
              </Row>
              <div style={{ display: "flex", flexDirection: "column", gap: phone ? 8 : 6 }}>
                {[0, 1, 2].map((i) => <Skeleton key={i} height={56} radius="var(--ui-radius-item)" />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
