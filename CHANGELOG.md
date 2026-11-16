# Changelog

## [Unreleased]

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
