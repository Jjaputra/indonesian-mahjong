import { TableSession } from '../../src/session';
import { DEFAULT_SETTINGS, MemoryStorage, practiceScoringSettings, withPracticeScoringDefaults } from '../../src/storage';
import { parseTileHand } from '../../src/core/tiles';
import { GameController } from '../../src/ui/game-controller';

const humans = { dong: 'human', nan: 'human', xi: 'human', bei: 'human' } as const;
export function parityFixture(joker = false, enabled = true) {
  const settings = { ...practiceScoringSettings({ ...DEFAULT_SETTINGS }), kimEnabled: enabled, kimMode: enabled ? 'dedicated' as const : 'off' as const };
  const soloSettings = withPracticeScoringDefaults({ ...DEFAULT_SETTINGS, kimEnabled: enabled, kimMode: settings.kimMode }, new MemoryStorage());
  const solo = new GameController({ settings: soloSettings, seed: 1, now: () => 1000, saveHistory: false });
  const session = new TableSession({ settings, seats: humans, seed: 1, now: () => 1000 });
  const data = session.serialize();
  const hand = parseTileHand(`1T 1T 1T 5S 5S 5S 9B 9B ${joker ? 'KIM' : '9B'} 3T 3T 3T 7S 7S`);
  for (const state of [data.state, solo.getState()]) {
    Object.assign(state, { phase: 'ACTION_DECISION', currentTurn: 'dong', selfDrawSeat: 'dong', turnCount: 8 });
    state.players.dong.hand = structuredClone(hand); state.players.dong.melds = []; state.players.dong.flowers = [];
  }
  const restored = TableSession.deserialize(data, () => 51000);
  return { solo, session: restored };
}

