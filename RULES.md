# Rules: what the game implements, and on what evidence

Source of truth: **BANDUNG MAHJONG CUP RULEBOOK ver06** (PDF, 20 pages, read in full). Page numbers below are PDF page numbers. The tournament rules themselves are on pp. 5, 7–12; the remaining pages cover schedule, registration, etiquette, prizes and contacts.

The rulebook is a tournament guide. It names ITM / YDSP "revisi 5 tahun 2026" as the underlying ruleset (p. 11, §5.4) but does not reproduce it. Anything the PDF does not state is marked **assumption** or **unresolved** below. Notes in `.agents/teamwork` are secondary: several record guesses as if they were confirmed.

This game does **not** claim full conformity with ITM/YDSP. Kim is chosen as a random natural face each hand, which players confirmed is acceptable (see Kim model below).

## 1. Confirmed by the PDF

| Rule | Page | Implementation |
|---|---|---|
| Variant: ITM / YDSP rules, with the tournament changes below | p. 7 §4, p. 8 §5.1, p. 11 §5.3–5.4 | Tournament preset |
| Minimum Hu is 5 Tay | p. 7 §4, p. 8 §5.1 | `minHuTay: 5` (editable) |
| Kim / joker may not be discarded | p. 7 §4, p. 11 §5.3 | `kimDiscardAllowed: false` in the tournament preset |
| No dead wall: the wall is played until it is empty | p. 7 §4 | Default: no dead wall; optional practice reserve of 14 tiles, including replacement draws |
| Empty wall = Seri (draw); the game still counts and seat winds do not rotate | p. 7 §4 | Seri outcome, `DRAW_SERI` phase |
| Table winner = most Hu (each at least 5 Tay); a tie goes to whoever reached that count first | p. 7 §4, p. 12 §6 | Superseded by player answers 2026-11-12: total Tay, then valid Hu, then first to final Tay; practice may lower the minimum |
| A replacement player cannot Hu | p. 5 §3.2, p. 11 §5.2 | Tournament admin, not modelled |
| DAFTAR TAY, 44 rows, two columns "Ada KIM" / "Tidak ada KIM" | pp. 8–10 | `src/scoring/patterns.ts`; pinned by `tests/scoring/rulebook-columns.test.ts` |
| Penalti 1–4 are all "Lew Fit": wrong tile count, wrong Jia/Pung, Jia/Pung using Kim, Hu below 5 Tay | p. 10 | `LewFitReason` `structure`, `kim-claim`, `below-minimum` |
| Anything not written down is decided by the Judges | p. 10 | n/a |

### DAFTAR TAY (pp. 8–10)

Values are `Ada KIM / Tidak ada KIM`; `—` means the cell is blank. Column placement of single values was checked from text x-positions in the PDF (Ada KIM ≈ 491 pt, Tidak ada KIM ≈ 521 pt), because plain text extraction loses the columns.

