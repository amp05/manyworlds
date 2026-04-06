import { useEffect, useRef } from 'react';
import '@xterm/xterm/css/xterm.css';
import { WebScreen } from './xterm-screen.js';
import { runWebGame } from './game-runner.js';

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || startedRef.current) return;
    startedRef.current = true;

    const screen = new WebScreen(containerRef.current);
    screen.focus();

    runWebGame(screen).catch((err) => {
      console.error('Game error:', err);
      screen.clear();
      screen.centerText(10, 'Game crashed. Check console.', '#ef4444');
      screen.flush();
    });
  }, []);

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#171717',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          maxWidth: '960px',
          maxHeight: '720px',
        }}
      />
    </div>
  );
}
