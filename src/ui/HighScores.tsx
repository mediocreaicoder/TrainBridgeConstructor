import { useEffect, useState, type FormEvent } from 'react';
import type { Bridge } from '../game/bridge';
import type { VehicleId } from '../game/train';
import { fetchScores, hasScoreServer, submitScore, type ScoreList } from './api';
import { loadNickname, loadPlayerId, saveNickname } from './preferences';

interface HighScoresProps {
  levelId: number;
  train: VehicleId;
  /** The winning bridge and what it cost. */
  bridge: Bridge;
  cost: number;
  /** Over-budget bridges don't go on the list. */
  overBudget: boolean;
}

/** Same rules as the worker (worker/src/submission.ts), so a saved nickname is never refused. */
const NICKNAME_MIN = 3;
const NICKNAME_MAX = 16;
const NICKNAME = /^[\p{L}\p{N} _.\-!?']+$/u;

function isValidNickname(name: string): boolean {
  const length = [...name].length;
  return length >= NICKNAME_MIN && length <= NICKNAME_MAX && NICKNAME.test(name);
}

/**
 * - idle: the "Submit score" button is shown
 * - naming: the first submit asks for a nickname
 * - sending / sent / failed: the submission and its outcome
 */
type SubmitState =
  | { step: 'idle' }
  | { step: 'naming' }
  | { step: 'sending' }
  | { step: 'sent'; rank: number; improved: boolean }
  | { step: 'failed'; message: string };

/**
 * After a win: the top 10 cheapest bridges for this level and train, and a
 * button to submit this one. Shows nothing if there is no score server, and
 * a short note if it can't be reached; the game never depends on it.
 */
export function HighScores({ levelId, train, bridge, cost, overBudget }: HighScoresProps) {
  const [playerId] = useState(loadPlayerId);
  const [list, setList] = useState<ScoreList | null>(null);
  const [offline, setOffline] = useState(false);
  const [submit, setSubmit] = useState<SubmitState>({ step: 'idle' });
  const [nickname, setNickname] = useState(loadNickname);

  useEffect(() => {
    if (!hasScoreServer()) return;
    let cancelled = false;
    fetchScores(levelId, train, playerId).then(
      (scores) => !cancelled && setList(scores),
      () => !cancelled && setOffline(true),
    );
    return () => {
      cancelled = true;
    };
  }, [levelId, train, playerId]);

  if (!hasScoreServer()) return null;

  const send = async (name: string) => {
    setSubmit({ step: 'sending' });
    try {
      const result = await submitScore({
        levelId,
        vehicleId: train,
        playerId,
        nickname: name,
        cost,
        bridge,
      });
      setSubmit({ step: 'sent', ...result });
      setList(await fetchScores(levelId, train, playerId));
    } catch (error) {
      setSubmit({ step: 'failed', message: error instanceof Error ? error.message : 'Failed' });
    }
  };

  const onSubmitClick = () => {
    if (nickname) void send(nickname);
    else setSubmit({ step: 'naming' });
  };

  const onNameChosen = (event: FormEvent) => {
    event.preventDefault();
    const name = nickname.trim();
    if (!isValidNickname(name)) return;
    saveNickname(name);
    setNickname(name);
    void send(name);
  };

  return (
    <div className="scores">
      <h3 className="scores-title">Cheapest bridges</h3>
      {list ? (
        <ScoreTable list={list} />
      ) : (
        <p className="scores-note">{offline ? 'High scores are offline' : 'Loading…'}</p>
      )}
      {overBudget ? (
        <p className="scores-note">Over budget bridges can't be submitted</p>
      ) : (
        <SubmitArea
          state={submit}
          nickname={nickname}
          onNicknameChange={setNickname}
          onSubmitClick={onSubmitClick}
          onNameChosen={onNameChosen}
        />
      )}
    </div>
  );
}

function ScoreTable({ list }: { list: ScoreList }) {
  if (list.entries.length === 0) {
    return <p className="scores-note">No scores yet. Be the first!</p>;
  }
  const ownRank = list.you?.rank;
  return (
    <>
      <ol className="scores-list">
        {list.entries.map((entry) => (
          <li key={entry.rank} className={entry.rank === ownRank ? 'scores-own' : undefined}>
            <span className="scores-rank">{entry.rank}.</span>
            <span className="scores-name">{entry.nickname}</span>
            <span className="scores-cost">$ {entry.cost}</span>
          </li>
        ))}
      </ol>
      {list.you && list.you.rank > list.entries.length && (
        <p className="scores-note">
          You: #{list.you.rank}, $ {list.you.cost}
        </p>
      )}
    </>
  );
}

interface SubmitAreaProps {
  state: SubmitState;
  nickname: string;
  onNicknameChange: (nickname: string) => void;
  onSubmitClick: () => void;
  onNameChosen: (event: FormEvent) => void;
}

function SubmitArea({
  state,
  nickname,
  onNicknameChange,
  onSubmitClick,
  onNameChosen,
}: SubmitAreaProps) {
  switch (state.step) {
    case 'idle':
    case 'failed':
      return (
        <>
          {state.step === 'failed' && <p className="scores-note scores-error">{state.message}</p>}
          <button type="button" className="toolbar-button scores-submit" onClick={onSubmitClick}>
            Submit score
          </button>
        </>
      );
    case 'naming':
      return (
        <form className="scores-form" onSubmit={onNameChosen}>
          <input
            className="scores-input"
            value={nickname}
            onChange={(event) => onNicknameChange(event.target.value)}
            placeholder="Nickname"
            aria-label="Nickname"
            minLength={NICKNAME_MIN}
            maxLength={NICKNAME_MAX}
            autoComplete="nickname"
            autoFocus
          />
          <button
            type="submit"
            className="toolbar-button"
            disabled={!isValidNickname(nickname.trim())}
          >
            OK
          </button>
          <p className="scores-note">{NICKNAME_MIN}-{NICKNAME_MAX} letters or digits</p>
        </form>
      );
    case 'sending':
      return <p className="scores-note">Sending…</p>;
    case 'sent':
      return (
        <p className="scores-note">
          {state.improved ? `Submitted! You are #${state.rank}` : `Your best is still #${state.rank}`}
        </p>
      );
  }
}
