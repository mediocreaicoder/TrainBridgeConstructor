import { useCallback, useRef, useState } from 'react';
import type { EngineEvent, EngineMode } from './game/Engine';
import { getLevel, LEVELS, levelIndexFromQuery, type Level } from './game/level';
import type { Bridge } from './game/bridge';
import type { MaterialId } from './game/materials';
import {
  isUnlocked,
  startingLevelIndex,
  starsEarned,
  starsFor,
  withResult,
  type LevelStars,
} from './game/progress';
import {
  heavierTrain,
  TRAIN_ORDER,
  VEHICLES,
  type RunOutcome,
  type VehicleId,
} from './game/train';
import { Budget } from './ui/Budget';
import { GameCanvas, type GameControls } from './ui/GameCanvas';
import { Hud } from './ui/Hud';
import { LevelSelect } from './ui/LevelSelect';
import {
  loadLevelStars,
  loadMuted,
  loadTrain,
  saveLevelStars,
  saveMuted,
  saveTrain,
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
function initialLevelIndex(stars: LevelStars): number {
  return (
    levelIndexFromQuery(window.location.search) ??
    startingLevelIndex(
      LEVELS.map((level) => level.id),
      stars,
    )
  );
}

/** The result of the last run, for the result panel. */
interface RunResult {
  outcome: RunOutcome;
  train: VehicleId;
  /** The bridge that was tested and its cost. Over budget costs a star. */
  bridge: Bridge;
  cost: number;
  overBudget: boolean;
}

export function App() {
  const [stars, setStars] = useState<LevelStars>(loadLevelStars);
  const [levelIndex, setLevelIndex] = useState(() => initialLevelIndex(stars));
  const level = getLevel(levelIndex);
  const [material, setMaterial] = useState<MaterialId>('track');
  const [train, setTrain] = useState<VehicleId>(loadTrain);
  const [muted, setMuted] = useState(loadMuted);
  const [mode, setMode] = useState<EngineMode>('edit');
  /** Result of the last run; cleared when the panel is closed or the bridge changes. */
  const [result, setResult] = useState<RunResult | null>(null);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [message, setMessage] = useState<ToastMessage | null>(() => levelToast(level));
  const hideMessage = useCallback(() => setMessage(null), []);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  /** What the bridge being built costs. */
  const [cost, setCost] = useState(0);
  const [zoom, setZoom] = useState({ canZoomIn: true, canZoomOut: false });
  const gameRef = useRef<GameControls>(null);

  /** Saves the stars a winning train earned on this level, if it is a new best. */
  const recordWin = useCallback((levelId: number, earned: number) => {
    setStars((previous) => {
      const next = withResult(previous, levelId, earned);
      if (next !== previous) saveLevelStars(next);
      return next;
    });
  }, []);

  const handleEngineEvent = useCallback(
    (event: EngineEvent) => {
      switch (event.type) {
        case 'historyChanged':
          setHistory({ canUndo: event.canUndo, canRedo: event.canRedo });
          setCost(event.cost);
          setResult(null); // the bridge changed, so the last result is out of date
          break;
        case 'zoomChanged':
          setZoom({ canZoomIn: event.canZoomIn, canZoomOut: event.canZoomOut });
          break;
        case 'modeChanged':
          setMode(event.mode);
          // A new run starts undecided. Back in edit mode the result panel shows it.
          if (event.mode === 'run') setResult(null);
          break;
        case 'runFinished': {
          const overBudget = event.cost > level.budget;
          setResult({
            outcome: event.outcome,
            train: event.train,
            bridge: event.bridge,
            cost: event.cost,
            overBudget,
          });
          if (event.outcome === 'arrived') {
            recordWin(level.id, starsEarned(VEHICLES[event.train].stars, event.cost, level.budget));
          }
          break;
        }
      }
    },
    [level.id, level.budget, recordWin],
  );

  const chooseTrain = (next: VehicleId) => {
    setTrain(next);
    saveTrain(next);
  };

  /** Sends `which` across, and says so in a toast. */
  const play = (which: VehicleId = train) => {
    chooseTrain(which);
    setMessage(toast(`Here comes the ${VEHICLES[which].name}!`, RUN_TOAST_SECONDS));
    gameRef.current?.play(which);
  };

  /** The train button cycles through the trains, light to heavy and round again. */
  const nextTrain = () => {
    const index = TRAIN_ORDER.indexOf(train);
    chooseTrain(TRAIN_ORDER[(index + 1) % TRAIN_ORDER.length] ?? 'handcar');
  };

  /** Switches level. The engine is recreated for it, with an empty bridge. */
  const selectLevel = (index: number) => {
    setLevelIndex(index);
    setResult(null);
    setLevelsOpen(false);
    setMessage(levelToast(getLevel(index)));
  };

  const toggleMute = () => {
    setMuted(!muted);
    saveMuted(!muted);
  };

  // Only offer the next level once it is open (an over-budget handcar earns no star).
  const nextLevel = LEVELS[levelIndex + 1];
  const hasNextLevel = nextLevel !== undefined && isUnlocked(nextLevel.id, stars);
  const heavier = result ? heavierTrain(result.train) : null;

  return (
    <>
      <GameCanvas
        ref={gameRef}
        level={level}
        material={material}
        train={train}
        muted={muted}
        onEvent={handleEngineEvent}
      />
      <Hud
        level={level}
        muted={muted}
        onOpenLevels={() => setLevelsOpen(true)}
        onShowHint={() => setMessage(levelToast(level))}
        onToggleMute={toggleMute}
      />
      <Budget cost={cost} budget={level.budget} />
      {message && <Toast message={message} onDone={hideMessage} />}
      <Toolbar
        material={material}
        train={train}
        running={mode === 'run'}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        canZoomIn={zoom.canZoomIn}
        canZoomOut={zoom.canZoomOut}
        onMaterialChange={setMaterial}
        onNextTrain={nextTrain}
        onUndo={() => gameRef.current?.undo()}
        onRedo={() => gameRef.current?.redo()}
        onZoomIn={() => gameRef.current?.zoomIn()}
        onZoomOut={() => gameRef.current?.zoomOut()}
        onPlay={() => play()}
        onStop={() => gameRef.current?.stop()}
      />
      {mode === 'edit' && result && !levelsOpen && (
        <ResultPanel
          outcome={result.outcome}
          levelId={level.id}
          train={result.train}
          bridge={result.bridge}
          cost={result.cost}
          hasWater={level.waterY !== null}
          trainName={VEHICLES[result.train].name}
          stars={starsFor(level.id, stars)}
          overBudget={result.overBudget}
          onTryAgain={() => play(result.train)}
          onEdit={() => setResult(null)}
          onHeavierTrain={heavier ? () => play(heavier) : null}
          onNextLevel={hasNextLevel ? () => selectLevel(levelIndex + 1) : null}
        />
      )}
      {levelsOpen && (
        <LevelSelect
          levels={LEVELS}
          currentIndex={levelIndex}
          stars={stars}
          train={train}
          onSelect={selectLevel}
          onClose={() => setLevelsOpen(false)}
        />
      )}
    </>
  );
}
