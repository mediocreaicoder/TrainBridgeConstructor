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

- Phase 4 is done: synthesised sound (bell, clacks, creaks, cracks, scream, splash, jingle),
  splash droplets, screen shake on breaks, result panel, mute toggle.

- Phase 5 is done: six levels with hints and per-level materials, level list, unlocking in
  order, progress saved, Next level. Every level is proven winnable by a test.

- Beams on the grid (2026-10-06): every material is drawn centred on the joint line, so
  horizontal and vertical beams lie on the grid dots (track: rail one row above, planks on the
  line and below; wood: 3 px wide). The bank track and the handcar moved down to match.
- Audio on iPhone (2026-10-06): sound was silent because of the ring/silent switch.
  `navigator.audioSession.type = 'playback'` (iOS 16.4+) keeps the game audible anyway, and audio
  is also unlocked on pointerup (iOS only counts touchend/click as a gesture for audio).
- Building feel (2026-10-06): the aiming cursor sits closer to the finger (32 CSS px).
  With Track selected the material is picked per beam (`autoMaterial()` in `editor.ts`): a beam
  that continues the track (starts on a bridge end or a joint with track, no steeper than 30°) is
  track, anything else gets the support material (the one chosen last, else the level's first).
  Choosing wood/steel/cable explicitly still builds only that. A long press (0.4 s) on a built
  joint picks it up; dragging moves it on the grid, only to spots where every attached beam
  stays within its length limits (`planJointMove()`); putting it down is one undo step.
- Longer beams, bigger levels (2026-10-06): max lengths ×1.5 (track 30, wood 36, steel 48,
  cable 96) and every level scaled to match, with the track at y = 75, so a bridge is made of
  fewer, longer pieces and fills more of the screen. Unit tests now use a fixed test level
  (`src/game/testing/testLevel.ts`) instead of level 1. Long Haul was shortened to 180 so its
  steel reference truss isn't right at the break limit (peak loads of all reference solutions
  are now at most about 75 %).
- Visible snap grid (2026-10-06): dots while editing, drawn under the terrain; they light up
  around the dragged beam end. The grid follows the zoom: 10 units when 5 would be closer than
  12 CSS px on screen (`gridSizeFor()` in `editor.ts`), otherwise 5. Other control ideas
  discussed and parked: tap–tap building, a magnifier loupe, a relative (trackpad-style) cursor.
