# Mahjong Tradisional Indonesia

A browser game of Indonesian Traditional Mahjong (ITM / YDSP), scored from the Bandung Mahjong Cup Rulebook ver06. You keep the same chair against three bots; your seat wind changes as the dealer rotates. There is no account and no server: settings, sound, and hand history stay in this browser.

## What you can do

### Play at the table

- Start a game from a 144-tile wall by default, with four normal copies of one face marked Kim. Learner mode adds four dedicated Kim for 148 tiles; Kim-off uses 144. The dealer gets 14 tiles. Everyone else gets 13. There is no dead wall.
- Flowers and seasons leave the hand and are replaced from the back of the wall.
- Tell them apart by the ink of the number and glyph, as on the supplied tile sheet: **Musim** (season, "kembang merah") has a red number and 春 夏 秋 冬; **Bunga** (flower, "kembang hitam / biru") has a blue/black number and 梅 蘭 竹 菊 (plum, orchid, bamboo, chrysanthemum). Each family has one tile per number 1–4.
- **Bonus posisi +1:** a Bunga or Musim whose number equals your seat (1 Timur, 2 Selatan, 3 Barat, 4 Utara) earns +1 Tay on top of that tile's base (0 in the practice house rule). See RULES.md §3.
- On your turn: **Tarik** (draw), choose a tile, **Buang** (discard). Click a tile once to lift it, then again to discard.
- On someone else's discard: **Hu**, **Kong**, **Pung**, or **Jia**. Hu wins over Kong and Pung. Jia is only for the player on the discarder's left.
- **Lew** passes a claim. **Pao Chin** declares an instant-ready opening hand.
- Concealed Kong (**Ankong**) and adding a tile to your own Pung (**Kakan**) are available when the rules allow them.
- The hand ends in a win, or in **Seri** when the wall runs out.

### Kim (the joker)

- **Natural Kim (default):** one normal face is chosen randomly each hand and all four copies become Kim, retaining their printed face. Kim stays in the hand and cannot be discarded or used to claim Jia, Pung, or Kong.
- **Learner Kim:** four extra dedicated jokers. Casual switches can allow discards and claims for these legacy jokers.
- Kim used entirely as its own printed face qualifies for **Bo Kim**, +3 Tay, in the **Tanpa Kim (NK)** column. The scorer chooses the highest-scoring legal interpretation, so a better joker reading can win instead. Dedicated jokers cannot be used naturally.
- In practice's match-table scoring, a Kim match normally reads **Ada Kim (K)**, including hands without Kim; an all-natural Kim interpretation is the exception above. The alternative hand-usage setting follows actual joker use. See RULES.md §3 for blank cells and special hands.

### Continuous matches

- Choose 4, 8 (default), 16 hands or endless practice. A valid Hu counts toward the standings; most Hu wins, with ties broken by who reached that count first. Total Tay is shown separately.
- After a non-dealer Hu or **Lew Fit**, the dealer moves one chair. Lew Fit earns no Hu or Tay. Dealer wins retain the deal by default, with an option to rotate; **Seri** counts as a hand and never rotates the seating. The prevailing wind advances after four dealer changes.
- **Waktu** offers no limit (default) or 90 minutes. Time keeps running through bot pauses, dialogs, hidden tabs and results between hands. A hand in progress at expiry finishes and counts; expiry between hands prevents another deal. Reaching the hand limit first freezes the clock.
- Match preferences are saved, but the active match and its clock are runtime only. Closing the app abandons the match; reopening starts a fresh one.

### Scoring

- A legal win needs a real hand shape and at least **5 Tay**. You can raise or lower that minimum in Pengaturan (0–100).
- The result lists every pattern that scored, the K or NK column, and the total.
- The 44 rulebook rows cover flowers, Kim, first-turn wins (Pao Chin, Thien Fu, Thi Fu), hand shapes, dragons and winds, concealed sets, Kong events, and the finish (self-draw or discard).

### Kalkulator Tay

Open **Kalkulator Tay** when you want to add patterns by hand instead of playing.

- Search the 44 rows by name, number, or note.
- Switch Ada Kim / Tanpa Kim. Rows that do not exist in that column cannot be selected.
- Count flowers, seasons, and how many match the seat.
- Turn on **Hu instan** for the 10-Tay immediate wins (seven bonus tiles, four Kim, or four concealed triplet kinds).
- Choose rulebook overlap (a bigger pattern replaces the smaller one it contains) or cumulative (they stack).
- Copy the result.

### Kept on this device

- **Pengaturan:** rules, AI difficulty (Mudah, Normal, Sulit), animation speed, sound, round wind, and the opening dealer.
- **Riwayat:** each finished game, with the winning tile, concealed tiles, melds, flowers and seasons, and the Tay lines.
- **Suara:** short tones for draw, discard, claims, flowers, a win, and Lew Fit. The header button mutes them.

## Run it on your computer

```bash
npm install
npm run dev
```

Open the address Vite prints (port 3000). `npm test` runs the suite. `npm run build` makes the static site in `dist/`.

## What this is not

This is a casual practice table for the ver06 rulebook. It is not an official Bandung Mahjong Cup product, and it does not play online against other people. Two browsers do not share a game or a history.

## Release version

The single release version source is package.json. The public header imports its typed version through src/ui/release.ts; Vite resolves it in production and Vitest uses the same value. Keep the root and root-package versions in package-lock.json synchronized when releasing.
