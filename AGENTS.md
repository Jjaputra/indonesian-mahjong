# Agent guide

Shared context for every coding agent on this repo (Claude, Codex, Cursor, Gemini, Grok). Read this before the task spec. A spec only says what is different for that task.

## Project

Indonesian Traditional Mahjong (ITM / YDSP) in the browser: React 19 + TypeScript + Vite, tests in Vitest. Online only, with a Cloudflare room server and localStorage for browser preferences and history; single player removed 2026-11-22. The owner is Jason; feedback comes from his WhatsApp mahjong group, usually in casual Indonesian.

## Rule sources, in priority order

1. **Bandung Mahjong Cup Rulebook ver06 PDF.** It always wins. Tay names are Hokkien readings of Chinese terms (Am Kang = 暗刻, Ciok = 雀, Kim = 金), so search the Chinese terms too.
2. **Player house rules** confirmed in chat. They are recorded in `RULES.md` with a date.
3. **MahjongLeh / PlayLeh** (https://playleh.com/mahjongleh-rules.html), only where the PDF is silent.

Don't bring in other variants (Fuzhou "gold", Riichi, ...). `RULES.md` is the implemented rule set with all 44 Tay rows. Don't change a Tay value or the 44-row table unless the task says so. If a rule can't be implemented or is unclear, say so in your report with a proposed fix and the question; don't just note it in `RULES.md`.

## Code map

| Area | Where |
| --- | --- |
| Tiles, melds, game engine, round score | `src/core/` (`game-engine.ts`, `types.ts`, `tiles.ts`, `melds.ts`, `round-score.ts`) |
| Kim (joker) solving | `src/kim/` (`wildcard-solver.ts`, `kim-mode-evaluator.ts`) |
| Tay scoring | `src/scoring/` (`scoring-engine.ts`, `hand-parser.ts`) |
| Bots | `src/ai/` |
| Multiplayer game session (seat-agnostic, used by the server) | `src/session/` (`table-session.ts`) |
| Multiplayer wire protocol and client | `src/net/` (`protocol.ts` is the contract for both sides) |
| Room server (Cloudflare Worker + Durable Object) | `server/` (`room.ts` logic, `index.ts` DO adapter, `router.ts`) |
| Save data and history | `src/storage/storage.ts` (persist new Meld fields here) |
| UI | `src/ui/` (`game-controller.ts`, `components/`), styles in `src/index.css` |
| Tests | `tests/<area>/`, mirroring `src/` |
| Notes, briefs and reference images | `.agents/` |
| Requests not scheduled yet | `BACKLOG.md` |
| Player reports, status and lessons | `FEEDBACK.md` (read before UI or online work) |

Multiplayer locally: `npm run server:dev` (room server on :8787), then `VITE_MP_SERVER=http://localhost:8787 npx vite --port 5199 --strictPort`. Use a second port for a second player; each origin has its own seat token.

Layout audit: `node scripts/layout-audit.mjs [--state x] [--viewport WxH] [--page id]` measures `?demo=online&state=…` fixtures (`src/ui/dev-online-demo.ts`, dev builds only) at 21 sizes. Output goes to `.agents/layout-audit/`. Run it before any UI release. One audit at a time: it drives the shared Orca browser.

Dev preview (dev builds only): `npx vite --port 5199 --strictPort`, then open `?demo=table|late|claim|hu|seri|dice|melds|final` for fixed table states. Production builds exclude this entry.

## Checks

```
npx tsc --noEmit
npx vitest run
npm run build
```

All three must pass before you report done. For scoring changes, add tests that print each case's breakdown (pattern, reason, Tay) with `console.log`, and paste that output in your report.

## Conventions

- Match the surrounding code: naming, comment density, terse helpers.
- UI text is Indonesian and says "tile", not "ubin". Code, comments and docs are English.
- **LF line endings only** (`.gitattributes` enforces this). Don't let your editor rewrite a whole file to CRLF.
- Keep diffs to the task. No drive-by refactors, no new dependencies unless the spec allows them.

## Working as a worker

- **Don't commit, push, or bump the version.** The coordinator releases.
- Only edit the files your spec gives you. If another file needs changing, ask the coordinator first.
- Your report lists the files you changed, the check results with test counts, any printed breakdowns, and the rule gaps or doubts you found.
- Write anything worth keeping for later agents (findings, a design you chose) to `.agents/notes-<topic>.md`, not only in your chat.

## Release (coordinator only)

1. Bump `version` in `package.json`, then `npm install --package-lock-only --silent`. Move the `[Unreleased]` notes in `CHANGELOG.md` under the new version with today's date; add a line for every player-visible change.
2. Run the checks, and run `npx vitest run` once more with `VITE_MP_SERVER=https://api.maciokyu.com` set, as CI does.
3. Commit with a `feat:`/`fix:` message ending `(vX.Y.Z)`, push the branch, open a PR to `main`, and merge it.
4. `main` deploys automatically through `.github/workflows/cloudflare.yml` (secret `CLOUDFLARE_API_TOKEN` set 2026-11-21; the room server only when server-side code changed, or via "Run workflow" with the server box ticked). Watch it with `gh run watch`. The workflow deploys the room server only when the pushed range touches server-side code. So if a deploy fails and the fix commit doesn't touch the server, deploy the server by hand or use "Run workflow" with the server box ticked. To deploy by hand:
   - **Room server:** `npx wrangler deploy --config server/wrangler.jsonc`, served at api.maciokyu.com plus the old workers.dev address. Deploy it only when server-side code changed, because a deploy restarts live rooms.
   - **Game:** build with `VITE_MP_SERVER=https://api.maciokyu.com npx vite build`, delete `dist/**/*.map` and `dist/wrangler.json`, then `npx wrangler deploy --config web/wrangler.jsonc`. That is the assets-only Worker `maciokyu-web` at maciokyu.com and www.
   - **Old addresses:** deploy the same build to Pages `indomahjong` (from an empty directory: `npx wrangler pages deploy <dist> --project-name indomahjong --branch main`). GitHub Pages (`pages.yml`) also still publishes. Both only move players to maciokyu.com (`src/storage/domain-move.ts`).
   - **Check:** `node scripts/smoke.mjs`.
