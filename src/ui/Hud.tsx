import type { Level } from '../game/level';

interface HudProps {
  level: Level;
  message: string;
}

/** Text overlay on top of the canvas. Ignores touches so they reach the game. */
export function Hud({ level, message }: HudProps) {
  return (
    <div className="hud">
      <div className="hud-title">
        Level {level.id} · {level.name}
      </div>
      <div className="hud-message">{message}</div>
      <div className="hud-rotate-hint">Rotate your phone for a wider view</div>
    </div>
  );
}
