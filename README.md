# Mahjong Tradisional Indonesia

A browser game of Indonesian Traditional Mahjong (ITM / YDSP), scored from the Bandung Mahjong Cup Rulebook ver06. You sit as Timur (East). Three bots take the other seats. There is no account and no server: settings, sound, and match history stay in this browser.

## What you can do

### Play at the table

- Start a game from a 148-tile wall. The dealer gets 14 tiles. Everyone else gets 13. There is no dead wall.
- Flowers and seasons leave the hand and are replaced from the back of the wall.
- On your turn: **Tarik** (draw), choose a tile, **Buang** (discard). Click a tile once to lift it, then again to discard.
- On someone else's discard: **Hu**, **Kong**, **Pung**, or **Jia**. Hu wins over Kong and Pung. Jia is only for the player on the discarder's left.
- **Lew** passes a claim. **Pao Chin** declares an instant-ready opening hand.
- Concealed Kong (**Ankong**) and adding a tile to your own Pung (**Kakan**) are available when the rules allow them.
- The hand ends in a win, or in **Seri** when the wall runs out.

### Kim (the joker)

- **Turnamen:** Kim stays in the hand. You cannot throw it, and you cannot use it to claim Jia, Pung, or Kong.
- **Kasual:** the same switches can be turned on in Pengaturan (discard, claim, pair, pung, jia, triplet).
- A hand that uses Kim scores in the **Ada Kim (K)** column. A hand with no Kim scores **Bo Kim**, +3 Tay, in the **Tanpa Kim (NK)** column.

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
