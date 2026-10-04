# Implementation plan

This is the hand-off document for continuing development with Claude Code. It describes where
the project stands, the design decisions so far, and a phased plan in which each phase is small
enough to review, commit and test on the phone before the next one starts.

Work one phase at a time. At the end of each phase: `npm run lint`, `npm run test`
(from phase 0 on), `npm run build`, a check in the browser at phone size, and then the user
reviews and commits.

---

## 1. Current state (v0.1)

What works:

- Vite + React 19 + strict TypeScript, ESLint, GitHub Actions deploy to Pages.
- Deployed: https://mediocreaicoder.github.io/TrainBridgeConstructor/
- Level 1 is drawn in a pixel style: banded sky, two cliffs with grass and dirt speckles,
  animated water, rails on both banks, start and goal flags, a dashed hint line across the gap,
  and four anchor points.
- Works in portrait and landscape. The 320×180 playfield is always fully visible.
- Phase 0 is done: type/lint overlay (vite-plugin-checker), Vitest, `window.__game` in dev, `?level=N`.
- Phase 1 is done: drag from a joint to build beams (grid snap 5, joint snap 8, end lifted 20 CSS px
  above the finger on touch), double-tap a beam to remove it, undo/redo, toolbar with materials.
  Decisions: beams must start from an anchor or joint; beams may cross.

What doesn't exist yet: physics, trains, sound, more levels.

### Files

| File | Responsibility |
| --- | --- |
| `src/game/Engine.ts` | rAF loop, pointer input, resize, event emitter. `update(dt)` is the hook for simulation. |
| `src/game/camera.ts` | `fitCamera()` and `cssToWorld()`. |
| `src/game/render.ts` | `renderFrame()` plus one function per layer. `FrameState` holds per-frame data. |
| `src/game/level.ts` | `Level` interface, `LEVELS`, `getLevel()`. |
| `src/game/types.ts` | `Vec2`, `distance()`. |
| `src/game/geometry.ts` | Distance to segment, point-in-polygon. |
| `src/game/materials.ts` | `MATERIALS` table (balancing values), `MIN_BEAM_LENGTH`. |
| `src/game/bridge.ts` | Immutable `Bridge` model: `addBeam`, `removeBeam`, `canPlaceBeam`, hit tests. |
| `src/game/editor.ts` | Undo/redo `History`, and `planBeam()` (snapping + validation while dragging). |
| `src/game/debug.ts` | Dev-only `window.__game` (state, `addBeam`, `removeBeam`, `undo`, `redo`). |
| `src/ui/GameCanvas.tsx` | Creates and destroys the Engine, forwards events, exposes `GameControls` (undo/redo) via ref. |
| `src/ui/Hud.tsx` | Text overlay (`pointer-events: none`). |
| `src/ui/Toolbar.tsx` | Material picker, undo, redo, play (disabled until phase 2). |
| `src/App.tsx` | UI state (material, undo/redo availability); wires engine events to the toolbar. |

### Rules that must stay true

1. **React never runs per frame.** The engine owns the canvas and the loop. React sends commands
   in (methods on `Engine`) and receives events out (`EngineEvent`). Only `GameCanvas.tsx`
   touches the Engine instance; pass it down via a ref or context if the toolbar needs it.
2. **Game logic is pure TypeScript** and can be tested in Node without a browser. Keep DOM and
   canvas code in `Engine.ts` and `render.ts`; keep models (bridge, physics, train) DOM-free.
3. **World units = virtual pixels.** Origin top-left, y down. Round to whole pixels when drawing
   so the pixel look stays crisp.
4. **Terrain polygons are clockwise** (grass is drawn on top edges that go rightwards) and
   extend far beyond the playfield.
5. StrictMode mounts effects twice in dev. `Engine.destroy()` must fully clean up.

---

## 2. Phase 0: Feedback loop (do this first)

Goal: Claude Code can change, verify and test on its own.

- [x] Wire `vite-plugin-checker` into `vite.config.ts` (`typescript: true`,
      `eslint: { lintCommand: 'eslint "./src/**/*.{ts,tsx}"', useFlatConfig: true }`), so type and lint errors show
      as an overlay in the browser.
- [x] Add Vitest: `npm i -D vitest`, script `"test": "vitest run"`, and put tests next to
      the code as `*.test.ts`. Start with tests for `camera.ts` (`fitCamera`, `cssToWorld`).
- [x] Add `npm run test` to `.github/workflows/deploy.yml` after lint.
- [x] Dev-only debug hook. In `Engine.start()`, when `import.meta.env.DEV` is true, set
      `window.__game = { engine, getState(), ... }`. It should expose read-only state plus a few
      commands for scripted browser tests (later: `addBeam`, `play`, `stepSeconds(n)`). Type it in
      `src/game/debug.ts` and never include it in production builds.
- [x] Optional: `?level=N` URL parameter to jump straight to a level while testing.

Done when: a deliberate type error shows up in the browser overlay, `npm run test` passes, and
`window.__game.getState()` returns the frame state in the dev console.

---

