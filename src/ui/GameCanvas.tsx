import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { Engine, type EngineEvent } from '../game/Engine';
import type { Level } from '../game/level';
import type { MaterialId } from '../game/materials';
import type { VehicleId } from '../game/train';

/** Commands the rest of the UI can send to the engine through a ref. */
export interface GameControls {
  undo(): void;
  redo(): void;
  zoomIn(): void;
  zoomOut(): void;
  /** Starts a run, with the given train (default: the selected one). */
  play(train?: VehicleId): void;
  stop(): void;
}

interface GameCanvasProps {
  level: Level;
  material: MaterialId;
  /** The train the next run sends across. */
  train: VehicleId;
  muted: boolean;
  onEvent: (event: EngineEvent) => void;
  ref?: Ref<GameControls>;
}

/**
 * The only bridge between React and the game engine.
 * React mounts the canvas; the engine owns everything that happens on it.
 */
export function GameCanvas({ level, material, train, muted, onEvent, ref }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);

  // Keep the latest props in refs, so new values from the parent don't tear
  // down and recreate the engine.
  const onEventRef = useRef(onEvent);
  const materialRef = useRef(material);
  const mutedRef = useRef(muted);
  const trainRef = useRef(train);
  useEffect(() => {
    onEventRef.current = onEvent;
    materialRef.current = material;
    mutedRef.current = muted;
    trainRef.current = train;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, level);
    engine.setMaterial(materialRef.current);
    engine.setMuted(mutedRef.current);
    engine.setTrain(trainRef.current);
    const unsubscribe = engine.onEvent((event) => onEventRef.current(event));
    engine.start();
    engineRef.current = engine;

    return () => {
      engineRef.current = null;
      unsubscribe();
      engine.destroy();
    };
  }, [level]);

  useEffect(() => {
    engineRef.current?.setMaterial(material);
  }, [material]);

  useEffect(() => {
    engineRef.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    engineRef.current?.setTrain(train);
  }, [train]);

  useImperativeHandle(
    ref,
    () => ({
      undo: () => engineRef.current?.undo(),
      redo: () => engineRef.current?.redo(),
      zoomIn: () => engineRef.current?.zoomIn(),
      zoomOut: () => engineRef.current?.zoomOut(),
      play: (train) => engineRef.current?.play(train),
      stop: () => engineRef.current?.stop(),
    }),
    [],
  );

  return <canvas ref={canvasRef} className="game-canvas" />;
}