| # | Name | K / NK | Page | Notes |
|---|---|---|---|---|
| 1 | Tile Bunga | 0 / 0 | 8 | "sesuai posisi duduk +1"; see §3 flowers (Bunga hitam: 0 base, +1 seat match) |
| 2 | Tile Musim | 1 / 1 | 8 | "sesuai posisi duduk +1"; see §3 flowers (Musim merah: 1 base, +1 seat match) |
| 3 | Bo Hua Zi | 3 / 3 | 8 | No flower, season, wind or dragon |
| 4 | 4 Tiles Bunga | 10 / 10 | 8 | |
| 5 | 4 Tiles Musim | 20 / 20 | 8 | |
| 6 | 7 Tiles Bunga/Musim | 30 / 30 | 8 | Immediate Hu without a finished hand = 10 Tay |
| 7 | Tile KIM | 1 / — | 8 | Value in the Ada KIM column |
| 8 | Bo KIM | — / 3 | 8 | No Kim, or every Kim used at its own face; house rule +3 in both columns (player feedback 2026-11-12) |
| 9 | Shi Kim | 40 / — | 8 | Immediate Hu = 10 Tay |
| 10 | Pao Chin | 20 / 30 | 8 | Must be declared; still counts if Thi Fu does not happen |
| 11 | Thien Fu | 40 / 60 | 8 | Opening hand Hu, posisi Dong only |
| 12 | Thi Fu | 40 / 60 | 8 | "Hu dari hasil lew atau discard pertama (diawali dengan declare Pao Chin)"; see §2 |
| 13 | Chicken Hand | 0 / 0 | 8 | |
| 14 | Ping Fu | 3 / 3 | 9 | Dragon, seat-wind or prevailing-wind pair disqualifies; other winds allowed (player answers 2026-11-12) |
| 15 | Tuei Tuei | 5 / 10 | 9 | Any pair allowed; pair never disqualifies (player answer 2026-11-12 'B') |
| 16 | Tjit Tuei | 10 / 20 | 9 | |
| 17 | Chao It | 5 / 10 | 9 | |
| 18 | It Set | 20 / 30 | 9 | |
| 19 | Yau Kiu | 30 / 40 | 9 | Suited 1 and 9 only |
| 20 | Cap Sa Yau Kiu | 40 / 60 | 9 | |
| 21 | Siau San Yen | 10 / 20 | 9 | |
| 22 | Ta San Yen | 30 / 40 | 9 | |
| 23 | Siau Se Si | 30 / 40 | 9 | |
| 24 | Ta Se Si | 50 / 60 | 9 | |
| 25 | Tris Angin Duduk | 1 / 1 | 9 | |
| 26 | Tris Angin Putaran | 1 / 1 | 9 | |
| 27 | Tris Zhong | 2 / 2 | 9 | |
| 28 | Tris Fat | 1 / 1 | 9 | |
| 29 | Tris Pat | 1 / 1 | 9 | |
| 30 | Kim Thi | 30 / — | 9 | Value in the Ada KIM column |
| 31 | Ji Pa Ciok | 1 / 1 | 9 | Text says only "Angka 2 atau 8"; the pair reading is an assumption |
| 32 | Kim Ciok | 20 / — | 9 | Value in the Ada KIM column |
| 33 | Sam Am Kang | 5 / 5 | 9 | |
| 34 | Si Am Kang | 20 / 30 | 9 | Immediate Hu = 10 Tay |
| 35 | Chiong Kong | 5 / 5 | 9 | |
| 36 | Ce Chiong Kong | 5 / 5 | 9 | See §4 gaps |
| 37 | Kong Song Hu/Mo | 5 / 5 | 9 | |
| 38 | Kong Kong Hu | 30 / 30 | 9 | |
| 39 | Se Sam Pu Tat | printed 40 / — | 9 | **Column conflict**, see §2; placement depends on the scoring basis |
| 40 | Pyong Pi | 5 / — | 9 | Value in the Ada KIM column; last tile from the wall |
| 41 | Tan Tiau | 5 / 5 | 9 | |
| 42 | Ce Mo | 1 / 1 | 9 | Open hand, self-draw |
| 43 | Mun | 1 / 1 | 10 | Concealed hand, win on an opponent's discard. Verified 1/1 in both the table and the engine |
| 44 | Ce Mo Pu Ciu Jen | 5 / 5 | 10 | Concealed hand, self-draw |

## 2. Decisions on conflicting or unclear rows

**#39 Se Sam Pu Tat column conflict: confirmed (research decision 2026-11-12).** The printed 40 sits under Ada KIM although the row explicitly requires "tidak ada kim". This is a layout error: every valid Se Sam Pu Tat scores 40 in either match choice and either scoring basis, including all-natural Kim interpretations. Joker use, flowers and seasons still invalidate this shape; a Kim-off match no longer loses #39 or becomes Lew Fit merely because the printed NK cell is blank. `PRINTED_PLACEMENT` preserves the PDF evidence; `tableTay` applies the correction.

