import { useCallback, useRef, useState } from 'react';
import type { EngineEvent, EngineMode } from './game/Engine';
import { getLevel, levelIndexFromQuery } from './game/level';
import type { MaterialId } from './game/materials';
import type { RunOutcome } from './game/train';
import { GameCanvas, type GameControls } from './ui/GameCanvas';
import { Hud } from './ui/Hud';
import { loadMuted, saveMuted } from './ui/preferences';
import { ResultPanel } from './ui/ResultPanel';
import { Toolbar } from './ui/Toolbar';

const EDIT_HINT = 'Drag from a joint to build. Pinch to zoom. Double-tap a beam to remove it';
const RUNNING_MESSAGE = 'Here comes the handcar!';
/** Shown in the HUD from the moment the run is decided until it ends. */
const OUTCOME_MESSAGES: Record<RunOutcome, string> = {
  arrived: 'The handcar made it across!',
  lost: 'Splash!',
};

export function App() {
  const [levelIndex] = useState(() => levelIndexFromQuery(window.location.search));
  const level = getLevel(levelIndex);
  const [material, setMaterial] = useState<MaterialId>('track');
  const [muted, setMuted] = useState(loadMuted);
  const [mode, setMode] = useState<EngineMode>('edit');
  /** Result of the last run; cleared when the panel is closed or the bridge changes. */
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
        // A new run starts undecided. Back in edit mode the result panel shows it.
        if (event.mode === 'run') setOutcome(null);
        break;
      case 'runFinished':
        setOutcome(event.outcome);
        break;
    }
  }, []);

  const toggleMute = () => {
    setMuted(!muted);
    saveMuted(!muted);
  };

  const message =
    mode === 'run' ? (outcome ? OUTCOME_MESSAGES[outcome] : RUNNING_MESSAGE) : EDIT_HINT;

  return (
    <>
      <GameCanvas
        ref={gameRef}
        level={level}
        material={material}
        muted={muted}
        onEvent={handleEngineEvent}
      />
      <Hud level={level} message={message} />
      <Toolbar
        material={material}
        running={mode === 'run'}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        canZoomIn={zoom.canZoomIn}
        canZoomOut={zoom.canZoomOut}
        muted={muted}
        onMaterialChange={setMaterial}
        onUndo={() => gameRef.current?.undo()}
        onRedo={() => gameRef.current?.redo()}
        onZoomIn={() => gameRef.current?.zoomIn()}
        onZoomOut={() => gameRef.current?.zoomOut()}
        onPlay={() => gameRef.current?.play()}
        onStop={() => gameRef.current?.stop()}
        onToggleMute={toggleMute}
      />
      {mode === 'edit' && outcome && (
        <ResultPanel
          outcome={outcome}
          onTryAgain={() => gameRef.current?.play()}
          onEdit={() => setOutcome(null)}
        />
      )}
    </>
  );
}
