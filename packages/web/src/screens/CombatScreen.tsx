import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../state/game.js';
import { isPlayerTurn } from '@manyworlds/engine';
import { Sprite } from '../components/Sprite.js';
import { Span, Bar, Option, Sep, C, fit } from '../components/Terminal.js';

const STATUS_DESCRIPTIONS: Record<string, string> = {
  'Burning': 'Takes fire damage each turn',
  'Poison': 'Takes poison damage each turn',
  'Frostbite': 'Takes ice damage + speed reduced',
  'Soaked': 'Defense reduced',
  'Defense Down': 'Defense reduced',
  'Regen': 'Recovers HP each turn',
  'Evasion': 'Speed increased',
  'Invulnerable': 'Cannot take damage',
  'Attack Up': 'Attack power increased',
  'Shield': 'Absorbs incoming damage',
  'Slowed': 'Speed reduced',
};

function labelEntities(entities: { name: string }[]): string[] {
  const counts: Record<string, number> = {};
  for (const e of entities) counts[e.name] = (counts[e.name] ?? 0) + 1;
  const idx: Record<string, number> = {};
  return entities.map((e) => {
    if (counts[e.name] > 1) {
      idx[e.name] = (idx[e.name] ?? 0) + 1;
      return `${e.name} (${String.fromCharCode(64 + idx[e.name])})`;
    }
    return e.name;
  });
}

