import type { GameRules, Seat, Tile, Wind } from '../core/types';
import { chooseClaim, chooseDiscardTile } from './heuristics';
import { DEFAULT_AI_RULES, type AIDecision, type AIDifficulty, type AIPublicInfo, type IAIEngine, type PlayerStateView } from './types';

/**
 * Deterministic Easy / Normal / Hard opponent.
 * Reads only the caller's PlayerState plus public discards, visible melds and flowers, and the rules.
 */
export class AIPlayer implements IAIEngine {
  constructor(private readonly defaultRules: GameRules = DEFAULT_AI_RULES) {}

  chooseDiscard(
    player: PlayerStateView,
    publicDiscards: Tile[],
    roundWind: Wind,
    difficulty: AIDifficulty,
    rules?: GameRules,
    publicInfo?: AIPublicInfo,
  ): Tile {
    return chooseDiscardTile(player, publicDiscards, roundWind, difficulty, rules ?? this.defaultRules, publicInfo);
  }

  evaluateClaim(
    player: PlayerStateView,
    discardedTile: Tile,
    fromSeat: Seat,
    publicDiscards: Tile[],
    roundWind: Wind,
    difficulty: AIDifficulty,
    rules: GameRules,
    publicInfo?: AIPublicInfo,
  ): AIDecision {
    return chooseClaim(player, discardedTile, fromSeat, publicDiscards, roundWind, difficulty, rules, publicInfo);
  }
}

export function createAIPlayer(rules?: Partial<GameRules>): AIPlayer {
  return new AIPlayer({ ...DEFAULT_AI_RULES, ...rules });
}
