# Agent guide

Shared context for every coding agent on this repo (Claude, Codex, Cursor, Gemini, Grok). Read this before the task spec. A spec only says what is different for that task.

## Project

Indonesian Traditional Mahjong (ITM / YDSP) in the browser: React 19 + TypeScript + Vite, tests in Vitest. No server; state is in localStorage. The owner is Jason; feedback comes from his WhatsApp mahjong group, usually in casual Indonesian.

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
| Developer mode (hand codes, sandbox) | `src/dev/` |
| Save data and history | `src/storage/storage.ts` (persist new Meld fields here) |
| UI | `src/ui/` (`game-controller.ts`, `components/`), styles in `src/index.css` |
| Tests | `tests/<area>/`, mirroring `src/` |
| Notes, briefs and reference images | `.agents/` |
| Requests not scheduled yet | `BACKLOG.md` |

Dev preview: `npx vite --port 5199 --strictPort`. Then open `?demo=table|late|claim|hu|seri|dice|melds|final` (add `&view=flat`) to see a fixed table state.

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

1. Bump `version` in `package.json`, then `npm install --package-lock-only --silent`.
2. Run the checks.
3. Commit with a `feat:`/`fix:` message ending `(vX.Y.Z)`, push the branch, open a PR to `main`, and merge it.
4. `main` deploys to GitHub Pages through `.github/workflows/pages.yml`. Watch the run with `gh run watch`.