## 3. Phase 1: Bridge editing (no physics)

Goal: the player can draw a bridge, remove parts, undo and redo. Nothing moves yet.

### Data model: `src/game/bridge.ts` (pure, immutable)

```ts
type MaterialId = 'track' | 'wood' | 'steel' | 'cable';

interface Joint { id: number; position: Vec2; fixed: boolean }   // fixed = level anchor
interface Beam  { id: number; a: number; b: number; material: MaterialId } // joint ids

interface Bridge { joints: Joint[]; beams: Beam[]; nextId: number }
```

- Level anchors become fixed joints when a level loads.
- Pure functions that return a new `Bridge`: `addBeam(bridge, from, to, material)`,
  `removeBeam(bridge, beamId)` (also removes free joints left with no beams), and
  `findJointNear(bridge, pos, radius)` / `findBeamNear(...)`.
- Validation in `canPlaceBeam(...)`: length between `MIN_BEAM_LENGTH` and the material's
  `maxLength`, no duplicate beam between the same two joints, the end point not inside terrain.

### Materials: `src/game/materials.ts`

A single table, so balancing happens in one place. Starting values (tune in phase 2):

| Material | maxLength | Stiffness | Breaks at strain | Notes |
| --- | --- | --- | --- | --- |
| track | 20 | medium | 1.5 % | Road deck. The train only drives on track beams. |
| wood | 24 | medium | 1.2 % | Cheap support. |
| steel | 32 | high | 3 % | Strong support. |
| cable | 64 | high in tension | 2 % | Tension only: slack when compressed. |

### Editing: `src/game/editor.ts`

- History: `past: Bridge[]`, `present: Bridge`, `future: Bridge[]`. Immutable snapshots make
  undo/redo trivial; the bridges are small, so memory doesn't matter. Cap the history at about
  100 entries.
- Gestures (in Engine, translated to editor calls):
  - **Drag** from a joint or anchor to an empty point creates a free joint and a beam. Drag to an
    existing joint connects the two. The end point snaps to joints within the snap radius, and
    otherwise to a grid (suggestion: 5 units).
  - While dragging, draw a preview beam: white if valid, red if not, and clamp it to the
    material's `maxLength`.
  - **Double-tap** a beam (two taps within 300 ms and 8 units) removes it.
  - A tap that doesn't start a drag does nothing (avoid accidental beams).
- Touch detail: lift the drag point about 20 CSS px above the finger, or show a magnifier, so
  the finger doesn't hide the end point. Decide after testing on the phone.

### UI: `src/ui/Toolbar.tsx`

- Material buttons (track, wood, steel, cable), undo, redo, and play (disabled in this phase).
- Pixel style using the same palette and font as the HUD. Buttons need at least 44×44 CSS px
  for touch and must respect safe-area insets.
- Engine API for the UI: `setMaterial(id)`, `undo()`, `redo()`. Event out:
  `{ type: 'historyChanged', canUndo, canRedo }`.

### Rendering

- Beams are drawn as pixel lines in the material's colour (track: dark planks and a rail line on
  top; wood: brown; steel: grey with a dark outline; cable: thin dark line). Joints are drawn as
  small circles or squares.

### Tests

`bridge.test.ts` and `editor.test.ts`: add, remove, orphan cleanup, validation, and
undo/redo sequences (including that a new action clears `future`).

Done when: on the phone you can build a deck across level 1, remove a beam with a double-tap,
and undo and redo several steps.

---

## 4. Phase 2: Physics and strain

Goal: press Play, the bridge sags under its own weight, beams show strain in colour, and
overloaded beams break. Abort restores the editor.

### Method: Verlet integration with position-based distance constraints

This is simple, stable and readable, and well suited to this genre.

- `src/game/physics.ts`: `createSimulation(bridge)` returns a `Simulation` with point masses
  (`pos`, `prevPos`, `invMass`, where 0 means fixed) and constraints (`a`, `b`, `restLength`,
  `material`, `broken`).
- Fixed time step: `1/120` s with an accumulator in `Engine.update` (deterministic, and the same
  result on every device), capped at about 8 steps per frame.
- Per step: gravity → Verlet → N iterations (start at 20) of constraint solving → fixed joints
  back in place.
- Mass per joint = half the mass of each connected beam (from the materials table).
- Stiffness: partial correction per iteration (`stiffness` in 0..1) per material.
- Cable: only correct when `length > restLength`.
- Strain = `(length - restLength) / restLength`. Smooth it a little (a moving average) before
  colouring and breaking, so single spikes don't break a beam.
- Break: when `|strain| > breakStrain` the constraint gets `broken = true`, and from then on it is
  ignored. For now, the beam is drawn as two halves that fall (later: real fragments).
- Fall-out: masses that fall below `waterY` (or the bottom of the screen) stop being simulated.

### Strain colour

Linear from green (0) through yellow (50 % of the break limit) to red (100 %). Draw the beam in
the strain colour in sim mode, and in the material colour in edit mode.

### Modes

- `mode: 'edit' | 'simulate'` in Engine. Play builds a simulation from the editor's `present`;
  Abort throws the simulation away. The bridge itself is never changed by the simulation.
