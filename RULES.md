# Rules: what the game implements, and on what evidence

Source of truth: **BANDUNG MAHJONG CUP RULEBOOK ver06** (PDF, 20 pages, read in full). Page numbers below are PDF page numbers. The tournament rules themselves are on pp. 5, 7–12; the remaining pages cover schedule, registration, etiquette, prizes and contacts.

The rulebook is a tournament guide. It names ITM / YDSP "revisi 5 tahun 2026" as the underlying ruleset (p. 11, §5.4) but does not reproduce it. Anything the PDF does not state is marked **assumption** or **unresolved** below. Notes in `.agents/teamwork` are secondary: several record guesses as if they were confirmed.

This game does **not** claim full conformity with ITM/YDSP. In particular, its Kim model is legacy (see Kim model below).

## 1. Confirmed by the PDF

| Rule | Page | Implementation |
|---|---|---|
| Variant: ITM / YDSP rules, with the tournament changes below | p. 7 §4, p. 8 §5.1, p. 11 §5.3–5.4 | Tournament preset |
| Minimum Hu is 5 Tay | p. 7 §4, p. 8 §5.1 | `minHuTay: 5` (editable) |
| Kim / joker may not be discarded | p. 7 §4, p. 11 §5.3 | `kimDiscardAllowed: false` in the tournament preset |
| No dead wall: the wall is played until it is empty | p. 7 §4 | `Wall` has no dead wall; replacements come from the tail |
| Empty wall = Seri (draw); the game still counts and seat winds do not rotate | p. 7 §4 | Seri outcome, `DRAW_SERI` phase |
| Table winner = most Hu (each at least 5 Tay); a tie goes to whoever reached that count first | p. 7 §4, p. 12 §6 | Tournament admin, not modelled in the casual game |
| A replacement player cannot Hu | p. 5 §3.2, p. 11 §5.2 | Tournament admin, not modelled |
| DAFTAR TAY, 44 rows, two columns "Ada KIM" / "Tidak ada KIM" | pp. 8–10 | `src/scoring/patterns.ts`; pinned by `tests/scoring/rulebook-columns.test.ts` |
| Penalti 1–4 are all "Lew Fit": wrong tile count, wrong Jia/Pung, Jia/Pung using Kim, Hu below 5 Tay | p. 10 | `LewFitReason` `structure`, `kim-claim`, `below-minimum` |
| Anything not written down is decided by the Judges | p. 10 | n/a |

### DAFTAR TAY (pp. 8–10)

Values are `Ada KIM / Tidak ada KIM`; `—` means the cell is blank. Column placement of single values was checked from text x-positions in the PDF (Ada KIM ≈ 491 pt, Tidak ada KIM ≈ 521 pt), because plain text extraction loses the columns.

| # | Name | K / NK | Page | Notes |
|---|---|---|---|---|
| 1 | Tile Bunga | 0 / 0 | 8 | "sesuai posisi duduk +1"; see §3 flowers |
| 2 | Tile Musim | 1 / 1 | 8 | "sesuai posisi duduk +1"; see §3 flowers |
| 3 | Bo Hua Zi | 3 / 3 | 8 | No flower, season, wind or dragon |
| 4 | 4 Tiles Bunga | 10 / 10 | 8 | |
| 5 | 4 Tiles Musim | 20 / 20 | 8 | |
| 6 | 7 Tiles Bunga/Musim | 30 / 30 | 8 | Immediate Hu without a finished hand = 10 Tay |
| 7 | Tile KIM | 1 / — | 8 | Value in the Ada KIM column |
| 8 | Bo KIM | — / 3 | 8 | Value in the Tidak ada KIM column |
| 9 | Shi Kim | 40 / — | 8 | Immediate Hu = 10 Tay |
| 10 | Pao Chin | 20 / 30 | 8 | Must be declared; still counts if Thi Fu does not happen |
| 11 | Thien Fu | 40 / 60 | 8 | Opening hand Hu, posisi Dong only |
| 12 | Thi Fu | 40 / 60 | 8 | "Hu dari hasil lew atau discard pertama (diawali dengan declare Pao Chin)"; see §2 |
| 13 | Chicken Hand | 0 / 0 | 8 | |
| 14 | Ping Fu | 3 / 3 | 9 | Not with a dragon, seat-wind or round-wind pair |
| 15 | Tuei Tuei | 5 / 10 | 9 | |
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
| 39 | Se Sam Pu Tat | printed 40 / — | 9 | **Column conflict**, see §2 |
| 40 | Pyong Pi | 5 / — | 9 | Value in the Ada KIM column; last tile from the wall |
| 41 | Tan Tiau | 5 / 5 | 9 | |
| 42 | Ce Mo | 1 / 1 | 9 | Open hand, self-draw |
| 43 | Mun | 1 / 1 | 10 | Concealed hand, win on an opponent's discard. Verified 1/1 in both the table and the engine |
| 44 | Ce Mo Pu Ciu Jen | 5 / 5 | 10 | Concealed hand, self-draw |

