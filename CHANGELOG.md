# Changelog

## [Unreleased]

## [1.7.1] - 2026-11-22
### Changed
- Every text in the game is rewritten to sound like a person, not a manual. It is short and relaxed, says "kamu" only where it's needed, has no slogans, and every error says what to do next. Rule explanations keep every fact. The menu tagline is "Mahjong Indonesia di browser", the side panel is "Opsi", the leave button is "Ke menu" everywhere, and the WhatsApp invite says "Yuk main maciokYU! bareng.".
- The Privacy, Terms and Delete Account pages use the same plain voice. No fact changed.
- The site has a description for search results and link previews.

## [1.7.0] - 2026-11-22
### Changed
- The admin panel is rebuilt with four tabs. Ringkasan shows player and match numbers with a 30-day chart. Pemain lists every player with search, filters, sorting, paging, the Premium switch, "Unduh CSV" and copying the emails of players who asked for news. Pengaturan groups the settings with explanations, a banner preview and who changed what last. Riwayat perubahan lists every settings and Premium change. The front menu shows an "Admin" button to the owner only.
### Docs
- `COPY.md` sets the voice for all player-facing text: relaxed, almost no pronouns, no slogans.

## [1.6.0] - 2026-11-22
### Fixed
- Online Tay now matches single player. In a Kim match every Hu reads the Ada KIM column, as the house rule says. Before, online read the Tanpa KIM column for a hand without Kim, so some hands scored higher online (for example 44 instead of 29 Tay). Rooms already playing keep their old scoring until the match ends.
### Changed
- The online Hu receipt is the same as in single player. It shows the Tay column, the winning hand by set with flowers, numbered patterns with the minimum-Hu check, Round Score, Kong lines, "Total game Hu + Kong" and the running standings. Reactions, the ready strip and "Lanjut" stay.
- Online Kong koin show on the scoreboard as soon as the Kong is made, with the "tiap pemain bayar" notice using player names.
- Riwayat saves every online hand with the players' names and the Tay column, not just one row per match.

## [1.5.2] - 2026-11-21
### Fixed
- The admin page (`?admin=1`) was blank. It now loads your login itself and shows "Memuat akun…", the Google login, "Akun ini bukan admin." or the settings, plus "Kembali ke menu".
### Docs
- `FEEDBACK.md` lists every group report with its status, version and the test that guards it, plus lessons to check before each release.

## [1.5.1] - 2026-11-21
### Added
- Online: after the last game of a match, "Klasemen Akhir" opens with the table winner, the ranked totals (koin, Tay, Hu), the Σ 0 check and every game of the match, like in single player. The host can press "Main lagi" from there. Coming back to a finished room opens the standings straight away.
### Fixed
- Online: "Keluar room" after a finished match really leaves. The menu no longer offers "Lanjutkan room" for it, so you don't end up going round between the menu and the last hand.
- Online: players who leave after the match keep their own name in the standings instead of turning into "Bot N".
- Online: "Lihat meja" on the last hand's result opens the table.

## [1.5.0] - 2026-11-21
### Changed
- Online: a host can start 3 matches a day (was 5). Joining someone else's room is still free.
- The allowance text shows when it resets: "Reset 00.00 WIB · 5 jam 12 menit lagi". When the matches are used up, a live countdown "Jatah hari ini habis. Reset dalam 05:12:33" shows in the lobby, on the result screen and in the account panel. It follows the server clock.
- The Terms page no longer names a fixed number of matches.
### Added
- An admin page for the owner (`?admin=1`). It can change the daily match limit, the discard pause, the login requirement, the Facebook button and a short announcement on the front menu without a new release. It can also turn Premium on for a player and copy the emails of players who asked for news.
- An announcement banner on the front menu when the admin sets one.

## [1.4.0] - 2026-11-21
### Changed
- Online: every player now logs in with Google, including friends who join with a code or link and spectators. An invite link opened while logged out asks for login and then joins that room. Single player still needs no login. Rooms already running keep their players.
### Added
- Online: your room follows your account. Log in on another phone or iPad and "Lanjutkan room" takes you back to the same seat. The older device shows "Room ini dibuka di perangkat lain." and can take the seat back with a button.
- Online: "Buat Room" while you still have a room asks "Lanjutkan" or "Buat room baru". Joining another room while seated asks "Lanjutkan" or "Gabung". The old room is only left once the new one works.
- An optional "Kabari saya lewat email soal Premium dan update maciokYU!" box in the account panel, off until you tick it. The Privacy and Terms pages explain it.

