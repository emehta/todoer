import { Tag } from "@phosphor-icons/react";
import { contentColor } from "@/lib/content-palette";

/**
 * A category, drawn the one way it is drawn everywhere on Tasks: the duotone
 * Tag in the category's colour, the mark on the category tabs.
 *
 * The tabs had the tag and everything else had a coloured dot (the task row,
 * the category header, the task dialog's pill and chip, the goal picker), so
 * the same category was two different marks a few pixels apart. The owner
 * asked for the tag throughout on 29 Sep 2026. Duotone, for the reason the
 * tabs give: the outline carries the colour and the body a wash of it, so it
 * reads at 12px without turning into a solid block.
 *
 * Decorative: every use sits next to the category's name.
 */
export default function CategoryIcon({ color, size = 13 }: { color: string; size?: number }) {
  return <Tag size={size} weight="duotone" aria-hidden="true" style={{ color: contentColor(color), flexShrink: 0, display: "block" }} />;
}
