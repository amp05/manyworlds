import type { FloorMap, MapNode } from '@manyworlds/shared';
import { SeededRNG, MAP_ROWS, MAP_MIN_COLS, MAP_MAX_COLS } from '@manyworlds/shared';

export function generateMap(rng: SeededRNG): FloorMap {
  const mapRng = rng.fork('map');
  const nodes: MapNode[] = [];
  const edges: [string, string][] = [];

  // Row 0: start node (combat)
  // Rows 1..MAP_ROWS-2: mixed content
  // Row MAP_ROWS-1: boss

  const rowLayouts: MapNode[][] = [];

  // Row 0: single start combat node
  const startNode: MapNode = { id: 'node_0_0', type: 'combat', row: 0, col: 0 };
  rowLayouts.push([startNode]);
  nodes.push(startNode);

  // Middle rows
  let elitePlaced = false;
  let restPlaced = false;
  let secondRestPlaced = false;
  let shopPlaced = false;
  let eventCount = 0;

  for (let row = 1; row < MAP_ROWS - 1; row++) {
    const colCount = mapRng.nextInt(MAP_MIN_COLS, MAP_MAX_COLS);
    const rowNodes: MapNode[] = [];

    for (let col = 0; col < colCount; col++) {
      const nodeId = `node_${row}_${col}`;
      let type: MapNode['type'] = 'combat';

      // Apply constraints — ensure a balanced path with rest opportunities
      if (row === 3 && !restPlaced && col === 0) {
        // First rest at row 3 (after 3 combats)
        type = 'rest';
        restPlaced = true;
      } else if (row >= 3 && row <= 5 && !elitePlaced && col === colCount - 1) {
        type = 'elite';
        elitePlaced = true;
      } else if (row >= MAP_ROWS - 3 && restPlaced && !secondRestPlaced) {
        // Second rest before the boss
        type = 'rest';
        secondRestPlaced = true;
      } else if (!shopPlaced && row >= 2) {
        if (mapRng.roll(0.3)) {
          type = 'shop';
          shopPlaced = true;
        }
      } else if (eventCount < 3 && row >= 2) {
        if (mapRng.roll(0.25)) {
          type = 'event';
          eventCount += 1;
        }
      }

      const node: MapNode = { id: nodeId, type, row, col };
      rowNodes.push(node);
      nodes.push(node);
    }

    rowLayouts.push(rowNodes);
  }

  // Boss row
  const bossNode: MapNode = { id: `node_${MAP_ROWS - 1}_0`, type: 'boss', row: MAP_ROWS - 1, col: 0 };
  rowLayouts.push([bossNode]);
  nodes.push(bossNode);

  // Generate edges: each node in row R connects to 1-2 nodes in row R+1
  for (let row = 0; row < MAP_ROWS - 1; row++) {
    const fromRow = rowLayouts[row];
    const toRow = rowLayouts[row + 1];

    // Ensure every "to" node has at least one incoming edge
    const covered = new Set<string>();

    for (const fromNode of fromRow) {
      // Connect to 1-2 nodes in the next row
      const count = mapRng.roll(0.4) ? 2 : 1;
      const shuffled = mapRng.shuffle(toRow);
      const targets = shuffled.slice(0, Math.min(count, toRow.length));
      for (const target of targets) {
        const edgeKey = `${fromNode.id}->${target.id}`;
        edges.push([fromNode.id, target.id]);
        covered.add(target.id);
      }
    }

    // Ensure any uncovered "to" nodes get at least one connection
    for (const toNode of toRow) {
      if (!covered.has(toNode.id)) {
        const from = mapRng.pick(fromRow);
        edges.push([from.id, toNode.id]);
      }
    }
  }

  return {
    nodes,
    edges,
    startNodeId: startNode.id,
    bossNodeId: bossNode.id,
  };
}

/** Returns the set of node IDs reachable from a given node */
export function getReachableNodes(map: FloorMap, fromId: string): string[] {
  return map.edges
    .filter(([from]) => from === fromId)
    .map(([, to]) => to);
}

/** Returns nodes the player can travel to next (forward-only from current position) */
export function getFrontierNodes(map: FloorMap, visitedIds: string[]): string[] {
  // Only look at the last visited node — enforces linear forward path (like Slay the Spire)
  const visited = new Set(visitedIds);
  const reachable = new Set<string>();

  const lastVisited = visitedIds[visitedIds.length - 1];
  if (lastVisited) {
    for (const nodeId of getReachableNodes(map, lastVisited)) {
      if (!visited.has(nodeId)) reachable.add(nodeId);
    }
  }

  // If nothing visited yet, start from start node
  if (visitedIds.length === 0) {
    reachable.add(map.startNodeId);
  }

  return [...reachable];
}
