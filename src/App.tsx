import { useCallback, useRef, useState } from 'react';
import type { EngineEvent } from './game/Engine';
import { getLevel, levelIndexFromQuery } from './game/level';
import type { MaterialId } from './game/materials';
import { GameCanvas, type GameControls } from './ui/GameCanvas';
import { Hud } from './ui/Hud';
import { Toolbar } from './ui/Toolbar';

const HINT = 'Drag from a joint to build. Pinch to zoom. Double-tap a beam to remove it';

export function App() {
  const [levelIndex] = useState(() => levelIndexFromQuery(window.location.search));
  const level = getLevel(levelIndex);
  const [material, setMaterial] = useState<MaterialId>('track');
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [zoom, setZoom] = useState({ canZoomIn: true, canZoomOut: false });
  const gameRef = useRef<GameControls>(null);

  const handleEngineEvent = useCallback((event: EngineEvent) => {
    switch (event.type) {
      case 'historyChanged':
        setHistory({ canUndo: event.canUndo, canRedo: event.canRedo });
        break;
      case 'zoomChanged':
        setZoom({ canZoomIn: event.canZoomIn, canZoomOut: event.canZoomOut });
        break;
    }
  }, []);

  return (
    <>
      <GameCanvas ref={gameRef} level={level} material={material} onEvent={handleEngineEvent} />
      <Hud level={level} message={HINT} />
      <Toolbar
        material={material}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        canZoomIn={zoom.canZoomIn}
        canZoomOut={zoom.canZoomOut}
        onMaterialChange={setMaterial}
        onUndo={() => gameRef.current?.undo()}
        onRedo={() => gameRef.current?.redo()}
        onZoomIn={() => gameRef.current?.zoomIn()}
        onZoomOut={() => gameRef.current?.zoomOut()}
      />
    </>
  );
}
