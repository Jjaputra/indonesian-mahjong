import { scoringEngine } from '../../src/scoring/scoring-engine';
import { keyToTile, parseTileHand } from '../../src/core/tiles';
import type { GameRules, Meld } from '../../src/core/types';
import type { WinContext } from '../../src/scoring/types';

const defaultRules: GameRules = {
  kimEnabled: true,
  kimDiscardAllowed: false,
  allowKimInMeldClaim: false,
  minHuTay: 5,
};

let passCount = 0;
let failCount = 0;

function runProbe(name: string, fn: () => void) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passCount++;
  } catch (err: any) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failCount++;
    process.exitCode = 1;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

console.log('--- STARTING DYNAMIC PROBE SUITE FOR MILESTONE 3 SCORING ENGINE ---');

// Probe 1: Novel Pure Suited Flush (It Set #18) + Ping Fu (#14) + Bo Kim (#8) + Mun (#43) + Bo Hua Zi (#3)
runProbe('Probe 1: Novel It Set + Ping Fu + Bo Kim + Mun + Bo Hua Zi', () => {
  const hand = parseTileHand('1S 2S 3S 4S 5S 6S 7S 8S 9S 3S 4S 5S 6S');
  const win = keyToTile('6S', 3); // 3rd copy of 6S (1st and 2nd in hand)
  const context: WinContext = {
    winningTile: win,
    isSelfDraw: false,
    isDiscardWin: true,
    isInitialDeal: false,
    isPaoChin: false,
    isRobbingKong: false,
    isSelfRobbingKong: false,
    isKongReplacement: false,
    isDoubleKongReplacement: false,
    seatWind: 'nan',
    roundWind: 'dong',
  };
  const result = scoringEngine.evaluateHand(hand, [], [], context, defaultRules);
  assert(result.isValidHu, 'Should be valid Hu');
  assert(!result.isLewFit, 'Should not be Lew Fit');
  assert(result.mode === 'NK', `Expected NK mode, got ${result.mode}`);
  assert(!result.isWithKim, 'isWithKim should be false');

  const patternIds = result.patterns.map((p) => p.id).sort((a, b) => a - b);
  assert(patternIds.includes(3), 'Should include #3 Bo Hua Zi');
  assert(patternIds.includes(8), 'Should include #8 Bo Kim');
  assert(patternIds.includes(14), 'Should include #14 Ping Fu');
  assert(patternIds.includes(18), 'Should include #18 It Set');
  assert(patternIds.includes(43), 'Should include #43 Mun');
  assert(result.totalTay === 40, `Expected 40 Tay, got ${result.totalTay}`);
});

// Probe 2: Novel Kim Thi (#30) + Tuei Tuei (#15) + Chao It (#17) + Tris Pat (#29) + Ce Mo (#42) + Sam Am Kang (#33)
runProbe('Probe 2: Novel Kim Thi + Tuei Tuei + Chao It + Tris Pat + Ce Mo + Sam Am Kang', () => {
  const hand = parseTileHand('KIM KIM KIM 1T 1T 1T 9T 9T 9T 5T');
  const win = keyToTile('5T', 2);
  const melds: Meld[] = [
    { type: 'pung', tiles: parseTileHand('DP DP DP'), claimedFrom: 'dong' },
  ];
  const context: WinContext = {
    winningTile: win,
    isSelfDraw: true,
    isDiscardWin: false,
    isInitialDeal: false,
    isPaoChin: false,
    isRobbingKong: false,
    isSelfRobbingKong: false,
    isKongReplacement: false,
    isDoubleKongReplacement: false,
    seatWind: 'nan',
    roundWind: 'dong',
  };
  const result = scoringEngine.evaluateHand(hand, melds, [], context, defaultRules);
  assert(result.isValidHu, 'Should be valid Hu');
  assert(result.mode === 'K', `Expected K mode, got ${result.mode}`);
  assert(result.isWithKim, 'isWithKim should be true');

  const patternIds = result.patterns.map((p) => p.id);
  assert(patternIds.includes(7), 'Should include #7 Tile KIM');
  assert(patternIds.includes(30), 'Should include #30 Kim Thi');
  assert(patternIds.includes(15), 'Should include #15 Tuei Tuei');
  assert(patternIds.includes(17), 'Should include #17 Chao It');
  assert(patternIds.includes(29), 'Should include #29 Tris Pat');
  assert(patternIds.includes(33), 'Should include #33 Sam Am Kang (3 concealed triplets)');
  assert(patternIds.includes(42), 'Should include #42 Ce Mo');
  // 3 (Tile KIM) + 30 (Kim Thi) + 5 (Tuei Tuei K) + 5 (Chao It K) + 1 (Tris Pat) + 5 (Sam Am Kang) + 1 (Ce Mo) = 50 Tay
  assert(result.totalTay === 50, `Expected 50 Tay, got ${result.totalTay}`);
});