**#12 Thi Fu: confirmed (research decision 2026-11-12).** Thi Fu is the Hokkien reading of 地胡 (tē-hô). Standard 地胡 is a non-dealer's first wall self-draw with no prior calls; 人胡 is a win on the dealer's first discard ([地糊 background](https://zh.wikipedia.org/wiki/地糊)). The PDF's "hasil lew atau discard pertama" covers both: the first self-draw and the existing first-round discard case, each requiring a declared Pao Chin. The live first-go-around window closes after calls or later turns. Thi Fu awards 40 K / 60 NK and supersedes Pao Chin under the exclusive policy; without Thi Fu, Pao Chin remains. Thien Fu still belongs only to the dealer's untouched dealt hand.

**#33/#34 Sam Am Kang / Si Am Kang: confirmed (research decision 2026-11-12).** These names mean 三暗刻 / 四暗刻. The standard definition says "铳和得到的刻子记作明刻" ([Moegirl 四暗刻](https://zh.moegirl.org.cn/麻将/番种/四暗刻)): a triplet completed by the winning discard is exposed for counting concealed triplets. A discard completing the pair leaves all triplets concealed, as does self-draw completion. Identical copies can take different roles; when the winning face can complete a concealed sequence or pair instead, the scorer uses the highest-total-Tay interpretation, independently of physical copy IDs.

**#36 Ce Chiong Kong: confirmed from row text (research decision 2026-11-12).** The player must already have an exposed Pung of X, self-draw the fourth X as the winning tile, and use it inside a concealed sequence in the winning decomposition. "seri harus ada di dalam" requires the sequence to be concealed; "harus ce mo" requires self-draw. `buildWinContext` derives the exposed-Pung opportunity from candidate melds; the scorer validates the winning decomposition, so a flag alone cannot award it. Pair/triplet completion, an exposed sequence, a discard win, or no matching Pung do not qualify.

**#31 Ji Pa Ciok: confirmed (research decision 2026-11-12).** Ciok is 雀, the pair/eyes, as supported by the PDF's own #32 Kim Ciok explanation "Kim dijadikan pair untuk kaki". Ji Pa Ciok requires a suited pair of 2s or 8s; merely holding a 2 or 8 is insufficient. Existing implementation is retained.

**#11 Thien Fu "posisi Dong" (p. 8).** The engine awards it when the seat wind is Dong and the hand is the untouched opening hand of the dealer. Seat winds are relative to the dealer, so a dealer on any physical chair can score Thien Fu. Treating "posisi Dong" as the dealer follows the continuous-match convention in §7; the PDF does not explicitly distinguish a fixed chair from its rotating seat wind.

## 3. Interpretations the PDF does not settle

**K / NK: hand usage vs match table (setting `scoringBasis`).** The table has two columns, "Ada KIM" and "Tidak ada KIM" (pp. 8–10), and the PDF never says which applies. Both readings are implemented and the active one is always shown (menu, table header, settings, result, receipt, history):
- `match_table` (**user house rule**, the practice default): the column is chosen before play by the match choice Ada Kim / Tanpa Kim. A Kim match reads Ada KIM for every Hu except the confirmed all-natural Kim interpretation below, also a hand that holds no Kim; a Kim-off match reads Tanpa KIM. The user stated this rule; the PDF does not.
- `hand_kim_usage` (legacy, the PDF reference preset, and the default for any caller that does not pass the option): the column follows joker use in the winning interpretation (all-natural Kim qualifies for NK).

The column only decides values. Kim usage is still counted from the hand (`ScoringResult.handKimCount`, `isWithKim`):
- #7 Tile KIM, #9, #30, #32 and #40 need Kim in the hand. A zero-Kim hand never gets a 0-Tay "Tile KIM" line just because the Ada KIM column is active.
- #8 Bo KIM is detected from the hand and awards +3 in either column and either scoring basis, overriding the blank Ada KIM PDF cell (player feedback 2026-11-12). It is awarded once and never together with joker-use awards.
- Example, Kim match, concealed Tuei Tuei with a number pair and no Kim, won on a discard completing the pair: hand usage gives #15 10, #34 30, #8 3; match table gives #15 5, #34 20 and #8 3.

