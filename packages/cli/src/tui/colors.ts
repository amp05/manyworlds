/**
 * Color palette — shared between all screen implementations.
 * No dependencies on terminal-kit or any runtime.
 */

// Palette derived from the personal site's dark theme:
// bg #171717, fg #fafaf9, muted #a8a29e, accent #fbbf24, border #292524
export const C = {
  bg: '#171717',
  bgAlt: '#262626',
  bgPanel: '#1e1e1e',
  fg: '#fafaf9',
  dim: '#a8a29e',
  border: '#292524',
  borderBright: '#44403c',

  hp: '#4ade80',
  hpLow: '#ef4444',
  hpMid: '#f59e0b',
  mp: '#60a5fa',
  gold: '#fbbf24',

  title: '#fbbf24',
  selected: '#fbbf24',
  enemy: '#f87171',
  player: '#67e8f9',
  blessing: '#c084fc',
  info: '#a8a29e',
  warning: '#f59e0b',
  success: '#4ade80',

  fire: '#f97316',
  ice: '#67e8f9',
  void_: '#a78bfa',
  water: '#38bdf8',
  earth: '#a8a29e',
  shadow: '#c084fc',
} as const;
