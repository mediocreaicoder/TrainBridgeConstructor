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
- Zoom: pinch (zoom + pan), one-finger pan on empty space, mouse wheel, and −/+ buttons. Zoom 1–4;
  the view can't leave the zoom-1 area. Zooming in makes pixels bigger (canvas `pixelScale`).
  Touch radii (grab, snap, double-tap) are in CSS px, so building is more precise when zoomed in.

- Phase 2 is done: Play/Stop, a one-man handcar rolls across a rigid bridge, arrives or falls
  into the water. Fixed 1/120 s simulation step.

- Phase 3 is done: XPBD bridge physics, strain colours, beams break into dangling halves, the
  handcar loads the bridge.

What doesn't exist yet: sound and effects, more levels, more trains, terrain collisions.

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
| `src/game/physics.ts` | XPBD bridge simulation: particles, beam constraints, strain, breaking. |
| `src/game/run.ts` | One run: simulation + vehicle, stepped together (used by Engine and tests). |
| `src/game/train.ts` | Vehicle model: `buildTrack`, `createVehicle`, `stepVehicle` (roll, fall, outcome). |
| `src/game/renderVehicle.ts` | Draws the handcar sprite (animated, rotated with nearest-neighbour). |
| `src/game/pixelLine.ts` | Bresenham line helper shared by the renderers. |
| `src/game/debug.ts` | Dev-only `window.__game` (state, `addBeam`, `removeBeam`, `undo`, `redo`, `play`, `stop`, `stepSeconds`). |
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

### Triangle snapping (done)

Wood and steel must be easy to build as triangles on top of or under track beams, with the
middle of each triangle at the middle of the track beam's length. `triangleApexes()` in
`editor.ts` gives each track beam two apexes, above and below its middle, half the beam's length
away (so both legs meet the track at 45°). While dragging wood or steel, the end snaps to the
nearest apex or joint, and the apexes are drawn as small yellow diamonds.

---

## 4. Phase 2: Train on a rigid bridge (handcar)

Goal: press Play and a vehicle rolls from the left bank, across the bridge, to the goal, or falls
into the gap. The bridge doesn't bend yet (that is phase 3), so this phase is about the vehicle,
following the track, winning and losing, and the play/stop flow.

Decisions (2026-10-04):

- Trains come before physics. The bridge is rigid in this phase.
- The first vehicle is an animated **one-man handcar** (Norwegian: dressin): a small platform on
  two wheels with a man pumping a see-saw lever. More trains come in phase 6.
- Only **track** beams carry the vehicle. Wood, steel and cable are supports only.
- The handcar's speed stays at 16 world units/s for now. Revisit it once physics makes the
  crossing interesting (phase 3).

### Model: `src/game/train.ts` (pure, tested)

- `buildTrack(level, bridge)`: the drivable surface as line segments: the rails on both banks
  plus every track beam. Track beams steeper than 45° are not drivable.
- `Vehicle`: position (the point between the axles, on the rail), tilt angle, distance rolled
  (drives the animation), velocity and spin (used while falling), `status: 'rolling' | 'falling'`
  and `outcome: null | 'arrived' | 'lost'`.
- Rolling: constant speed along x. Each wheel finds the track segment under it, near its current
  height (so a beam far above or below doesn't count, and a step of more than a couple of units
  is a gap). The tilt follows the two wheels. A wheel over a gap hangs on the car's line.
- Falling: when the point between the axles has no track under it, the handcar tips off and
  falls with gravity and spin. While falling it doesn't collide with anything (yet).
- Win: the vehicle reaches `bridgeEnd.x + 24` while rolling. It keeps rolling afterwards.
- Lose: it falls into the water (or below the playfield when there is no water).
- Fixed time step of 1/120 s with an accumulator in `Engine.update`, so runs are deterministic
  (and ready for the physics in phase 3).

### Modes and UI

- `mode: 'edit' | 'run'` in Engine. Play creates the vehicle; Stop removes it and returns to the
  editor. The bridge is never changed by a run.
- The run ends by itself 1.5 s after the vehicle arrives or falls in (decided 2026-10-04), and
  the game goes back to editing. The result message stays in the HUD until the bridge changes or
  Play is pressed again. Stop can still end a run early.
- During a run: building, undo/redo and material buttons are disabled; pinch, pan and zoom still
  work. The Play button becomes Stop.
- Events: `{ type: 'modeChanged', mode }` and `{ type: 'runFinished', outcome }`. The HUD shows the
  result. (A proper result panel and sounds come in phase 4.)
- Debug hook: `play()`, `stop()`, `stepSeconds(n)`.

### Graphics

