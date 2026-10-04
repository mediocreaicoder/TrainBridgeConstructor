# Train Bridge Constructor

16-bit style train bridge building game for iPhone (portrait and landscape), built with
Vite + React 19 + TypeScript. Hosted on GitHub Pages:
https://mediocreaicoder.github.io/TrainBridgeConstructor/

The full feature wish list (materials, trains, controls, terrain, difficulty) is in the
claude.ai project "Train Bridge Cosntructor". Build it step by step, starting with the basics.

## Working agreement

- The user is a developer and reviews all code. Write readable code: small functions,
  descriptive names, comments where the logic isn't obvious (especially physics).
- The user commits and pushes from VSCode. Do not commit or push unless asked.
- Talk to the user in Norwegian. Code, comments and in-game text are in English.
- No extra frameworks or libraries without asking first.

## Commands

- `npm run dev`: dev server at http://localhost:5173/TrainBridgeConstructor/ (also on LAN via --host).
  vite-plugin-checker shows type/lint errors as a browser overlay. `?level=N` jumps to a level.
  In dev, `window.__game` (see `src/game/debug.ts`) exposes engine state for console/scripted tests.
- `npm run lint`: ESLint
- `npm run test`: Vitest (Node, no DOM). Tests live next to the code as `*.test.ts`.
- `npm run build`: `tsc --noEmit` + `vite build`. Run lint, test and build before saying a change
  is done.
- Deploy: every push to `main` runs `.github/workflows/deploy.yml` (lint, test, build, Pages deploy).

## Architecture

- `src/game/`: plain TypeScript, no React. Runs every frame.
  - `Engine.ts`: rAF game loop, pointer input, resize. Emits `EngineEvent`s to the UI.
  - `camera.ts`: world units ↔ canvas/CSS pixels.
  - `render.ts`: draws a frame (sky, water, terrain, track, flags, beams, joints, drag preview).
  - `level.ts`: level data (terrain polygons, anchors, bridgeStart/bridgeEnd).
  - `bridge.ts` / `editor.ts` / `materials.ts`: immutable bridge model, undo/redo and drag
    snapping, material table. Pure and unit tested.
  - `train.ts` / `renderVehicle.ts`: vehicle model (pure, tested) and its sprite. Runs use a
    fixed 1/120 s step (`Engine.update`).
  - `physics.ts` / `run.ts`: XPBD bridge physics (mutates in place for speed) and one run
    (physics + vehicle stepped together). Balancing values live in `materials.ts`.
  - `cues.ts` / `audio.ts` / `effects.ts`: sound cues per step (pure), Web Audio playback
    with synthesised sounds (swap in files via `SOUND_FILES`), splash droplets and screen shake.
- Full plan and per-phase status: `docs/PLAN.md`.
- `src/ui/`: React components. `GameCanvas.tsx` is the ONLY bridge between React and the
  engine: it creates the Engine in a useEffect and forwards events. React never runs per frame.
- Pixel look: the canvas backing store is 1 px per world unit; the 320×180 playfield is always
  fully visible and CSS scales it with `image-rendering: pixelated`.
- Coordinates: world units, origin top-left, y down. Terrain polygons are clockwise and extend
  far beyond the playfield so wide/tall screens show more landscape.
- TypeScript is strict with `noUncheckedIndexedAccess`.

## Planned next steps

1. Wire `vite-plugin-checker` (already installed) into `vite.config.ts` for type/lint overlay.
2. Dev-only debug hook `window.__game` to inspect/drive engine state in tests.
3. Bridge building: drag beams between anchors/joints, snapping, double-tap to remove, undo/redo.
4. Physics (verlet or similar) with strain colouring, then trains, then more levels.
