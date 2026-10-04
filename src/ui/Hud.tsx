import type { Level } from '../game/level';

interface HudProps {
  level: Level;
  onOpenLevels: () => void;
  onShowHint: () => void;
}

/**
 * The small buttons in the top-right corner: the level list (labelled with
 * the current level) and "?" to show the level's hint again. Messages
 * themselves appear as toasts, so the screen stays free for building.
 */
export function Hud({ level, onOpenLevels, onShowHint }: HudProps) {
  return (
    <div className="hud">
      <button type="button" className="toolbar-button hud-button" onClick={onOpenLevels}>
        Level {level.id}
      </button>
      <button
        type="button"
        className="toolbar-button hud-button"
        aria-label="Show hint"
        onClick={onShowHint}
      >
        ?
      </button>
    </div>
  );
}
