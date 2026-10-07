import { beforeEach, describe, expect, it } from 'vitest';
import worker, { type Env } from './index';
import { createFakeD1 } from './testing/fakeD1';

const PLAYER_A = '11111111-1111-4111-8111-111111111111';
const PLAYER_B = '22222222-2222-4222-8222-222222222222';
const PLAYER_C = '33333333-3333-4333-8333-333333333333';

const BRIDGE = { joints: [{ id: 0, position: { x: 0, y: 0 }, fixed: true }], beams: [], nextId: 1 };

let env: Env;

beforeEach(() => {
  env = { DB: createFakeD1() };
});

function call(method: string, path: string, body?: unknown): Promise<Response> {
  const init: RequestInit = { method };
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  return worker.fetch(new Request(`https://scores.test${path}`, init), env);
}

function submit(player: string, cost: number, overrides: Record<string, unknown> = {}) {
  return call('POST', '/scores', {
    levelId: 1,
    vehicleId: 'goods',
    physicsVersion: 1,
    playerId: player,
    nickname: `Player ${player[0]}`,
    cost,
    bridge: BRIDGE,
    ...overrides,
  });
}

async function list(query = 'level=1&vehicle=goods&version=1', player?: string) {
  const response = await call('GET', `/scores?${query}${player ? `&player=${player}` : ''}`);
  return response.json() as Promise<{
    entries: { rank: number; nickname: string; cost: number }[];
    you: { rank: number; cost: number } | null;
  }>;
}

describe('POST /scores', () => {
  it('stores a score and returns its rank', async () => {
    const response = await submit(PLAYER_A, 900);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ rank: 1, improved: true });
  });

  it('only replaces a player’s score with a cheaper one', async () => {
    await submit(PLAYER_A, 900);
    expect(await (await submit(PLAYER_A, 950)).json()).toEqual({ rank: 1, improved: false });
    expect(await (await submit(PLAYER_A, 900)).json()).toEqual({ rank: 1, improved: false });
    expect(await (await submit(PLAYER_A, 800)).json()).toEqual({ rank: 1, improved: true });
    expect((await list()).entries).toEqual([{ rank: 1, nickname: 'Player 1', cost: 800 }]);
  });

  it('refuses malformed submissions', async () => {
    const bad = [
      { levelId: 0 },
      { vehicleId: 'Goods!' },
      { physicsVersion: 1.5 },
      { playerId: 'not-a-uuid' },
      { nickname: 'ab' },
      { nickname: 'a'.repeat(17) },
      { nickname: '<script>' },
      { cost: -1 },
      { bridge: [] },
      { bridge: { joints: [] } },
    ];
    for (const overrides of bad) {
      expect((await submit(PLAYER_A, 900, overrides)).status, JSON.stringify(overrides)).toBe(400);
    }
    expect((await call('POST', '/scores', '{nope')).status).toBe(400);
    expect((await list()).entries).toEqual([]);
  });

  it('refuses a body that is too big', async () => {
    const huge = { joints: [], beams: [], padding: 'x'.repeat(200 * 1024) };
    expect((await submit(PLAYER_A, 900, { bridge: huge })).status).toBe(413);
  });

  it('trims the nickname and accepts letters from any language', async () => {
    await submit(PLAYER_A, 900, { nickname: '  Håvard Ø.  ' });
    expect((await list()).entries[0]?.nickname).toBe('Håvard Ø.');
  });
});

describe('GET /scores', () => {
  it('lists the cheapest bridges first, the earlier one winning a tie', async () => {
    await submit(PLAYER_A, 900);
    await submit(PLAYER_B, 700);
    await submit(PLAYER_C, 900);
    const { entries } = await list();
    expect(entries.map((e) => [e.rank, e.nickname, e.cost])).toEqual([
      [1, 'Player 2', 700],
      [2, 'Player 1', 900],
      [3, 'Player 3', 900],
    ]);
  });

  it('shows the top 10 only, and the player’s own rank below them', async () => {
    for (let i = 0; i < 12; i++) {
      const player = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      await submit(player, 100 + i, { nickname: `Player ${i}` });
    }
    const last = '00000000-0000-4000-8000-000000000011';
    const { entries, you } = await list(undefined, last);
    expect(entries).toHaveLength(10);
    expect(entries.at(-1)).toEqual({ rank: 10, nickname: 'Player 9', cost: 109 });
    expect(you).toEqual({ rank: 12, cost: 111 });
  });

  it('keeps separate lists per level, train and physics version', async () => {
    await submit(PLAYER_A, 900);
    await submit(PLAYER_A, 500, { levelId: 2 });
    await submit(PLAYER_A, 400, { vehicleId: 'handcar' });
    await submit(PLAYER_A, 300, { physicsVersion: 2 });
    expect((await list()).entries.map((e) => e.cost)).toEqual([900]);
    const level2 = await list('level=2&vehicle=goods&version=1');
    expect(level2.entries.map((e) => e.cost)).toEqual([500]);
  });

  it('has no own entry for a player without a score', async () => {
    await submit(PLAYER_A, 900);
    expect((await list(undefined, PLAYER_B)).you).toBeNull();
  });

  it('refuses a malformed query', async () => {
    expect((await call('GET', '/scores?level=x&vehicle=goods&version=1')).status).toBe(400);
  });
});

describe('GET /records', () => {
  it('gives the cheapest bridge on every level for one train', async () => {
    await submit(PLAYER_A, 900);
    await submit(PLAYER_B, 700);
    await submit(PLAYER_A, 500, { levelId: 3 });
    await submit(PLAYER_C, 100, { vehicleId: 'handcar' });
    await submit(PLAYER_C, 100, { physicsVersion: 2 });
    const response = await call('GET', '/records?vehicle=goods&version=1');
    expect(await response.json()).toEqual({
      records: [
        { levelId: 1, nickname: 'Player 2', cost: 700 },
        { levelId: 3, nickname: 'Player 1', cost: 500 },
      ],
    });
  });

  it('refuses a malformed query', async () => {
    expect((await call('GET', '/records?vehicle=goods')).status).toBe(400);
  });
});

describe('routing', () => {
  it('answers CORS preflight and allows any origin', async () => {
    const response = await call('OPTIONS', '/scores');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect((await list()).entries).toEqual([]);
  });

  it('returns 404 for unknown paths and 405 for other methods', async () => {
    expect((await call('GET', '/other')).status).toBe(404);
    expect((await call('DELETE', '/scores')).status).toBe(405);
  });
});
