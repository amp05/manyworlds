/**
 * Terminal rendering primitives.
 * All game UI is built from these — everything renders inside <pre> blocks
 * using monospace text, box-drawing characters, and colored spans.
 */
import { type ReactNode, type CSSProperties } from 'react';

// ── Color palette (matches CLI renderer) ────────────────────────────────

export const C = {
  bg: '#0a0a0f',
  bgAlt: '#12121a',
  fg: '#d4c5a9',
  dim: '#7a6a5a',
  border: '#3a3050',
  fire: '#ff6600',
  void: '#8888ff',
  shadow: '#9966cc',
  earth: '#886644',
  hp: '#44cc44',
  hpLow: '#cc4444',
  mp: '#4488ff',
  gold: '#ffcc44',
  title: '#ff9944',
  selected: '#ffdd66',
  enemy: '#ff6644',
  player: '#44ddff',
  blessing: '#cc88ff',
  info: '#aaaacc',
  warning: '#ffaa44',
  success: '#44ff88',
} as const;

const TERM_WIDTH = 64;

// ── Helpers ─────────────────────────────────────────────────────────────

/** Pad or truncate a string to exactly `len` characters */
function fit(s: string, len: number, align: 'left' | 'right' | 'center' = 'left'): string {
  if (s.length > len) return s.slice(0, len);
  const pad = len - s.length;
  if (align === 'right') return ' '.repeat(pad) + s;
  if (align === 'center') return ' '.repeat(Math.floor(pad / 2)) + s + ' '.repeat(Math.ceil(pad / 2));
  return s + ' '.repeat(pad);
}

// ── Span helper ─────────────────────────────────────────────────────────

export function Span({ color, bold, children }: { color?: string; bold?: boolean; children: ReactNode }) {
  const style: CSSProperties = {};
  if (color) style.color = color;
  if (bold) style.fontWeight = 'bold';
  return <span style={style}>{children}</span>;
}

// ── Box drawing ─────────────────────────────────────────────────────────

export function Box({ title, children, width = TERM_WIDTH, color = C.border }: {
  title?: string; children: ReactNode; width?: number; color?: string;
}) {
  const top = title
    ? `╔═ ${title} ${'═'.repeat(Math.max(0, width - title.length - 5))}╗`
    : `╔${'═'.repeat(width - 2)}╗`;
  const bot = `╚${'═'.repeat(width - 2)}╝`;

  return (
    <pre className="term-block">
      <Span color={color}>{top}</Span>{'\n'}
      {children}
      <Span color={color}>{bot}</Span>{'\n'}
    </pre>
  );
}

export function BoxRow({ children, width = TERM_WIDTH, color = C.border }: {
  children: ReactNode; width?: number; color?: string;
}) {
  return (
    <>
      <Span color={color}>{'║'}</Span>
      {' '}{children}
      <Span color={color}>{'║'}</Span>{'\n'}
    </>
  );
}

// ── Separator ───────────────────────────────────────────────────────────

export function Sep({ char = '─', width = TERM_WIDTH, color = C.border }: {
  char?: string; width?: number; color?: string;
}) {
  return <><Span color={color}>{char.repeat(width)}</Span>{'\n'}</>;
}

// ── HP / MP bar ─────────────────────────────────────────────────────────

export function Bar({ current, max, width = 20, type = 'hp' }: {
  current: number; max: number; width?: number; type?: 'hp' | 'mp';
}) {
  const pct = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const color = type === 'mp' ? C.mp
    : pct < 0.25 ? C.hpLow
    : pct < 0.5 ? C.warning
    : C.hp;
  const label = `${current}/${max}`;

  return (
    <>
      <Span color={color}>{'█'.repeat(filled)}</Span>
      <Span color={C.border}>{'░'.repeat(empty)}</Span>
      {' '}<Span color={C.dim}>{label}</Span>
    </>
  );
}

// ── Clickable option (renders as terminal-style numbered choice) ────────

export function Option({ index, label, onClick, disabled, color = C.fg, detail }: {
  index: number; label: string; onClick: () => void;
  disabled?: boolean; color?: string; detail?: string;
}) {
  const dimStyle: CSSProperties = disabled
    ? { opacity: 0.35, cursor: 'not-allowed' }
    : { cursor: 'pointer' };

  return (
    <span
      className="term-option"
      style={dimStyle}
      onClick={disabled ? undefined : onClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => { if (e.key === 'Enter' && !disabled) onClick(); }}
    >
      <Span color={disabled ? C.dim : C.selected}>{`[${index}]`}</Span>
      {' '}<Span color={disabled ? C.dim : color}>{label}</Span>
      {detail && <Span color={C.dim}>{`  ${detail}`}</Span>}
      {'\n'}
    </span>
  );
}

// ── Header (centered title in a box) ────────────────────────────────────

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Box color={C.border}>
      <BoxRow>
        <Span color={C.title}>{fit(title, TERM_WIDTH - 4, 'center')}</Span>
      </BoxRow>
      {subtitle && (
        <BoxRow>
          <Span color={C.dim}>{fit(subtitle, TERM_WIDTH - 4, 'center')}</Span>
        </BoxRow>
      )}
    </Box>
  );
}

// ── Status line (key: value pairs) ──────────────────────────────────────

export function StatusLine({ items }: { items: { label: string; value: string; color?: string }[] }) {
  return (
    <pre className="term-block">
      {items.map((item, i) => (
        <span key={i}>
          <Span color={C.dim}>{item.label}: </Span>
          <Span color={item.color ?? C.fg}>{item.value}</Span>
          {i < items.length - 1 ? '  ' : ''}
        </span>
      ))}
      {'\n'}
    </pre>
  );
}

export { TERM_WIDTH, fit };