- Bigger aiming cursor (2026-10-06): on touch, the beam end is a crosshair 56 CSS px above the
  finger (the lift grows over the first pixels of the drag, so it doesn't jump), with a dotted
  line down to the finger. The crosshair has a fixed screen size and an open centre where the
  snapped point (white square) shows.
- HUD text replaced by toasts (2026-10-04): the level name and hint fade out after 5 s, "?"
  shows them again. Manifest and icons added for "Add to Home Screen" (no address bar).

What doesn't exist yet: terrain collisions, recorded sounds, saved bridges.

### Files

| File | Responsibility |
| --- | --- |
| `src/game/Engine.ts` | rAF loop, pointer input, resize, event emitter. `update(dt)` is the hook for simulation. |
| `src/game/camera.ts` | `fitCamera()` and `cssToWorld()`. |
| `src/game/render.ts` | `renderFrame()` plus one function per layer. `FrameState` holds per-frame data. |
| `src/game/level.ts` | `Level` interface, the six `LEVELS`, `getLevel()`, `?level=N`. |
| `src/game/progress.ts` | Unlock rule and starting level (pure). |
| `src/game/testing/bridgeBuilder.ts` | Test helper: build bridges by position (`chain`, `truss`). |
| `src/game/types.ts` | `Vec2`, `distance()`. |
| `src/game/geometry.ts` | Distance to segment, point-in-polygon. |
| `src/game/materials.ts` | `MATERIALS` table (balancing values), `MIN_BEAM_LENGTH`. |
| `src/game/bridge.ts` | Immutable `Bridge` model: `addBeam`, `removeBeam`, `canPlaceBeam`, hit tests. |
| `src/game/editor.ts` | Undo/redo `History`, and `planBeam()` (snapping + validation while dragging). |
| `src/game/physics.ts` | XPBD bridge simulation: particles, beam constraints, strain, breaking. |
| `src/game/run.ts` | One run: simulation + vehicle, stepped together (used by Engine and tests). |
| `src/game/cues.ts` | Which sounds a simulation step causes (pure). |
| `src/game/audio.ts` | `GameAudio`: Web Audio playback, synthesised sounds, mute. |
| `src/game/effects.ts` | Splash droplets and screen shake (pure). |
| `src/game/train.ts` | Vehicle model: `buildTrack`, `createVehicle`, `stepVehicle` (roll, fall, outcome). |
| `src/game/renderVehicle.ts` | Draws the handcar sprite (animated, rotated with nearest-neighbour). |
| `src/game/pixelLine.ts` | Bresenham line helper shared by the renderers. |
| `src/game/debug.ts` | Dev-only `window.__game` (state, `addBeam`, `removeBeam`, `undo`, `redo`, `play`, `stop`, `stepSeconds`). |
| `src/ui/GameCanvas.tsx` | Creates and destroys the Engine, forwards events, exposes `GameControls` (undo/redo) via ref. |
| `src/ui/Hud.tsx` | Top-right buttons: "Level N" (opens the level list) and "?" (shows the hint again). |
| `src/ui/Toast.tsx` | Short messages that fade out by themselves (level name + hint, "Here comes the handcar!"). |
| `src/ui/LevelSelect.tsx` | The level list (done / locked). |
| `src/ui/ResultPanel.tsx` | "Made it!" / "Splash!" panel with Try again and Edit bridge. |
| `src/ui/preferences.ts` | Mute setting in localStorage. |
| `src/ui/Toolbar.tsx` | Material picker, undo, redo, play (disabled until phase 2). |
| `src/App.tsx` | UI state (material, undo/redo availability); wires engine events to the toolbar. |

### Rules that must stay true

1. **React never runs per frame.** The engine owns the canvas and the loop. React sends commands
   in (methods on `Engine`) and receives events out (`EngineEvent`). Only `GameCanvas.tsx`
   touches the Engine instance; pass it down via a ref or context if the toolbar needs it.
2. **Game logic is pure TypeScript** and can be tested in Node without a browser. Keep DOM and
   canvas code in `Engine.ts` and `render.ts`; keep models (bridge, physics, train) DOM-free.
   From phase 8 on, the same code also runs on the server (Cloudflare Worker), whose type check
   has no DOM and enforces this.
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

Status: done (2026-10-04).

Decisions:

- Sounds are **synthesised in code now, recordings maybe later**. Every sound has a synthesised
  version; a recording replaces it by adding one line to `SOUND_FILES` in `audio.ts` (files go in
  `public/sounds/`, with a licence note in `public/sounds/CREDITS.md`). A missing or broken file
  falls back to the synthesised sound.
- After a run ends (1.5 s after it is decided), a **result panel** shows "Made it!" or "Splash!"
  with "Try again" (runs the same bridge) and "Edit bridge" (closes the panel). "Next level"
  comes with more levels (phase 5). Stopping a run by hand before it is decided shows no panel.

### Code

- `cues.ts` (pure, tested): `summarizeRun()` before and after each simulation step, and
  `soundCues()` turns the difference into sounds: `bell` (Play), `clack` (every 10 units rolled),
  `creak` (any beam above 75 % of its break limit), `crack` (a beam breaks), `scream` (the handcar
  leaves the track), `splash` (it hits the water; none on dry levels), `arrive` (goal).
- `audio.ts` (`GameAudio`, Web Audio): unlocked on the first touch or Play (iOS needs a user
  gesture), master volume, mute, a minimum repeat interval per sound (creaks don't pile up), and
  a short history for the debug hook (`window.__game.sounds()`). Synthesised sounds: noise bursts
  through filters (clack, crack, splash), a thump, bells, a square-wave jingle, a wobbling
  sawtooth creak, and the scream: a falling sawtooth with vibrato through two "ah" formant
  filters.
- `effects.ts` (pure, tested): splash droplets (seeded, so a run always looks the same) and a
  short screen shake when a beam breaks, in whole world units so pixels stay crisp. Effects run
  in screen time, so they finish after the run has stopped.
- UI: a Sound/Muted toggle in the toolbar, saved in `localStorage` (`ui/preferences.ts`, every
  access in try/catch), and `ui/ResultPanel.tsx`.

Recordings (2026-10-06): the user added an applause and a scream recording. Converted (in the
browser, no extra tools) to mono 22 kHz 16-bit WAV in `public/sounds/` (applause: first 5 s with a
fade-out, 6.9 MB → 216 KB; scream: normalised, it clipped). They replace the synthesised `arrive`
jingle and `scream`. Sources and licences belong in `public/sounds/CREDITS.md` (still TODO). The
originals are in `src/game/audio/` and are not used by the game.

Note: on iPhone, the ring/silent switch mutes Web Audio.

---

## 7. Phase 5: Levels and progression

Status: done (2026-10-04). Level 7 from the original list ("heavier train on a known gap") waits
for phase 6, when there are more trains.

Decisions:

- Levels unlock in order: the first is open, each next one opens when the one before is won.
  The game starts in the first level not yet won (or `?level=N`, which also skips the lock, for
  testing). Progress is saved in `localStorage` (`ui/preferences.ts`).
- A "Levels" button in the HUD opens the level list (done / locked). The result panel gets
  "Next level" after a win. Switching level starts with an empty bridge (bridges are not saved).
- Each level has a one-line `hint` shown in the HUD while building, `allowedMaterials` (the
  toolbar only shows those; the engine also refuses others) and a `vehicle` (only `handcar` so far).
- Anchors above the deck stand on stone **pillars**: scenery drawn behind the track, not solid.
- Every level has a **reference solution and a naive bridge in `levels.test.ts`**: the solution
  must be legal (lengths, materials, no joint inside terrain) and win with real physics; the
  naive bridge must lose. Change a level or the balancing, and the tests tell you if a level
  became impossible or trivial.

### The levels

Every level can be played with every train, with all four materials (decided 2026-10-07).
`levels.test.ts` proves for each level that a bare track deck loses even with the handcar, a
light bridge carries the handcar (1 star) and a strong one carries the goods train (4 stars).

| # | Name | Idea | Light bridge (1 star) | Strong bridge (4 stars) |
| --- | --- | --- | --- | --- |
| 1 | First Crossing | 120 wide, low anchors | Wooden truss | Steel truss |
| 2 | Stepping Stone | Two gaps with a rock island | Wooden truss in each gap | Steel truss in each gap |
| 3 | Wide Gap | 180 wide, anchors on the cliff faces | Wooden truss + braced props | Steel truss under and over the deck |
| 4 | From Below | 180 wide, only deep anchors, dry | Wooden truss + columns | Steel truss under and over |
| 5 | Hanging Bridge | Anchors on pillars above the deck | Cables from the pillars | Steel truss under and over |
| 6 | Long Haul | 180 wide, no extra anchors | Steel truss | Steel truss under and over |
| 7 | Bare Cliffs | 120 wide, no extra anchors | Wooden truss | Steel truss |
| 8 | Ledges | 150 wide, anchors on the cliffs | Steel truss | Steel truss + steel props |
| 9 | Grand Span | 180 wide | Steel truss | Steel truss under and over |

Ideas for later: a small level editor in dev mode (`?editor`) that exports level JSON; saving
the player's bridge per level.

---

## 8. Phase 6: More trains

Status: done (2026-10-07).

A train is a chain of cars (`src/game/train.ts`): the cars are coupled at a fixed spacing and all
roll at the train's speed. Each car finds its own track, tilts with it and loads the bridge with
its own wheels. A car whose middle has no track under it falls; the cars behind keep rolling and
follow it over the edge, one by one. The run is lost as soon as a car is in the water (or off the
screen) and won when the last car is past the end of the bridge with nothing fallen.

| Train (`VehicleId`) | Cars | Total mass | Speed | Look |
| --- | --- | --- | --- | --- |
| `handcar` | handcar | 140 | 16 | One man pumping the lever |
| `maintenance` | shunter | 280 | 20 | Yellow diesel shunter, blinking beacon, hazard stripes |
| `passenger` | engine + 3 coaches | 1040 | 24 | Green steam engine; maroon coaches with passengers at the windows |
| `goods` | engine + 6 boxcars | 2180 | 18 | Boxcars in three colours |

Stars (decided 2026-10-07): each level gives 1 to 4 stars, for the heaviest train that has
crossed it (handcar 1, maintenance locomotive 2, passenger train 3, goods train 4). The train
button in the toolbar cycles through the trains (it shows the train's stars); after a win the
result panel offers "Heavier train". The best stars per level are saved (older saved progress
counts as 1 star), shown in the level list, and 1 star unlocks the next level. Sound on/off moved
to the HUD to make room for the train button.

Budget (decided 2026-10-07): materials have a price per unit of length (wood 1, track 2,
cable 2, steel 3, in `materials.ts`); `bridgeCost()` sums length × price. Each level has a
`budget`, about 10 % above its strong (4-star) reference bridge, rounded up to 50:

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Budget | 1150 | 1550 | 3100 | 3100 | 2550 | 3100 | 1150 | 1950 | 3100 |

The cost shows top left ("$ 240 / 1150", red when over). Going over budget is allowed but costs a
star (`starsEarned()` in `progress.ts`): the handcar then earns none, so the next level stays
locked and "Next level" isn't offered. `levels.test.ts` checks that both reference bridges are
within budget. The reference bridges are not optimal (all-steel), so smarter bridges come in
well under.

- Cars with people (handcar, shunter, engine, coaches) scream when they go over the edge, one
  scream per car; every car splashes when it hits the water.
- The toast and the result panel name the train ("Here comes the goods train!").

Ideas for later: an armored train for final levels; smoke puffs from the steam engine; cars that
pull each other when one falls instead of rolling on at constant speed.

---

## 9. Phase 7: Polish

- PWA: done: `public/manifest.webmanifest` (display fullscreen) and pixel-art icons in
  `public/icons/` (180 apple-touch-icon, 192, 512). Safari can't hide its address bar from a
  web page; added to the home screen, the game opens without it. Still open: a service worker
  for offline play (consider `vite-plugin-pwa`; ask first).
- Performance on iPhone: cache static layers (sky and terrain) in an offscreen canvas that is
  redrawn only on resize; today the dirt speckles are drawn every frame.
- Pixel sprites for trains and materials, and parallax clouds or mountains in the background.
- Optional haptics on beam breaks (not supported in iOS Safari; skip if it adds complexity).
- ~~Budget per level~~: done (see phase 6).

## 10. Phase 8: Landing page and high scores

Status: 8a built and the worker deployed (2026-10-07) at
https://train-bridge-scores.mediocreaicoder.workers.dev (D1 `train-bridge-scores`, region EEUR).
The game gets the address from `.env` (`VITE_API_URL`). 8b later.

The phase is split in two (decided 2026-10-07):

- **8a: simplest thing that works, to get it live now.** The server stores what the client sends,
  with no game validation. The frontend stays as it is, plus a "Submit score" button and a top-10
  list in the result panel.
- **8b: later, once enough iterations have made the game playable.** Server-side verification,
  the landing page, hash routing, replays and everything else described further down in this
  section.

### 8a: first version (now)

Decisions (2026-10-07):

- **No server-side validation yet.** The client sends level, train, cost and the bridge; the
  worker checks only that the body is well-formed (types, sizes, nickname length) and stores it.
  Faked scores are possible and accepted for now.
- **Submitting**: a "Submit score" button in the result panel after a win, only for bridges within
  the budget (checked by the client). The first time, the player picks a nickname (3–16
  characters), which is remembered. `playerId` is a random UUID in `localStorage`.
- **List**: after submitting (or when the result panel opens after a win), the result panel shows
  the top 10 for that level and train (cheapest bridge first, earliest wins ties) and the
  player's own rank. Nothing else in the frontend changes.
- One row per player per level, train and `PHYSICS_VERSION`; a new submission replaces it only if
  it is cheaper. The physics version is stored from the start, so lists can start fresh when it
  is bumped (decided earlier).
- The bridge JSON is stored with every score, so 8b can re-verify and replay it later.
- CORS allows any origin (the data is public and there are no cookies), so testing from the
  phone on the LAN dev server works too. No rate limiting yet.
- The fixes for determinism made at the start of the phase are kept (Math.sqrt instead of
  Math.hypot, damping without Math.exp, car direction as a unit vector); they are needed for 8b.
- Also kept from the earlier decisions: wrangler and @cloudflare/workers-types as dev
  dependencies, Worker tests with Vitest and a fake D1, wrangler logged in locally, and the
  Cloudflare token and account id as GitHub secrets.

API (8a):

| Method and path | Purpose |
| --- | --- |
| `GET /scores?level=1&vehicle=goods&player=<uuid>` | Top 10 `{ entries: [{ rank, nickname, cost }], you: { rank, cost } \| null }` |
| `POST /scores` | Body `{ levelId, vehicleId, physicsVersion, playerId, nickname, cost, bridge }`, returns `{ rank, improved }` |

### 8b: later (the full plan below)

Earlier decisions that still apply to 8b: only bridges within the budget go on the lists; lists
start fresh when `PHYSICS_VERSION` is bumped; replays of other players' bridges unlock after
your own win with the same train (enforced by the server); every material is allowed on every
level, so verification checks materials against `MATERIALS`.

Goal: a landing page where people pick a level and play it, and a global high-score list per
level and train, ranked by the cheapest bridge that gets the train across. New versions of both
the game and the API go live by pushing to `main`, as today.

### Architecture

- **Frontend** stays on GitHub Pages (unchanged deploy).
- **API**: a Cloudflare Worker with a D1 (SQLite) database, in a new `worker/` folder in the same
  repo. Both run on Cloudflare's free plan at hobby scale.
- **Shared game code**: the worker imports `src/game/` directly (`bridge.ts`, `materials.ts`,
  `physics.ts`, `train.ts`, `run.ts`, `level.ts`, `bridgeCost()`). No copy, no package. This is
  what makes server-side verification possible, and why rule 2 ("game logic is pure TypeScript")
  matters.
- Considered and rejected: Supabase (free projects are paused after about a week of low activity,
  bad for a hobby game that may sit idle), scores stored as files in a GitHub repo (slow and
  awkward), and trusting scores sent by the client (trivially faked).

### Repo layout

```
src/game/verify.ts          headless run of a submitted bridge (pure, shared)
src/game/apiTypes.ts        request/response types shared by client and worker
src/ui/api.ts               fetch wrapper used by React
src/ui/LandingPage.tsx      title + level grid (builds on LevelSelect.tsx)
src/ui/Leaderboard.tsx      top list per level, with train tabs
worker/
  src/index.ts              routing, CORS, rate limiting
  src/scores.ts             D1 queries (one function per query)
  src/validate.ts           runtime checks of request bodies
  migrations/0001_scores.sql
  wrangler.toml             worker name, D1 binding
  tsconfig.json             lib ES2022 + Workers types, **no "dom"**
```

The worker's `tsconfig.json` deliberately leaves out the DOM lib. If anything in `src/game/`
that the worker imports touches `window`, `document`, `AudioContext` or canvas, the worker's
type check fails. Add `npm run typecheck:worker` and run it in CI. (`verify.ts` must not import
`Engine.ts`, `render.ts`, `renderVehicle.ts`, `audio.ts` or `debug.ts`.)

### Server-side verification (the core of this phase)

The client never sends a score. It sends the **bridge**, and the server computes the result.

- `verifyRun(levelId, vehicleId, bridge)` in `src/game/verify.ts` returns
  `{ ok: true, cost, simSeconds } | { ok: false, reason }`. Steps:
  1. **Validate the bridge** against the level: the fixed joints match the level's anchors and
     bridge ends exactly, every beam passes `canPlaceBeam` (length, no joint inside terrain, no
     duplicates), every material is in `allowedMaterials`, ids are consistent, and the bridge is
     within size limits (for example 200 joints and 400 beams).
  2. **Run it headless** with `createRun` / `stepRun` from `run.ts` at the same fixed 1/120 s
     step as the engine, until the train's outcome is `arrived` or `lost`, or a timeout (for
     example 60 simulated seconds).
  3. **Compute the cost** with `bridgeCost()`. A cost sent by the client is ignored.
- The engine can call the same `verifyRun` (or simply use the run that just played) so the
  player sees exactly the cost the server will compute.

### Determinism across JavaScript engines

The server (V8 in the Worker) must get exactly the same result as the player's phone
(JavaScriptCore on iPhone) and Chrome, or winning bridges will be rejected.

- `+ - * /` and `Math.sqrt` are exact IEEE 754 operations: identical everywhere.
- `Math.sin`, `cos`, `atan2`, `exp`, `pow`, `hypot` and friends are **not** guaranteed to give
  the same last bit on different engines. Today they are used in the simulation path:
  - `physics.ts`: `Math.exp(-DAMPING * h)` (damping factor) and `Math.hypot(dx, dy)` (beam
    length).
  - `train.ts`: `Math.sin(car.angle)`, `Math.atan2(...)` for the car tilt, and
    `Math.cos/sin(car.angle)` for the velocity when a car starts falling.
- Fix before the server goes live:
  - Damping: precompute the factor as a constant (`h` is fixed), written as a literal number
    (or computed with `1 - DAMPING * h + ...` using only `+ - * /`).
  - Beam length: `Math.sqrt(dx * dx + dy * dy)`.
  - Car tilt: store the car's direction as a unit vector (`dirX`, `dirY`, from the two wheel
    heights via `Math.sqrt`) instead of an angle. Rendering can still call `Math.atan2` on it,
    since rendering never feeds back into the simulation.
- Add an ESLint `no-restricted-properties` rule for `physics.ts`, `train.ts`, `run.ts` and
  `verify.ts` that forbids those `Math` functions, so they don't creep back in.
- `physicsVersion`: add `PHYSICS_VERSION` (an integer) in `src/game/`. Bump it whenever a change
  in physics, trains, materials, levels or cost could change a result. Scores are stored with
  the version, and lists show only the current version (see section 11 for what happens to old
  scores).
- Golden test: a stored bridge must give an exact stored result (positions after N steps and the
  outcome). Run it in Node in CI, and once by hand in Safari on the iPhone via the dev hook
  (`window.__game`), to confirm V8 and JavaScriptCore agree.

### CPU time

Measure `verifyRun` in Node for the worst case (Grand Span with the goods train and a bridge at
the size limit) before writing the worker. The free Workers plan allows only a few ms of CPU per
request; check the current limit in Cloudflare's docs. If a run doesn't fit:

- Option A: store the submission as `pending` and verify it in a scheduled worker (Cron Trigger)
  in small batches. The client shows "submitted, verifying…".
- Option B: Workers Paid (about 5 USD per month at the time of writing; check the current price),
  which raises the limit.

Decide with the user once the numbers are in.

### Database: `worker/migrations/0001_scores.sql`

```sql
CREATE TABLE scores (
  id              INTEGER PRIMARY KEY,
  level_id        INTEGER NOT NULL,
  vehicle_id      TEXT    NOT NULL,   -- 'handcar' | 'maintenance' | 'passenger' | 'goods'
  physics_version INTEGER NOT NULL,
  player_id       TEXT    NOT NULL,   -- random UUID from the client
  nickname        TEXT    NOT NULL,
  cost            INTEGER NOT NULL,   -- computed by the server
  bridge_json     TEXT    NOT NULL,   -- for replays and re-verification
  created_at      INTEGER NOT NULL,   -- unix ms
  UNIQUE (level_id, vehicle_id, physics_version, player_id)
);

CREATE INDEX scores_board
  ON scores (level_id, vehicle_id, physics_version, cost, created_at);
```

- One row per player per (level, train, version). A new submission replaces the row only if its
  cost is lower (`INSERT ... ON CONFLICT DO UPDATE ... WHERE excluded.cost < scores.cost`).
- Ranking: lowest `cost` first, earliest `created_at` wins ties.
- Rank of a score: `SELECT COUNT(*) + 1 ... WHERE cost < ? OR (cost = ? AND created_at < ?)`,
  which the index covers.

### API

| Method and path | Purpose | Responses |
| --- | --- | --- |
| `GET /levels/:levelId/scores?vehicle=:vehicleId&limit=20` | Top list | `200 { entries: [{ rank, nickname, cost, createdAt, scoreId }] }` |
| `GET /levels/best` | Best cost per level and train, for the landing page | `200 { [levelId]: { [vehicleId]: cost } }` |
| `GET /scores/:scoreId/bridge` | Bridge for replay | `200 Bridge` / `404` |
| `POST /scores` | Submit a bridge | `200 { cost, rank, improved }` / `422 { reason }` / `409` wrong physics version / `429` |

- `POST` body: `{ levelId, vehicleId, physicsVersion, playerId, nickname, bridge }`. Max 32 KB.
  Checked at runtime in `worker/src/validate.ts` with small hand-written type guards (no new
  dependencies; ask before adding something like zod).
- CORS: allow `https://mediocreaicoder.github.io` and `http://localhost:5173` only.
- Rate limiting: for example 10 `POST` per minute per IP. Use whatever Cloudflare offers on the
  free plan at the time (check the docs); a fallback is a small counter table in D1.
- Cache the `GET` lists for about 60 seconds with the Workers Cache API, and purge that level's
  list after a successful `POST`. This keeps D1 row reads low.

### Free-plan limits to respect

- D1 on the free plan has daily row-read and row-write limits, and since 1 September 2026
  queries fail when they are exceeded (until midnight UTC). So: every query goes through the
  index, always use `LIMIT`, never scan the whole table, and cache the lists.
- Before starting, read Cloudflare's current limits pages for Workers and D1 and note the
  numbers here.

### Player identity

- No login. `playerId = crypto.randomUUID()`, stored in `localStorage` via `ui/preferences.ts`
  (try/catch, like the other settings). Clearing site data means a new player; that is
  acceptable.
- Nickname: asked for the first time the player submits. 3–16 characters: letters (including
  æ, ø, å), digits, space, `-` and `_`. A small blocklist for obvious abuse, checked on the
  server. The player can change it later; it updates all their rows.

### Frontend

- **Routing** with the URL hash (`#/`, `#/level/3`, `#/level/3/scores`), since GitHub Pages has
  no fallback for client-side routes. A small `useHashRoute()` hook; no router library.
  `?level=N` keeps working for testing.
- **Landing page** (`LandingPage.tsx`): title, the level grid from `LevelSelect.tsx` with stars
  and locks as today, plus for each level the player's own best cost and the global best (from
  `GET /levels/best`). Tapping a level opens the game.
