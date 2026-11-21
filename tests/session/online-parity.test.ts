import { describe, expect, it } from 'vitest';
import { TableSession } from '../../src/session';
import { DEFAULT_SETTINGS} from '../../src/storage';
import { parseTileHand } from '../../src/core/tiles';
import { kongPayment } from '../../src/core/round-score';

import { parityFixture } from './online-parity-fixture';
const humans = { dong: 'human', nan: 'human', xi: 'human', bei: 'human' } as const;

describe('online scoring parity', () => {
  it.each([[false, true], [true, true], [false, false]])('same hand via solo and session (joker %s, Kim match %s)', (joker, enabled) => {
    const { solo, session } = parityFixture(joker, enabled);
    const expected = solo.getHumanActions().selfHuScore!;
    const actual = session.viewFor('dong').legal!.selfHuScore!;
    expect(actual).toBeTruthy(); expect(expected).toBeTruthy();
    expect(actual.totalTay).toBe(expected.totalTay); expect(actual.mode).toBe(expected.mode);
    expect(actual.patterns).toEqual(expected.patterns);
    console.log(`Kim match=${enabled}, joker=${joker}, solo=online=${actual.totalTay} Tay\n` + actual.patterns.map(p => `#${p.id} ${p.name} | ${p.description} | ${p.tay} Tay`).join('\n'));
    solo.humanSelfDrawHu();
    expect(session.apply('dong', { type: 'selfHu', version: session.version }).ok).toBe(true);
    const last = session.viewFor(null).lastHand!;
    expect(last.scoring).toEqual(actual); expect(last.durationSeconds).toBe(50);
    expect(last.payments.totalTay).toBe(expected.totalTay);
    expect(session.viewFor(null).hand).toEqual([]);
  });

  it('keeps frozen legacy settings and publishes completed Kong payments without private hands', () => {
    const s = new TableSession({ settings: { ...DEFAULT_SETTINGS }, seats: humans, seed: 1, now: () => 1000 });
    const data = s.serialize();
    data.payments = [kongPayment('nan', parseTileHand('DZ')[0]!, true)];
    const restored = TableSession.deserialize(data, () => 2000);
    const view = restored.viewFor(null);
    expect(view.settings.scoringBasis).toBe('hand_kim_usage');
    expect(view.liveKong).toEqual(data.payments); expect(view.hand).toEqual([]);
    expect(restored.serialize().options.settings).toEqual(data.options.settings);
  });
});
