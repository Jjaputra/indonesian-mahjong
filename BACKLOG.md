# Backlog

Player requests noted for later. Not scheduled yet.

## Done in v0.6.0 (2026-11-14)

- Bigger discards in a framed rectangle, 17 per row (20 with OPTION hidden), "SISA: n TILES", wind labels on the edges.
- Each seat's Pung/Jia/Kong and bunga/musim in one strip between its hidden tiles and the discards.
- Bot difficulty chosen on the main menu.
- Collapsible OPTION panel (TableInfo stays visible).
- Three dice; never auto-roll; "Lempar dadu" then "OK, mulai main". (The per-hand dealer roll was removed in v0.6.5: it decided nothing, players 2026-11-15.)

## Bigger items

- **Multiplayer**: friends playing online from different places. Scope is in the project memory; it comes after the rules settle.
- **Lew Fit koin penalty**: not decided yet, 0 for now.
- **Polish ideas (2026-11-13)**: auto-save and resume a match, install as an app (PWA), a shorter Hu screen on phones, a "waiting tiles" hint, a 450-koin starting balance, and bots that play around koin.

## Multiplayer decisions (players, WhatsApp 2026-11-15)

- **Hosting.** Cloudflare Workers + Durable Objects (one per room), with D1 for accounts. Start on the free plan and upgrade to Workers Paid ($5/month) only when we hit the limits.
- **Turn timer.** Every decision has a time limit: the discard turn and claim windows (Jia, Pung, Kong, Hu). The room lobby shows the timer seconds and the rules.
- **Timeout.**
  - On a discard turn, the player is skipped for that turn only: the tile just drawn from the wall is discarded for them. They play normally next turn and are not kicked.
  - A claim window that times out counts as pass.
- **AFK.** Two consecutive timeouts mark the player AFK and a bot takes the seat.
  - The player stays in the room (option B) and can take the seat back at any time.
  - A disconnected player can rejoin and resume.
  - Open: does the AFK bot only discard the drawn tile, or play fully?
- **The lobby shows** Kim / Bo Kim and a Min Tay choice of 0 / 3 / 5 / 8. The engine already accepts 0–100.
- **Premium payment candidates.** DOKU (a player suggests its payment links are easy), Midtrans, Xendit.
