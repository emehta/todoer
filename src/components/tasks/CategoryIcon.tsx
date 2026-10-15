import { Tag } from "@phosphor-icons/react";
import { contentColor } from "@/lib/content-palette";

/**
 * A category, drawn the one way it is drawn everywhere on Tasks: the duotone
 * Tag in the category's colour, the mark on the category tabs.
 *
 * One mark throughout (the owner's ask, 29 Sep 2026), so the same category
 * is never two different marks a few pixels apart. Duotone, for the reason
 * the tabs give: the outline carries the colour and the body a wash of it,
 * so it reads at 12px without turning into a solid block.
 *
 * Decorative: every use sits next to the category's name.
 */
export default function CategoryIcon({ color, size = 13 }: { color: string; size?: number }) {
  return <Tag size={size} weight="duotone" aria-hidden="true" style={{ color: contentColor(color), flexShrink: 0, display: "block" }} />;
}
