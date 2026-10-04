import { useCallback, useRef, useState } from 'react';
import type { EngineEvent, EngineMode } from './game/Engine';
import { getLevel, levelIndexFromQuery } from './game/level';
import type { MaterialId } from './game/materials';
import type { RunOutcome } from './game/train';
import { GameCanvas, type GameControls } from './ui/GameCanvas';
import { Hud } from './ui/Hud';
import { Toolbar } from './ui/Toolbar';

const EDIT_HINT = 'Drag from a joint to build. Pinch to zoom. Double-tap a beam to remove it';
const RUNNING_MESSAGE = 'Here comes the handcar!';
/** Shown when the run is decided, and kept after it ends until the bridge changes. */
const OUTCOME_MESSAGES: Record<RunOutcome, string> = {
  arrived: 'The handcar made it across!',
  lost: 'Splash! Fix the bridge and try again',
};

export function App() {
  const [levelIndex] = useState(() => levelIndexFromQuery(window.location.search));
  const level = getLevel(levelIndex);
  const [material, setMaterial] = useState<MaterialId>('track');
  const [mode, setMode] = useState<EngineMode>('edit');
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [zoom, setZoom] = useState({ canZoomIn: true, canZoomOut: false });
  const gameRef = useRef<GameControls>(null);

  const handleEngineEvent = useCallback((event: EngineEvent) => {
    switch (event.type) {
      case 'historyChanged':
        setHistory({ canUndo: event.canUndo, canRedo: event.canRedo });
        setOutcome(null); // the bridge changed, so the last result is out of date
        break;
      case 'zoomChanged':
        setZoom({ canZoomIn: event.canZoomIn, canZoomOut: event.canZoomOut });
        break;
      case 'modeChanged':
        setMode(event.mode);
        // A new run starts undecided. Back in edit mode the result stays visible.
        if (event.mode === 'run') setOutcome(null);
        break;
      case 'runFinished':
        setOutcome(event.outcome);
        break;
    }
  }, []);

  const message = outcome
    ? OUTCOME_MESSAGES[outcome]
    : mode === 'run'
      ? RUNNING_MESSAGE
      : EDIT_HINT;

  return (
    <>
      <GameCanvas ref={gameRef} level={level} material={material} onEvent={handleEngineEvent} />
      <Hud level={level} message={message} />
      <Toolbar
        material={material}
        running={mode === 'run'}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        canZoomIn={zoom.canZoomIn}
        canZoomOut={zoom.canZoomOut}
        onMaterialChange={setMaterial}
        onUndo={() => gameRef.current?.undo()}
        onRedo={() => gameRef.current?.redo()}
        onZoomIn={() => gameRef.current?.zoomIn()}
        onZoomOut={() => gameRef.current?.zoomOut()}
        onPlay={() => gameRef.current?.play()}
        onStop={() => gameRef.current?.stop()}
      />
    </>
  );
}