- The handcar is drawn in code into a small offscreen sprite canvas each frame (wheels with
  turning spokes, platform, see-saw lever, the man pumping in time with the wheels), then drawn
  rotated by the tilt with nearest-neighbour scaling so it stays pixel-sharp.

### Tests

`train.test.ts`: rolls along a flat bank; crosses a complete deck and arrives; falls into an
empty gap; falls where the deck has a hole; follows a sloped track beam; ignores wood beams.

Done when: level 1 can be won with a sensible bridge and lost with a bad one.

---

## 5. Phase 3: Physics and strain

Goal: press Play, the bridge sags under its own weight and under the vehicle, beams show strain in
colour, and overloaded beams break. Stop restores the editor.

Status: done (2026-10-04).

### Method: XPBD with small steps (`src/game/physics.ts`)

Decision: XPBD (extended position-based dynamics) instead of plain Verlet with a 0..1 stiffness
per iteration. With plain Verlet, how stiff a beam feels depends on the iteration count, which
makes strain and breaking almost impossible to tune. XPBD gives every material a real stiffness:
a beam under force F stretches by F / stiffness. The code is just as short.

- `createSimulation(bridge)`: one particle per joint (anchors fixed, `inverseMass` 0) and one
  distance constraint per beam. Each joint gets half the mass of every beam that meets there.
- `stepSimulation(sim, loads, dt)`: the 1/120 s step is split into 8 substeps. Each substep
  integrates (gravity + loads + damping), solves every constraint once
  (`Δλ = −C / (wA + wB + α/h²)`, compliance `α = restLength / stiffness`), and derives velocities
  from how far particles moved. Changes the simulation in place, for speed.
- Gravity (160 units/s², shared with the vehicle) is faded in over the first second, so the
  bridge settles instead of dropping and overshooting. Velocity damping 3/s.
- Cables are tension-only: no correction (and zero strain) when shorter than their rest length.
- Strain = `(length − rest) / rest`, smoothed per step (factor 0.2) before colouring and breaking.
- Break: `|strain| > breakStrain` → the beam is replaced by two halves, each hanging from one of
  its joints with a new loose particle in the middle (a quarter of the beam's mass each). Halves
  can't break again and aren't drivable.
- Not done (yet): collisions between the bridge and the terrain; falling debris just keeps falling.

### Run: `src/game/run.ts`

`createRun(level, bridge)` and `stepRun(run, level, spec, dt)` are shared by the engine and the
tests: wheel loads from the current track → physics step → the vehicle follows the moved track.

### Vehicle load

- The track is rebuilt from the simulation every step: intact, non-fragment track beams.
- `wheelLoads()`: the vehicle's weight is shared by the wheels that stand on track; a wheel on a
  track beam pushes on the beam's two end particles, split by where it stands (lever principle).
  Wheels on the bank rails add no load.
- The handcar's mass is 140 (a track beam of length 20 weighs 20).

### Tuned values (materials.ts)

| Material | Mass/length | Stiffness | Breaks at strain |
| --- | --- | --- | --- |
| track | 1 | 4e7 | 0.35 % |
| wood | 0.6 | 3e7 | 0.4 % |
| steel | 1.5 | 1.2e8 | 0.8 % |
| cable | 0.2 | 8e7 | 0.6 % (tension only) |

Physics behind the tuning: a flat deck with no bracing is a chain of hinged links; its strain
grows like (load / stiffness)^(2/3), while a truss's grows linearly. So stiff materials reward
trusses. Outcomes on level 1 with these values (also covered by tests):

- Deck of track alone: holds its own weight (about 55 % of the break limit), breaks under the
  handcar.
- Deck + wooden zigzag without a bottom chord: still hinged at the deck joints, so it breaks.
- Wooden Warren truss (deck + zigzag + bottom chord): carries the handcar (peak about 60 %).
- Deck + one wooden strut from each low anchor: holds, but at about 85 % (orange/red).

### Strain colour

Green (0) → yellow (50 % of the break limit) → red (100 %), blended in RGB (`strainColor()` in
`render.ts`). Track planks, wood and steel bodies and cables take the strain colour during a run;
broken halves keep their material colour. Edit mode uses material colours.

### Tests

`physics.test.ts`: masses and fixed anchors; a steel triangle holds; a track deck sags without
breaking; a cable goes slack instead of pushing; determinism; a track deck breaks under the
handcar and its beams become two dangling halves; a wooden Warren truss carries the handcar;
the deck sags more with the handcar on it. `train.test.ts`: wheel loads (weight conserved, lever
split, none on the bank or while falling). `render.test.ts`: strain colours.

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
| One-man handcar | 1 | very low | First vehicle (phase 2). |
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
