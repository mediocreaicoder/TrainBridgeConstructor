import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { Engine, type EngineEvent } from '../game/Engine';
import type { Level } from '../game/level';
import type { MaterialId } from '../game/materials';

/** Commands the rest of the UI can send to the engine through a ref. */
export interface GameControls {
  undo(): void;
  redo(): void;
  zoomIn(): void;
  zoomOut(): void;
  play(): void;
  stop(): void;
}

interface GameCanvasProps {
  level: Level;
  material: MaterialId;
  onEvent: (event: EngineEvent) => void;
  ref?: Ref<GameControls>;
}

/**
 * The only bridge between React and the game engine.
 * React mounts the canvas; the engine owns everything that happens on it.
 */
export function GameCanvas({ level, material, onEvent, ref }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);

  // Keep the latest props in refs, so new values from the parent don't tear
  // down and recreate the engine.
  const onEventRef = useRef(onEvent);
  const materialRef = useRef(material);
  useEffect(() => {
    onEventRef.current = onEvent;
    materialRef.current = material;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, level);
    engine.setMaterial(materialRef.current);
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

  useImperativeHandle(
    ref,
    () => ({
      undo: () => engineRef.current?.undo(),
      redo: () => engineRef.current?.redo(),
      zoomIn: () => engineRef.current?.zoomIn(),
      zoomOut: () => engineRef.current?.zoomOut(),
      play: () => engineRef.current?.play(),
      stop: () => engineRef.current?.stop(),
    }),
    [],
  );

  return <canvas ref={canvasRef} className="game-canvas" />;
}