## [1.3.3] - 2026-11-21
### Fixed
- Every discard now shows for 1 second before play goes on, whether or not anyone can claim it. The claim popup and the Aktivitas log no longer give away that someone can Jia, Pung, Kong or Hu. This applies online and in single player.

## [1.3.2] - 2026-11-21
### Changed
- The Privacy, Terms and Delete Account pages are shorter and describe exactly what the game does. Room data is deleted about 24 hours after a room goes idle, and "Hapus akun" in the game deletes the account immediately.

## [1.3.1] - 2026-11-21
### Changed
- Online: the host now logs in with Google to create a room and to press Mulai or Main lagi. Friends who join with a code or link still don't need to log in.
- The account row sits inside the online card and fits small phones.

## [1.3.0] - 2026-11-21
### Added
- Online: "Masuk dengan Google" on the online screen. A logged-in host's 5 matches a day are counted on the server, so they hold across devices. The panel shows your name and photo, "Keluar" and "Hapus akun".
- Logging in is optional for now; friends who join a room never need to log in.

## [1.2.0] - 2026-11-21
### Changed
- The game moved to **https://maciokyu.com**. Old links (GitHub Pages and indomahjong.pages.dev) open maciokyu.com and bring your history, settings, name and room seats along. Invite links with a room code keep working.
- The online room server moved to api.maciokyu.com; the old address stays up during the move.
### Added
- A contact address for feedback after a match and in Settings, with links to the new Privacy Policy and Terms pages.
- Privacy Policy, Terms of Service and account deletion pages under maciokyu.com/legal/.

## [1.1.0] - 2026-11-21
### Changed
- The front menu has three choices: "Main sendiri", "Main bareng teman" and "Premium · segera hadir". The Kim, bot level, Akhir tembok and Waktu options moved to the Main sendiri screen, which has a "Kembali" button.
- Phones in landscape show the two main choices side by side.
### Added
- Online: a host can start 5 matches a day, counted from 00:00 WIB. Joining someone else's room is always free. The lobby and the result screen show the host "Sisa N dari 5 match hari ini". For now the count is kept on the device.
- A "maciokYU! Premium" window that says Premium is coming soon. There are no payments yet.

## [1.0.0] - 2026-11-20
### Changed
- The game is now **maciokYU!**: a new logo on the menu and header, new app icons, and a black, cream and red theme. The green table and the tiles stay the same.
- The Hu receipt and the WhatsApp invite use the new name.
- Wind labels on the table, the active player's name and your lobby seat are easier to read.
### Added
- PUNG, KONG, JIA, BUNGA and HU callouts by the seat that makes them, and a short flower burst when someone wins. They show in single player and online, and there is no motion when reduced motion is on.
- Online: quick reactions (👍 😂 😮 😭 🔥 "Ayo cepet!" "Nice Hu!" "Hoki banget!") shown as a bubble by the sender. Other players' reactions can be muted.
- Online: the winning tile is marked on the result screen.
- Online: if the host is offline for 60 seconds or leaves, the host role passes to the longest-seated player.
- Online matches are saved in Riwayat with an "Online" badge and the match totals.
### Fixed
- Online: after a reload, the discards show in the order they were played, including around a Kong.

## [0.9.2] - 2026-11-19
### Changed
- Online: a slow connection now reads "Sinyal lemah".

## [0.9.1] - 2026-11-19
### Changed
- Online: the hand result looks like the single-player one. It has a big HU banner, a chip for how the hand was won, a Tay table without 0-Tay rows plus a total, a coloured koin table and a ready strip with a countdown bar.
- Online: the "Kocok dadu" button is large and gold, and your own row is highlighted.
- Online: bots are named Bot 1–4, because chairs don't match winds once the dealer rotates.
### Added
- Online: a connection indicator shows Online with the ping in ms, Lemot when slow, or Terputus while reconnecting.
### Fixed
- Online: two players can't have the same name; the second "A Liong" becomes "A Liong 2". Lookalike names with extra spaces or invisible characters count as the same name.
- Online: the hand result shows each player's real seat wind after the dealer rotates.

