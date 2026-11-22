# Player feedback log

Every report from the WhatsApp group: what was asked, what we did, and the test that pins it. Check this before working on a UI or online change, so the same kind of bug doesn't come back. Add new reports at the top.

| Date | Report (group's words) | Status | Version | Guard |
| --- | --- | --- | --- | --- |
| 2026-11-22 | "Mode main sendiri. Itu kalau ke refresh jadi balik ke awal" (video) | Jason: remove single player; a room with bots already comes back after a refresh | 1.8.0 | |
| 2026-11-22 | "Knapa ini kecil banget … kalau buangan udah ke baris ke-2 buangannya mengecil" (Xiaomi tablet, landscape) | Fixed: the pool fits columns and scale to its real frame | 1.7.2 | `tests/ui/pool-fit.test.ts` |
| 2026-11-22 | Hu popup on a tablet: "ga mau kebawah buttonnya ilang" (video) | Fixed: the modal body scrolls, the footer stays | 1.7.2 | `tests/ui/modal-short-viewport.test.ts` |
| 2026-11-22 | "Kaya susunannya berantakan" (account panel on a tablet) | Fixed: a grid layout that wraps at any width | 1.7.2 | `tests/ui/account-rooms.test.ts` |
| 2026-11-22 | "Dev mode ga bisa save" / "dev mode matiin lah" since online exists | Removed together with single player | 1.8.0 | |
| 2026-11-22 | "Jeda bot sekarang mah ga ada ya di single player?" | Answered: Opsi → Tempo & aktivitas. A table button only if the group wants it | | |
| 2026-11-22 | "Mode main sendiri gak usah ada … create room trus pasang bot 3" | Jason agreed: single player removed; front menu is Buat room / Gabung room | 1.8.0 | |
| 2026-11-21 | Admin page `?admin=1` is blank | Fixed: the page loads the login itself and is never empty | 1.5.2 | `tests/ui/admin-page.test.ts` |
| 2026-11-21 | "Kalau uda beres meja gak ditampili score akhir … tabel juara" | Fixed: online Klasemen Akhir | 1.5.1 | `tests/ui/online-standings.test.ts` |
| 2026-11-21 | "Kalau uda beres game bolak balik di lanjutkan room" (video) | Fixed: leaving a finished room really leaves | 1.5.1 | `tests/ui/account-room-flow.test.ts`, `tests/server/room.test.ts` |
| 2026-11-21 | "Jumlah host hariannya jadi 3x … reset jam berapa, ada timer" | Done: limit 3, reset countdown, admin settings | 1.5.0 | `tests/server/admin-settings.test.ts` |
| 2026-11-21 | "Semua nya login pake google dulu aja … email group" | Done: every online player logs in, email opt-in off by default | 1.4.0 | `tests/server/room.test.ts`, `tests/ui/account-rooms.test.ts` |
| 2026-11-21 | "Login di hp sama ipad … emailnya sama tp jadi 2 room" | Done: the room follows the account. **Not yet tested on two real devices.** | 1.4.0 | `tests/server/room.test.ts` (reclaim) |
| 2026-11-21 | Claim popup only shows when someone can claim, so it gives away hands | Fixed: every discard shows for 1 s | 1.3.3 | `tests/session/table-session.test.ts`, `tests/ui/game-controller.test.ts` |
| 2026-11-21 | "Yg jelas kerasa mah point perhitungan (tay)" on the new site | Fixed: new online matches use the house-rule match column, shared with practice; running matches keep frozen rules. Online receipt, per-hand history and live Kong koin now follow solo. | 1.6.0 | `tests/session/online-parity.test.ts`, `tests/server/room.test.ts`, `tests/ui/online-parity.test.ts`, `tests/net/remote-table.test.ts` |

## Lessons (check these every time)
- **Parity:** a feature in single player should exist online too, and the other way round (standings, Tay rules, history). Both 1.5.1 and the open Tay report were parity gaps.
- **Every screen in a real browser:** unit tests passed while the admin page was blank. Open each new or changed screen once before release.
- **Real device sizes:** test landscape tablets (1280x560 to 1280x800) and short phones, not just desktop and portrait phone. Tablet reports 1.7.2 all came from that gap.
- **Ends of flows:** the end of a match, leaving, coming back and a second device are where bugs hide. Test them, not just the middle of a hand.