// Probe 3: Novel Kim Ciok (#32) + Pyong Pi (#40) + Ji Pa Ciok (#31) + Ping Fu (#14) + Ce Mo Pu Ciu Jen (#44)
runProbe('Probe 3: Novel Kim Ciok + Pyong Pi + Ji Pa Ciok + Ping Fu + Ce Mo Pu Ciu Jen', () => {
  const hand = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 2S 3S 4S KIM');
  const win = keyToTile('8S', 1);
  const context: WinContext = {
    winningTile: win,
    isSelfDraw: true,
    isDiscardWin: false,
    isInitialDeal: false,
    isPaoChin: false,
    isRobbingKong: false,
    isSelfRobbingKong: false,
    isKongReplacement: false,
    isDoubleKongReplacement: false,
    seatWind: 'nan',
    roundWind: 'bei',
  };
  const result = scoringEngine.evaluateHand(hand, [], [], context, defaultRules);
  assert(result.isValidHu, 'Should be valid Hu');
  assert(result.mode === 'K', `Expected K mode, got ${result.mode}`);
  const patternIds = result.patterns.map((p) => p.id);
  assert(patternIds.includes(7), 'Should include #7 Tile KIM');
  assert(patternIds.includes(40), 'Should include #40 Pyong Pi');
  assert(patternIds.includes(31), 'Should include #31 Ji Pa Ciok (pair of 8S)');
  assert(patternIds.includes(14), 'Should include #14 Ping Fu');
  assert(patternIds.includes(44), 'Should include #44 Ce Mo Pu Ciu Jen');
  assert(patternIds.includes(3), 'Should include #3 Bo Hua Zi');
  // 1 (Tile KIM) + 5 (Pyong Pi) + 1 (Ji Pa Ciok) + 3 (Ping Fu) + 5 (Ce Mo Pu Ciu Jen) + 3 (Bo Hua Zi) = 18 Tay
  assert(result.totalTay === 18, `Expected 18 Tay, got ${result.totalTay}`);
});

// Probe 4: Novel Lew Fit Gating (< 5 Tay, below-minimum)
runProbe('Probe 4: Novel Lew Fit Gating (< 5 Tay)', () => {
  // Hand with open meld 1T 2T 3T, concealed 4T 5T 6T, 7T 8T 9T, 2S 3S 4S, pair DF DF (Green Dragon)
  // Pair of dragon breaks Ping Fu, resulting in Chicken Hand (0) + Bo Kim (3) = 3 Tay < 5 Tay
  const melds: Meld[] = [
    { type: 'jia', tiles: parseTileHand('1T 2T 3T'), claimedFrom: 'dong' },
  ];
  const hand = parseTileHand('4T 5T 6T 7T 8T 9T 2S 3S 4S DF');
  const win = keyToTile('DF', 2);
  const context: WinContext = {
    winningTile: win,
    isSelfDraw: false,
    isDiscardWin: true,
    isInitialDeal: false,
    isPaoChin: false,
    isRobbingKong: false,
    isSelfRobbingKong: false,
    isKongReplacement: false,
    isDoubleKongReplacement: false,
    seatWind: 'nan',
    roundWind: 'xi',
  };
  const result = scoringEngine.evaluateHand(hand, melds, [], context, defaultRules);
  assert(!result.isValidHu, 'Should be invalid Hu');
  assert(result.isLewFit, 'Should be Lew Fit');
  assert(result.lewFitReason === 'below-minimum', `Expected below-minimum reason, got ${result.lewFitReason}`);
  assert(result.totalTay === 3, `Expected 3 Tay, got ${result.totalTay}`);
  assert(result.rejectionReason!.includes('kurang dari 5 Tay'), 'Rejection reason should mention < 5 Tay');
});

