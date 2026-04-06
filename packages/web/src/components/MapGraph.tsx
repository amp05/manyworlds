import type { FloorMap, MapNode } from '@manyworlds/shared';

interface MapGraphProps {
  map: FloorMap;
  visitedNodeIds: string[];
  frontierNodeIds: string[];
  onSelectNode: (nodeId: string) => void;
}

const NODE_COLORS: Record<string, string> = {
  combat: '#d4c5a9',
  elite: '#ffaa44',
  boss: '#ff4444',
  rest: '#44ff88',
  shop: '#ffcc44',
  event: '#cc88ff',
};

const NODE_ICONS: Record<string, string> = {
  combat: '⚔',
  elite: '☠',
  boss: '👑',
  rest: '♥',
  shop: '$',
  event: '?',
};

export function MapGraph({ map, visitedNodeIds, frontierNodeIds, onSelectNode }: MapGraphProps) {
  // Group nodes by row
  const rowMap = new Map<number, MapNode[]>();
  for (const node of map.nodes) {
    const row = rowMap.get(node.row) ?? [];
    row.push(node);
    rowMap.set(node.row, row);
  }
  const rows = [...rowMap.entries()].sort((a, b) => b[0] - a[0]); // top = highest row (boss)

  const maxCols = Math.max(...[...rowMap.values()].map((r) => r.length));
  const svgWidth = Math.max(320, maxCols * 80 + 40);
  const svgHeight = rows.length * 64 + 40;
  const rowSpacing = 64;
  const yOffset = 30;

  // Calculate positions
  const positions: Record<string, { x: number; y: number }> = {};
  for (const [rowIdx, rowNodes] of rows) {
    const maxRow = rows[0][0];
    const y = (maxRow - rowIdx) * rowSpacing + yOffset;
    const spacing = svgWidth / (rowNodes.length + 1);
    rowNodes.forEach((node, i) => {
      positions[node.id] = { x: spacing * (i + 1), y };
    });
  }

  const visited = new Set(visitedNodeIds);
  const frontier = new Set(frontierNodeIds);
  const currentNodeId = visitedNodeIds[visitedNodeIds.length - 1];

  return (
    <div className="map-graph-container">
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
        {/* Connection lines */}
        {map.edges.map(([fromId, toId], i) => {
          const from = positions[fromId];
          const to = positions[toId];
          if (!from || !to) return null;
          const isWalked = visited.has(fromId) && visited.has(toId);
          return (
            <line
              key={i}
              x1={from.x} y1={from.y}
              x2={to.x} y2={to.y}
              stroke={isWalked ? '#5a5070' : '#2a2030'}
              strokeWidth={isWalked ? 2 : 1}
              strokeDasharray={isWalked ? undefined : '4 3'}
            />
          );
        })}

        {/* Nodes */}
        {map.nodes.map((node) => {
          const pos = positions[node.id];
          if (!pos) return null;
          const isVisited = visited.has(node.id);
          const isFrontier = frontier.has(node.id);
          const isCurrent = node.id === currentNodeId;
          const color = NODE_COLORS[node.type] ?? '#d4c5a9';
          const icon = NODE_ICONS[node.type] ?? '?';

          const r = node.type === 'boss' ? 22 : 18;

          return (
            <g
              key={node.id}
              onClick={() => isFrontier && onSelectNode(node.id)}
              style={{ cursor: isFrontier ? 'pointer' : 'default' }}
            >
              {/* Glow for frontier nodes */}
              {isFrontier && (
                <circle
                  cx={pos.x} cy={pos.y} r={r + 4}
                  fill="none" stroke={color} strokeWidth={1}
                  opacity={0.4}
                >
                  <animate attributeName="r" values={`${r + 2};${r + 6};${r + 2}`}
                    dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.4;0.1;0.4"
                    dur="2s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Current position indicator */}
              {isCurrent && (
                <circle cx={pos.x} cy={pos.y} r={r + 6}
                  fill="none" stroke="#44ddff" strokeWidth={2} opacity={0.6}>
                  <animate attributeName="opacity" values="0.6;0.2;0.6" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Node circle */}
              <circle
                cx={pos.x} cy={pos.y} r={r}
                fill={isCurrent ? '#1a2a3a' : isVisited ? '#1a1a2e' : isFrontier ? '#1a1030' : '#12121a'}
                stroke={isCurrent ? '#44ddff' : isFrontier ? '#ff9944' : isVisited ? '#4a4060' : color}
                strokeWidth={isCurrent ? 2.5 : isFrontier ? 2.5 : 1.5}
                opacity={isVisited && !isFrontier && !isCurrent ? 0.5 : 1}
              />

              {/* Icon */}
              <text
                x={pos.x} y={pos.y + 5}
                fill={isVisited ? '#6a6a6a' : color}
                textAnchor="middle"
                fontSize={node.type === 'boss' ? 16 : 14}
                fontFamily="monospace"
              >
                {icon}
              </text>

              {/* Label below for frontier/boss */}
              {(isFrontier || node.type === 'boss') && (
                <text
                  x={pos.x} y={pos.y + r + 14}
                  fill={isFrontier ? '#d4c5a9' : '#7a6a5a'}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily="monospace"
                >
                  {node.type.toUpperCase()}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="map-legend">
        {Object.entries(NODE_ICONS).map(([type, icon]) => (
          <span key={type} className="legend-item">
            <span style={{ color: NODE_COLORS[type] }}>{icon}</span>
            <span className="dim"> {type} </span>
          </span>
        ))}
      </div>
    </div>
  );
}