## 2. Decisions on conflicting or unclear rows

**#39 Se Sam Pu Tat column conflict (p. 9).** The only value, 40, sits in the **Ada KIM** column, but the row text requires "tidak ada kim". The engine stores it as `K: null, NK: 40`. Reason: the engine picks K/NK from Kim in the winning hand (see §3), so a Se Sam Pu Tat hand is always NK, and the printed column would make the pattern unreachable. If K/NK is a per-match setting instead, the printed column would be consistent (40 in a Kim match whose hand holds no Kim). This needs confirmation. `tests/scoring/rulebook-columns.test.ts` pins both the printed placement and the deviation.

**#12 Thi Fu and the word "lew" (p. 8, rows #10 and #12).** Row #12 reads "Hu dari hasil lew atau discard pertama". The meaning of "lew" is not defined in the PDF. One earlier note read it as the wall draw ("lew" = draw); the app glossary (README) uses Lew for passing on a claim. The latest product change (commit 21fbba5) scores Thi Fu only on a first-round discard win after a declared Pao Chin. The engine keeps that rule:
- First-round discard win after Pao Chin: Thi Fu (40 K / 60 NK). With the supersede policy, Pao Chin is dropped, following row #10 "apabila tidak thi fu, pao chin tetap berlaku".
- First-round self-draw after Pao Chin (non-dealer): Pao Chin stays, no Thi Fu.
- No Pao Chin, or a later turn: no Thi Fu.

Eleven older tests expected the self-draw reading. They now assert the discard-only rule: the discard cases stay positive and the self-draw cases became explicit negatives. The fixture and test comments point here. **Unresolved:** if "hasil lew" means the first wall draw, the self-draw path should be restored.

**#11 Thien Fu "posisi Dong" (p. 8).** The engine awards it when the seat wind is Dong and the hand is the untouched opening hand of the dealer. The app lets the starting dealer be another seat. In that case nobody can score Thien Fu. Whether "posisi Dong" means the East seat or the dealer is unresolved.

## 3. Interpretations the PDF does not settle

**K / NK: hand usage vs match toggle.** The table has two columns, "Ada KIM" and "Tidak ada KIM" (pp. 8–10), and the PDF never says which:
- *Hand usage* (implemented): the column is chosen by whether the winning hand holds any Kim. A hand with no Kim uses NK even in a Kim-enabled match.
- *Match toggle*: the column is chosen by whether the match is played with Kim.

