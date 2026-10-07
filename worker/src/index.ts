import { readRecords, readScores, submitScore } from './scores';
import { parseListKey, parsePlayerId, parseRecordsKey, parseSubmission } from './submission';

/**
 * The high-score API (docs/PLAN.md, phase 8a):
 *
 *   GET  /scores?level=1&vehicle=goods&version=1&player=<uuid>  top 10 and the player's rank
 *   POST /scores                                                 submit a winning bridge
 *   GET  /records?vehicle=goods&version=1                        rank 1 on every level
 *
 * Everything is public and there are no cookies, so any origin may call it.
 */

export interface Env {
  DB: D1Database;
}

/** A request body bigger than this is refused before it is parsed. */
const MAX_BODY_BYTES = 100 * 1024;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      console.error(error);
      return json({ error: 'Server error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (url.pathname === '/records' && request.method === 'GET') return getRecords(url, env);
  if (url.pathname !== '/scores') return json({ error: 'Not found' }, 404);

  switch (request.method) {
    case 'GET':
      return getScores(url, env);
    case 'POST':
      return postScore(request, env);
    default:
      return json({ error: 'Method not allowed' }, 405);
  }
}

async function getScores(url: URL, env: Env): Promise<Response> {
  const key = parseListKey(url.searchParams);
  if (typeof key === 'string') return json({ error: key }, 400);
  return json(await readScores(env.DB, key, parsePlayerId(url.searchParams)));
}

async function getRecords(url: URL, env: Env): Promise<Response> {
  const key = parseRecordsKey(url.searchParams);
  if (typeof key === 'string') return json({ error: key }, 400);
  return json({ records: await readRecords(env.DB, key) });
}

async function postScore(request: Request, env: Env): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json({ error: 'Body too big' }, 413);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'Body must be JSON' }, 400);
  }
  const submission = parseSubmission(body);
  if (typeof submission === 'string') return json({ error: submission }, 400);
  return json(await submitScore(env.DB, submission, Date.now()));
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