- Events: `{ type: 'modeChanged', mode }`, `{ type: 'beamBroke', beamId }`.

### Tests

- A short steel beam between two anchors holds after 5 simulated seconds.
- A long, unsupported deck of wood breaks.
- A cable under compression doesn't push.
- Determinism: the same bridge gives identical positions after N steps.

Done when: the bridge visibly sags, the colours make sense, and an obviously bad bridge collapses.

---

## 5. Phase 3: Train

Goal: a simple locomotive drives from the left, across the bridge, and to the goal, or falls.

- `src/game/train.ts`. The simplest model that still loads the bridge correctly:
  - The train is a chain of cars. Each car has two wheels (axles) at fixed distances, and the
    train moves at a constant target speed along x.
  - For each wheel, find the track surface under it: static rails on land (the level's banks),
    or a non-broken **track** beam in the simulation. The wheel's y is interpolated along the
    beam.
  - The wheel's weight is applied as a force on the beam's two joints, split by where the wheel
    is along the beam (lever principle). This is what makes the bridge sag under the train.
  - If there is no track under a wheel, the car falls freely (simple ballistics plus rotation)
    and the run is lost.
- Win: the front of the train reaches `bridgeEnd.x + some margin`, and every car is on track.
- Lose: a car falls below `waterY` or out of the screen.
- Events: `{ type: 'trainArrived' }`, `{ type: 'trainLost' }`.
- Graphics: the locomotive as a small pixel sprite (draw it in code with `fillRect` first, use
  sprite sheets later), with wheel animation and smoke puffs.

Done when: level 1 can be won with a sensible bridge and lost with a bad one.

---

## 6. Phase 4: Feedback, sound and screams

- `src/game/audio.ts` using the Web Audio API. iOS requires audio to be unlocked by a user
  gesture: create or resume the `AudioContext` on the first tap or Play.
- Sounds: train rumble and whistle, wood creaking under high strain, a crack when a beam breaks,
  a splash, and **screams** when the train falls (the main feature from the original game).
- Sources: generate simple ones with Web Audio (noise and oscillators for cracks and splashes),
  or use CC0 sound files in `public/sounds/` with a licence note in `public/sounds/CREDITS.md`.
- A mute button in the toolbar, with the choice saved in `localStorage`.
- Effects: water splash particles, shaking on breaks, and a result panel (React) with "Try again",
  "Edit bridge" and "Next level".

---

## 7. Phase 5: Levels and progression

- Extend `Level` with: `allowedMaterials`, `train` (type), and optionally `hint`.
- Level select screen (React) and progress saved in `localStorage` (completed levels, wrapped in
  try/catch).
- Level ideas, in rising difficulty:
  1. Short gap, anchors at deck height (current level).
  2. Wider gap: needs supports under the deck.
  3. Low anchors on the cliff faces: build a truss from below.
  4. A gap that is too wide for wood: needs steel.
  5. High anchor points above the deck: a suspension bridge with cables.
  6. Two gaps with a small island in the middle.
  7. Heavier train on a known gap.
- Consider a small level editor in dev mode later (`?editor`) to draw terrain and anchors and
  export JSON.

---

## 8. Phase 6: More trains

Defined in `src/game/trains.ts` as data: number of cars, mass per car, length, speed and sprite.

| Train | Cars | Mass | Notes |
| --- | --- | --- | --- |
| Simple locomotive | 1 | low | Levels 1–3. |
| Passenger train | 3–4 | medium | Screams when it falls. |
| Goods train | 5–6 | high | Long load spread out over the bridge. |
| Armored train | 2–3 | very high | Final levels. |

---

## 9. Phase 7: Polish

- PWA: `manifest.webmanifest`, home screen icons (180×180 apple-touch-icon), and a simple
  service worker for offline play (consider `vite-plugin-pwa`; ask first).
- Performance on iPhone: cache static layers (sky and terrain) in an offscreen canvas that is
  redrawn only on resize; today the dirt speckles are drawn every frame.
- Pixel sprites for trains and materials, and parallax clouds or mountains in the background.
- Optional haptics on beam breaks (not supported in iOS Safari; skip if it adds complexity).
- Budget per level (explicitly "not yet" in the wish list; plan for it in `Level` but don't
  build it).

---

## 10. Decisions to clarify with the user along the way

- Grid snap size (suggestion: 5 units), and whether beams may cross each other.
- Whether the bridge must be built from the start flag, or whether free floating beams are allowed.
- Touch: offset the drag point above the finger, or use a magnifier?
- Sound: generated sounds, or CC0 recordings (which screams)?
- Whether the train should brake or keep going when the bridge starts to fail.

---

## 11. Manual test on the phone (each phase)

1. Open the Pages URL (or the dev server's `Network:` URL on the same Wi-Fi).
2. Portrait and landscape, and a reload in both.
3. All gestures with fingers, including fast double-taps (no page zoom must happen).
4. Added to the home screen: fullscreen, no address bar, and the notch doesn't cover the UI.
