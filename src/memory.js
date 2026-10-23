import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, '..', 'data');
const storeFile = path.join(dataDir, 'household.json');

const SEED = {
  householdId: 'sharma-family',
  home: { name: 'Sharma household', city: 'Pune, India', currency: 'INR', locale: 'en-IN' },
  members: [
    { id: 'abhinav', name: 'Abhinav', role: 'adult', preferences: { genres: ['Documentary', 'Sci-Fi'], volume: 6, music: 'Ambient' }, allergies: [] },
    { id: 'amma', name: 'Amma', role: 'adult', preferences: { genres: ['Drama', 'Family'], volume: 5, music: 'Film themes' }, allergies: ['peanuts'] },
    { id: 'chikki', name: 'Chikki', role: 'child', preferences: { genres: ['Animation', 'Kids'], volume: 7, music: ['Soundtracks'] }, allergies: ['dairy'] }
  ],
  rules: {
    maxAmountNoPrompt: 40,
    spendBudget: 25,
    screenTimeCurfewLocal: '22:00',
    quietHours: { from: '22:30', to: '07:00' },
    familySafeOnlyAfter: '19:00'
  },
  pantry: [
    { item: 'Popcorn kernels', qty: 2, unit: 'packs', lowAt: 1, price: 3.5 },
    { item: 'Peanut brittle', qty: 1, unit: 'jar', lowAt: 1, allergen: 'peanuts', price: 6 },
    { item: 'Masala chai', qty: 1, unit: 'packs', lowAt: 1, price: 4.5 },
    { item: 'Oat cookies', qty: 0, unit: 'tubs', lowAt: 1, price: 5 },
    { item: 'Yogurt', qty: 0, unit: 'tubs', lowAt: 2, allergen: 'dairy', price: 4 }
  ],
  sessions: {},
  lastRoutine: null,
  audit: []
};

let state = null;

async function load() {
  if (state) return state;
  await mkdir(dataDir, { recursive: true });
  try {
    state = JSON.parse(await readFile(storeFile, 'utf8'));
  } catch {
    state = structuredClone(SEED);
    await persist();
  }
  return state;
}

async function persist() {
  await mkdir(dataDir, { recursive: true });
  await writeFile(storeFile, JSON.stringify(state, null, 2), 'utf8');
}

function log(s, verb, detail) {
  state.audit.unshift({ at: new Date().toISOString(), session: s, verb, detail });
  state.audit = state.audit.slice(0, 60);
}

/** Session id is stable per household device, so memory survives across conversations. */
export async function openSession(sessionId) {
  const s = await load();
  const id = sessionId || 'living-room';
  if (!s.sessions[id]) {
    s.sessions[id] = { id, startedAt: new Date().toISOString(), turns: 0, context: {}, carriedFrom: s.lastRoutine };
  }
  const sess = s.sessions[id];
  sess.turns += 1;
  sess.lastSeenAt = new Date().toISOString();
  await persist();
  return { household: s, session: sess };
}

export async function snapshot() {
  const s = await load();
  const { sessions, audit, ...publicState } = s;
  return { ...publicState, sessionCount: Object.keys(sessions).length, audit: audit.slice(0, 12) };
}

export async function profile() {
  const s = await load();
  return {
    householdId: s.householdId,
    home: s.home,
    members: s.members.map((m) => ({ id: m.id, name: m.name, role: m.role, genres: m.preferences.genres, allergies: m.allergies })),
    rules: s.rules,
    pantry: s.pantry,
    lastRoutine: s.lastRoutine,
    rememberedFor: Object.values(s.sessions).map((x) => ({ session: x.id, turns: x.turns, carriedFrom: x.carriedFrom }))
  };
}

export async function notePreference({ member, key, value, session }) {
  const s = await load();
  const m = s.members.find((x) => x.id === member || x.name.toLowerCase() === String(member).toLowerCase());
  if (!m) throw new Error(`Unknown member "${member}"`);
  m.preferences[key] = value;
  log(session, 'notePreference', `${m.name}.${key} = ${JSON.stringify(value)}`);
  await persist();
  return { member: m.name, key, value, totalMembers: s.members.length };
}

/** Cross-session continuity: the last completed routine is handed to the next conversation.
 *  routine.trace is optional: if provided, store a compact per-step record { tool, status, why }
 *  so describe_last_decision can return exact values rather than guessing from the summary text. */
export async function commitRoutine(routine, session) {
  const s = await load();
  s.lastRoutine = {
    id: crypto.randomUUID().slice(0, 8),
    name: routine.name,
    at: new Date().toISOString(),
    summary: routine.spokenSummary,
    chosen: routine.chosen || null,
    spend: routine.spend || 0
  };
  // Store compact per-step trace if the caller provides it; keep shape minimal.
  if (Array.isArray(routine.trace) && routine.trace.length) {
    s.lastRoutine.trace = routine.trace.map((t) => ({
      tool: t.tool,
      status: t.status,
      why: t.why || null
    }));
  }
  if (s.sessions[session]) s.sessions[session].carriedFrom = s.lastRoutine.id;
  log(session, 'commitRoutine', `${routine.name} -> ${s.lastRoutine.summary}`);
  await persist();
  return s.lastRoutine;
}

/** Spend guardrail: purchases above the household cap require an explicit confirmation token. */
export async function recordOrder({ items, totalBase, confirmed, session }) {
  const s = await load();
  const cap = s.rules.maxAmountNoPrompt;
  if (totalBase > cap && !confirmed) {
    log(session, 'orderBlocked', `Rs equivalent ${totalBase} over cap ${cap}, awaiting confirmation`);
    await persist();
    return { status: 'needs_confirmation', cap, totalBase, reason: `Order exceeds the ${cap} ${s.home.currency === 'INR' ? 'USD-equivalent' : 'unit'} no-prompt limit.` };
  }
  const order = { id: crypto.randomUUID().slice(0, 8), at: new Date().toISOString(), items, totalBase, confirmed: Boolean(confirmed) };
  s.orders = s.orders || [];
  s.orders.unshift(order);
  s.orders = s.orders.slice(0, 25);
  log(session, 'orderPlaced', `${order.id} ${items.map((i) => i.title).join(', ')} = ${totalBase}`);
  await persist();
  return { status: 'placed', order };
}

export async function stockLevel() {
  const s = await load();
  const low = s.pantry.filter((p) => p.qty <= p.lowAt);
  const allergens = new Set(s.members.flatMap((m) => m.allergies));
  return {
    low: low.map((p) => ({ ...p, unsafeFor: s.members.filter((m) => p.allergen && m.allergies.includes(p.allergen)).map((m) => m.name) })),
    trackedAllergens: [...allergens],
    count: s.pantry.length
  };
}

export async function reset() {
  state = structuredClone(SEED);
  await persist();
  return { status: 'reset', householdId: state.householdId };
}
