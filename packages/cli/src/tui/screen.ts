/**
 * Full-screen terminal renderer built on terminal-kit.
 * Supports both interactive (real terminal) and headless (programmatic) modes.
 *
 * Headless mode: no terminal-kit dependency, renders to an in-memory grid.
 * Input comes from a queue. The screen can be dumped as plain text.
 * This lets Claude play the game and iterate on it.
 */
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);

let term: any = null;

function getTerm() {
  if (!term) {
    term = _require('terminal-kit').terminal;
  }
  return term;
}

export interface Cell {
  char: string;
  fg: string;   // hex '#rrggbb'
  bg: string;   // hex '#rrggbb'
  bold?: boolean;
}

export const EMPTY_CELL: Cell = { char: ' ', fg: '#fafaf9', bg: '#171717' };

export class Screen {
  width: number;
  height: number;
  private cells: Cell[][];
  private prevCells: Cell[][];
  private _dirty = true;
  private _inputHandler: ((key: string) => void) | null = null;
  private _started = false;
  readonly headless: boolean;

  // Headless mode: input queue
  private _inputQueue: string[] = [];
  private _inputWaiters: ((key: string) => void)[] = [];
  // Headless mode: callback on each flush (so the player agent can read the screen)
  private _onFlush: ((text: string) => void) | null = null;

  constructor(opts?: { headless?: boolean; width?: number; height?: number }) {
    this.headless = opts?.headless ?? false;
    if (this.headless) {
      this.width = opts?.width ?? 80;
      this.height = opts?.height ?? 24;
    } else {
      const t = getTerm();
      this.width = t.width || 80;
      this.height = t.height || 24;
    }
    this.cells = this.makeGrid();
    this.prevCells = this.makeGrid();
  }

  private makeGrid(): Cell[][] {
    const grid: Cell[][] = [];
    for (let y = 0; y < this.height; y++) {
      const row: Cell[] = [];
      for (let x = 0; x < this.width; x++) {
        row.push({ ...EMPTY_CELL });
      }
      grid.push(row);
    }
    return grid;
  }

  /** Enter full-screen mode and grab input */
  start(): void {
    if (this._started) return;
    this._started = true;
    if (this.headless) return;

    const t = getTerm();
    t.fullscreen(true);
    t.grabInput({ mouse: false });
    t('\x1b[?25l'); // hide cursor

    t.on('key', (key: string) => {
      if (key === 'CTRL_C') {
        this.stop();
        process.exit(0);
      }
      if (this._inputHandler) this._inputHandler(key);
    });

    t.on('resize', (w: number, h: number) => {
      this.width = w;
      this.height = h;
      this.cells = this.makeGrid();
      this.prevCells = this.makeGrid();
      this._dirty = true;
    });
  }

  /** Exit full-screen mode */
  stop(): void {
    this._started = false;
    if (this.headless) return;
    const t = getTerm();
    t.fullscreen(false);
    t.grabInput(false);
    t('\x1b[?25h');
    t.styleReset();
  }

  /** Set the keyboard input handler */
  onKey(handler: (key: string) => void): void {
    this._inputHandler = handler;
  }

  /** Wait for a single keypress */
  waitKey(): Promise<string> {
    if (this.headless) {
      // In headless mode, consume from the input queue
      if (this._inputQueue.length > 0) {
        return Promise.resolve(this._inputQueue.shift()!);
      }
      // Wait for input to be queued
      return new Promise((resolve) => {
        this._inputWaiters.push(resolve);
      });
    }
    return new Promise((resolve) => {
      const prev = this._inputHandler;
      this._inputHandler = (key) => {
        this._inputHandler = prev;
        resolve(key);
      };
    });
  }

  /** Wait for Enter or space */
  async waitEnter(): Promise<void> {
    while (true) {
      const key = await this.waitKey();
      if (key === 'ENTER' || key === ' ') return;
    }
  }

  /** Wait for a number key (1-9). Returns the number, or 0 for escape. */
  async waitNumber(max: number): Promise<number> {
    while (true) {
      const key = await this.waitKey();
      const n = parseInt(key, 10);
      if (!isNaN(n) && n >= 1 && n <= max) return n;
      if (key === 'ESCAPE' || key === 'q') return 0;
    }
  }

  // ── Headless mode API ─────────────────────────────────────────────────

  /** Queue a keypress (headless mode only) */
  sendKey(key: string): void {
    if (this._inputWaiters.length > 0) {
      const waiter = this._inputWaiters.shift()!;
      waiter(key);
    } else {
      this._inputQueue.push(key);
    }
  }

  /** Set a callback that fires after each flush with the screen text */
  onFlush(handler: (text: string) => void): void {
    this._onFlush = handler;
  }

