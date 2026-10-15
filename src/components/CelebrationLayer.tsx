"use client";

import { useEffect, useRef } from "react";
import { onCelebrate, type CelebrationOrigin } from "@/lib/celebrate";

/**
 * The confetti half of a celebration. Mounted once by the app shell.
 *
 * Three things the previous version got wrong, all of which are why this one
 * is shaped the way it is:
 *
 * 1. It mounted a fresh component and a fresh canvas per burst, keyed off
 *    `showConfetti` state held by the tasks page. Finishing two tasks quickly
 *    tore the canvas down mid-flight and the first burst vanished. Here the
 *    canvas is mounted for the life of the shell and a burst only appends to
 *    the particle array, so overlapping celebrations layer instead of
 *    cancelling.
 * 2. Physics advanced by one unit per frame, so it fell twice as fast on a
 *    120Hz screen. Everything below is scaled by a delta normalised to 60fps.
 * 3. `onDone` sat in the effect's dependency array while being redefined every
 *    render, which re-ran the effect and restarted the animation.
 *
 * The canvas sits above the nav (z-index 40) and below modals (50): confetti
 * over a dialog would obscure the thing you opened.
 */

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  /** Rotation about the axis facing you. */
  tilt: number;
  tiltRate: number;
  /** Rotation about the vertical axis, faked by squashing the width. */
  spin: number;
  spinRate: number;
  /** Phase offset so pieces do not flutter in unison. */
  drift: number;
  life: number;
  maxLife: number;
}

const GRAVITY = 0.20;
const DRAG = 0.987;
const FADE_FROM = 0.72; // fraction of life at which a piece starts fading

/* Festive colours are not a themed surface, but two of the five are pulled
   from the active theme so the burst still belongs to the palette it lands
   on: the Nature theme's moss green reads very differently from Midnight's
   mint, and confetti that ignored both looked stuck on. */
const FIXED_COLORS = ["#FFC83D", "#FF6B8A", "#4FC3F7"];

function paletteFor(root: HTMLElement): string[] {
  const styles = getComputedStyle(root);
  const themed = ["--c-accent", "--c-success"]
    .map((name) => styles.getPropertyValue(name).trim())
    .filter(Boolean);
  return themed.length ? [...themed, ...FIXED_COLORS] : FIXED_COLORS;
}

function spawn(origin: CelebrationOrigin, colors: string[]): Piece[] {
  const count = 88;
  return Array.from({ length: count }, () => {
    // A cone aimed upward: full width, but biased away from straight down so
    // the burst reads as thrown rather than dropped.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
    const speed = 4 + Math.random() * 7.5;
    const w = 5 + Math.random() * 5;
    return {
      x: origin.x + (Math.random() - 0.5) * 14,
      y: origin.y + (Math.random() - 0.5) * 14,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w,
      h: w * (0.4 + Math.random() * 0.35),
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * Math.PI * 2,
      tiltRate: (Math.random() - 0.5) * 0.24,
      spin: Math.random() * Math.PI * 2,
      spinRate: 0.12 + Math.random() * 0.2,
      drift: Math.random() * Math.PI * 2,
      life: 0,
      maxLife: 74 + Math.random() * 46,
    };
  });
}

export default function CelebrationLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const piecesRef = useRef<Piece[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Captured once. The ref holds the array across renders; it is only ever
    // mutated in place, never reassigned, so this binding stays correct for
    // the life of the effect, including in the cleanup.
    const pieces = piecesRef.current;
    let disposed = false;

    /* Backing store in device pixels, drawing in CSS pixels. Without this a
       5px ribbon is genuinely 5 physical pixels on a 2x display and the edges
       crawl as it rotates. */
    let sized = false;
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.floor(window.innerWidth * dpr);
      canvas!.height = Math.floor(window.innerHeight * dpr);
      canvas!.style.width = `${window.innerWidth}px`;
      canvas!.style.height = `${window.innerHeight}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      sized = true;
    }
    /*
     * Only while pieces fly. A screen-sized backing store at 2x is 20 to 33
     * MB, too much for every signed-in tab to hold between celebrations,
     * which come a few times a day; with none it is let go.
     */
    function release() {
      canvas!.width = 0;
      canvas!.height = 0;
      sized = false;
    }
    function onResize() {
      if (rafRef.current !== null) resize();
    }
    window.addEventListener("resize", onResize);

    function frame(now: number) {
      if (disposed) return;
      // Normalised to a 60fps step, clamped so a backgrounded tab returning
      // to focus does not teleport every piece off screen in one jump.
      const dt = Math.min((now - lastRef.current) / 16.667, 3);
      lastRef.current = now;

      ctx!.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const floor = window.innerHeight + 40;
      let writeIndex = 0;

      for (const p of pieces) {
        p.life += dt;
        p.vy += GRAVITY * dt;
        p.vx *= Math.pow(DRAG, dt);
        // A little lateral flutter, as a falling ribbon catches the air.
        p.x += (p.vx + Math.sin(p.life * 0.08 + p.drift) * 0.55) * dt;
        p.y += p.vy * dt;
        p.tilt += p.tiltRate * dt;
        p.spin += p.spinRate * dt;

        const progress = p.life / p.maxLife;
        if (progress >= 1 || p.y > floor) continue;

        const alpha =
          progress < FADE_FROM ? 1 : 1 - (progress - FADE_FROM) / (1 - FADE_FROM);

        ctx!.save();
        ctx!.globalAlpha = alpha;
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.tilt);
        // Squashing the width as it spins fakes a flat ribbon turning over.
        ctx!.scale(Math.max(Math.abs(Math.cos(p.spin)), 0.12), 1);
        ctx!.fillStyle = p.color;
        ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx!.restore();

        pieces[writeIndex++] = p;
      }
      pieces.length = writeIndex;

      if (pieces.length > 0) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        // Idle: no loop running, and nothing left on the canvas or held for it.
        rafRef.current = null;
        release();
      }
    }

    const stopListening = onCelebrate((origin) => {
      if (disposed) return;
      // Someone who has asked for less motion gets the nav banner and no
      // flying objects. The banner is legible on its own.
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const at: CelebrationOrigin = origin ?? {
        x: window.innerWidth / 2,
        y: window.innerHeight * 0.4,
      };
      const colors = paletteFor(document.documentElement);
      pieces.push(...spawn(at, colors));
      // A ceiling, in case of a very enthusiastic run of completions.
      if (pieces.length > 600) pieces.splice(0, pieces.length - 600);

      if (rafRef.current === null) {
        if (!sized) resize();
        lastRef.current = performance.now();
        rafRef.current = requestAnimationFrame(frame);
      }
    });

    return () => {
      disposed = true;
      stopListening();
      window.removeEventListener("resize", onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      pieces.length = 0;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 45,
      }}
    />
  );
}
