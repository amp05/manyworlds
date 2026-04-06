/**
 * Animation engine for terminal UI.
 * Provides tweens, timers, and frame-based animation loops.
 */
import type { IScreen } from './screen-interface.js';
import { C } from './colors.js';

export type EasingFn = (t: number) => number;

export const Easing = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => t * (2 - t),
  easeInOut: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  bounce: (t: number) => {
    if (t < 0.5) return 4 * t * t * t;
    return 1 - Math.pow(-2 * t + 2, 3) / 2;
  },
};

/** Animate a value from `from` to `to` over `duration` ms */
export async function tween(
  screen: IScreen,
  duration: number,
  from: number,
  to: number,
  easing: EasingFn,
  onFrame: (value: number) => void,
  fps = 30,
): Promise<void> {
  const frameMs = 1000 / fps;
  const start = Date.now();
  while (true) {
    const elapsed = Date.now() - start;
    const t = Math.min(1, elapsed / duration);
    const value = from + (to - from) * easing(t);
    onFrame(value);
    screen.flush();
    if (t >= 1) break;
    await screen.sleep(frameMs);
  }
}

/** Flash a rectangular region with a color, then restore */
export async function flashRegion(
  screen: IScreen,
  x: number, y: number, w: number, h: number,
  color: string,
  durationMs = 150,
): Promise<void> {
  // Save original cells
  const saved: { char: string; fg: string; bg: string }[][] = [];
  for (let dy = 0; dy < h; dy++) {
    saved[dy] = [];
    for (let dx = 0; dx < w; dx++) {
      const cell = screen.get(x + dx, y + dy);
      saved[dy][dx] = { char: cell.char, fg: cell.fg, bg: cell.bg };
      // Flash: brighten bg
      screen.set(x + dx, y + dy, cell.char, '#ffffff', color);
    }
  }
  screen.flush();
  await screen.sleep(durationMs);
  // Restore
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const s = saved[dy][dx];
      screen.set(x + dx, y + dy, s.char, s.fg, s.bg);
    }
  }
  screen.flush();
}

/** Typewriter effect — reveal text character by character */
export async function typewrite(
  screen: IScreen,
  x: number, y: number,
  text: string,
  fg: string = C.fg, bg: string = C.bg,
  charDelayMs = 25,
): Promise<void> {
  for (let i = 0; i < text.length; i++) {
    screen.set(x + i, y, text[i], fg, bg);
    screen.flush();
    await screen.sleep(charDelayMs);
  }
}

/** Fade in text (dim → full brightness) */
export async function fadeInText(
  screen: IScreen,
  x: number, y: number,
  text: string,
  targetFg: string,
  bg: string = C.bg,
  durationMs = 300,
): Promise<void> {
  const [tr, tg, tb] = hexToRgb(targetFg);
  await tween(screen, durationMs, 0, 1, Easing.easeOut, (t) => {
    const r = Math.round(tr * t);
    const g = Math.round(tg * t);
    const b = Math.round(tb * t);
    const fg = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    screen.text(x, y, text, fg, bg);
  });
}

/** Screen wipe transition (left to right) */
export async function wipeTransition(
  screen: IScreen,
  durationMs = 400,
  color = C.border,
): Promise<void> {
  const cols = screen.width;
  const delayPerCol = durationMs / cols;
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < screen.height; y++) {
      screen.set(x, y, '░', color, C.bg);
    }
    if (x % 3 === 0) {
      screen.flush();
      await screen.sleep(delayPerCol * 3);
    }
  }
  screen.flush();
  await screen.sleep(50);
}

/** Apply a scanline overlay effect (for CRT feel) */
export function applyScanlines(screen: IScreen): void {
  for (let y = 0; y < screen.height; y += 2) {
    for (let x = 0; x < screen.width; x++) {
      const cell = screen.get(x, y);
      // Slightly darken every other row
      const [r, g, b] = hexToRgb(cell.fg);
      const dr = Math.max(0, r - 15);
      const dg = Math.max(0, g - 15);
      const db = Math.max(0, b - 15);
      screen.set(x, y, cell.char,
        `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`,
        cell.bg, cell.bold);
    }
  }
}

/** Shake effect — briefly shift the screen content */
export async function screenShake(
  screen: IScreen,
  intensity = 1,
  durationMs = 200,
): Promise<void> {
  // Save screen state
  const saved: { char: string; fg: string; bg: string }[][] = [];
  for (let y = 0; y < screen.height; y++) {
    saved[y] = [];
    for (let x = 0; x < screen.width; x++) {
      const cell = screen.get(x, y);
      saved[y][x] = { char: cell.char, fg: cell.fg, bg: cell.bg };
    }
  }

  const frames = Math.floor(durationMs / 50);
  for (let f = 0; f < frames; f++) {
    const offsetX = Math.round((Math.random() - 0.5) * 2 * intensity);
    screen.clear();
    for (let y = 0; y < screen.height; y++) {
      for (let x = 0; x < screen.width; x++) {
        const sx = x - offsetX;
        if (sx >= 0 && sx < screen.width && saved[y]?.[sx]) {
          const s = saved[y][sx];
          screen.set(x, y, s.char, s.fg, s.bg);
        }
      }
    }
    screen.flush();
    await screen.sleep(50);
  }

  // Restore
  for (let y = 0; y < screen.height; y++) {
    for (let x = 0; x < screen.width; x++) {
      const s = saved[y]?.[x];
      if (s) screen.set(x, y, s.char, s.fg, s.bg);
    }
  }
  screen.flush();
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}
