# Backlog

Player requests noted for later. Not scheduled yet.

## Open (2026-11-22)

- **Solo resume patch:** kept in `.agents/solo-resume.patch` in case single player ever comes back.

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

## Visual polish, subtle (Jason 2026-11-15, after looking at the Mahbar app)

Keep it light, not flashy.
- A short callout ("PUNG", "KONG", "HU") when a claim is made.
- A brief Hu celebration.
- Smoother tile motion.
- Optional claim voice lines, which could later become a cosmetic.

Not planned for now: ranks, a cosmetics shop, voice chat.

## Multiplayer follow-ups (after v0.7.0)

- Move a seat to another device without an account (a short transfer code).
- Retire the GitHub Pages copy: redirect plus a one-time localStorage move to indomahjong.pages.dev, then make the repo private after 2–4 weeks.

## Multiplayer decisions (players, WhatsApp 2026-11-15)

- **Hosting.** Cloudflare Workers + Durable Objects (one per room), with D1 for accounts. Start on the free plan and upgrade to Workers Paid ($5/month) only when we hit the limits.
- **Turn timer.** Every decision has a time limit: the discard turn and claim windows (Jia, Pung, Kong, Hu). The room lobby shows the timer seconds and the rules.
- **Timeout.** The rule is in `RULES.md`, "Multiplayer turn timer". A timeout on a turn skips that turn and discards the drawn tile. A timeout on a claim is a pass. A bot never takes over the seat. (This replaces the earlier AFK/bot takeover idea; players decided 2026-11-15.)
- **Room form ("Buat Room"), modeled on a lobby screenshot the players shared.** The lobby shows these settings before anyone joins:

  | Field | Options |
  | --- | --- |
  | Mode Kim | natural / dedicated (Bo Kim) / off |
  | Min Tay | 0 / 3 / 5 (default) / 8 |
  | Waktu giliran | 5 / 10 / 15 (default) / 20 / 30 s / 1 min / tanpa batas (practice) |
  | Jumlah hand | 16 / 16++, with an optional 90-minute limit |
  | Isi kursi kosong dengan bot | on, with a bot level |
  | Room privat (invite code) | default on |
  | Boleh ditonton | on/off; spectators never see hidden tiles |

  Ranked play and ladders come later.
- **Never copy:** an entry fee, tickets or any real-money stake. Online gambling is illegal in Indonesia, and Google refuses ads for it.
- **Premium payment candidates.** DOKU (a player suggests its payment links are easy), Midtrans, Xendit.
