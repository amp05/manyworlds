import { useGameStore } from '../state/game.js';
import { Header, Span, Option, Sep, C } from '../components/Terminal.js';

export function BlessingScreen() {
  const { content, selectBlessing } = useGameStore();
  if (!content) return null;

  return (
    <div className="screen">
      <Header title="C H O O S E   Y O U R   B L E S S I N G" />
      <pre className="term-block">
{'\n'}
<Span color={C.dim}>  A blessing bends the rules of reality for your entire run.</Span>{'\n'}
{'\n'}
      </pre>
      {content.blessings.player.map((b, i) => (
        <pre key={b.id} className="term-block">
<Sep />
<span className="term-option" onClick={() => selectBlessing(b)} role="button" tabIndex={0}
  onKeyDown={(e) => { if (e.key === 'Enter') selectBlessing(b); }}
  style={{ cursor: 'pointer' }}>
<Span color={C.selected}>[{i + 1}]</Span>{' '}<Span color={C.blessing} bold>{b.name}</Span>{'\n'}
{'    '}<Span color={C.dim}>"{b.flavor}"</Span>{'\n'}
{'    '}<Span color={C.fg}>{b.text}</Span>{'\n'}
{'    '}<Span color={C.info}>Triggers: {b.triggers.join(', ')}</Span>{'\n'}
</span>
        </pre>
      ))}
    </div>
  );
}
