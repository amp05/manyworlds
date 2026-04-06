/**
 * WebScreen — implements the same API as the CLI's Screen class,
 * but renders to an xterm.js terminal in the browser.
 *
 * The game logic doesn't know or care that it's running in a browser.
 * It calls screen.set(), screen.text(), screen.flush() etc. and this
 * class translates those to ANSI escape codes written to xterm.js.
 */
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

interface Cell {
  char: string;
  fg: string;
  bg: string;
  bold?: boolean;
}

const EMPTY_CELL: Cell = { char: ' ', fg: '#fafaf9', bg: '#171717' };

function hexToAnsi(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `${r};${g};${b}`;
}

export class WebScreen {
  width: number;
  height: number;
  readonly headless = false;
  private cells: Cell[][];
  private prevCells: Cell[][];
  private _dirty = true;
  private _inputWaiters: ((key: string) => void)[] = [];
  private _inputQueue: string[] = [];
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private _onFlush: ((text: string) => void) | null = null;

  constructor(container: HTMLElement) {
    this.terminal = new Terminal({
      fontFamily: "'IBM Plex Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: 14,
      lineHeight: 1,
      theme: {
        background: '#171717',
        foreground: '#fafaf9',
        cursor: 'transparent',
        cursorAccent: 'transparent',
      },
      cursorBlink: false,
      cursorStyle: 'bar',
      cursorInactiveStyle: 'none',
      allowTransparency: false,
      scrollback: 0,
      convertEol: true,
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(container);
    this.fitAddon.fit();

    this.width = this.terminal.cols;
    this.height = this.terminal.rows;
    this.cells = this.makeGrid();
    this.prevCells = this.makeGrid();

    // Keyboard input
    this.terminal.onKey(({ key, domEvent }) => {
      const mapped = this.mapKey(domEvent);
      if (mapped) this.sendKey(mapped);
    });

    // Handle resize
    const ro = new ResizeObserver(() => {
      this.fitAddon.fit();
      this.width = this.terminal.cols;
      this.height = this.terminal.rows;
      this.cells = this.makeGrid();
      this.prevCells = this.makeGrid();
      this._dirty = true;
    });
    ro.observe(container);
  }

  private mapKey(e: KeyboardEvent): string | null {
    if (e.key === 'Enter') return 'ENTER';
    if (e.key === ' ') return ' ';
    if (e.key === 'Escape') return 'ESCAPE';
    if (e.key.length === 1) return e.key; // letters, numbers
    return null;
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

  start(): void { /* no-op for web */ }
  stop(): void { /* no-op for web */ }

  onKey(_handler: (key: string) => void): void { /* not used — we use sendKey */ }

  sendKey(key: string): void {
    if (this._inputWaiters.length > 0) {
      const waiter = this._inputWaiters.shift()!;
      waiter(key);
    } else {
      this._inputQueue.push(key);
    }
  }

  waitKey(): Promise<string> {
    if (this._inputQueue.length > 0) {
      return Promise.resolve(this._inputQueue.shift()!);
    }
    return new Promise((resolve) => {
      this._inputWaiters.push(resolve);
    });
  }

  async waitEnter(): Promise<void> {
    while (true) {
      const key = await this.waitKey();
      if (key === 'ENTER' || key === ' ') return;
    }
  }

  async waitNumber(max: number): Promise<number> {
    while (true) {
      const key = await this.waitKey();
      const n = parseInt(key, 10);
      if (!isNaN(n) && n >= 1 && n <= max) return n;
      if (key === 'ESCAPE' || key === 'q') return 0;
    }
  }

  onFlush(handler: (text: string) => void): void {
    this._onFlush = handler;
  }

  dumpText(): string {
    const lines: string[] = [];
    for (let y = 0; y < this.height; y++) {
      let line = '';
      for (let x = 0; x < this.width; x++) {
        line += this.cells[y]?.[x]?.char ?? ' ';
      }
      lines.push(line.trimEnd());
    }
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  }

  // ── Drawing primitives (same API as CLI Screen) ───────────────────────

  clear(bg = '#171717'): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.cells[y][x] = { char: ' ', fg: '#fafaf9', bg, bold: false };
      }
    }
    this._dirty = true;
  }

  set(x: number, y: number, char: string, fg = '#fafaf9', bg = '#171717', bold = false): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    if (!this.cells[y]) return;
    this.cells[y][x] = { char: char[0] ?? ' ', fg, bg, bold };
    this._dirty = true;
  }

  get(x: number, y: number): Cell {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return { ...EMPTY_CELL };
    return this.cells[y][x];
  }

  text(x: number, y: number, str: string, fg = '#fafaf9', bg = '#171717', bold = false): void {
    for (let i = 0; i < str.length; i++) {
      this.set(x + i, y, str[i], fg, bg, bold);
    }
  }

  hline(x: number, y: number, len: number, char = '─', fg = '#292524', bg = '#171717'): void {
    for (let i = 0; i < len; i++) this.set(x + i, y, char, fg, bg);
  }

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

  fill(x: number, y: number, w: number, h: number, char = ' ', fg = '#fafaf9', bg = '#171717'): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.set(x + dx, y + dy, char, fg, bg);
      }
    }
  }

  bar(x: number, y: number, width: number, current: number, max: number, fgColor: string, bgColor = '#292524'): void {
    const filled = Math.round((Math.max(0, current) / max) * width);
    for (let i = 0; i < width; i++) {
      this.set(x + i, y, i < filled ? '█' : '░', i < filled ? fgColor : bgColor);
    }
  }

  centerText(y: number, str: string, fg = '#fafaf9', bg = '#171717', bold = false): void {
    const x = Math.floor((this.width - str.length) / 2);
    this.text(x, y, str, fg, bg, bold);
  }

  // ── Rendering to xterm.js ─────────────────────────────────────────────

  flush(): void {
    if (!this._dirty) return;

    // Build a full screen buffer as ANSI escape codes
    let output = '\x1b[H'; // Move cursor to home
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.cells[y][x];
        const prev = this.prevCells[y]?.[x];
        if (prev && cell.char === prev.char && cell.fg === prev.fg && cell.bg === prev.bg && cell.bold === prev.bold) {
          continue;
        }
        // Move cursor to position
        output += `\x1b[${y + 1};${x + 1}H`;
        // Set colors
        if (cell.bold) output += '\x1b[1m';
        output += `\x1b[38;2;${hexToAnsi(cell.fg)}m`;
        output += `\x1b[48;2;${hexToAnsi(cell.bg)}m`;
        output += cell.char;
        if (cell.bold) output += '\x1b[22m';
      }
    }
    output += '\x1b[0m'; // Reset

    this.terminal.write(output);

    // Swap buffers
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.prevCells[y]) {
          this.prevCells[y][x] = { ...this.cells[y][x] };
        }
      }
    }
    this._dirty = false;

    if (this._onFlush) this._onFlush(this.dumpText());
  }

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

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Focus the terminal for keyboard input */
  focus(): void {
    this.terminal.focus();
  }

  /** Get the underlying xterm terminal (for advanced use) */
  getTerminal(): Terminal {
    return this.terminal;
  }
}
