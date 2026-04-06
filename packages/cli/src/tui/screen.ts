/**
 * Full-screen terminal renderer built on terminal-kit.
 * Double-buffered cell grid with true-color support.
 */
// @ts-expect-error — terminal-kit has no types
import termkit from 'terminal-kit';

const term = termkit.terminal;

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

  constructor() {
    this.width = term.width || 80;
    this.height = term.height || 24;
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
    term.fullscreen(true);
    term.grabInput({ mouse: false });
    term('\x1b[?25l'); // hide cursor

    term.on('key', (key: string) => {
      if (key === 'CTRL_C') {
        this.stop();
        process.exit(0);
      }
      if (this._inputHandler) this._inputHandler(key);
    });

    // Handle resize
    term.on('resize', (w: number, h: number) => {
      this.width = w;
      this.height = h;
      this.cells = this.makeGrid();
      this.prevCells = this.makeGrid();
      this._dirty = true;
    });
  }

  /** Exit full-screen mode */
  stop(): void {
    term.fullscreen(false);
    term.grabInput(false);
    term('\x1b[?25h'); // show cursor (raw escape)
    term.styleReset();
    this._started = false;
  }

  /** Set the keyboard input handler */
  onKey(handler: (key: string) => void): void {
    this._inputHandler = handler;
  }

  /** Wait for a single keypress */
  waitKey(): Promise<string> {
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
    if (!this.cells[y]) return; // safety
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
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.cells[y][x];
        const prev = this.prevCells[y]?.[x];
        if (prev && cell.char === prev.char && cell.fg === prev.fg && cell.bg === prev.bg && cell.bold === prev.bold) {
          continue; // No change
        }
        term.moveTo(x + 1, y + 1); // terminal-kit is 1-indexed
        const [fr, fg, fb] = hexToRgb(cell.fg);
        const [br, bg, bb] = hexToRgb(cell.bg);
        if (cell.bold) term.bold();
        term.colorRgb(fr, fg, fb);
        term.bgColorRgb(br, bg, bb);
        term(cell.char);
        if (cell.bold) term.styleReset();
      }
    }
    // Swap buffers
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.prevCells[y][x] = { ...this.cells[y][x] };
      }
    }
    this._dirty = false;
  }

  /** Force full redraw (clears delta cache) */
  forceRedraw(): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.prevCells[y][x] = { ...EMPTY_CELL, char: '\0' }; // Force mismatch
      }
    }
    this._dirty = true;
  }

  // ── Utility ───────────────────────────────────────────────────────────

  /** Sleep for ms milliseconds */
  sleep(ms: number): Promise<void> {
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