- **Saving the player's bridges**: needed to submit and to replay; store the last winning bridge
  per level and train in `localStorage` (this also fulfils "saved bridges" from the wish list).
- **After a win**: `ResultPanel.tsx` shows the cost and a "Submit score" button, then the rank
  the server returns ("#4 on Wide Gap with the passenger train").
- **Leaderboard** (`Leaderboard.tsx`): one tab per train, top 20, the player's own row
  highlighted. Tapping a row loads that bridge read-only and plays it (replay).
- **API base URL** from `import.meta.env.VITE_API_URL`. If the API is unreachable, the game
  still works: score parts are hidden behind a short "high scores unavailable" message.

### Deploy on push

- New job in `.github/workflows/deploy.yml` (the user edits this file by hand), after lint and
  tests, using `cloudflare/wrangler-action`:
  1. `wrangler d1 migrations apply <db-name> --remote`
  2. `wrangler deploy`
- The Pages build gets `VITE_API_URL` from a GitHub repository variable.
- One-time manual setup by the user (Claude writes a step-by-step list when the phase starts):
  create a Cloudflare account, run `npx wrangler d1 create <db-name>` and put the `database_id`
  into `wrangler.toml`, create an API token with Workers and D1 edit rights, and add
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub secrets.
- Local development: `npx wrangler dev` (local D1 copy) next to `npm run dev`, with
  `VITE_API_URL=http://localhost:8787` in `.env.development`.