// Probe 5: Novel Lew Fit Structure (invalid hand shape)
runProbe('Probe 5: Novel Lew Fit Structure (invalid hand shape)', () => {
  const hand = parseTileHand('1T 1T 3T 5T 7T 9T 2S 4S 6S 8S 1B 3B 5B');
  const win = keyToTile('7B', 1);
  const context: WinContext = {
    winningTile: win,
    isSelfDraw: false,
    isDiscardWin: true,
    isInitialDeal: false,
    isPaoChin: false,
    isRobbingKong: false,
    isSelfRobbingKong: false,
    isKongReplacement: false,
    isDoubleKongReplacement: false,
    seatWind: 'dong',
    roundWind: 'dong',
  };
  const result = scoringEngine.evaluateHand(hand, [], [], context, defaultRules);
  assert(!result.isValidHu, 'Should be invalid Hu');
  assert(result.isLewFit, 'Should be Lew Fit');
  assert(result.lewFitReason === 'structure', `Expected structure reason, got ${result.lewFitReason}`);
  assert(result.totalTay === 0, `Expected 0 Tay, got ${result.totalTay}`);
  assert(result.patterns.length === 0, 'Patterns should be empty');
});

// Probe 6: Novel Instant Hu Triggers (#6, #9, #34) and Invalid Instant Hu
runProbe('Probe 6: Novel Instant Hu Triggers and Invalid Instant Hu', () => {
  const context: WinContext = {
    winningTile: keyToTile('1T'),
    isSelfDraw: true,
    isDiscardWin: false,
    isInitialDeal: false,
    isPaoChin: false,
    isRobbingKong: false,
    isSelfRobbingKong: false,
    isKongReplacement: false,
    isDoubleKongReplacement: false,
    seatWind: 'dong',
    roundWind: 'dong',
    isInstantHu: true,
  };

  // 6.1: 7 Flowers/Seasons trigger (#6 instant)
  const flowers7 = [
    keyToTile('F1'), keyToTile('F2'), keyToTile('F3'), keyToTile('F4'),
    keyToTile('M1'), keyToTile('M2'), keyToTile('M3'),
  ];
  const r6 = scoringEngine.evaluateHand([], [], flowers7, context, defaultRules);
  assert(r6.isValidHu, '7 flowers instant Hu should be valid');
  assert(r6.isInstantHu, 'isInstantHu should be true');
  assert(r6.totalTay === 10, `Expected 10 Tay for instant #6, got ${r6.totalTay}`);
  assert(r6.patterns.some((p) => p.id === 6), 'Should include #6');

  // 6.2: 4 Kim trigger (#9 instant)
  const hand4Kim = parseTileHand('KIM KIM KIM KIM 1T 2T 3T 4S 5S 6S 7B 8B 9B');
  const r9 = scoringEngine.evaluateHand(hand4Kim, [], [], context, defaultRules);
  assert(r9.isValidHu, '4 Kim instant Hu should be valid');
  assert(r9.isInstantHu, 'isInstantHu should be true');
  assert(r9.totalTay === 10, `Expected 10 Tay for instant #9, got ${r9.totalTay}`);
  assert(r9.patterns.some((p) => p.id === 9), 'Should include #9');

  // 6.3: 4 Concealed Triplet Kinds trigger (#34 instant)
  const hand4Ankang = parseTileHand('1T 1T 1T 2S 2S 2S 3B 3B 3B 4B 4B 4B WD');
  const r34 = scoringEngine.evaluateHand(hand4Ankang, [], [], context, defaultRules);
  assert(r34.isValidHu, '4 concealed triplets instant Hu should be valid');
  assert(r34.isInstantHu, 'isInstantHu should be true');
  assert(r34.totalTay === 10, `Expected 10 Tay for instant #34, got ${r34.totalTay}`);
  assert(r34.patterns.some((p) => p.id === 34), 'Should include #34');

  // 6.4: Invalid instant Hu (no trigger met)
  const handInvalid = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WD WN WX WB');
  const rInvalid = scoringEngine.evaluateHand(handInvalid, [], [], context, defaultRules);
  assert(!rInvalid.isValidHu, 'Invalid instant Hu should not be valid');
  assert(rInvalid.isLewFit, 'Should be Lew Fit');
  assert(rInvalid.lewFitReason === 'instant-invalid', `Expected instant-invalid, got ${rInvalid.lewFitReason}`);
});

