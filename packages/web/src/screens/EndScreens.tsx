import { useGameStore } from '../state/game.js';
import { Sprite } from '../components/Sprite.js';
import { Header, Span, Option, Sep, C } from '../components/Terminal.js';
import type { Entity } from '@manyworlds/shared';

function cloneEntity(e: Entity): Entity {
  return JSON.parse(JSON.stringify(e));
}

export function BossIntroScreen() {
  const { content, startCombat } = useGameStore();
  if (!content) return null;

  const boss = content.bossEncounter.boss;
  const bossBlessing = content.blessings.boss;

  return (
    <div className="screen">
      <Header title="B O S S   E N C O U N T E R" />
      <div className="boss-sprite-container">
        <Sprite entityName={boss.name} palette={boss.spriteDescriptor?.palette} />
      </div>
      <pre className="term-block">
<Span color={C.enemy} bold>{'  '}{boss.name}</Span>{'\n'}
{'\n'}
<Span color={C.fg}>  {content.bossEncounter.introText}</Span>{'\n'}
{'\n'}
<Sep />
<Span color={C.enemy}>  ⚔ {bossBlessing.name}</Span>{'\n'}
<Span color={C.dim}>  "{bossBlessing.flavor}"</Span>{'\n'}
<Span color={C.dim}>  {bossBlessing.text}</Span>{'\n'}
{'\n'}
      </pre>
      <pre className="term-block">
        <Option index={1} label="F I G H T" onClick={() => startCombat([cloneEntity(boss)], true)} color={C.enemy} />
      </pre>
    </div>
  );
}

export function VictoryScreen() {
  const { player, blessing, gold, visitedNodeIds } = useGameStore();
  if (!player) return null;

  return (
    <div className="screen">
      <Header title="R U N   C O M P L E T E" />
      <pre className="term-block">
{'\n'}
<Span color={C.success}>  The Ashen Colossus crumbles.</Span>{'\n'}
<Span color={C.success}>  Silence returns to the wastes.</Span>{'\n'}
{'\n'}
<Sep />
{'  '}<Span color={C.dim}>Character:  </Span><Span color={C.player}>{player.name} Lv{player.level}</Span>{'\n'}
{'  '}<Span color={C.dim}>Blessing:   </Span><Span color={C.blessing}>{blessing?.name}</Span>{'\n'}
{'  '}<Span color={C.dim}>Gold:       </Span><Span color={C.gold}>{String(gold)}</Span>{'\n'}
{'  '}<Span color={C.dim}>Nodes:      </Span><Span color={C.info}>{String(visitedNodeIds.length)}</Span>{'\n'}
{'  '}<Span color={C.dim}>Final HP:   </Span><Span color={C.hp}>{player.stats.hp}/{player.stats.maxHp}</Span>{'\n'}
<Sep />
{'\n'}
      </pre>
      <pre className="term-block">
        <Option index={1} label="Play Again" onClick={() => window.location.reload()} color={C.title} />
      </pre>
    </div>
  );
}

export function DefeatScreen() {
  const { player, blessing, visitedNodeIds } = useGameStore();
  if (!player) return null;

  return (
    <div className="screen">
      <Header title="D E F E A T" />
      <pre className="term-block">
{'\n'}
<Span color={C.hpLow}>  The ash claims another wanderer.</Span>{'\n'}
{'\n'}
<Sep />
{'  '}<Span color={C.dim}>Character:  </Span><Span color={C.fg}>{player.name} Lv{player.level}</Span>{'\n'}
{'  '}<Span color={C.dim}>Blessing:   </Span><Span color={C.blessing}>{blessing?.name}</Span>{'\n'}
{'  '}<Span color={C.dim}>Nodes:      </Span><Span color={C.info}>{String(visitedNodeIds.length)}</Span>{'\n'}
<Sep />
{'\n'}
      </pre>
      <pre className="term-block">
        <Option index={1} label="Try Again" onClick={() => window.location.reload()} color={C.warning} />
      </pre>
    </div>
  );
}
