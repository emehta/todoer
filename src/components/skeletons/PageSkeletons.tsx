"use client";

import { PageTitleSlot } from "@/components/PageTitle";
import Skeleton, { SkeletonScreen } from "@/components/Skeleton";
import { DOCK_ROOM, HEADER_ROOM, LIST_COLUMN_WIDTH, UNDER_DOCK_MARGIN } from "@/lib/styles";
import { usePhone } from "@/lib/use-viewport-width";

/**
 * The loading shape of each signed-in page.
 *
 * These replaced a centred spinner and the words "Loading tasks…". The point
 * is not decoration: each one is laid out to the same geometry as the page it
 * stands in for, so when the data lands nothing moves. A skeleton that does
 * not match its page is worse than a spinner, because it promises a layout and
 * then breaks it.
 */

const CARD: React.CSSProperties = {
  background: "var(--dashboard-card-bg)",
  border: "1px solid var(--dashboard-card-border)",
  borderRadius: "var(--ui-radius-lg)",
  padding: 18,
};

function Row({ gap = 8, style, children }: { gap?: number; style?: React.CSSProperties; children: React.ReactNode }) {
  return <div style={{ display: "flex", alignItems: "center", gap, ...style }}>{children}</div>;
}

/* ─── Home ─── */

/*
 * Home's Cockpit: the search row, four tiles (one on a phone), the day's
 * bar, three columns of cards and the week ahead, at the page's own sizes
 * (16px inside each card, 12px between them), so nothing moves when the
 * data lands.
 */
export function DashboardSkeleton() {
  const phone = usePhone();
  const card: React.CSSProperties = { ...CARD, padding: 16 };
  const head = (width: number) => (
    <Row style={{ justifyContent: "space-between", marginBottom: 12 }}>
      <Skeleton width={width} height={11} />
    </Row>
  );
  const rows = (count: number, height: number) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} height={height} />)}
    </div>
  );

  return (
    <SkeletonScreen label="Loading dashboard…">
      {/* No ticker strip: the real ribbon is mounted above this skeleton and
          draws its own placeholder chips. */}

      {/* The search row: the field across, the date and clock on the right. */}
      <div
        style={{
          display: "flex",
          flexDirection: phone ? "column" : "row-reverse",
          alignItems: phone ? "stretch" : "center",
          justifyContent: "space-between",
          gap: phone ? 10 : 24,
        }}
      >
        <Skeleton width={phone ? 150 : 300} height={phone ? 18 : 20} />
        <Skeleton height={44} style={{ flex: phone ? undefined : 1 }} />
      </div>
      <div style={{ height: 1, background: "var(--c-border)", margin: phone ? "18px 0" : "26px 0" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: phone ? 10 : 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: phone ? "minmax(0, 1fr)" : "repeat(4, minmax(0, 1fr))", gap: 12 }}>
          {(phone ? [0] : [0, 1, 2, 3]).map((i) => (
            <div key={i} style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <Skeleton width={92} height={14} />
              <Skeleton width={i === 0 ? "70%" : 64} height={30} />
              <Skeleton width="56%" height={12} />
            </div>
          ))}
        </div>

        <div style={card}>
          <Skeleton height={phone ? 56 : 90} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: phone ? "minmax(0, 1fr)" : "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          <div style={card}>{head(48)}{rows(6, 40)}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={card}>{head(84)}{rows(3, 32)}</div>
            <div style={card}>{head(32)}{rows(2, 32)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={card}>{head(80)}{rows(3, 28)}</div>
            <div style={card}>{head(56)}{rows(2, 32)}</div>
          </div>
        </div>

        {/* The week ahead across, or one day a row on a phone. */}
        <div style={card}>
          {head(84)}
          {phone ? rows(7, 28) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 12 }}>
              {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} height={72} />)}
            </div>
          )}
        </div>
      </div>
    </SkeletonScreen>
  );
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

/* ─── Habits ─── */

