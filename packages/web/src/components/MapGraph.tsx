import type { FloorMap, MapNode } from '@manyworlds/shared';
import { Span, C } from './Terminal.js';

interface MapGraphProps {
  map: FloorMap;
  visitedNodeIds: string[];
  frontierNodeIds: string[];
  onSelectNode: (nodeId: string) => void;
}

const NODE_LABELS: Record<string, string> = {
  combat: 'COMBAT',
  elite: 'ELITE!',
  boss: '-BOSS-',
  rest: ' REST ',
  shop: ' SHOP ',
  event: 'EVENT?',
};

const NODE_COLORS: Record<string, string> = {
  combat: C.fg,
  elite: C.warning,
  boss: C.hpLow,
  rest: C.success,
  shop: C.gold,
  event: C.blessing,
};

export function MapGraph({ map, visitedNodeIds, frontierNodeIds, onSelectNode }: MapGraphProps) {
  const visited = new Set(visitedNodeIds);
  const frontier = new Set(frontierNodeIds);
  const currentNodeId = visitedNodeIds[visitedNodeIds.length - 1];

  // Group nodes by row
  const rowMap = new Map<number, MapNode[]>();
  for (const node of map.nodes) {
    const row = rowMap.get(node.row) ?? [];
    row.push(node);
    rowMap.set(node.row, row);
  }
  const rows = [...rowMap.entries()].sort((a, b) => b[0] - a[0]); // top = boss

  // Build edge lookup: for each node, which nodes in the next row does it connect to?
  const edgesFrom = new Map<string, Set<string>>();
  for (const [from, to] of map.edges) {
    const s = edgesFrom.get(from) ?? new Set();
    s.add(to);
    edgesFrom.set(from, s);
  }

  // Render each row as a line of ASCII nodes with connections
  const maxCols = Math.max(...[...rowMap.values()].map((r) => r.length));
  const cellWidth = 10; // chars per node cell

  return (
    <pre className="term-block" style={{ lineHeight: '1.3' }}>
      {rows.map(([rowIdx, rowNodes], ri) => {
        // Pad to center nodes
        const padding = Math.floor((maxCols - rowNodes.length) / 2) * cellWidth;
        const padStr = ' '.repeat(Math.max(0, padding));

        // Render the node line
        const nodeLine = rowNodes.map((node) => {
          const isVisited = visited.has(node.id);
          const isFrontier = frontier.has(node.id);
          const isCurrent = node.id === currentNodeId;
          const label = NODE_LABELS[node.type] ?? node.type.toUpperCase();
          const color = NODE_COLORS[node.type] ?? C.fg;

          if (isCurrent) {
            // Current position: bright highlighted box
            return (
              <span key={node.id}>
                <Span color={C.player} bold>{'['}{label}{']'}</Span>
                {'  '}
              </span>
            );
          } else if (isFrontier) {
            // Clickable frontier node
            return (
              <span
                key={node.id}
                className="term-option"
                style={{ cursor: 'pointer', display: 'inline' }}
                onClick={() => onSelectNode(node.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelectNode(node.id); }}
              >
                <Span color={color} bold>{'['}{label}{']'}</Span>
                {'  '}
              </span>
            );
          } else if (isVisited) {
            return (
              <span key={node.id}>
                <Span color={C.dim}>{' '}{label}{' '}</Span>
                {'  '}
              </span>
            );
          } else {
            return (
              <span key={node.id}>
                <Span color={C.border}>{' '}{label}{' '}</Span>
                {'  '}
              </span>
            );
          }
        });

        // Render connection lines to the next row (below this one, since we render top-down)
        const nextRow = ri < rows.length - 1 ? rows[ri + 1] : null;
        let connLine: React.ReactNode = null;
        if (nextRow) {
          const [, nextNodes] = nextRow;
          const nextPadding = Math.floor((maxCols - nextNodes.length) / 2) * cellWidth;

          // Simple connection: draw | under each node that connects down
          const connChars: string[] = [];
          const lineWidth = Math.max(maxCols * cellWidth, 40);
          for (let c = 0; c < lineWidth; c++) connChars.push(' ');

          for (const node of rowNodes) {
            const nodeCol = rowNodes.indexOf(node);
            const nodeCenter = padding + nodeCol * cellWidth + 4;
            const targets = edgesFrom.get(node.id);
            if (!targets) continue;

            for (const targetId of targets) {
              const targetNode = nextNodes.find((n) => n.id === targetId);
              if (!targetNode) continue;
              const targetCol = nextNodes.indexOf(targetNode);
              const targetCenter = nextPadding + targetCol * cellWidth + 4;

              if (nodeCenter === targetCenter) {
                connChars[nodeCenter] = '|';
              } else if (nodeCenter < targetCenter) {
                connChars[nodeCenter] = '\\';
                for (let c = nodeCenter + 1; c < targetCenter; c++) {
                  if (connChars[c] === ' ') connChars[c] = '-';
                }
              } else {
                connChars[targetCenter] = '/';
                for (let c = targetCenter + 1; c < nodeCenter; c++) {
                  if (connChars[c] === ' ') connChars[c] = '-';
                }
              }
            }
          }
          const isWalked = rowNodes.some((n) => visited.has(n.id));
          connLine = (
            <Span color={isWalked ? C.dim : C.border}>
              {connChars.join('').trimEnd()}
            </Span>
          );
        }

        return (
          <span key={rowIdx}>
            {padStr}{nodeLine}{'\n'}
            {connLine && <>{connLine}{'\n'}</>}
          </span>
        );
      })}
      {'\n'}
      <Span color={C.dim}>{'  Click a highlighted node to proceed.'}</Span>{'\n'}
      {'\n'}
      <Span color={C.dim}>{'  '}</Span>
      <Span color={C.fg}>COMBAT</Span>{'  '}
      <Span color={C.warning}>ELITE!</Span>{'  '}
      <Span color={C.success}> REST </Span>{'  '}
      <Span color={C.gold}> SHOP </Span>{'  '}
      <Span color={C.blessing}>EVENT?</Span>{'  '}
      <Span color={C.hpLow}>-BOSS-</Span>{'\n'}
    </pre>
  );
}
