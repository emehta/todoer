"use client";

import { createContext, useContext } from "react";
import type { CSSProperties, ReactNode } from "react";
import BackButton from "@/components/BackButton";
import { usePhone } from "@/lib/use-viewport-width";

/**
 * A page's heading, with the way back to its hub on the same line.
 *
 * The Back button used to be a boxed row of its own above every title, 50px
 * of height spent on one arrow. It is now the arrow beside the title, so the
 * page starts where the title does.
 *
 * Where it goes comes from a `PageBackProvider` the hub wraps around a view
 * (Tools, Finance), so a workspace that draws its own title row, with its own
 * buttons in it, only swaps its <h1> for this. A page that is its own route
 * (Brand Analytics, the Reflect screens) passes `back` instead.
 */

export interface PageBack {
  /** Where the arrow goes, as its label names it: "Tools", "Finance". */
  label: string;
  onBack: () => void;
}

const PageBackContext = createContext<PageBack | null>(null);

export function PageBackProvider({ back, children }: { back: PageBack; children: ReactNode }) {
  return <PageBackContext.Provider value={back}>{children}</PageBackContext.Provider>;
}

/**
 * The title line around any title, the real heading or a skeleton's bar, so
 * the arrow is on screen and working while the page under it loads, as the
 * old Back button was.
 *
 * The arrow sits in a box one title line tall (`1lh` in the title's own
 * type), so it is centred on the first line whatever the title's size, and
 * stays there when a long title wraps on a phone. Pulled left by the arrow's
 * own inset, so the glyph, not its hover box, lines up with the content
 * below.
 */
export function PageTitleSlot({
  back,
  titleClassName,
  titleStyle,
  style,
  children,
}: {
  back?: PageBack | null;
  titleClassName?: string;
  titleStyle?: CSSProperties;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const fromHub = useContext(PageBackContext);
  const phone = usePhone();
  const way = back ?? fromHub;
  if (!way) return <>{children}</>;
  /* The 20px arrow is inset 6px in its 32px box, 10px in the phone's 40px
     one; either way it ends 14px from the title. */
  const inset = phone ? 10 : 6;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14 - inset, minWidth: 0, marginLeft: -inset, ...style }}>
      <span
        className={titleClassName}
        style={{
          fontSize: titleStyle?.fontSize,
          lineHeight: titleStyle?.lineHeight,
          height: "1lh",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <BackButton label={way.label} onBack={way.onBack} />
      </span>
      {children}
    </div>
  );
}

/**
 * The <h1>, `text-2xl font-bold` as every page heading is, or `titleStyle`
 * for the tools whose titles are drawn larger. `style` lands on the outer
 * element, whichever that is, so a title row's flex rules still apply.
 */
export default function PageTitle({
  back,
  titleStyle,
  style,
  children,
}: {
  back?: PageBack | null;
  titleStyle?: CSSProperties;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const fromHub = useContext(PageBackContext);
  const way = back ?? fromHub;
  const className = titleStyle ? undefined : "text-2xl font-bold";
  const heading = (extra?: CSSProperties) => (
    <h1 className={className} style={{ color: "var(--c-text-1)", minWidth: 0, ...titleStyle, ...extra }}>
      {children}
    </h1>
  );
  if (!way) return heading(style);
  return (
    <PageTitleSlot back={way} titleClassName={className} titleStyle={titleStyle} style={style}>
      {heading()}
    </PageTitleSlot>
  );
}