## [0.9.0] - 2026-11-19
### Added
- Install the game as an app: Settings shows "Pasang sebagai aplikasi" (Android) or the Add to Home Screen steps (iPhone). The app opens full screen.
- The screen stays on while you play ("Layar tetap menyala saat main", on by default).
- Online: when it becomes your turn and the tab is in the background, the tab title blinks "Giliran Anda!", a sound plays and Android phones vibrate.
- Online: "Main lagi" lets the host start a new match with the same people in the same room, starting with the seat dice.
### Changed
- Phones: your hand fills the screen width with bigger tiles, side players' sets and flowers stay on the table, and long names are shortened with "…".
- iPad: the top player and the Kim label sit inside the table and the discard area uses the space.
- Wide landscape phones show the green table panel.

## [0.8.0] - 2026-11-19
### Added
- "Susun otomatis" toggle by your hand. Turn it off to arrange tiles yourself by dragging; a new tile goes to the right end, and every new hand starts sorted.
- Online: a "Waktu hampir habis!" countdown shows in the last 5 seconds of your turn or claim.
- Online: after a hand, every player presses "Lanjut"; the next hand starts when everyone is ready or after 120 seconds. Offline players and bots count as ready.
- Online: at the start of a match every player rolls three dice for their seat. Highest total sits at Dong (first dealer), then Nan, Xi, Bei; ties roll again.
- Online: the host can let a bot play for an offline player ("Ganti bot"). The player gets the seat back when they return.
### Changed
- Bots take 1.5–3 seconds to discard and 1–2 seconds to claim, online and in single player.
- Phones in landscape get a compact table layout; the hand no longer covers the board.

## [0.7.2] - 2026-11-16
### Changed
- House rule (players, 2026-11-16): Kim may be discarded, but nobody can claim a discarded Kim. That means no Jia, Pung, Kong or Hu on it. The Turnamen preset keeps the PDF ban.
- House rule: choosing "Tanpa Kim" sets Min Tay to 3; a Kim mode sets 5. The room host can still change it.
- Saved settings move to the house rules once; an explicit Turnamen choice is kept.

