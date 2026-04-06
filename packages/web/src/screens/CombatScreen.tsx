import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../state/game.js';
import { isPlayerTurn } from '@manyworlds/engine';
import { Sprite } from '../components/Sprite.js';
import { Span, Bar, Option, Sep, C, TERM_WIDTH, fit } from '../components/Terminal.js';

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

  const enemies = combat.entities.filter((e) => !e.isPlayer && e.stats.hp > 0);
  const allEnemies = combat.entities.filter((e) => !e.isPlayer);
  const playerEntity = combat.entities.find((e) => e.isPlayer)!;
  const isMyTurn = isPlayerTurn(combat) && combat.status === 'active';

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
            <Option
              index={1}
              label={pendingLevelUp ? 'Choose Ability' : 'Continue'}
              onClick={pendingLevelUp ? () => useGameStore.setState({ phase: 'level_up' }) : returnToMap}
              color={C.title}
            />
          </pre>
        </div>
      );
    }
    return null;
  }

  // ── Target selection ──
  if (selectingTarget) {
    return (
      <div className="screen">
        <pre className="term-block">
<Span color={C.dim}>{'  ─── Choose Target ───'}</Span>{'\n'}{'\n'}
        </pre>
        <pre className="term-block">
          {enemies.map((e, i) => (
            <Option key={e.id} index={i + 1} label={`${e.name} (${e.stats.hp}/${e.stats.maxHp} HP)`}
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
    if (ability.effect.target === 'single_enemy' && enemies.length > 1) {
      setSelectingTarget(abilityId);
    } else {
      doPlayerAction({ type: 'ability', abilityId });
    }
  };

  return (
    <div className="screen">
      {/* ── Battle scene (sprites) ── */}
      <div className="battle-scene">
        <div className="sprite-row player-sprites">
          <Sprite entityName={playerEntity.name}
            palette={content?.characters.find((c) => c.name === playerEntity.name)?.spriteDescriptor?.palette}
            defeated={playerEntity.stats.hp <= 0} />
        </div>
        <div className="sprite-row enemy-sprites">
          {allEnemies.map((e) => (
            <Sprite key={e.id} entityName={e.name} palette={e.spriteDescriptor?.palette}
              defeated={e.stats.hp <= 0} />
          ))}
        </div>
      </div>

      {/* ── Entity status (terminal-style) ── */}
      <pre className="term-block">
<Sep />
{allEnemies.map((e) => {
  const statuses = e.statuses.map((s) => s.name.slice(0, 4)).join(' ');
  return (
    <span key={e.id} style={{ opacity: e.stats.hp <= 0 ? 0.3 : 1 }}>
{'  '}<Span color={C.enemy} bold>{fit(e.name, 20)}</Span>
<Span color={C.dim}>Lv{e.level} </Span>
<Span color={C.dim}>HP </Span><Bar current={Math.max(0, e.stats.hp)} max={e.stats.maxHp} width={14} />
{statuses ? <Span color={C.info}>{` ${statuses}`}</Span> : ''}{'\n'}
    </span>
  );
})}
{'\n'}
{'  '}<Span color={C.player} bold>{fit(playerEntity.name, 20)}</Span>
<Span color={C.dim}>Lv{playerEntity.level} </Span>
<Span color={C.dim}>HP </Span><Bar current={playerEntity.stats.hp} max={playerEntity.stats.maxHp} width={14} />
{'\n'}
{'  '}<Span color={C.dim}>{fit('', 20)}</Span>
<Span color={C.dim}>     </Span>
<Span color={C.dim}>MP </Span><Bar current={playerEntity.stats.mp} max={playerEntity.stats.maxMp} width={14} type="mp" />
{playerEntity.statuses.length > 0 ? (
  <>{' '}<Span color={C.info}>{playerEntity.statuses.map((s) => s.name.slice(0, 4)).join(' ')}</Span></>
) : ''}{'\n'}
      </pre>

      {/* ── Blessing details (always visible) ── */}
      <pre className="term-block">
{'  '}<Span color={C.blessing}>☆ {blessing?.name ?? ''}</Span>{'\n'}
{'  '}<Span color={C.dim}>{content?.blessings.player.find((b) => b.id === blessing?.id)?.text ?? ''}</Span>{'\n'}
{combat.bossBlessing && <>
{'  '}<Span color={C.enemy}>⚔ {combat.bossBlessing.name}</Span>{'\n'}
{'  '}<Span color={C.dim}>{content?.blessings.boss.text ?? ''}</Span>{'\n'}
</>}
      </pre>

      {/* ── Combat log ── */}
      <div className="combat-log" ref={logRef}>
        {combatLog.slice(-12).map((line, i) => {
          if (line === '───') return <div key={i} className="combat-log-separator" />;
          const cls = line.includes('damage') || line.includes('defeated') ? 'damage'
            : line.includes('recover') || line.includes('heal') || line.includes('Regen') ? 'success'
            : line.includes('☆') || line.includes('⚔') || line.includes('Blessing') || line.includes('tide') || line.includes('abyss') ? 'blessing-text'
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
                detail={a.description.slice(0, 28)}
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
            <span className="processing-dot">●</span>{' '}<Span color={C.blessing}>The blessing stirs...</Span>
          </span>
        </pre>
      )}
    </div>
  );
}
