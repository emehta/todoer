/**
 * Cases for the ink chosen on a solid content hue. No framework:
 * `npm test -- readable-on`.
 *
 * What is being defended is a mark you cannot see: white on the yellow goal
 * colour is 1.9:1.
 */

import { contrastRatio, luminance, readableOn } from "@/lib/readable-on";
import { GOAL_COLORS } from "@/types/category";

const failures = [];
let passed = 0;
function check(name, actual, expected) {
  if (actual === expected) { passed++; return; }
  failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

check("dark ink on yellow", readableOn("#FDD835"), "#141414");
check("dark ink on cyan", readableOn("#26C6DA"), "#141414");
check("white on a deep blue", readableOn("#3F51B5"), "#ffffff");
check("white on near-black", readableOn("#111111"), "#ffffff");
check("dark on white", readableOn("#ffffff"), "#141414");
check("three-digit hex", readableOn("#ff0"), "#141414");
check("an unreadable colour falls back to white", readableOn("var(--x)"), "#ffffff");
check("luminance of white", luminance("#ffffff"), 1);
check("luminance of junk", luminance("nope"), null);

// Every goal colour carries its ink at 3:1 or better, the non-text minimum.
for (const { label, value } of GOAL_COLORS) {
  const ink = readableOn(value);
  const ratio = contrastRatio(luminance(value), luminance(ink));
  if (ratio < 3) failures.push(`${label} ${value}: ${ink} is ${ratio.toFixed(2)}:1`);
  else passed++;
}

if (failures.length > 0) {
  console.error(`${failures.length} failed, ${passed} passed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`readable-on: ${passed} passed`);
