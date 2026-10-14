/**
 * publik's builder check: with PUBLIK_SELF_TEST set, the built app provisions
 * a publik key for this computer, prints one line ("publik self-test: ok
 * todoer 1.1.0 …") and exits. `PUBLIK_SELF_TEST=1 npm start` (publik's setup
 * guide) runs it.
 */
import { selfTest } from "@/lib/publik";

if (process.env.PUBLIK_SELF_TEST && process.env.NEXT_PHASE !== "phase-production-build") {
  console.log(await selfTest());
  process.exit(0);
}
