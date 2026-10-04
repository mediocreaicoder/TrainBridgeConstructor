import type { RunOutcome } from '../game/train';

interface ResultPanelProps {
  outcome: RunOutcome;
  onTryAgain: () => void;
  onEdit: () => void;
}

const TEXT: Record<RunOutcome, { title: string; body: string }> = {
  arrived: { title: 'Made it!', body: 'The handcar crossed the bridge.' },
  lost: { title: 'Splash!', body: 'The handcar ended up in the river.' },
};

/**
 * Shown after a run has ended. "Try again" runs the same bridge once more;
 * "Edit bridge" closes the panel. ("Next level" comes with more levels.)
 */
export function ResultPanel({ outcome, onTryAgain, onEdit }: ResultPanelProps) {
  const { title, body } = TEXT[outcome];
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
          <button type="button" className="toolbar-button toolbar-play" onClick={onTryAgain}>
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
