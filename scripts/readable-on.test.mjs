/**
 * Cases for the ink chosen on a solid content hue. No framework:
 * `npm test -- readable-on`.
 *
 * What is being defended is a tick you cannot see: white on the Learning
 * habit's yellow was 1.4:1.
 */

import { contrastRatio, luminance, readableOn } from "@/lib/readable-on";
import { CATEGORY_COLORS } from "@/types/habit";

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

// Every habit colour carries its tick at 3:1 or better, the non-text minimum.
for (const [name, hex] of Object.entries(CATEGORY_COLORS)) {
  const ink = readableOn(hex);
  const ratio = contrastRatio(luminance(hex), luminance(ink));
  if (ratio < 3) failures.push(`${name} ${hex}: ${ink} is ${ratio.toFixed(2)}:1`);
  else passed++;
}

// No habit colour is the danger red, or within reach of it.
const reds = ["#df6b62", "#b42318", "#e4786e", "#ef8076", "#EF5350"];
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const dist = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
for (const [name, hex] of Object.entries(CATEGORY_COLORS)) {
  const nearest = Math.min(...reds.map((r) => dist(hex, r)));
  if (nearest < 90) failures.push(`${name} ${hex} is ${nearest.toFixed(0)} from a danger red`);
  else passed++;
}

if (failures.length > 0) {
  console.error(`${failures.length} failed, ${passed} passed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`readable-on: ${passed} passed`);
