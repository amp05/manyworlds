import { useGameStore } from '../state/game.js';
import { getFrontierNodes } from '@manyworlds/engine';
import { MapGraph } from '../components/MapGraph.js';
import { Header, Span, Bar, Sep, C } from '../components/Terminal.js';

export function MapScreen() {
  const { content, player, gold, visitedNodeIds, navigateToNode, blessing } = useGameStore();
  if (!content || !player) return null;

  const frontier = getFrontierNodes(content.map, visitedNodeIds);

  return (
    <div className="screen">
      <pre className="term-block">
<Sep char="═" />
<Span color={C.title} bold>{'  '}{content.world.name}</Span>{'\n'}
<Sep char="═" />
{'\n'}
{'  '}<Span color={C.player} bold>{player.name}</Span> <Span color={C.dim}>Lv{player.level}</Span>{'\n'}
{'  '}<Span color={C.dim}>HP </Span><Bar current={player.stats.hp} max={player.stats.maxHp} width={16} />{'\n'}
{'  '}<Span color={C.dim}>MP </Span><Bar current={player.stats.mp} max={player.stats.maxMp} width={16} type="mp" />{'\n'}
{'  '}<Span color={C.gold}>Gold: {gold}</Span>{'  '}<Span color={C.info}>EXP: {player.exp}</Span>{'\n'}
{'  '}<Span color={C.blessing}>* {blessing?.name}</Span>{'\n'}
{'\n'}
      </pre>

      <MapGraph
        map={content.map}
        visitedNodeIds={visitedNodeIds}
        frontierNodeIds={frontier}
        onSelectNode={navigateToNode}
      />

      <pre className="term-block">
{'\n'}
<Span color={C.dim}>  Click a glowing node to proceed.</Span>{'\n'}
      </pre>
    </div>
  );
}
