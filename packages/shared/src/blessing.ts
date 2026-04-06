import type { BlessingTrigger, TriggerContext } from './blessing-triggers.js';
import type { Entity } from './types.js';

export interface BlessingRuntime {
  id: string;
  name: string;
  text: string;
  triggers: BlessingTrigger[];
  blessingParams: {
    nTurns?: number | null;
    hpThreshold?: number | null;
  };
  state: Record<string, unknown>;
  owner: 'player' | 'boss';
  visualEffect?: string;
}

export interface AdjudicationRequest {
  blessingId: string;
  blessingText: string;
  blessingState: Record<string, unknown>;
  triggerContext: TriggerContext;
  gameState: {
    entities: Entity[];
    turnNumber: number;
    currentEntityId: string;
    combatLog: string[];  // human-readable history
  };
}

export interface StateDelta {
  entityId: string;
  hpChange?: number;
  mpChange?: number;
  statChanges?: Partial<Entity['stats']>;
  addStatus?: import('./types.js').StatusEffect;
  removeStatusId?: string;
  preventAction?: boolean;
  grantInvulnerability?: number;  // turns of invulnerability
}

export interface AdjudicationResponse {
  stateDelta: StateDelta[];
  blessingState: Record<string, unknown>;
  narration: string;
  noEffect?: boolean;  // blessing had no effect this trigger
}