The **Mode Kim** setting decides how Kim is selected and whether it exists. Settings are frozen for a hand: changes made during a match (including the basis) apply from the next `newGame`, and the table header says so. `toGameRules` / `toFullRules` include `scoringBasis` only when it differs from the legacy default; omitted `bonusTileRule` means the sole live PDF rule.

**Persistence.** The scoring-basis choice is preserved when explicitly stored; otherwise practice uses `match_table`. Bonus tiles always use `rulebook_per_tile`; stored `own_seat_only` settings silently migrate to it. The old own-seat-only prompt was incorrect (players, 2026-11-12). History retains its original scoring fields, labels and totals, including legacy bonus rules; no historical Kim count is invented.

**Bo KIM natural use (#8, p. 8): confirmed by the user (2026-11-11).** Row #8 says “Tidak ada Kim / Joker ATAU Kim dipakai untuk melengkapi set sesuai dengan nomer/jenis kim tersebut.” Every Kim used at its own face earns Bo KIM (3 Tay) and reads the Tidak ada KIM column, including under the match-table house rule. Exception, #39 Se Sam Pu Tat: its "tidak ada kim" condition is met the same way, so such a hand reads the same column as a Kim-free hand in both bases (40 Tay). `handKimCount` still records physical Kim; `isWithKim` records joker use for this interpretation. Zero-Kim hands retain the existing match-table house rule described above. The solver enumerates natural and wildcard uses and the scorer chooses the highest total Tay legal interpretation; a possible natural reading does not force it over a higher scoring joker reading.

**Ping Fu honor-pair restriction (#14), and unrestricted Tuei Tuei (#15): player answer 2026-11-12 'B'.** The honor-pair predicate applies **only to Ping Fu**. The players clarified: "naga jadi kaki = Ping Fu 0; surat ada harga (sesuai tempat duduk / meja) = Ping Fu 0; surat tidak ada harga = Ping Fu 3". This matches the PDF Ping Fu text: any dragon, the player's seat wind, or the prevailing wind as the pair disqualifies Ping Fu; a non-valued wind pair is allowed. Seat and prevailing winds are those for the current hand, including dealer rotation. Kim-substituted pairs use their interpreted face; `isDisallowedHonorPair` checks Ping Fu eligibility before highest-total-Tay arbitration. Answer **B** confirms that **Tuei Tuei is unaffected by the pair**, including dragons and valued winds, replacing the earlier assumed restriction. The manual Tay calculator already has no pair gate; the engine and calculator both award #15 normally, and the friend-hand regression checks both totals. Sam/Si Am Kang (#33/#34) remain independent; Tjit Tuei (#16) is separate. The friend hand (9 Sok tris, Zhong tris won on Zhong discard, Pat pair, exposed Pung 9 Tong and 1 Ban, off-seat Musim 3, Kim match without Kim) now scores **11 Tay**: Musim 1 + Tuei Tuei 5 + Tris Zhong 2 + Bo KIM 3.

**Shi Kim decision (implementation interpretation).** Holding four physical Kim permits instant Shi Kim Hu (10 Tay), regardless of their potential natural use, since no completed decomposition is being declared. In a completed hand, all four used naturally earn Bo KIM/NK and no Kim-specific awards; any joker use permits Shi Kim (40 Tay/K). Kim Thi and Kim Ciok follow the row text literally: three Kim forming a tris is "Kim dijadikan tris" (#30) and two Kim forming the pair is "Kim dijadikan pair" (#32), even when the Kim are all one natural face (three natural Kim are always the same face). The scorer keeps the highest-total reading, so three Zhong Kim score Kim Thi 30 (Ada KIM column) rather than Bo KIM + Tris Zhong. Pyong Pi needs a Kim paired with the drawn winning tile. #7 Tile KIM counts every physical Kim held whenever the hand reads the Ada KIM column (1 Tay each, including any Kim used at its own face in a mixed hand). An all-natural reading never awards these K-only patterns together with Bo KIM; the four-Kim instant reading remains an interpretation pending further expert clarification.

**Flowers and seasons (#1, #2, p. 8): confirmed by players after a full round (2026-11-12).** `rulebook_per_tile` is the only live rule: each Bunga (kembang hitam) has base 0, each Musim (kembang merah) has base 1, and matching the current seat number adds +1. Thus off-seat Bunga = 0, own-seat Bunga = 1, off-seat Musim = 1, own-seat Musim = 2. The seat follows the rotated wind for this hand: Dong = 1, Nan = 2, Xi = 3, Bei = 4. The earlier `own_seat_only` house rule came from an incorrect prompt and is retired.

The players' game 6 regression: prevailing Nan, winner seated Xi (3), Bunga 3 + Bunga 1 + Musim 3 scores Tile Bunga 1 and Tile Musim 2. Prevailing wind does not decide the bonus seat number.

**Reading the bonus tiles (aligned with tiles rev2.pdf).** The rulebook row text calls the two families "Kembang hitam" (#1 Bunga) and "Kembang merah" (#2 Musim). As confirmed in `tiles rev2.pdf`:
- **Musim** (`season`, "kembang merah"): red number and glyph. 1 春 Spring/Semi, 2 夏 Summer/Panas, 3 秋 Autumn/Gugur, 4 冬 Winter/Dingin. Base 1 Tay, seat match +1 Tay.
- **Bunga** (`flower`, "kembang hitam / biru"): blue/black number and glyph. 1 梅 Plum, 2 蘭 Orchid/Anggrek, 3 竹 Bamboo/Bambu, 4 菊 Chrysanthemum/Krisan. Base 0 Tay, seat match +1 Tay.

The family is read from the ink of the number and glyph, not from the petal or background colours. The internal types, tile IDs, the 1–4 seat numbering, the four-of-each inventory, stored histories and Tay values match the Bandung Mahjong Cup rulebook.

Collection awards are: #4 four Bunga 10, #5 four Musim 20, #6 seven bonus tiles 30. Per user rule ("kalau uda 4 musim +20, musim gak diitung +1 lagi"), a 4-of-a-kind collection supersedes the individual bonus tile points (#5 supersedes #2, #4 supersedes #1, and #6 supersedes #1, #2, #4, #5).

**Pattern stacking confirmed (research decision 2026-11-12).** Tuei Tuei stacks with Sam Am Kang, as in standard Chinese definitions; it also remains independent of Si Am Kang. Si Am Kang supersedes Sam Am Kang only; no additional pattern exclusion is introduced. The existing other exclusions remain as listed below.

**Overlap policy.** The rulebook exclusive policy (`SUPERSEDES`) applies:
- Thi Fu replaces Pao Chin (#12 → #10)
- 4 Tiles Bunga replaces individual Tile Bunga (#4 → #1)
- 4 Tiles Musim replaces individual Tile Musim (#5 → #2)
- 7 Tiles Bunga/Musim replaces all lower flower/season awards (#6 → #1, #2, #4, #5)
- Higher dragon/wind patterns replace lower ones (#21/#22 → #27–#29, #23/#24 → #25/#26, #34 → #33, #38 → #37).

**Other exclusions in the detectors (assumptions, not in the PDF):**
- Chicken Hand (#13) is only awarded when no other hand-shape pattern fires and the hand mixes sequences and triplets. The PDF says "tanpa membentuk pola yang lain"; it does not say which patterns count. The value is 0 either way. Per user instruction ("chicken hand ga usah di tulis"), Pattern #13 is suppressed from being rendered or written in the winning receipt breakdown and copied receipt text.
- #17 Chao It, #18 It Set and #19 Yau Kiu are not awarded on Cap Sa Yau Kiu or Se Sam Pu Tat shapes.
- #25 to #29 ignore a pure KIM-KIM-KIM triplet (Kim Thi), because it has no wind or dragon identity.
- Se Sam Pu Tat with any flower or season is not a legal Hu (the row requires none, and the shape is not otherwise a winning hand).
- #6 is awarded at 7 or more bonus tiles.

## 4. Kim model and tile inventory

**The PDF does not specify inventory or Kim selection.** The domain expert confirmed (2026-11-11) that Kim comes from an existing normal tile face; dedicated extra jokers are acceptable for learners. Settings offer:
- `natural` (**default for new settings**): 144 tiles = 108 suited + 16 winds + 12 dragons + 4 Bunga + 4 Musim. After shuffling, randomly choose one non-bonus face; all four physical copies become Kim, keeping their face and identity. No tiles are added or removed. The random choice is a simplification, not the unconfirmed dice procedure; the settings explanation says so. A seed controls both shuffle and choice.
- `dedicated` (**pemula / learner, legacy**): 148 tiles, adding four dedicated blank jokers. These cannot qualify for natural use.
- `off`: 144 tiles, no Kim. Normal tile copies are never removed.

`createGameWall(kimMode: KimMode, seed?)` returns `{ wall: Wall, kimFace: TileFace | null }`; the boolean compatibility overload returns `Wall` and retains true = dedicated / false = off. Engine state exposes `kimFace`, and the table displays it. Raw engine rules without `kimMode` retain boolean compatibility; fresh app settings/presets default to natural. Explicit legacy stored `kimEnabled: true/false` migrates to dedicated/off; malformed mode values fall back to natural. Settings stay frozen during a hand.

Natural Kim cannot be discarded or used to claim Jia/Pung/Kong, even if a casual toggle allowed legacy dedicated-joker claims. Core discard validation, human legal actions and bot selection enforce this. Consequently a tile of the chosen Kim face cannot enter the discard pile and cannot be claimed from a discard. Concealed nominal use remains allowed. Dealer starts with 14 tiles, other players with 13 (existing inventory assumption).

**Random selection confirmed acceptable by players (2026-11-12).** Asked how Kim should be chosen, the playtest group answered that random is fine ("toh mau ambil dari mana2 juga sama aja random dapetnya") and that no flipped indicator needs to be shown. The game keeps the random face plus the small "Kim: <face>" indicator; no dice/indicator procedure is modelled.

## 5. Resolved implementation gap

#36 Ce Chiong Kong now detects the exposed Pung from live candidate melds and validates the concealed winning sequence (see confirmed definition in §2).

## 6. Questions that need an answer

1. Resolved (old question #3, players 2026-11-12): bonus-tile scoring follows the PDF per-tile rule; collection awards stay #4 = 10, #5 = 20, #6 = 30 with the existing supersede behaviour.
2. Does "posisi Dong" (Thien Fu) confirm the dealer-relative seat-wind convention used by the app?

The #39 column placement, #12 first self-draw, #36 winning fourth tile, #33/#34 discard completion, #31 pair meaning and pattern stacking questions are confirmed in §2–3. Random Kim selection was also confirmed by players (see Kim model).

## 7. Match flow (continuous game)

Code: `src/ui/match.ts`, `GameController.startMatch` / `nextHand`.

**Latest player decision (2026-11-12):** plain **16 game** means the dealer rotates after every valid Hu, even when the dealer wins ("jumlah 16 game kalau menang tetep ganti"). Players distinguished this from **16 game ++**, where a dealer win reshuffles and keeps the deal, and chose plain 16. This supersedes the earlier dealer-stays confirmation and the MahjongLeh dealer-stays reference. With no Seri, games 1–4 have prevailing wind Dong (Timur), 5–8 Nan (Selatan), 9–12 Xi (Barat), and 13–16 Bei (Utara).

Match policy (player answers 2026-11-12; supersedes PDF section 4's 8-game / Hu-count choices):
- Every match has exactly **16 games**, unless the optional 90-minute Waktu ends it earlier at a hand boundary. There is no match-length choice or saved length; the old `itm.match-length.v1` preference is silently removed on app startup.
- Every completed hand is one game: dealer Hu, other valid Hu, Seri and Lew Fit all count once. Seri moves straight to the next game without replay and without rotation (PDF section 4). Any valid Hu, including dealer Hu, or Lew Fit rotates the dealer one chair and the seat winds. The removed dealer-rotation preference is still discarded on load; legacy dealer-stays values cannot override this policy.
- Ranking uses **highest cumulative Tay**, then **more valid Hu**, then **whoever reached their final Tay total first** (the hand number of their last credited Hu). Only valid Hu meeting the match minimum add Tay or Hu; Seri and Lew Fit add zero. Players with no Hu share a rank. Physical game numbers provide the final tie-break.
- The in-play MatchBoard orders players by this ranking and highlights the Tay leader independently of the dealer badge. Hu remains visible alongside Tay. The result modal's standings and final standings use the same order and totals, and the final winner message leads with Tay.

Implementation conventions and practice choices (**not stated in the PDF**; seating policy is in `nextSeating`):
- The dealer always sits posisi Dong (Timur). Seat winds are relative to the dealer, so Tris Angin Duduk, own Bunga/Musim number, Ping Fu and Thien Fu use the rotated seat wind each hand. Thien Fu belongs to the dealer.
- Lew Fit: the dealer moves one chair and the seat winds rotate; no Hu is credited. This is a user-approved **inference** from [PlayLeh Game Setup and False Win](https://playleh.com/mahjongleh-rules.html), whose rotation exceptions are dealer wins and stalemates. Indonesian Lew Fit and PlayLeh False Win are different concepts; neither the PDF nor PlayLeh explicitly establishes this Indonesian penalty rotation.
- The prevailing wind (angin putaran) advances Timur → Selatan → Barat → Utara after four dealer changes, including changes following dealer Hu. Seri keeps the dealer and does not advance this counter.
- Practice uses the minimum chosen at match start (fixed for that match); a lower minimum still credits the player's valid Hu. Scoreboards and final standings explicitly label a minimum below 5 as training rules, alongside the tournament minimum of 5.
- The coach offers continuation after intermediate hands and final standings after the last; pace and pause preferences continue across hands.
- Players keep their chairs on screen; only the winds and the dealer badge move. Each hand deals a fresh wall in the Kim mode chosen at the start of the match.


**Optional match clock (PDF section 4).** `Waktu: tanpa batas (default) / 90 menit` is saved in `itm.match-time-limit.v1`, outside the settings module. With a limit, the hand-count limit or the 90-minute limit ends the match, whichever is reached first. Reaching time during a hand never interrupts it: that hand finishes and its result counts before final standings show “berakhir karena batas waktu”. If time expires between hands, no new hand is dealt. The clock includes bot pauses, hidden-tab time, dialogs and between-hand results. Only the preference is persisted; active matches and clocks remain in memory as before, so closing the app abandons that match and does not charge closed-app time to a later match. Finishing the current hand on expiry is the user-approved app policy; section 4 does not define that cutoff detail.

### v0.4.2 match choices (player feedback 2026-11-12)

- At match start all four chairs roll two dice; the highest sum becomes the dealer (Timur). Tied highest chairs alone re-roll until one wins. Opening dice use seeded Mulberry32 when a seed is supplied, independently of wall shuffling and AI randomness. Every chair keeps its screen position; scoring and AI derive seat winds from the elected dealer.
- Cumulative Tay credits only valid Hu; Seri and Lew Fit add zero. Tay appears beside Hu in the scoreboard, hand results and final standings. Ranking follows player answers 2026-11-12: total Tay, then valid Hu count, then first to reach the final Tay total.
- **Akhir tembok** defaults to **Sampai habis (turnamen)**, per PDF section 4 (no dead wall). **Sisa 14 tile (dead wall)** is an optional practice deviation: no head or replacement draw can use the final 14 tiles. A bunga or Kong needing another replacement at that boundary ends the hand Seri; it counts as a game and keeps seating. The final drawable tile may still complete Hu; once a further draw is required, the hand ends. Wall serialization and cloning retain the reserve.
- **Pilihan Kim** is the single pregame control: **Kim dari tile** (`natural`, default), **Kim tambahan (pemula)** (`dedicated`), **Tanpa Kim** (`off`). Settings persistence retains the mode; legacy boolean-only settings migrate enabled to natural and disabled to off. Kim has no player-facing tail-draw action; internal bunga/Kong replacements are engine details.
