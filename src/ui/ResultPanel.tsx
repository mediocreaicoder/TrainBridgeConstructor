import type { Bridge } from '../game/bridge';
import type { RunOutcome, VehicleId } from '../game/train';
import { HighScores } from './HighScores';
import { Stars } from './Stars';

interface ResultPanelProps {
  outcome: RunOutcome;
  levelId: number;
  train: VehicleId;
  /** The bridge that was tested, and its cost, for the high-score list. */
  bridge: Bridge;
  cost: number;
  /** Falling into water is a splash; into a dry ravine, a crash. */
  hasWater: boolean;
  /** E.g. "handcar" or "goods train". */
  trainName: string;
  /** The level's best stars so far (including this run). */
  stars: number;
  /** The bridge cost more than the budget, so this win earned a star less. */
  overBudget: boolean;
  onTryAgain: () => void;
  onEdit: () => void;
  /** After a win: run the next heavier train on the same bridge. Null if there is none. */
  onHeavierTrain: (() => void) | null;
  /** After a win: go on to the next level. Null on the last level. */
  onNextLevel: (() => void) | null;
}

const TEXT = {
  arrived: { title: 'Made it!', body: (train: string) => `The ${train} crossed the bridge.` },
  splash: { title: 'Splash!', body: (train: string) => `The ${train} ended up in the river.` },
  crash: { title: 'Crash!', body: (train: string) => `The ${train} fell into the ravine.` },
};

/**
 * Shown after a run has ended, with the level's stars. After a win the player
 * can send a heavier train across the same bridge (for more stars) or move
 * on, and see (and join) the high-score list; after a loss, try again or fix
 * the bridge.
 */
export function ResultPanel({
  outcome,
  levelId,
  train,
  bridge,
  cost,
  hasWater,
  trainName,
  stars,
  overBudget,
  onTryAgain,
  onEdit,
  onHeavierTrain,
  onNextLevel,
}: ResultPanelProps) {
  const won = outcome === 'arrived';
  const text = won ? TEXT.arrived : hasWater ? TEXT.splash : TEXT.crash;
  const heavier = won ? onHeavierTrain : null;
  const next = won ? onNextLevel : null;
  // The first offered action is the highlighted (green) one.
  const primary = heavier ? 'heavier' : next ? 'next' : 'again';
  const buttonClass = (action: string) =>
    action === primary ? 'toolbar-button toolbar-play' : 'toolbar-button';

  return (
    <div className="result-backdrop">
      <div
        className={`result-panel result-${outcome}`}
        role="dialog"
        aria-labelledby="result-title"
      >
        <h2 id="result-title" className="result-title">
          {text.title}
        </h2>
        <p className="result-body">{text.body(trainName)}</p>
        <div className="result-stars">
          <Stars count={stars} />
        </div>
        {won && overBudget && <p className="result-note">Over budget: one star less</p>}
        {won && (
          <HighScores
            levelId={levelId}
            train={train}
            bridge={bridge}
            cost={cost}
            overBudget={overBudget}
          />
        )}
        <div className="result-actions">
          {heavier && (
            <button type="button" className={buttonClass('heavier')} onClick={heavier}>
              Heavier train
            </button>
          )}
          {next && (
            <button type="button" className={buttonClass('next')} onClick={next}>
              Next level
            </button>
          )}
          {!won && (
            <button type="button" className={buttonClass('again')} onClick={onTryAgain}>
              Try again
            </button>
          )}
          <button type="button" className="toolbar-button" onClick={onEdit}>
            Edit bridge
          </button>
        </div>
      </div>
    </div>
  );
}
