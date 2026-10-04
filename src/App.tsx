import { useCallback, useRef, useState } from 'react';
import type { EngineEvent, EngineMode } from './game/Engine';
import { getLevel, LEVELS, levelIndexFromQuery, type Level } from './game/level';
import type { MaterialId } from './game/materials';
import { startingLevelIndex } from './game/progress';
import type { RunOutcome } from './game/train';
import { GameCanvas, type GameControls } from './ui/GameCanvas';
import { Hud } from './ui/Hud';
import { LevelSelect } from './ui/LevelSelect';
import {
  loadCompletedLevels,
  loadMuted,
  saveCompletedLevels,
  saveMuted,
} from './ui/preferences';
import { ResultPanel } from './ui/ResultPanel';
import { Toast, type ToastMessage } from './ui/Toast';
import { Toolbar } from './ui/Toolbar';

/** How long toasts stay up, in seconds. */
const LEVEL_TOAST_SECONDS = 5;
const RUN_TOAST_SECONDS = 2;

let nextToastId = 1;

function toast(text: string, seconds: number, title?: string): ToastMessage {
  return { id: nextToastId++, title, text, seconds };
}

/** The level's name and hint, shown when it starts (and on "?"). */
const levelToast = (level: Level) =>
  toast(level.hint, LEVEL_TOAST_SECONDS, `Level ${level.id} · ${level.name}`);

/** `?level=N` jumps straight to a level (for testing); otherwise continue where the player was. */
function initialLevelIndex(completed: ReadonlySet<number>): number {
  return (
    levelIndexFromQuery(window.location.search) ??
    startingLevelIndex(
      LEVELS.map((level) => level.id),
      completed,
    )
  );
}

export function App() {
  const [completed, setCompleted] = useState(loadCompletedLevels);
  const [levelIndex, setLevelIndex] = useState(() => initialLevelIndex(completed));
  const level = getLevel(levelIndex);
  const [material, setMaterial] = useState<MaterialId>('track');
  const [muted, setMuted] = useState(loadMuted);
  const [mode, setMode] = useState<EngineMode>('edit');
  /** Result of the last run; cleared when the panel is closed or the bridge changes. */
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [message, setMessage] = useState<ToastMessage | null>(() => levelToast(level));
  const hideMessage = useCallback(() => setMessage(null), []);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [zoom, setZoom] = useState({ canZoomIn: true, canZoomOut: false });
  const gameRef = useRef<GameControls>(null);

  const markCompleted = useCallback((levelId: number) => {
    setCompleted((previous) => {
      if (previous.has(levelId)) return previous;
      const next = new Set(previous).add(levelId);
      saveCompletedLevels(next);
      return next;
    });
  }, []);

  const handleEngineEvent = useCallback(
    (event: EngineEvent) => {
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
          if (event.mode === 'run') {
            setOutcome(null);
            setMessage(toast('Here comes the handcar!', RUN_TOAST_SECONDS));
          }
          break;
        case 'runFinished':
          setOutcome(event.outcome);
          if (event.outcome === 'arrived') markCompleted(level.id);
          break;
      }
    },
    [level.id, markCompleted],
  );

  /** Switches level. The engine is recreated for it, with an empty bridge. */
  const selectLevel = (index: number) => {
    const next = getLevel(index);
    setLevelIndex(index);
    setOutcome(null);
    setLevelsOpen(false);
    setMessage(levelToast(next));
    if (!next.allowedMaterials.includes(material)) setMaterial(next.allowedMaterials[0] ?? 'track');
  };

  const toggleMute = () => {
    setMuted(!muted);
    saveMuted(!muted);
  };

  const hasNextLevel = levelIndex + 1 < LEVELS.length;

  return (
    <>
      <GameCanvas
        ref={gameRef}
        level={level}
        material={material}
        muted={muted}
        onEvent={handleEngineEvent}
      />
      <Hud
        level={level}
        onOpenLevels={() => setLevelsOpen(true)}
        onShowHint={() => setMessage(levelToast(level))}
      />
      {message && <Toast message={message} onDone={hideMessage} />}
      <Toolbar
        materials={level.allowedMaterials}
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
      {mode === 'edit' && outcome && !levelsOpen && (
        <ResultPanel
          outcome={outcome}
          hasWater={level.waterY !== null}
          onTryAgain={() => gameRef.current?.play()}
          onEdit={() => setOutcome(null)}
          onNextLevel={hasNextLevel ? () => selectLevel(levelIndex + 1) : null}
        />
      )}
      {levelsOpen && (
        <LevelSelect
          levels={LEVELS}
          currentIndex={levelIndex}
          completed={completed}
          onSelect={selectLevel}
          onClose={() => setLevelsOpen(false)}
        />
      )}
    </>
  );
}