export function HabitsSkeleton() {
  const phone = usePhone();

  return (
    <SkeletonScreen label="Loading habits…" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Life view stats strip */}
      <div style={{ ...CARD }}>
        <Skeleton width={96} height={14} style={{ marginBottom: 14 }} />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(${phone ? 130 : 150}px, 100%), 1fr))`, gap: 12 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Skeleton width={64} height={26} />
              <Skeleton width="80%" height={11} />
            </div>
          ))}
        </div>
      </div>

      {/* Overview chart */}
      <div style={{ ...CARD }}>
        <Row style={{ justifyContent: "space-between", marginBottom: 14 }}>
          <Skeleton width={140} height={14} />
          <Skeleton width={170} height={12} />
        </Row>
        <Skeleton height={180} />
      </div>

      {/* Category chips */}
      <Row gap={8} style={{ flexWrap: "wrap" }}>
        {[44, 92, 88, 88, 74, 96, 90, 80].map((w, i) => (
          <Skeleton key={i} width={w} height={30} radius="var(--ui-radius-round)" />
        ))}
      </Row>

      {/* Habit grid */}
      <div style={{ ...CARD }}>
        <Skeleton width={120} height={14} style={{ marginBottom: 14 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Row key={i} gap={12}>
              <Skeleton width={phone ? 110 : 180} height={18} />
              <Skeleton height={18} style={{ flex: 1 }} />
            </Row>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}

/* ─── Finance ─── */

export function FinanceSkeleton() {
  const phone = usePhone();

  return (
    <SkeletonScreen label="Loading banking…" style={{ display: "flex", flexDirection: "column" }}>
      {/* Title, Insights, Add transactions. The arrow back is real, not a
          bar: it works while the page loads, as it did above the title. */}
      <Row style={{ gap: 16, minHeight: 32, marginBottom: 20 }}>
        <PageTitleSlot titleClassName="text-2xl font-bold" style={{ alignItems: "center" }}>
          <Skeleton width={110} height={28} />
        </PageTitleSlot>
        <div style={{ flex: 1 }} />
        <Skeleton width={84} height={28} radius="var(--ui-radius-item)" />
        <Skeleton width={136} height={30} radius="var(--ui-radius-md)" />
      </Row>

      {/* The filter line: one long field, and the date picker beside it */}
      <Row gap={10} style={{ minHeight: 32, marginBottom: 16 }}>
        <Skeleton height={38} radius="var(--ui-radius-md)" style={{ flex: 1 }} />
        <Skeleton width={97} height={32} radius="var(--ui-radius-md)" />
      </Row>

      {/* Summary tiles — full width, as on the page */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(${phone ? 150 : 160}px, 100%), 1fr))`, gap: 12, marginBottom: 24 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ ...CARD, minHeight: 100, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <Skeleton width="58%" height={11} />
            <Skeleton width="72%" height={26} />
            <Skeleton width="44%" height={11} />
          </div>
        ))}
      </div>

      {/* Transactions, in the same centred reading column the list uses */}
      <div style={{ maxWidth: LIST_COLUMN_WIDTH, width: "100%", margin: "0 auto" }}>
        <Row gap={12} style={{ marginBottom: 12 }}>
          <Skeleton width={104} height={16} />
          <Skeleton width={30} height={16} radius="var(--ui-radius-round)" />
        </Row>

        {/* One line of chips that scrolls — not a wrapped block. */}
        <Row gap={8} style={{ marginBottom: 12, overflow: "hidden" }}>
          {[44, 112, 104, 96, 88, 76, 92].map((w, i) => (
            <Skeleton key={i} width={w} height={29} radius="var(--ui-radius-md)" style={{ flexShrink: 0 }} />
          ))}
        </Row>

        {/* No card: the real list is rows on the page, running past the fold. */}
        <div>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--c-border-sub)" }}>
            <Skeleton height={12} />
          </div>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <div key={i} style={{ padding: "10px 12px" }}>
              <Skeleton height={20} />
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}

/* ─── Finance · Income ─── */

export function IncomeSkeleton() {
  const phone = usePhone();

  return (
    <SkeletonScreen label="Loading income…" style={{ display: "flex", flexDirection: "column" }}>
      {/* Title, with the working arrow back beside it */}
      <Row style={{ gap: 16, minHeight: 32, marginBottom: 20 }}>
        <PageTitleSlot titleClassName="text-2xl font-bold" style={{ alignItems: "center" }}>
          <Skeleton width={96} height={28} />
        </PageTitleSlot>
      </Row>

      {/* The four figures */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(${phone ? 150 : 160}px, 100%), 1fr))`, gap: 12, marginBottom: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ ...CARD, minHeight: 100, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <Skeleton width="52%" height={11} />
            <Skeleton width="70%" height={26} />
            <Skeleton width="48%" height={11} />
          </div>
        ))}
      </div>

      {/* The section chips: one line */}
      <Row gap={8} style={{ marginBottom: 16, overflow: "hidden" }}>
        {[44, 72, 132, 40, 128, 72].map((w, i) => (
          <Skeleton key={i} width={w} height={29} radius="var(--ui-radius-md)" style={{ flexShrink: 0 }} />
        ))}
      </Row>

      {/* Pay: the month, split between the bank and CPF, and its two columns of lines */}
      <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12 }}>
        <Skeleton width={120} height={11} />
        <Skeleton width="100%" height={8} radius="var(--ui-radius-round)" />
        <Skeleton width={220} height={11} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", columnGap: 32, rowGap: 12, marginTop: 4 }}>
          {[0, 1].map((column) => (
            <div key={column} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[0, 1, 2, 3, 4].map((line) => (
                <Row key={line} style={{ justifyContent: "space-between" }}>
                  <Skeleton width={`${34 + ((line * 7) % 20)}%`} height={13} />
                  <Skeleton width={72} height={13} />
                </Row>
              ))}
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
