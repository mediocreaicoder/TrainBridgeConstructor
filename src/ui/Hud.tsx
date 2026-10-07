import type { Level } from '../game/level';

interface HudProps {
  level: Level;
  muted: boolean;
  onOpenLevels: () => void;
  onShowHint: () => void;
  onToggleMute: () => void;
}

/**
 * The small buttons in the top-right corner: the level list (labelled with
 * the current level), "?" to show the level's hint again, and sound on/off.
 * Messages themselves appear as toasts, so the screen stays free for building.
 */
export function Hud({ level, muted, onOpenLevels, onShowHint, onToggleMute }: HudProps) {
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
      <button
        type="button"
        className="toolbar-button hud-button"
        aria-pressed={!muted}
        onClick={onToggleMute}
      >
        {muted ? 'Muted' : 'Sound'}
      </button>
    </div>
  );
}
