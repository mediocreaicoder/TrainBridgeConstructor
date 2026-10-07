import { useEffect, useState } from 'react';
import type { Level } from '../game/level';
import { isUnlocked, starsFor, type LevelStars } from '../game/progress';
import { VEHICLES, type VehicleId } from '../game/train';
import { fetchRecords, hasScoreServer, type LevelRecord } from './api';
import { Stars } from './Stars';

interface LevelSelectProps {
  levels: readonly Level[];
  currentIndex: number;
  stars: LevelStars;
  /** The selected train: each level shows the record (cheapest bridge) for it. */
  train: VehicleId;
  onSelect: (index: number) => void;
  onClose: () => void;
}

/**
 * The list of levels with the best stars earned on each, and the record to
 * beat for the selected train. Locked levels (the one before has no star
 * yet) can't be chosen.
 */
export function LevelSelect({
  levels,
  currentIndex,
  stars,
  train,
  onSelect,
  onClose,
}: LevelSelectProps) {
  const records = useRecords(train);
  return (
    <div className="result-backdrop">
      <div className="result-panel level-select" role="dialog" aria-labelledby="levels-title">
        <h2 id="levels-title" className="result-title">
          Levels
        </h2>
        {records && <p className="level-records-title">Records: {VEHICLES[train].name}</p>}
        <ol className="level-list">
          {levels.map((level, index) => {
            const unlocked = isUnlocked(level.id, stars);
            const record = records?.get(level.id);
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
                  <span className="level-name">
                    {unlocked ? level.name : 'Locked'}
                    {unlocked && records && (
                      <span className="level-record">
                        {record ? `$ ${record.cost} ${record.nickname}` : 'No record yet'}
                      </span>
                    )}
                  </span>
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

/**
 * The record per level id for one train, or null while loading, without a
 * score server, or if it can't be reached (the list then shows stars only).
 */
function useRecords(train: VehicleId): Map<number, LevelRecord> | null {
  const [records, setRecords] = useState<Map<number, LevelRecord> | null>(null);
  useEffect(() => {
    if (!hasScoreServer()) return;
    let cancelled = false;
    fetchRecords(train).then(
      (list) => !cancelled && setRecords(new Map(list.map((record) => [record.levelId, record]))),
      () => {}, // offline: no records
    );
    return () => {
      cancelled = true;
    };
  }, [train]);
  return records;
}
