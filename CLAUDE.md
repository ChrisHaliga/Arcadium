# Arcadium

Game hub (placeholder name) bundling several games; Landgrab (Paper.io-style multiplayer territory game) is the first.
Read `docs/ARCHITECTURE.md` (the spec and module map), `docs/DECISIONS.md` (what the owner decided and why) and `docs/STATUS.md` (what is done and open) before changing anything.

## Conventions
- TypeScript strict, ES modules, Preact + @preact/signals for UI (`jsxImportSource: preact`), canvas 2D for game rendering.
- Files marked `CONTRACT FILE` define interfaces between modules. Don't change them casually; if you must, keep every implementer compiling.
- `src/games/landgrab/core` must stay deterministic (integer math, no Math.random/Date/trig, slot-order iteration). `core`, `ai`, `room`, `net/protocol` must not touch DOM/browser APIs (the server imports them).
- All tuning numbers go in `src/games/landgrab/config.ts`; colours in `palette.ts`; cosmetics/missions in `content.ts`.
- Match surrounding code style; comments explain why, not what. No dead code, no TODO stubs left behind.
- Tests: Vitest (`npm test`), colocated as `*.test.ts`. Only tests that prove the game works (see ARCHITECTURE.md "Testing"). Playwright e2e in `e2e/` (`npm run test:e2e`).
- Typecheck with `npx tsc --noEmit`.
- Don't add npm dependencies without a strong reason.

## Commands
- `npm run dev` — client at http://localhost:5173
- `npm run dev:server` — match server at ws://localhost:8787/play
- `npm test`, `npm run test:e2e`, `npm run typecheck`, `npm run build`
