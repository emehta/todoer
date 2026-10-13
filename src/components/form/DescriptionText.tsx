import { parseDescription } from "@/lib/description-lists";
import { renderDescriptionBlocks } from "./DescriptionField";
import formStyles from "./form.module.css";
import styles from "./DescriptionEditor.module.css";

/**
 * A task's description as the card reads it: its lines, and its bullets and
 * numbers as the lists the editor drew. It used to be the raw text, so a list
 * read as lines with dashes on them.
 */
export default function DescriptionText({ text, empty }: { text: string | null | undefined; empty: string }) {
  const blocks = parseDescription(text);
  if (!blocks.some((block) => block.kind === "list" || block.text.trim())) {
    return <p className={formStyles.plain} style={{ color: "var(--c-text-4)" }}>{empty}</p>;
  }
  return <div className={`${styles.text} ${styles.lists}`}>{renderDescriptionBlocks(blocks)}</div>;
}