- `wrangler` becomes a dev dependency (ask before adding, per the working agreement).

### Tests

- `verify.test.ts`:
  - The reference solutions from `levels.test.ts` win and give the expected cost; the naive
    bridges are rejected with `lost`.
  - Tampered bridges are rejected: a beam longer than `maxLength`, a material not allowed on the
    level, a moved anchor, a joint inside terrain, too many beams, broken ids.
  - Golden determinism test (see above). If it changes, `PHYSICS_VERSION` must be bumped.
- Worker tests for routing, validation, "only a cheaper bridge replaces the row" and rank
  calculation. Test against a fake D1, or use `@cloudflare/vitest-pool-workers` (ask first).

Done when: on the phone you can open the landing page, win a level, submit with a nickname and
see yourself on the list; a second device sees the same list; a hand-made `POST` with a fake or
invalid bridge is rejected; and one push to `main` deploys both the game and the API.

---

## 11. Decisions to clarify with the user along the way

- Grid snap size (suggestion: 5 units), and whether beams may cross each other.
- Whether the bridge must be built from the start flag, or whether free floating beams are allowed.
- Touch: offset the drag point above the finger, or use a magnifier?
- ~~Sound: generated sounds, or CC0 recordings?~~ Decided: generated now, recordings later.
- Whether the train should brake or keep going when the bridge starts to fail.
- High scores (phase 8):
  - ~~Over-budget bridges on the list?~~ Decided: only within budget.
  - If `verifyRun` doesn't fit the free CPU limit: verify in the background (Cron Trigger), or
    pay for Workers Paid?
  - ~~When `PHYSICS_VERSION` is bumped?~~ Decided: start fresh lists.
  - ~~Public replays?~~ Decided: after your own win with the same train.
  - Custom domain, or keep `github.io` and `workers.dev`?

---

## 12. Manual test on the phone (each phase)

1. Open the Pages URL (or the dev server's `Network:` URL on the same Wi-Fi).
2. Portrait and landscape, and a reload in both.
3. All gestures with fingers, including fast double-taps (no page zoom must happen).
4. Added to the home screen: fullscreen, no address bar, and the notch doesn't cover the UI.
5. From phase 8: the landing page and leaderboard load, a score can be submitted, and the game
   still works with the network turned off.
