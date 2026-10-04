import { useEffect, useRef } from 'react';
import { Engine, type EngineEvent } from '../game/Engine';
import type { Level } from '../game/level';

interface GameCanvasProps {
  level: Level;
  onEvent: (event: EngineEvent) => void;
}

/**
 * The only bridge between React and the game engine.
 * React mounts the canvas; the engine owns everything that happens on it.
 */
export function GameCanvas({ level, onEvent }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Keep the latest callback in a ref, so a new onEvent from the parent
  // doesn't tear down and recreate the engine.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, level);
    const unsubscribe = engine.onEvent((event) => onEventRef.current(event));
    engine.start();

    return () => {
      unsubscribe();
      engine.destroy();
    };
  }, [level]);

  return <canvas ref={canvasRef} className="game-canvas" />;
}
