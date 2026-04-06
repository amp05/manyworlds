import { useState } from 'react';
import { useGameStore } from '../state/game.js';
import { Header, Span, Option, Sep, Bar, C } from '../components/Terminal.js';

export function EventScreen() {
  const { currentEvent, makeEventChoice, returnToMap } = useGameStore();
  const [chosen, setChosen] = useState<number | null>(null);

  if (!currentEvent) {
    return (
      <div className="screen">
        <pre className="term-block"><Span color={C.dim}>  No event.</Span>{'\n'}</pre>
        <pre className="term-block"><Option index={1} label="Continue" onClick={returnToMap} /></pre>
      </div>
    );
  }

  if (chosen !== null) {
    const outcome = currentEvent.choices[chosen]?.outcome;
    return (
      <div className="screen">
        <Header title="E V E N T" />
        <pre className="term-block">
{'\n'}
<Span color={C.fg}>  {outcome?.narrative}</Span>{'\n'}
{'\n'}
{outcome?.rewards?.gold && <Span color={C.gold}>{'  +' + outcome.rewards.gold + ' Gold\n'}</Span>}
{outcome?.rewards?.exp && <Span color={C.info}>{'  +' + outcome.rewards.exp + ' EXP\n'}</Span>}
{outcome?.rewards?.item && <Span color={C.success}>{'  Received: ' + outcome.rewards.item.name + '\n'}</Span>}
{outcome?.rewards?.statBoost && (
  <Span color={C.success}>{'  ' + Object.entries(outcome.rewards.statBoost).filter(([,v]) => v).map(([k,v]) => `${k} +${v}`).join(', ') + '\n'}</Span>
)}
{outcome?.penalties?.hpLoss && <Span color={C.hpLow}>{'  Lost ' + outcome.penalties.hpLoss + ' HP\n'}</Span>}
{outcome?.penalties?.goldLoss && <Span color={C.warning}>{'  Lost ' + outcome.penalties.goldLoss + ' Gold\n'}</Span>}
{'\n'}
        </pre>
        <pre className="term-block">
          <Option index={1} label="Continue" onClick={returnToMap} color={C.title} />
        </pre>
      </div>
    );
  }

  return (
    <div className="screen">
      <Header title="E V E N T" />
      <pre className="term-block">
{'\n'}
<Span color={C.fg}>  {currentEvent.narrative}</Span>{'\n'}
{'\n'}
      </pre>
      <pre className="term-block">
        {currentEvent.choices.map((choice, i) => (
          <Option key={i} index={i + 1} label={choice.text}
            onClick={() => { makeEventChoice(i); setChosen(i); }} />
        ))}
      </pre>
    </div>
  );
}

export function ShopScreen() {
  const { currentShop, gold, buyItem, leaveShop, player } = useGameStore();
  if (!currentShop || !player) return null;

  return (
    <div className="screen">
      <Header title="S H O P" />
      <pre className="term-block">
{'\n'}
<Span color={C.gold}>  Gold: {gold}</Span>{'\n'}
{'\n'}
      </pre>
      <pre className="term-block">
        {currentShop.inventory.map((si, i) => (
          <Option key={si.item.id} index={i + 1}
            label={`${si.item.name} — ${si.price}G`}
            detail={si.item.description}
            onClick={() => buyItem(si.item.id, si.price)}
            disabled={gold < si.price}
            color={C.gold} />
        ))}
        <Option index={0} label="Leave Shop" onClick={leaveShop} color={C.dim} />
      </pre>
    </div>
  );
}

export function RestScreen() {
  const { currentRest, player, completeRest } = useGameStore();
  if (!player) return null;

  const healAmt = Math.floor(player.stats.maxHp * (currentRest?.healPercent ?? 0.3));
  const mpAmt = Math.floor(player.stats.maxMp * 0.3);

  return (
    <div className="screen">
      <Header title="R E S T" />
      <pre className="term-block">
{'\n'}
{currentRest && <Span color={C.dim}>  {currentRest.flavor}</Span>}
{currentRest && '\n'}
{'\n'}
<Span color={C.dim}>  Current  </Span><Span color={C.dim}>HP </Span><Bar current={player.stats.hp} max={player.stats.maxHp} width={16} />{'\n'}
<Span color={C.dim}>           </Span><Span color={C.dim}>MP </Span><Bar current={player.stats.mp} max={player.stats.maxMp} width={16} type="mp" />{'\n'}
{'\n'}
<Span color={C.success}>  Will recover ~{healAmt} HP and ~{mpAmt} MP.</Span>{'\n'}
{'\n'}
      </pre>
      <pre className="term-block">
        <Option index={1} label="Rest" onClick={completeRest} color={C.success} />
      </pre>
    </div>
  );
}

export function LevelUpScreen() {
  const { content, player, selectedArchetype, selectLevelUpAbility, returnToMap } = useGameStore();
  if (!content || !player || !selectedArchetype) return null;

  const choices = content.levelUpChoices.find(
    (c) => c.archetypeId === selectedArchetype.id && c.level === player.level,
  );

  if (!choices) {
    return (
      <div className="screen">
        <pre className="term-block">
<Span color={C.success} bold>{'  >> Level {player.level} reached!'}</Span>{'\n'}
        </pre>
        <pre className="term-block"><Option index={1} label="Continue" onClick={returnToMap} /></pre>
      </div>
    );
  }

  return (
    <div className="screen">
      <Header title="L E V E L   U P" subtitle={`Level ${player.level}`} />
      <pre className="term-block">
{'\n'}
<Span color={C.fg}>  Choose a new ability:</Span>{'\n'}
{'\n'}
      </pre>
      <pre className="term-block">
        {choices.abilities.map((a, i) => (
          <Option key={a.id} index={i + 1}
            label={`${a.name} (${a.mpCost} MP)`}
            detail={a.description}
            onClick={() => { selectLevelUpAbility(a.id); returnToMap(); }}
            color={C.selected} />
        ))}
      </pre>
    </div>
  );
}
