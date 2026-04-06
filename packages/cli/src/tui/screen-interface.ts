/**
 * Screen interface — the contract that all screen implementations must satisfy.
 * Both the terminal-kit Screen and xterm.js WebScreen implement this.
 * Scene code depends on this interface, not the concrete implementation.
 */

export interface IScreen {
  width: number;
  height: number;
  headless: boolean;

  start(): void;
  stop(): void;
  onKey(handler: (key: string) => void): void;
  sendKey(key: string): void;
  waitKey(): Promise<string>;
  waitEnter(): Promise<void>;
  waitNumber(max: number): Promise<number>;
  onFlush(handler: (text: string) => void): void;
  dumpText(): string;

  clear(bg?: string): void;
  set(x: number, y: number, char: string, fg?: string, bg?: string, bold?: boolean): void;
  get(x: number, y: number): { char: string; fg: string; bg: string; bold?: boolean };
  text(x: number, y: number, str: string, fg?: string, bg?: string, bold?: boolean): void;
  hline(x: number, y: number, len: number, char?: string, fg?: string, bg?: string): void;
  box(x: number, y: number, w: number, h: number, fg?: string, bg?: string): void;
  fill(x: number, y: number, w: number, h: number, char?: string, fg?: string, bg?: string): void;
  bar(x: number, y: number, width: number, current: number, max: number, fgColor: string, bgColor?: string): void;
  centerText(y: number, str: string, fg?: string, bg?: string, bold?: boolean): void;

  flush(): void;
  forceRedraw(): void;
  sleep(ms: number): Promise<void>;
}
