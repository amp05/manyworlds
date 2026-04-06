import { useGameStore } from '../state/game.js';
import { Sprite } from '../components/Sprite.js';
import { Header, Span, Option, Sep, C } from '../components/Terminal.js';
import type { Entity } from '@manyworlds/shared';

function cloneEntity(e: Entity): Entity {
  return JSON.parse(JSON.stringify(e));
}

export function EncounterIntroScreen() {
  const { encounterIntro, startCombat } = useGameStore();
  if (!encounterIntro) return null;

  const { enemies, isElite } = encounterIntro;
  const names = [...new Set(enemies.map((e) => e.name))];
  const counts = names.map((n) => {
    const c = enemies.filter((e) => e.name === n).length;
    return c > 1 ? `${c} ${n}s` : `a ${n}`;
  });

  return (
    <div className="screen">
      <pre className="term-block">
<Sep char="═" />
<Span color={isElite ? C.warning : C.enemy} bold>
  {isElite ? '  ═══ ELITE ENCOUNTER ═══' : '  ═══ ENCOUNTER ═══'}
</Span>{'\n'}
<Sep char="═" />
{'\n'}
<Span color={C.fg}>{'  '}{counts.join(' and ')} {enemies.length > 1 ? 'appear' : 'appears'}!</Span>{'\n'}
{'\n'}
      </pre>
      <pre className="term-block">
        <Option index={1} label="Fight!" onClick={() => startCombat(enemies, false)} color={C.enemy} />
      </pre>
    </div>
  );
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
  const { player, blessing, gold, visitedNodeIds, content } = useGameStore();
  if (!player || !content) return null;

  return (
    <div className="screen">
      <Header title="V I C T O R Y" />
      <pre className="term-block">
{'\n'}
<Span color={C.success} bold>  Against all odds, you prevailed.</Span>{'\n'}
<Span color={C.success}>  The {content.world.name} will remember your name.</Span>{'\n'}
{'\n'}
<Sep />
<Span color={C.title}>{'  ─── Run Summary ───'}</Span>{'\n'}
{'\n'}
{'  '}<Span color={C.dim}>Character:  </Span><Span color={C.player} bold>{player.name}</Span> <Span color={C.dim}>Lv{player.level}</Span>{'\n'}
{'  '}<Span color={C.dim}>Blessing:   </Span><Span color={C.blessing}>{blessing?.name}</Span>{'\n'}
{'  '}<Span color={C.dim}>Final HP:   </Span><Span color={C.hp}>{player.stats.hp}/{player.stats.maxHp}</Span>{'\n'}
{'  '}<Span color={C.dim}>Gold:       </Span><Span color={C.gold}>{String(gold)}</Span>{'\n'}
{'  '}<Span color={C.dim}>Battles:    </Span><Span color={C.info}>{visitedNodeIds.length} nodes traversed</Span>{'\n'}
{'  '}<Span color={C.dim}>Abilities:  </Span><Span color={C.fg}>{player.abilities.map((a) => a.name).join(', ')}</Span>{'\n'}
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
