import { useCallback, useState } from 'react';
import type { EngineEvent } from './game/Engine';
import { getLevel, levelIndexFromQuery } from './game/level';
import { GameCanvas } from './ui/GameCanvas';
import { Hud } from './ui/Hud';

const INITIAL_MESSAGE = 'Tap an anchor point to start building';

export function App() {
  const [levelIndex] = useState(() => levelIndexFromQuery(window.location.search));
  const level = getLevel(levelIndex);
  const [message, setMessage] = useState(INITIAL_MESSAGE);

  const handleEngineEvent = useCallback((event: EngineEvent) => {
    switch (event.type) {
      case 'anchorTapped':
        setMessage(`Anchor ${event.anchorIndex + 1} selected`);
        break;
      case 'emptyTapped':
        setMessage('No anchor there. Tap a white square');
        break;
    }
  }, []);

  return (
    <>
      <GameCanvas level={level} onEvent={handleEngineEvent} />
      <Hud level={level} message={message} />
    </>
  );
}
