# Train Bridge Constructor

16-bit style train bridge building game for iPhone (portrait and landscape), built with
Vite + React 19 + TypeScript. Hosted on GitHub Pages:
https://mediocreaicoder.github.io/TrainBridgeConstructor/

The full feature wish list (materials, trains, controls, terrain, difficulty) is in the
claude.ai project "Train Bridge Cosntructor". The phased plan, every decision taken so far and the
status of each phase are in `docs/PLAN.md`. Read it before starting new work, and keep it
updated as decisions are made.

## Working agreement

- The user is a developer and reviews all code. Write readable code: small functions,
  descriptive names, comments where the logic isn't obvious (especially physics).
- The user commits and pushes from VSCode. Do not commit or push unless asked.
- Talk to the user in Norwegian. Code, comments and in-game text are in English.
- No extra frameworks or libraries without asking first.
- Run lint, test and build before saying a change is done, and check visual changes in the
  browser (see Testing in the browser).

## Commands

- `npm run dev`: dev server at http://localhost:5173/TrainBridgeConstructor/ (also on LAN via
  --host). vite-plugin-checker shows type/lint errors as a browser overlay. `?level=N` jumps
  straight to a level (and skips the lock).
- `npm run lint`: ESLint.
- `npm run test`: Vitest (Node, no DOM). Tests live next to the code as `*.test.ts`.
- `npm run build`: `tsc --noEmit` + `vite build`.
- Deploy: every push to `main` runs `.github/workflows/deploy.yml` (lint, test, build, Pages
  deploy).

## The game in short

- Nine levels. The player builds a bridge from four materials (track, wood, steel, cable) and
  sends a train across. Any train on any level: handcar, maintenance locomotive, passenger train
  or goods train, worth 1–4 stars. The best stars per level are saved; 1 star opens the next
  level.
- Each level has a budget. Materials have a price per unit of length; going over budget is
  allowed but costs a star (so an over-budget handcar earns none).
- The bridge is simulated with XPBD physics: beams stretch, show their strain in colour (green →
  yellow → red) and break. Trains are chains of cars that load the beams they stand on.

## Architecture

- `src/game/`: plain TypeScript, no React. Runs every frame.
  - `Engine.ts`: rAF loop, pointer input (build, pan, pinch, long press to move a joint),
    camera/zoom, edit and run modes. Emits `EngineEvent`s to the UI.
  - `camera.ts`: world units ↔ canvas/CSS pixels, zoom and pan.
  - `render.ts`: draws a frame (sky, water, grid, terrain, pillars, track, beams, joints, drag
    preview, effects). `renderVehicle.ts` paints the train cars as sprites.
  - `level.ts`: level data (terrain, pillars, anchors, bridge ends, hint, budget).
  - `bridge.ts` / `editor.ts` / `materials.ts`: immutable bridge model and cost, undo/redo,
    drag planning (grid and triangle snapping, automatic material), the material table. All
    balancing values (stiffness, strength, mass, price) live in `materials.ts`.
  - `physics.ts` / `run.ts`: XPBD bridge physics (mutates in place for speed) and one run
    (physics + train stepped together at a fixed 1/120 s).
  - `train.ts`: trains as chains of cars, their stars and wheel loads. Pure.
  - `progress.ts`: stars, budget penalty and level unlocking. Pure.
  - `cues.ts` / `audio.ts` / `effects.ts`: sound cues per step (pure), Web Audio playback
    (synthesised sounds, recordings in `public/sounds/` via `SOUND_FILES`), splash droplets
    and screen shake.
  - `debug.ts`: dev-only `window.__game` (state, `addBeam`, `undo`, `play`, `stepSeconds`,
    `sounds`, ...) for the console and scripted browser tests. Stripped from production builds.
- `src/ui/`: React components. `GameCanvas.tsx` is the ONLY bridge between React and the
  engine: it creates the Engine in a useEffect and forwards events and commands. React never
  runs per frame. `App.tsx` holds the UI state (level, train, material, stars, results);
  `preferences.ts` saves settings and progress in `localStorage` (always in try/catch).
- Pixel look: the canvas backing store is a whole number of pixels per world unit
  (`pixelScale`), and everything is drawn on whole world units, so it stays crisp. The
  320×180 playfield is always fully visible at zoom 1; CSS scales the canvas with
  `image-rendering: pixelated`. UI icons are pixel art too (`PixelIcon.tsx`).
- Coordinates: world units, origin top-left, y down. Terrain polygons are clockwise and extend
  far beyond the playfield, so wide/tall screens show more landscape.
- TypeScript is strict with `noUncheckedIndexedAccess`.

## Tests

- Pure game logic is unit tested. Unit tests use the fixed `TEST_LEVEL`
  (`src/game/testing/testLevel.ts`), not the real levels, so redesigning a level doesn't break
  them. `BridgeBuilder` (`src/game/testing/bridgeBuilder.ts`) builds bridges by position.
- `levels.test.ts` plays every level with real physics: a bare track deck must lose, a light
  bridge must carry the handcar and a strong one the goods train, both within the budget and
  the building rules. Run it after changing levels, materials, trains or physics.
- When tuning, measure first (a temporary probe test that prints strains or costs), then pick
  values, then delete the probe.

## Testing in the browser

- The Playwright MCP server is configured in `.mcp.json` (iPhone 15 emulation). Screenshots
  go to `.playwright-mcp/` (git-ignored).
- With `npm run dev` running, use `window.__game` to build bridges and step runs quickly, and
  CDP touch events (`Input.dispatchTouchEvent`) for real touch gestures.
- On iPhone, the ring/silent switch can mute Web Audio; the game asks for a "playback" audio
  session (iOS 16.4+) and unlocks audio on pointerup.

## Next steps

See `docs/PLAN.md`: phase 7 (polish) and phase 8 (landing page and high scores) are next.