## [0.7.1] - 2026-11-16
### Changed
- A Kong claimed from a discard now opens the hand: a self-draw scores Ce Mo instead of Ce Mo Pu Ciu Jen, and a discard win no longer scores Mun. It still counts for Sam/Si Am Kang. A Kong you draw yourself keeps the hand concealed. (Players, 2026-11-16; the Mun part waits for the group's confirmation.)
- Every Kong button and message says just "Kong"; the Riichi term "Kakan" and the word "Ankong" are gone.
- Sok tiles use only green and red, so they no longer look like Tong.
- Pung, Kong, Jia and flower tiles beside each player are bigger and upright; the side seats show one set per row.
- The online name field suggests "A Liong".

## [0.7.0] - 2026-11-16
### Added
- **Main bareng teman** (online multiplayer). Create a private room, invite friends with a 6-character code or a link, and share it to WhatsApp. Empty seats can be filled with bots.
- Room rules the host can change in the lobby: Kim mode, Min Tay, turn time (5 s to 60 s, or no limit), the 90-minute limit, bot level and spectators.
- A turn timer. When it runs out, the just-drawn tile is discarded and a claim counts as a pass. Bots never take over a player's seat.
- Automatic reconnect and "Lanjutkan room". A seat is kept when a player drops out, and an Offline/AFK badge shows on the table.
- A "Cara undang teman" guide in the online menu and the lobby.
- The game is now also at indomahjong.pages.dev.
### Security
- Hidden tiles never leave the server: each player receives only their own hand, and every hand is shuffled with fresh cryptographic randomness.

### Docs
- Recorded the players' multiplayer decisions in `BACKLOG.md`.
- Added the multiplayer turn-timer house rule and the room form fields.
- A Pung/Jia claim can't be undone when the timer runs out; which tile is then discarded is still an open question for the players.
- Multiplayer claim prompts appear only when the claim is possible.
- Added a subtle visual polish item to the backlog.

## [0.6.5] - 2026-11-15
### Changed
- The dice are rolled only at the start of a match; later hands deal straight away.

## [0.6.4] - 2026-11-15
### Added
- Guzheng tea-house background music.

## [0.6.3] - 2026-11-15
### Fixed
- A selected tile no longer lifts a second time when hovered or focused.

## [0.6.2] - 2026-11-15
### Fixed
- Music follows the volume slider, and zero volume stops it completely.
- Sound effects recover after the browser tab returns to the foreground.

## [0.6.1] - 2026-11-15
### Added
- Background music and three separate volume sliders.
### Changed
- Sound effects are quieter.
### Removed
- The 3D table view.

## [0.6.0] - 2026-11-14
### Added
- OPTION panel.
- Difficulty can be chosen from the menu.
- Three dice.
### Changed
- The table shows a framed discard area.

## [0.5.11] - 2026-11-14
### Fixed
- A Kong made from a concealed triplet stays concealed.
- The Hu hand is grouped by set.

## [0.5.10] - 2026-11-14
### Fixed
- The central discard pool shrinks to fit late in a hand.

## [0.5.9] - 2026-11-14
### Changed
- The 8 Sok tile uses printed-set art with leaning middle sticks.

## [0.5.8] - 2026-11-14
### Fixed
- Pyong Pi now stacks with Tjit Tuei.

## [0.5.7] - 2026-11-12
### Changed
- A Kong's koin are paid immediately by every other player.

## [0.5.6] - 2026-11-12
### Added
- Developer mode for troubleshooting scoring.

## [0.5.5] - 2026-11-12
### Changed
- Round Score is counted in koin instead of "x2 points".

## [0.5.4] - 2026-11-12
### Changed
- Ce Mo / Mun hands are worth double points.

## [0.5.3] - 2026-11-12
### Added
- Kim indicator on the table.
### Changed
- The dealer always rotates.
### Fixed
- Restored the discard pool.

## [0.5.2] - 2026-11-12
### Changed
- UI polish: flat table by default, themed menu, and discards shown per player.

## [0.5.1] - 2026-11-12
### Fixed
- The dealer rotates after every Hu in the 16-game match.

## [0.5.0] - 2026-11-12
### Added
- Table info and a total point table.

## [0.4.9] - 2026-11-12
### Fixed
- Flower and season scoring follows the rulebook.

## [0.4.8] - 2026-11-12
### Added
- Switchable table view: 3D tilted or flat.

## [0.4.7] - 2026-11-12
### Fixed
- A claimed meld's tile lies sideways without overlapping its neighbours.

## [0.4.6] - 2026-11-12
### Fixed
- Resolved rules after research: Am Kang, Thi Fu, Se Sam Pu Tat and Ce Chiong Kong.

## [0.4.5] - 2026-11-12
### Fixed
- Tuei Tuei is no longer affected by the pair.

## [0.4.4] - 2026-11-12
### Added
- Tay ranking.
- Fixed 16-game matches.
### Changed
- Valued-pair rule.

## [0.4.3] - 2026-11-12
### Changed
- Single Kim setting.
- One-row header on phones.
- Larger table on big screens.

## [0.4.2] - 2026-11-12
### Added
- Opening dice.
- 16 and 16++ matches.
- Tay totals and a tile counter.

## [0.4.1] - 2026-11-12
### Added
- Tilted 3D table.
- Real wall depletion.
- Player house rules.

## [0.4.0] - 2026-11-12
### Added
- Timed matches.
### Changed
- Refined the 3D table.

## [0.3.0] - 2026-11-12
### Added
- Kim can be played with natural tiles, with a Bo KIM option.
- Continuous rotating matches.

## [0.2.0] - 2026-11-11
### Changed
- Polished the public game interface.
- The release version is shown in the game.

## [0.1.0] - 2026-11-10
### Added
- First release: Indonesian Traditional Mahjong (ITM / YDSP) casual web edition.
- Readable feature guide, plus tighter play, history and Tay calculator.
- Practice mode opened from a menu, with a coach that points out the legal action.
- Better practice pacing, new tile artwork and rule verification.
- Animated table actions; match scoring follows the pregame choices.
### Fixed
- Bonus tile colors and flower order match the supplied reference.