export function CombatScreen() {
  const {
    combat, combatLog, player, blessing, content,
    processingTurn, doPlayerAction, combatRewards,
    pendingLevelUp, returnToMap, isBossFight,
  } = useGameStore();
  const [showItems, setShowItems] = useState(false);
  const [selectingTarget, setSelectingTarget] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [combatLog]);

  if (!combat || !player) return null;

  const liveEnemies = combat.entities.filter((e) => !e.isPlayer && e.stats.hp > 0);
  const allEnemies = combat.entities.filter((e) => !e.isPlayer);
  const playerEntity = combat.entities.find((e) => e.isPlayer)!;
  const isMyTurn = isPlayerTurn(combat) && combat.status === 'active';
  const enemyLabels = labelEntities(allEnemies);

  // ── Post-combat rewards ──
  if (combat.status !== 'active') {
    if (combat.status === 'victory' && combatRewards) {
      return (
        <div className="screen">
          <pre className="term-block">
<Sep char="═" />
<Span color={C.success} bold>{'  V I C T O R Y'}</Span>{'\n'}
<Sep char="═" />
{'\n'}
{'  '}<Span color={C.info}>+{combatRewards.exp} EXP</Span>{'   '}<Span color={C.gold}>+{combatRewards.gold} Gold</Span>{'\n'}
{'  '}<Span color={C.dim}>HP: {playerEntity.stats.hp}/{playerEntity.stats.maxHp}</Span>{'\n'}
{pendingLevelUp && <><Span color={C.blessing}>{'\n  ★ LEVEL UP! Choose a new ability.'}</Span>{'\n'}</>}
{'\n'}
          </pre>
          <pre className="term-block">
            <Option index={1}
              label={pendingLevelUp ? 'Choose Ability' : 'Continue'}
              onClick={pendingLevelUp ? () => useGameStore.setState({ phase: 'level_up' }) : returnToMap}
              color={C.title} />
          </pre>
        </div>
      );
    }
    return null;
  }

  // ── Target selection ──
  if (selectingTarget) {
    const labels = labelEntities(liveEnemies);
    return (
      <div className="screen">
        <pre className="term-block">
<Span color={C.dim}>{'  ─── Choose Target ───'}</Span>{'\n'}{'\n'}
        </pre>
        <pre className="term-block">
          {liveEnemies.map((e, i) => (
            <Option key={e.id} index={i + 1}
              label={`${labels[i]} (${e.stats.hp}/${e.stats.maxHp} HP)`}
              onClick={() => { doPlayerAction({ type: 'ability', abilityId: selectingTarget, targetId: e.id }); setSelectingTarget(null); }} />
          ))}
          <Option index={0} label="Cancel" onClick={() => setSelectingTarget(null)} color={C.dim} />
        </pre>
      </div>
    );
  }

  // ── Item selection ──
  if (showItems) {
    const consumables = playerEntity.inventory.filter((i) => i.type === 'consumable' && i.quantity > 0);
    return (
      <div className="screen">
        <pre className="term-block">
<Span color={C.dim}>{'  ─── Items ───'}</Span>{'\n'}{'\n'}
        </pre>
        <pre className="term-block">
          {consumables.length === 0 && <Span color={C.dim}>{'  (No consumables)\n'}</Span>}
          {consumables.map((item, i) => (
            <Option key={item.id} index={i + 1}
              label={`${item.name} x${item.quantity}`}
              detail={item.description}
              onClick={() => { doPlayerAction({ type: 'item', itemId: item.id }); setShowItems(false); }} />
          ))}
          <Option index={0} label="Back" onClick={() => setShowItems(false)} color={C.dim} />
        </pre>
      </div>
    );
  }

  const handleAbility = (abilityId: string) => {
    const ability = playerEntity.abilities.find((a) => a.id === abilityId);
    if (!ability) return;
    if (ability.effect.target === 'single_enemy' && liveEnemies.length > 1) {
      setSelectingTarget(abilityId);
    } else {
      doPlayerAction({ type: 'ability', abilityId });
    }
  };

  return (
    <div className="screen">
      {/* ── Turn indicator ── */}
      <pre className="term-block">
        <Span color={isMyTurn ? C.player : C.border} bold>
          {isMyTurn ? '  ═══ YOUR TURN ═══' : '  ═══ COMBAT ═══'}
        </Span>{'\n'}
      </pre>

      {/* ── Battle scene (sprites — only alive enemies) ── */}
      <div className="battle-scene">
        <div className="sprite-row player-sprites">
          <Sprite entityName={playerEntity.name}
            palette={content?.characters.find((c) => c.name === playerEntity.name)?.spriteDescriptor?.palette}
            defeated={playerEntity.stats.hp <= 0} />
        </div>
        <div className="sprite-row enemy-sprites">
          {liveEnemies.map((e) => (
            <Sprite key={e.id} entityName={e.name} palette={e.spriteDescriptor?.palette} />
          ))}
        </div>
      </div>

      {/* ── Entity status with full status descriptions ── */}
      <pre className="term-block">
<Sep />
{allEnemies.map((e, i) => {
  if (e.stats.hp <= 0) return null; // Hide dead enemies
  const label = enemyLabels[i];
  return (
    <span key={e.id}>
{'  '}<Span color={C.enemy} bold>{fit(label, 22)}</Span>
<Span color={C.dim}>Lv{e.level} HP </Span><Bar current={e.stats.hp} max={e.stats.maxHp} width={14} />{'\n'}
{e.statuses.map((s) => (
  <span key={s.id}>{'    '}<Span color={s.type === 'buff' ? C.success : C.hpLow}>{s.name}</Span>
  {' '}<Span color={C.dim}>({s.duration}t) {STATUS_DESCRIPTIONS[s.name] ?? ''}</Span>{'\n'}</span>
))}
    </span>
  );
})}
{'\n'}
{'  '}<Span color={C.player} bold>{fit(playerEntity.name, 22)}</Span>
<Span color={C.dim}>Lv{playerEntity.level} HP </Span><Bar current={playerEntity.stats.hp} max={playerEntity.stats.maxHp} width={14} />{'\n'}
{'  '}<Span color={C.dim}>{fit('', 22)}     MP </Span><Bar current={playerEntity.stats.mp} max={playerEntity.stats.maxMp} width={14} type="mp" />{'\n'}
{playerEntity.statuses.map((s) => (
  <span key={s.id}>{'    '}<Span color={s.type === 'buff' ? C.success : C.hpLow}>{s.name}</Span>
  {' '}<Span color={C.dim}>({s.duration}t) {STATUS_DESCRIPTIONS[s.name] ?? ''}</Span>{'\n'}</span>
))}
      </pre>

      {/* ── Blessing details (always visible) ── */}
      <pre className="term-block">
{'  '}<Span color={C.blessing}>☆ {blessing?.name}</Span>{' '}<Span color={C.dim}>{content?.blessings.player.find((b) => b.id === blessing?.id)?.text ?? ''}</Span>{'\n'}
{combat.bossBlessing && <>
{'  '}<Span color={C.enemy}>⚔ {combat.bossBlessing.name}</Span>{' '}<Span color={C.dim}>{content?.blessings.boss.text ?? ''}</Span>{'\n'}
</>}
      </pre>

      {/* ── Combat log ── */}
      <div className="combat-log" ref={logRef}>
        {combatLog.slice(-12).map((line, i) => {
          if (line === '───') return <div key={i} className="combat-log-separator" />;
          const cls = line.includes('damage') || line.includes('defeated') || line.includes('deals') ? 'damage'
            : line.includes('recover') || line.includes('heal') || line.includes('Regen') ? 'success'
            : line.includes('☆') || line.includes('⚔') || line.includes('undertow') || line.includes('tide') || line.includes('abyss') || line.includes('Blessing') ? 'blessing-text'
            : line.includes('gains') || line.includes('fades') ? 'dim'
            : '';
          return <div key={i} className={`combat-log-entry ${cls}`}>{'  > '}{line}</div>;
        })}
      </div>

      {/* ── Actions ── */}
      <Sep />
      {isMyTurn && !processingTurn && (
        <pre className="term-block">
          {playerEntity.abilities.map((a, i) => {
            const canUse = playerEntity.stats.mp >= a.mpCost
              && !a.lockedForCombat && !(a.currentCooldown && a.currentCooldown > 0);
            const extra = a.lockedForCombat ? ' [LOCKED]' : a.currentCooldown ? ` [CD:${a.currentCooldown}]` : '';
            return (
              <Option key={a.id} index={i + 1}
                label={`${fit(a.name, 22)}${a.mpCost}MP${extra}`}
                detail={a.description}
                onClick={() => handleAbility(a.id)}
                disabled={!canUse} />
            );
          })}
          <Option index={playerEntity.abilities.length + 1} label={`${fit('Defend', 22)}0MP`}
            detail="Restore 8 MP + 5 HP"
            onClick={() => doPlayerAction({ type: 'defend' })} />
          <Option index={playerEntity.abilities.length + 2} label="Items →"
            onClick={() => setShowItems(true)} />
        </pre>
      )}
      {processingTurn && (
        <pre className="term-block">
          <span className="processing-indicator">
            <span className="processing-dot">●</span>{' '}<Span color={C.blessing}>Processing turn...</Span>
          </span>
        </pre>
      )}
    </div>
  );
}
