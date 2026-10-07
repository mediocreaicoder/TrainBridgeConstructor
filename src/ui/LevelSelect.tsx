import type { Level } from '../game/level';
import { isUnlocked, starsFor, type LevelStars } from '../game/progress';
import { Stars } from './Stars';

interface LevelSelectProps {
  levels: readonly Level[];
  currentIndex: number;
  stars: LevelStars;
  onSelect: (index: number) => void;
  onClose: () => void;
}

/**
 * The list of levels with the best stars earned on each. Locked levels (the
 * one before has no star yet) can't be chosen.
 */
export function LevelSelect({ levels, currentIndex, stars, onSelect, onClose }: LevelSelectProps) {
  return (
    <div className="result-backdrop">
      <div className="result-panel level-select" role="dialog" aria-labelledby="levels-title">
        <h2 id="levels-title" className="result-title">
          Levels
        </h2>
        <ol className="level-list">
          {levels.map((level, index) => {
            const unlocked = isUnlocked(level.id, stars);
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
                  {unlocked && <Stars count={starsFor(level.id, stars)} />}
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