// Probe 7: Novel Se Sam Pu Tat (#39, 40 Tay NK + Bo Kim 3 + Ce Mo Pu Ciu Jen 5 = 48 Tay)
runProbe('Probe 7: Novel Se Sam Pu Tat (#39, 48 Tay NK self-draw)', () => {
  const hand = parseTileHand('1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB');
  const win = keyToTile('DZ');
  const context: WinContext = {
    winningTile: win,
    isSelfDraw: true,
    isDiscardWin: false,
    isInitialDeal: false,
    isPaoChin: false,
    isRobbingKong: false,
    isSelfRobbingKong: false,
    isKongReplacement: false,
    isDoubleKongReplacement: false,
    seatWind: 'nan',
    roundWind: 'dong',
  };
  const result = scoringEngine.evaluateHand(hand, [], [], context, defaultRules);
  assert(result.isValidHu, 'Se Sam Pu Tat should be valid Hu');
  assert(result.mode === 'NK', 'Mode should be NK');
  assert(result.patterns.some((p) => p.id === 39), 'Should include #39 Se Sam Pu Tat');
  assert(result.patterns.some((p) => p.id === 8), 'Should include #8 Bo Kim');
  assert(result.patterns.some((p) => p.id === 44), 'Should include #44 Ce Mo Pu Ciu Jen');
  assert(result.totalTay === 48, `Expected 48 Tay, got ${result.totalTay}`);
});

// Probe 8: Novel Kong Kong Hu (#38) vs Kong Song Hu/Mo (#37)
runProbe('Probe 8: Novel Kong Kong Hu vs Kong Song Hu/Mo', () => {
  const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 5S');
  const win = keyToTile('5S', 3);
  const melds: Meld[] = [
    { type: 'kong', tiles: parseTileHand('1S 1S 1S 1S'), claimedFrom: 'dong' },
  ];

  // 8.1: Single kong replacement
  const ctxSingle: WinContext = {
    winningTile: win,
    isSelfDraw: true,
    isDiscardWin: false,
    isInitialDeal: false,
    isPaoChin: false,
    isRobbingKong: false,
    isSelfRobbingKong: false,
    isKongReplacement: true,
    isDoubleKongReplacement: false,
    seatWind: 'nan',
    roundWind: 'dong',
  };
  const rSingle = scoringEngine.evaluateHand(hand, melds, [], ctxSingle, defaultRules);
  assert(rSingle.isValidHu, 'Single kong replacement Hu should be valid');
  assert(rSingle.patterns.some((p) => p.id === 37), 'Should include #37 Kong Song Hu/Mo');
  assert(!rSingle.patterns.some((p) => p.id === 38), 'Should NOT include #38 Kong Kong Hu');

  // 8.2: Double kong replacement
  const ctxDouble: WinContext = {
    ...ctxSingle,
    isDoubleKongReplacement: true,
  };
  const rDouble = scoringEngine.evaluateHand(hand, melds, [], ctxDouble, defaultRules);
  assert(rDouble.isValidHu, 'Double kong replacement Hu should be valid');
  assert(rDouble.patterns.some((p) => p.id === 38), 'Should include #38 Kong Kong Hu');
  assert(!rDouble.patterns.some((p) => p.id === 37), 'Should NOT include #37 Kong Song Hu/Mo');
  assert(rDouble.patterns.find((p) => p.id === 38)!.tay === 30, 'Kong Kong Hu should be 30 Tay');
});

console.log(`--- PROBES SUMMARY: ${passCount} PASSED, ${failCount} FAILED ---`);
