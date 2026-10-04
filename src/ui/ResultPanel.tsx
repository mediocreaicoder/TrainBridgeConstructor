import type { RunOutcome } from '../game/train';

interface ResultPanelProps {
  outcome: RunOutcome;
  /** Falling into water is a splash; into a dry ravine, a crash. */
  hasWater: boolean;
  onTryAgain: () => void;
  onEdit: () => void;
  /** Shown after a win when there is a next level. */
  onNextLevel: (() => void) | null;
}

const ARRIVED = { title: 'Made it!', body: 'The handcar crossed the bridge.' };
const SPLASH = { title: 'Splash!', body: 'The handcar ended up in the river.' };
const CRASH = { title: 'Crash!', body: 'The handcar fell into the ravine.' };

/**
 * Shown after a run has ended. "Try again" runs the same bridge once more;
 * "Edit bridge" closes the panel; after a win, "Next level" moves on.
 */
export function ResultPanel({
  outcome,
  hasWater,
  onTryAgain,
  onEdit,
  onNextLevel,
}: ResultPanelProps) {
  const { title, body } = outcome === 'arrived' ? ARRIVED : hasWater ? SPLASH : CRASH;
  const showNext = outcome === 'arrived' && onNextLevel !== null;
  return (
    <div className="result-backdrop">
      <div
        className={`result-panel result-${outcome}`}
        role="dialog"
        aria-labelledby="result-title"
      >
        <h2 id="result-title" className="result-title">
          {title}
        </h2>
        <p className="result-body">{body}</p>
        <div className="result-actions">
          {showNext && (
            <button type="button" className="toolbar-button toolbar-play" onClick={onNextLevel}>
              Next level
            </button>
          )}
          <button
            type="button"
            className={showNext ? 'toolbar-button' : 'toolbar-button toolbar-play'}
            onClick={onTryAgain}
          >
            Try again
          </button>
          <button type="button" className="toolbar-button" onClick={onEdit}>
            Edit bridge
          </button>
        </div>
      </div>
    </div>
  );
}