  /** Dump the current screen as plain text (strips colors) */
  dumpText(): string {
    const lines: string[] = [];
    for (let y = 0; y < this.height; y++) {
      let line = '';
      for (let x = 0; x < this.width; x++) {
        line += this.cells[y]?.[x]?.char ?? ' ';
      }
      lines.push(line.trimEnd());
    }
    // Trim trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  }

  // ── Drawing primitives ────────────────────────────────────────────────

  /** Clear the buffer to the default background */
  clear(bg = '#171717'): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.cells[y][x] = { char: ' ', fg: '#fafaf9', bg, bold: false };
      }
    }
    this._dirty = true;
  }

  /** Set a single cell */
  set(x: number, y: number, char: string, fg = '#fafaf9', bg = '#171717', bold = false): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    if (!this.cells[y]) return;
    this.cells[y][x] = { char: char[0] ?? ' ', fg, bg, bold };
    this._dirty = true;
  }

  /** Get a cell */
  get(x: number, y: number): Cell {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return { ...EMPTY_CELL };
    return this.cells[y][x];
  }

  /** Write a string starting at (x, y) */
  text(x: number, y: number, str: string, fg = '#fafaf9', bg = '#171717', bold = false): void {
    for (let i = 0; i < str.length; i++) {
      this.set(x + i, y, str[i], fg, bg, bold);
    }
  }

  /** Draw a horizontal line */
  hline(x: number, y: number, len: number, char = '─', fg = '#292524', bg = '#171717'): void {
    for (let i = 0; i < len; i++) this.set(x + i, y, char, fg, bg);
  }

  /** Draw a box with border */
  box(x: number, y: number, w: number, h: number, fg = '#292524', bg = '#171717'): void {
    this.set(x, y, '┌', fg, bg);
    this.set(x + w - 1, y, '┐', fg, bg);
    this.set(x, y + h - 1, '└', fg, bg);
    this.set(x + w - 1, y + h - 1, '┘', fg, bg);
    for (let i = 1; i < w - 1; i++) {
      this.set(x + i, y, '─', fg, bg);
      this.set(x + i, y + h - 1, '─', fg, bg);
    }
    for (let i = 1; i < h - 1; i++) {
      this.set(x, y + i, '│', fg, bg);
      this.set(x + w - 1, y + i, '│', fg, bg);
    }
  }

  /** Fill a rectangle */
  fill(x: number, y: number, w: number, h: number, char = ' ', fg = '#fafaf9', bg = '#171717'): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.set(x + dx, y + dy, char, fg, bg);
      }
    }
  }

  /** Draw a progress bar */
  bar(x: number, y: number, width: number, current: number, max: number, fgColor: string, bgColor = '#292524'): void {
    const filled = Math.round((Math.max(0, current) / max) * width);
    for (let i = 0; i < width; i++) {
      this.set(x + i, y, i < filled ? '█' : '░', i < filled ? fgColor : bgColor);
    }
  }

  /** Draw centered text */
  centerText(y: number, str: string, fg = '#fafaf9', bg = '#171717', bold = false): void {
    const x = Math.floor((this.width - str.length) / 2);
    this.text(x, y, str, fg, bg, bold);
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  /** Flush the buffer to the terminal (delta rendering — only changed cells) */
  flush(): void {
    if (!this._dirty) return;

    if (!this.headless) {
      const t = getTerm();
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const cell = this.cells[y][x];
          const prev = this.prevCells[y]?.[x];
          if (prev && cell.char === prev.char && cell.fg === prev.fg && cell.bg === prev.bg && cell.bold === prev.bold) {
            continue;
          }
          t.moveTo(x + 1, y + 1);
          const [fr, fg, fb] = hexToRgb(cell.fg);
          const [br, bg, bb] = hexToRgb(cell.bg);
          if (cell.bold) t.bold();
          t.colorRgb(fr, fg, fb);
          t.bgColorRgb(br, bg, bb);
          t(cell.char);
          if (cell.bold) t.styleReset();
        }
      }
    }

    // Swap buffers
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.prevCells[y]) {
          this.prevCells[y][x] = { ...this.cells[y][x] };
        }
      }
    }
    this._dirty = false;

    // Notify headless observer
    if (this._onFlush) {
      this._onFlush(this.dumpText());
    }
  }

  /** Force full redraw (clears delta cache) */
  forceRedraw(): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.prevCells[y]) {
          this.prevCells[y][x] = { ...EMPTY_CELL, char: '\0' };
        }
      }
    }
    this._dirty = true;
  }

  // ── Utility ───────────────────────────────────────────────────────────

  /** Sleep for ms milliseconds (instant in headless mode) */
  sleep(ms: number): Promise<void> {
    if (this.headless) return Promise.resolve(); // Skip delays in headless
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

// ── Color palette ───────────────────────────────────────────────────────

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