The **Kim aktif** setting is a separate thing: it decides whether Kim tiles exist in the wall at all. With Kim off every hand is NK under both readings. With Kim on, the two readings disagree for hands that hold no Kim (for example #15 Tuei Tuei: 10 under hand usage, 5 under match toggle). Rows #7, #8 and #39 fit one reading better than the other, so the table itself is inconsistent.

**Bo KIM natural use (#8, p. 8).** The row text also awards Bo KIM when "Kim dipakai untuk melengkapi set sesuai dengan nomer/jenis kim tersebut", meaning a Kim used as its own face value. That only makes sense if Kim tiles have a face (a physical tile chosen as Kim). In the legacy model Kim tiles are blank jokers with no face, so this clause can never fire: any hand holding Kim is K. `KimValidator` has a `natural_nominal` role for this, but the legacy tiles never match it. This is a limitation of the model, not a confirmed rule.

**Flowers and seasons (#1, #2, p. 8).** The engine follows the table: each Bunga is 0 Tay, each Musim is 1 Tay, and a tile whose number matches the seat (Dong = 1, Nan = 2, Xi = 3, Bei = 4) adds +1. **Discrepancy:** the user has said only the own-seat flower should count. That conflicts with the printed base of 1 per Musim. The engine keeps the PDF behaviour until this is clarified. Two further points are assumptions: that the base applies per tile, and that number N maps to the Nth seat.

**Overlap policy.** The PDF supports one exclusion: Thi Fu replaces Pao Chin (row #10 text). The other entries in `SUPERSEDES` have **no PDF support**: #6 replaces #4/#5, #21/#22 replace #27–#29, #23/#24 replace #25/#26, #34 replaces #33, #38 replaces #37. They only apply when the "Eksklusif" policy is selected. The settings label now says that only Thi Fu → Pao Chin is written in the rulebook.

**Other exclusions in the detectors (assumptions, not in the PDF):**
- Chicken Hand (#13) is only awarded when no other hand-shape pattern fires and the hand mixes sequences and triplets. The PDF says "tanpa membentuk pola yang lain"; it does not say which patterns count. The value is 0 either way.
- #17 Chao It, #18 It Set and #19 Yau Kiu are not awarded on Cap Sa Yau Kiu or Se Sam Pu Tat shapes.
- #25 to #29 ignore a pure KIM-KIM-KIM triplet (Kim Thi), because it has no wind or dragon identity.
- #33/#34 count a triplet completed by the winning discard as concealed. Many rulesets do not. Unresolved.
- Se Sam Pu Tat with any flower or season is not a legal Hu (the row requires none, and the shape is not otherwise a winning hand).
- #6 is awarded at 7 or more bonus tiles.

## 4. Kim model and tile inventory

**Inventory is not in the PDF.** The rulebook does not give the tile count, hand sizes, number of flowers/seasons, or how Kim is chosen. The game uses:
- Kim on: 148 tiles = 108 suited + 16 winds + 12 dragons + 4 Bunga + 4 Musim + **4 dedicated Kim tiles** (legacy).
- Kim off: the 4 Kim tiles are removed **before** the shuffle and deal, leaving 144 tiles (136 + 8 bonus). `createGameWall(kimEnabled, seed?)` in `src/core/wall.ts` builds both; the engine's own default walls use it. A custom `Wall` passed in by a test is used as given.
- Deal: dealer 14, others 13 (assumption carried over from the existing code).

**Dedicated-joker Kim is legacy, not established by the PDF.** The PDF only says Kim is a "Joker, dapat menggantikan tiles apa saja" (#7, p. 8), that it may not be discarded (pp. 7, 11) and that it may not be used to call Jia/Pung (Penalti #3, p. 10). A proposed (user-described) dice-selected Kim exists, but its details are **unconfirmed**: dice direction, stack and top indexing, how winds and flowers map, and how the physical tiles are distributed. The PDF does not establish it, so it is not implemented and is not labelled official anywhere. The settings screen explains the legacy model. **The Kim indicator shown in the UI refers to the legacy joker tiles, not to a dice-selected Kim.**

## 5. Gaps found in this audit

- **#36 Ce Chiong Kong cannot happen in live play.** `buildWinContext` always passes `isSelfRobbingKong: false`; only the manual calculator and direct scorer calls can award it. The likely meaning is: self-draw the 4th tile of an exposed Pung and use it in a concealed sequence. Whether the winning tile itself must be that 4th tile is unconfirmed, so live detection was not added.

## 6. Questions that need an answer

1. Does "Ada KIM / Tidak ada KIM" mean Kim in the winning hand, or a match played with Kim? This also settles #39.
2. What does "lew" mean in rows #10 and #12? Does a first-round self-draw after Pao Chin score Thi Fu?
3. Flowers/seasons: does every tile score (Musim 1 each, +1 own seat), or only the own-seat tile?
4. Is "posisi Dong" (Thien Fu) the East seat or the dealer?
5. The full dice-Kim procedure: direction, stack/top indexing, wind and flower mapping, physical distribution, and whether Kim used at face value earns Bo KIM.
6. Ce Chiong Kong: must the winning tile be the 4th tile of the exposed Pung?
7. Is a triplet completed by the winning discard concealed for Sam/Si Am Kang?
8. Which pattern pairs exclude each other beyond Thi Fu → Pao Chin?
