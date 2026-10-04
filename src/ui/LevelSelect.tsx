import type { Level } from '../game/level';
import { isUnlocked } from '../game/progress';

interface LevelSelectProps {
  levels: readonly Level[];
  currentIndex: number;
  completed: ReadonlySet<number>;
  onSelect: (index: number) => void;
  onClose: () => void;
}

/**
 * The list of levels. Completed levels are marked, locked ones (the one
 * before isn't completed yet) can't be chosen.
 */
export function LevelSelect({
  levels,
  currentIndex,
  completed,
  onSelect,
  onClose,
}: LevelSelectProps) {
  return (
    <div className="result-backdrop">
      <div className="result-panel level-select" role="dialog" aria-labelledby="levels-title">
        <h2 id="levels-title" className="result-title">
          Levels
        </h2>
        <ol className="level-list">
          {levels.map((level, index) => {
            const unlocked = isUnlocked(level.id, completed);
            const done = completed.has(level.id);
            return (
              <li key={level.id}>
                <button
                  type="button"
                  className="toolbar-button level-button"
                  aria-current={index === currentIndex}
                  disabled={!unlocked}
                  onClick={() => onSelect(index)}
                >
                  <span className="level-number">{level.id}</span>
                  <span className="level-name">{unlocked ? level.name : 'Locked'}</span>
                  <span className="level-state">{done ? 'Done' : ''}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <button type="button" className="toolbar-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
