import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(root, '..', '..', 'data', 'fixtures');

/** Fetch JSON with a hard timeout. On any failure fall back to a bundled fixture
 *  so judges can always run the demo offline and still see the full flow. */
export async function getJson(url, { fixture, timeoutMs = 6000 } = {}) {
  if (process.env.AURA_OFFLINE === '1' && fixture) {
    const data = JSON.parse(await readFile(path.join(fixtureDir, fixture), 'utf8'));
    return { data, source: 'offline fixture', host: new URL(url).host };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'AuraHouseholdAgent/1.0 (hackathon demo)' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    return { data: await res.json(), source: 'live', host: new URL(url).host };
  } catch (err) {
    if (!fixture) throw new Error(`${url} failed (${err.message}) and no fixture was supplied`);
    const data = JSON.parse(await readFile(path.join(fixtureDir, fixture), 'utf8'));
    return { data, source: 'fixture', host: new URL(url).host, error: err.message };
  }
}
