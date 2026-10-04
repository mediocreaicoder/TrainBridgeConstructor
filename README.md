# Train Bridge Constructor

A small 16-bit style bridge building game for the phone: build a bridge over a
ravine, send a train across, and hope it holds.

**Play:** https://mediocreaicoder.github.io/TrainBridgeConstructor/

## Running locally

Requires Node.js (LTS).

```bash
npm install
npm run dev
```

- Open the `Local:` URL in Chrome. For a phone view, open DevTools (F12),
  press Ctrl+Shift+M (device toolbar) and pick an iPhone.
- To test on a real phone on the same Wi-Fi, open the `Network:` URL that
  `npm run dev` prints. Windows may ask to allow Node through the firewall.

Other scripts:

| Command           | What it does                                     |
| ----------------- | ------------------------------------------------ |
| `npm run build`   | Type-checks and builds the static site to `dist/` |
| `npm run preview` | Serves the built `dist/` locally                  |
| `npm run lint`    | Runs ESLint                                       |

## Deploying

Every push to `main` builds and deploys to GitHub Pages through
`.github/workflows/deploy.yml`.

One-time setup: in the repo on GitHub, go to **Settings → Pages** and set
**Source** to **GitHub Actions**.

## Project structure

```
src/
  game/            Plain TypeScript, no React. Runs every frame.
    Engine.ts      Game loop, input, resizing. Emits events to the UI.
    camera.ts      World units ↔ canvas/screen conversion.
    render.ts      Draws a frame: sky, water, terrain, track, anchors.
    level.ts       Level data (terrain polygons, anchors, bridge start/end).
    types.ts       Vec2 and small math helpers.
  ui/              React components.
    GameCanvas.tsx Creates the Engine and forwards its events.
    Hud.tsx        Text overlay.
  App.tsx          Holds UI state and wires the pieces together.
```

### Design notes

- **React for UI, not for the game.** The engine owns the canvas and runs its
  own `requestAnimationFrame` loop. React only receives occasional events
  (for example "anchor tapped"), so the 60 fps hot path never touches React state.
- **Pixel look.** The canvas backing store is low resolution: 1 canvas pixel
  per world unit, with the 320×180 playfield always fully visible. CSS scales
  it up with `image-rendering: pixelated`.
- **Coordinates.** World units, origin top-left, y pointing down, the same as
  the canvas API.
