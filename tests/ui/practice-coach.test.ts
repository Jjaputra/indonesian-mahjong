import { describe, it, expect } from 'vitest';
import { COACH_BOTS_TEXT, COACH_GAME_OVER_TEXT, practiceCoachLine, type PracticeCoachInput } from '@/ui/practice-coach';

const idle: PracticeCoachInput = {
  canDraw: false,
  canDiscard: false,
  discardableTileIds: [],
  ankongOptions: [],
  kakanOptions: [],
  canSelfDrawHu: false,
  canPaoChin: false,
  canReplaceFlowers: false,
  claim: null,
};

const claim = { canHu: false, canKong: false, canPung: false, jiaOptions: [] as unknown[][] };

describe('practiceCoachLine', () => {
  it('tells the player to Tarik when a draw is due', () => {
    const line = practiceCoachLine({ ...idle, canDraw: true });
    expect(line.emphasis).toBe('tarik');
    expect(line.text).toContain('Tarik');
    expect(line.text).not.toContain('Buang');
  });

  it('asks to lift a tile first when nothing is selected', () => {
    const line = practiceCoachLine({ ...idle, canDiscard: true, discardableTileIds: ['a', 'b'] });
    expect(line.emphasis).toBe('buang');
    expect(line.text).toMatch(/Angkat satu tile/);
    expect(line.text).toContain('Buang');
  });

  it('names the selected tile when it can be discarded', () => {
    const line = practiceCoachLine({
      ...idle,
      canDiscard: true,
      discardableTileIds: ['a', 'b'],
      selectedTileId: 'b',
      selectedTileLabel: '5 Tong',
    });
    expect(line.emphasis).toBe('buang');
    expect(line.text).toContain('5 Tong');
  });

  it('treats a selected non-discardable tile as no selection', () => {
    const line = practiceCoachLine({ ...idle, canDiscard: true, discardableTileIds: ['a'], selectedTileId: 'kim', selectedTileLabel: 'Kim' });
    expect(line.text).not.toContain('Kim');
    expect(line.text).toMatch(/Angkat satu tile/);
  });

  it('puts Hu before Pung in a claim window', () => {
    const line = practiceCoachLine({ ...idle, claim: { ...claim, canHu: true, canPung: true } });
    expect(line.emphasis).toBe('hu');
    expect(line.text).toContain('Hu didahulukan');
    expect(line.text).toContain('Pung');
    expect(line.text).not.toContain('Kong');
    expect(line.text).not.toContain('Jia');
    expect(line.text.indexOf('Hu')).toBeLessThan(line.text.indexOf('Pung'));
  });

  it('mentions only Jia, from the left player, when Jia is the only claim', () => {
    const line = practiceCoachLine({ ...idle, claim: { ...claim, jiaOptions: [[]] } });
    expect(line.emphasis).toBe('jia');
    expect(line.text).toContain('Jia hanya dari pemain di kiri Anda');
    expect(line.text).not.toMatch(/\b(Hu|Pung|Kong)\b/);
    expect(line.text).toContain('Lew');
  });

  it('falls back to Lew when no claim is possible', () => {
    expect(practiceCoachLine({ ...idle, claim }).emphasis).toBe('lew');
  });

  it('ranks a self-draw Hu above Pao Chin, Ankong and Kakan', () => {
    const line = practiceCoachLine({ ...idle, canDiscard: true, canSelfDrawHu: true, canPaoChin: true, ankongOptions: [[]], kakanOptions: [{}] });
    expect(line.emphasis).toBe('hu');
    expect(practiceCoachLine({ ...idle, canDiscard: true, ankongOptions: [[]] }).emphasis).toBe('ankong');
    expect(practiceCoachLine({ ...idle, canDiscard: true, kakanOptions: [{}] }).emphasis).toBe('kakan');
    expect(practiceCoachLine({ ...idle, canDiscard: true, canPaoChin: true }).emphasis).toBe('pao-chin');
  });

  it('points at Ganti Bunga when flowers wait for replacement', () => {
    const line = practiceCoachLine({ ...idle, canReplaceFlowers: true });
    expect(line).toEqual({ text: expect.stringContaining('Ganti Bunga'), emphasis: 'flowers' });
  });

  it('says the bots are playing when nothing is enabled', () => {
    expect(practiceCoachLine({ ...idle, waiting: true })).toEqual({ text: COACH_BOTS_TEXT, emphasis: 'none' });
    expect(COACH_BOTS_TEXT).toBe('Pemain lain sedang mengambil giliran.');
  });

  it('reports the finished hand once there is an outcome', () => {
    const line = practiceCoachLine({ ...idle, canDraw: true, outcome: { kind: 'seri', durationSeconds: 10 } });
    expect(line).toEqual({ text: COACH_GAME_OVER_TEXT, emphasis: 'none' });
    expect(COACH_GAME_OVER_TEXT).toBe('Hasil permainan sudah siap. Permainan Baru membawa Anda kembali ke menu utama.');
  });
});
