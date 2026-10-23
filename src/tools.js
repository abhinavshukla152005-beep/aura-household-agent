import * as memory from './memory.js';
import { lookupWeather } from './services/weather.js';
import { searchMedia, isFamilySafe } from './services/media.js';
import { headlines, factOfTheDay } from './services/news.js';
import { convert } from './services/currency.js';

/** Tool implementations. Every MCP tool and the simulated Alexa+ agent both call
 *  these, so behaviour can never drift between the two surfaces. */

export async function householdProfile() {
  return memory.profile();
}

export async function weatherNow({ place } = {}) {
  const p = memory.snapshot().then((s) => s.home.city);
  return lookupWeather(place || (await p));
}

export async function mediaSearch({ term, media = 'movie', limit = 6, familySafe = false } = {}) {
  const res = await searchMedia({ term, media, limit: limit + 4 });
  const items = familySafe ? res.items.filter(isFamilySafe) : res.items;
  return { ...res, items: items.slice(0, limit), filteredFor: familySafe ? 'family-safe' : 'none' };
}

export async function newsBriefing({ limit = 4 } = {}) {
  return headlines(limit);
}

export async function learnFact({ topic } = {}) {
  return factOfTheDay(topic);
}

export async function priceConvert({ amount, from = 'USD', to }) {
  const target = to || (await memory.snapshot()).home.currency;
  return convert(Number(amount), from, target);
}

export async function pantryStatus() {
  return memory.stockLevel();
}

export async function remember({ member, key, value, session }) {
  return memory.notePreference({ member, key, value, session });
}

export async function placeOrder({ items, totalBase, confirmed, session }) {
  return memory.recordOrder({ items, totalBase: Number(totalBase), confirmed, session });
}

export async function commitRoutine({ routine, session }) {
  return memory.commitRoutine(routine, session);
}

export async function audit({ limit = 10 } = {}) {
  const s = await memory.snapshot();
  return { entries: s.audit.slice(0, limit), sessionCount: s.sessionCount };
}

export async function reset() {
  return memory.reset();
}

/** Reconstruct the most recent committed routine from stored trace and household state.
 *  Returns exact values derived from the persisted compact trace written at commit time.
 *  If no trace was stored (older data file), returns traceAvailable: false instead of guessing. */
export async function describeLastDecision() {
  const s = await memory.snapshot();
  const last = s.lastRoutine;
  if (!last) return { found: false, reason: 'No routine has been committed yet.' };

  // Detect whether the spend cap fired (from the audit log — this is still correct).
  const entries = s.audit;
  const orderBlocked = entries.find((e) => e.verb === 'orderBlocked');
  const purchaseBlocked = Boolean(orderBlocked);

  // No trace stored → return an honest "not available" rather than guessing.
  if (!Array.isArray(last.trace) || last.trace.length === 0) {
    return {
      found: true,
      traceAvailable: false,
      routineName: last.name,
      routineId: last.id,
      committedAt: last.at,
      summary: last.summary,
      chosen: last.chosen,
      spend: last.spend,
      purchaseBlocked,
      blockedDetail: purchaseBlocked ? orderBlocked.detail : null,
      reason: 'This routine was committed before per-step trace storage was introduced.'
    };
  }

  // Exact values from the stored trace — no inference.
  const toolsInOrder = last.trace.map((t) => t.tool);

  const addedByAgent = last.trace
    .filter((t) => t.status === 'added-by-agent')
    .map((t) => ({ tool: t.tool, why: t.why }));

  const skippedSteps = last.trace
    .filter((t) => t.status === 'skipped')
    .map((t) => ({ tool: t.tool, reason: t.why }));

  return {
    found: true,
    traceAvailable: true,
    routineName: last.name,
    routineId: last.id,
    committedAt: last.at,
    summary: last.summary,
    chosen: last.chosen,
    spend: last.spend,
    toolsInOrder,
    addedByAgent,
    skippedSteps,
    purchaseBlocked,
    blockedDetail: purchaseBlocked ? orderBlocked.detail : null
  };
}

export const TOOL_NAMES = [
  'household_profile', 'weather_now', 'media_search', 'news_briefing', 'learn_fact',
  'convert_price', 'pantry_status', 'remember_preference', 'plan_routine',
  'run_routine', 'place_order', 'commit_routine', 'household_audit', 'reset_household',
  'describe_last_decision'
];
