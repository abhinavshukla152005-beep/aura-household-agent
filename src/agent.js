/** Aura's agent core: intent -> plan -> act -> observe -> re-plan.
 *
 *  The loop is policy-driven and deterministic so judges can run it with no API
 *  keys, while every action still goes through the MCP tool surface over
 *  Streamable HTTP. `opts.planner` can replace `classify`/`initialPlan` with an
 *  LLM (Bedrock, SageMaker, or any tool-calling model) without touching the rest.
 */

import { isFamilySafe } from './services/media.js';

const INTENTS = [
  { intent: 'explain', say: 'Explain the last decision', match: /\b(why did|why'd|why didn'?t|why no[t]? |how come|what changed|explain (that|your|the|what|it)|give me the reason|reason for (that|the|your)|what made you)\b/i },
  { intent: 'memory', say: 'Recall from household memory', match: /(remember|last time|what did (we|you)|earlier tonight|yesterday night|our history|state of the household)/i },
  { intent: 'morningBriefing', say: 'Good morning briefing', match: /(good morning|wake me|start my day|brief me|what.s today)/i },
  { intent: 'movieNight', say: 'Family movie night', match: /(movie|film|watch|cinema|entertain|movie night)/i },
  { intent: 'musicMood', say: 'Mood music', match: /(music|song|study|focus|relax|ambient|playlist)/i },
  { intent: 'restock', say: 'Pantry restock', match: /(order|buy|restock|groceries|snacks|out of)/i },
  { intent: 'windDown', say: 'Wind down / bedtime', match: /(bedtime|bed ?time|\bbed\b|sleep|wind down|night night|lights out|turn off screens)/i }
];

export function classify(utterance = '') {
  const hit = INTENTS.find((i) => i.match.test(utterance));
  return { intent: hit?.intent ?? 'morningBriefing', label: hit?.say ?? 'Good morning briefing', utterance };
}

function localHour(date = new Date()) {
  return date.getHours();
}

function inWindow(hour, from, to) {
  const f = Number(from.split(':')[0]), t = Number(to.split(':')[0]);
  return f <= t ? hour >= f && hour < t : hour >= f || hour < t;
}

export function initialPlan({ intent }, ctx) {
  const steps = [{ tool: 'household_profile', args: {}, why: 'Load household rules, members and budget' }];

  if (intent === 'morningBriefing') {
    steps.push(
      { tool: 'weather_now', args: {}, why: 'Today\'s weather for the home city' },
      { tool: 'news_briefing', args: { limit: 4 }, why: 'Headlines for the kitchen screen' },
      { tool: 'pantry_status', args: {}, why: 'Anything low before the day starts' }
    );
  }
  if (intent === 'movieNight') {
    steps.push(
      { tool: 'weather_now', args: {}, why: 'Indoors or outdoors decides the plan' },
      { tool: 'media_search', args: { term: 'family adventure', media: 'movie', limit: 6 }, why: 'Candidate titles' },
      { tool: 'pantry_status', args: {}, why: 'Snacks already in stock' }
    );
  }
  if (intent === 'musicMood') {
    steps.push({ tool: 'media_search', args: { term: 'calm instrumental', media: 'music', limit: 5 }, why: 'Mood playlist candidates' });
  }
  if (intent === 'restock') {
    steps.push({ tool: 'pantry_status', args: {}, why: 'What is actually at or below reorder level' });
  }
  if (intent === 'explain') {
    steps.push({ tool: 'describe_last_decision', args: {}, why: 'Read back the trace stored when the last routine committed' });
  }
  if (intent === 'memory') {
    steps.push({ tool: 'household_audit', args: { limit: 5 }, why: 'Read back what the household already decided' });
  }
  if (intent === 'windDown') {
    steps.push(
      { tool: 'learn_fact', args: { topic: 'space' }, why: 'One calm card instead of a screen' },
      { tool: 'media_search', args: { term: 'sleep stories', media: 'music', limit: 3 }, why: 'Audio alternative' }
    );
  }
  return steps;
}

/** Re-plan after each observation. Returns extra steps, skipped steps and notes. */
export function observe(step, result, ctx) {
  const notes = [];
  if (step.tool === 'household_profile') Object.assign(ctx, { profile: result, home: result.home, rules: result.rules });
  if (step.tool === 'weather_now') ctx.weather = result;
  if (step.tool === 'media_search') ctx.candidates = result.items;
  if (step.tool === 'pantry_status') ctx.stock = result;
  if (step.tool === 'news_briefing') ctx.headlines = result.items;
  if (step.tool === 'learn_fact') ctx.fact = result;
  if (step.tool === 'household_audit') ctx.audit = result.entries;
  if (step.tool === 'describe_last_decision') ctx.decision = result;
  return notes;
}

export function replan(step, result, ctx, hour) {
  const added = [];
  const rules = ctx.rules || {};

  if (step.tool === 'weather_now' && result.inclement && ctx.intent === 'movieNight') {
    added.push({
      tool: 'media_search',
      args: { term: 'cozy indoor animation', media: 'movie', limit: 4 },
      why: `Rain risk ${result.rainChance}% - swapping to an indoor-friendly short film`,
      replaces: 'outdoor pick'
    });
    added.push({ tool: 'learn_fact', args: { topic: 'nature' }, why: 'Add a rainy-evening card to the carousel' });
  }

  if (step.tool === 'media_search' && result.items?.length) {
    const child = (ctx.profile?.members || []).some((m) => m.role === 'child');
    const unsafe = result.items.filter((i) => !isFamilySafe(i));
    if (child && unsafe.length && hour >= Number((rules.familySafeOnlyAfter || '19:00').split(':')[0])) {
      added.push({
        tool: 'media_search',
        args: { term: 'family animation', media: 'movie', limit: 4, familySafe: true },
        why: `${unsafe.length} result(s) are not family-safe after ${rules.familySafeOnlyAfter}; re-querying with the content filter`,
        replaces: result.items.map((i) => i.id)
      });
    }
  }

  if (step.tool === 'media_search' && !result.items?.length) {
    const widen = result.media === 'movie' ? 'adventure' : 'calm';
    added.push({
      tool: 'media_search',
      args: { term: widen, media: result.media, limit: 5 },
      why: `Catalogue returned nothing for "${result.term}" (${result.source}); agent widened the query instead of giving up`,
      replaces: [result.term]
    });
  }

  if (step.tool === 'news_briefing' && rules.quietHours && inWindow(hour, rules.quietHours.from, rules.quietHours.to)) {
    return { skip: 'Quiet hours - headlines replaced by a single whisper card', added: [{ tool: 'learn_fact', args: { topic: 'history' }, why: 'Low-stimulation replacement' }] };
  }

  if (step.tool === 'media_search' && rules.screenTimeCurfewLocal && hour >= Number(rules.screenTimeCurfewLocal.split(':')[0]) && ctx.intent === 'movieNight') {
    added.push({
      tool: 'media_search',
      args: { term: 'bedtime audio', media: 'music', limit: 3 },
      why: `Past the ${rules.screenTimeCurfewLocal} screen-time curfew - offering audio instead of video`,
      blocks: 'video playback'
    });
  }

  return { added };
}

function pickCandidate(ctx) {
  const pool = ctx.candidates || [];
  const genres = new Set((ctx.profile?.members || []).flatMap((m) => m.preferences?.genres || []));
  const scored = pool
    .filter((i) => isFamilySafe(i))
    .map((i) => ({
      ...i,
      score: (genres.has(i.primaryGenreName) ? 2 : 0) + (i.streamable ? 1 : 0) - (i.price || 0) / 10
    }))
    .sort((a, b) => b.score - a.score);
  return scored[0] || pool[0] || null;
}

async function totalInHomeCurrency(call, items, home) {
  const base = items.reduce((s, i) => s + (i.price || 0), 0);
  if (!base) return { base, home: 0, detail: null };
  const detail = await call('convert_price', { amount: base, from: 'USD', to: home.currency });
  return { base, home: detail.converted, detail };
}

/** Run the whole agentic turn. `call(toolName, args)` must execute through MCP. */
export async function runTurn(utterance, { call, session = 'living-room', now = new Date(), commit = true } = {}) {
  const cls = classify(utterance);
  const ctx = { intent: cls.intent, session };
  const hour = localHour(now);
  const trace = [];
  let plan = initialPlan(cls, ctx);

  for (let i = 0; i < plan.length && plan.length <= 14; i++) {
    const step = plan[i];
    const t0 = Date.now();
    let result, error = null;
    try {
      result = await call(step.tool, step.args);
    } catch (err) {
      error = err.message;
      trace.push({ ...step, status: 'error', error, ms: Date.now() - t0 });
      continue;
    }
    observe(step, result, ctx);
    trace.push({ ...step, status: step.queued ? 'added-by-agent' : 'ok', ms: Date.now() - t0, summary: summarise(step.tool, result) });

    const adj = replan(step, result, ctx, hour);
    if (adj.skip) trace.push({ tool: step.tool, why: adj.skip, status: 'skipped' });
    for (const extra of adj.added || []) {
      if (!plan.some((p) => p.tool === extra.tool && JSON.stringify(p.args) === JSON.stringify(extra.args))) {
        extra.queued = true;
        plan.push(extra);
      }
    }
  }

  const chosen = pickCandidate(ctx);
  const basket = [];
  const vetoes = [];
  if (ctx.intent === 'movieNight' && chosen) basket.push(chosen);
  if (ctx.intent === 'restock') {
    for (const low of ctx.stock?.low || []) {
      if (low.unsafeFor?.length) {
        vetoes.push(`${low.item} - keep away from ${low.unsafeFor.join(' and ')} (${low.allergen || 'allergen'})`);
        continue;
      }
      basket.push({ id: low.item.toLowerCase().replace(/\s+/g, '-'), title: low.item, price: low.price ?? 3, kind: 'pantry' });
    }
  }
  for (const v of vetoes) trace.push({ tool: 'pantry_status', why: `Vetoed by memory: ${v}`, status: 'skipped' });

  const money = await totalInHomeCurrency(call, basket, ctx.home || { currency: 'INR' });
  const budget = ctx.rules?.spendBudget ?? 25;
  let spendNote = null;
  let finalBasket = basket;
  if (money.base > budget && basket.length > 1) {
    finalBasket = basket.slice().sort((a, b) => a.price - b.price).slice(0, -1);
    const recalc = await totalInHomeCurrency(call, finalBasket, ctx.home || { currency: 'INR' });
    spendNote = `Over the ${budget} USD budget - agent dropped the priciest item and re-costed to ${recalc.base} USD`;
    Object.assign(money, recalc);
  }

  ctx.basket = finalBasket;
  ctx.auditVetoed = vetoes;

  let order = null;
  const wantsToBuy = ctx.intent === 'movieNight' || ctx.intent === 'restock';
  if (finalBasket.length && wantsToBuy && money.base > 0) {
    order = await call('place_order', {
      items: finalBasket.map((i) => ({ title: i.title, price: i.price, kind: i.kind })),
      totalBase: money.base,
      session
    });
    trace.push({ tool: 'place_order', why: spendNote || 'Purchase guardrail check', status: order.status, summary: order.reason || `${order.order?.items?.length} item(s)` });
  } else if (finalBasket.length && wantsToBuy) {
    order = { status: 'nothing_to_buy', reason: 'Every pick is already included - no spend authorisation needed' };
    trace.push({ tool: 'place_order', why: order.reason, status: 'skipped' });
  }

  const routine = {
    name: cls.label,
    intent: cls.intent,
    chosen,
    basket: finalBasket,
    spend: money.base,
    money,
    spendNote,
    order,
    spokenSummary: spoken(cls, ctx, chosen, money, order),
    trace
  };

  if (commit && (ctx.intent === 'movieNight' || ctx.intent === 'morningBriefing' || ctx.intent === 'restock')) {
    // Pass a compact trace ({ tool, status, why } only — no ms/summary/full results) so that
    // describe_last_decision can read exact values instead of guessing from the summary text.
    const compactTrace = trace.map((t) => ({ tool: t.tool, status: t.status, why: t.why || null }));
    routine.committed = await call('commit_routine', {
      routine: { name: routine.name, spokenSummary: routine.spokenSummary, chosen: chosen?.title, spend: money.base, trace: compactTrace },
      session
    });
  }

  return { intent: cls, ctx, routine, cards: buildCards(ctx, routine), ui: uiRefs(routine) };
}

function summarise(tool, r) {
  switch (tool) {
    case 'weather_now': return `${r.place}: ${r.spoken}`;
    case 'media_search': return `${r.count} result(s) from ${r.source}${r.note ? ` (${r.note})` : ''}${r.filteredFor && r.filteredFor !== 'none' ? `, ${r.filteredFor} only` : ''}`;
    case 'news_briefing': return `${r.count} headline(s)`;
    case 'learn_fact': return `${r.title}: ${String(r.text).slice(0, 60)}...`;
    case 'pantry_status': return `${r.low.length} low, allergens ${r.trackedAllergens.join('/') || 'none'}`;
    case 'household_profile': return `${r.members.length} members, budget ${r.rules.spendBudget}`;
    case 'convert_price': return r.spoken || `${r.converted} ${r.to}`;
    case 'describe_last_decision': return r.traceAvailable
      ? `${r.routineName}: ${r.addedByAgent.length} step(s) added by me, ${r.skippedSteps.length} skipped`
      : `${r.routineName}: no stored trace (${r.reason})`;
    default: return typeof r === 'object' ? JSON.stringify(r).slice(0, 80) : String(r);
  }
}

function spoken(cls, ctx, chosen, money, order) {
  const bits = [];
  if (ctx.intent === 'explain') {
    const d = ctx.decision;
    if (!d || !d.found) {
      bits.push('There is nothing to explain yet - this household has no committed routine.');
    } else if (!d.traceAvailable) {
      bits.push(`The last one was ${d.routineName}, committed before this household stored per-step traces, so I cannot show its steps.`);
    } else {
      bits.push(`Last time I ran ${d.routineName} at ${String(d.committedAt).slice(11, 16)}.`);
      const adds = d.addedByAgent || [], skips = d.skippedSteps || [];
      bits.push(`I ran ${d.toolsInOrder?.length || 0} steps: ${adds.length} added as the plan changed, ${skips.length} skipped.`);
      const decisive = adds[adds.length - 1] || skips[skips.length - 1];
      if (decisive) bits.push(`The one that mattered - ${decisive.tool}: ${String(decisive.why || decisive.reason || '').slice(0, 160)}`);
      if (!adds.length && !skips.length) bits.push('Nothing had to change mid-run.');
      if (d.purchaseBlocked) bits.push('And I did not spend: the household cap needed a spoken yes.');
    }
  } else if (ctx.intent === 'memory') {
    const last = ctx.profile?.lastRoutine;
    bits.push(last ? `Last time: ${last.summary || last.name} at ${String(last.at).slice(11, 16)}.` : 'This household has no committed routine yet.');
    if (ctx.audit?.length) bits.push(`Most recently I ${ctx.audit[0].verb.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${ctx.audit[0].detail}`);
  } else if (ctx.intent === 'morningBriefing') {
    bits.push(`Good morning. ${ctx.weather?.spoken || 'Weather unavailable.'}`);
    if (ctx.headlines?.length) bits.push(`Top of the feed: ${ctx.headlines[0].title}.`);
    if (ctx.stock?.low?.length) bits.push(`${ctx.stock.low.slice(0, 2).map((l) => l.item).join(' and ')} running low.`);
  } else if (chosen && ctx.intent === 'movieNight') {
    bits.push(`Movie night: ${chosen.title}${chosen.runtimeMin ? `, ${chosen.runtimeMin} minutes` : ''} - it suits everyone in the house.`);
    if (money.base) bits.push(`That is about ${Math.round(money.home)} ${money.detail?.to || ''} against the household budget.`);
    if (order?.status === 'needs_confirmation') bits.push('I have not spent anything yet - say confirm to go ahead.');
    if (order?.status === 'placed') bits.push('Purchased and logged.');
    if (order?.status === 'nothing_to_buy') bits.push('Nothing to buy - it is already in your plan.');
  } else if (ctx.intent === 'restock') {
    const names = (ctx.basket || []).map((b) => b.title.toLowerCase());
    bits.push(names.length ? `Ordering ${names.join(' and ')}.` : 'Nothing needs restocking.');
    if (money.base) bits.push(`About ${Math.round(money.home)} ${money.detail?.to || ''}.`);
    if (order?.status === 'needs_confirmation') bits.push(`That is over the ${ctx.rules?.maxAmountNoPrompt} limit, so say confirm and I will place it.`);
    if (ctx.auditVetoed?.length) bits.push(`I left out ${ctx.auditVetoed.join(', ')}.`);
  } else {
    bits.push(`${cls.label} ready.`);
  }
  if (ctx.fact) bits.push(`One thing to chew on: ${String(ctx.fact.text).slice(0, 120)}`);
  return bits.join(' ').replace(/\s+/g, ' ').trim();
}

function buildCards(ctx, routine) {
  const cards = [];
  if (ctx.weather) cards.push({ type: 'tile', title: ctx.weather.place, body: ctx.weather.spoken, meta: `${ctx.weather.tempC}C / feels ${ctx.weather.feelsLikeC}C, rain ${ctx.weather.rainChance}%`, accent: ctx.weather.inclement ? 'rain' : 'sun' });
  if (ctx.headlines?.length) cards.push({ type: 'list', title: 'Worth reading', items: ctx.headlines.map((h) => ({ title: h.title, sub: `${h.source} • ${h.points} points` })) });
  if (ctx.candidates?.length) cards.push({ type: 'carousel', title: routine.intent === 'movieNight' || ctx.intent === 'movieNight' ? 'Tonight\'s picks' : 'Candidates', items: ctx.candidates.slice(0, 6).map((i) => ({ title: i.title, sub: i.subtitle, art: i.artwork, price: i.price, chosen: i.id === routine.chosen?.id })) });
  if (ctx.stock?.low?.length) cards.push({ type: 'list', title: 'Low stock', items: ctx.stock.low.map((l) => ({ title: l.item, sub: `${l.qty} ${l.unit} left${l.unsafeFor.length ? ` - keep away from ${l.unsafeFor.join(', ')}` : ''}` })) });
  if (ctx.fact) cards.push({ type: 'tile', title: ctx.fact.title, body: ctx.fact.text, meta: 'learn_fact', accent: 'fact' });
  if (routine.basket?.length) {
    cards.push({
      type: 'list',
      title: routine.order?.status === 'placed' ? 'Ordered' : routine.order?.status === 'needs_confirmation' ? 'Waiting for you to confirm' : 'Basket',
      items: routine.basket.map((b) => ({ title: b.title, sub: `${b.price} USD${b.kind === 'pantry' ? ' • restock' : ''}` }))
    });
  }
  if (routine.spendNote) cards.push({ type: 'tile', title: 'Budget re-plan', body: routine.spendNote, meta: 'agent decision', accent: 'warn' });
  return cards;
}

function uiRefs(routine) {
  return {
    cards: 'ui://aura/cards',
    plan: 'ui://aura/plan',
    data: {
      cards: `data://aura/cards?r=${routine.name.replace(/\s+/g, '_')}`,
      trace: 'data://aura/trace'
    }
  };
}

export { isFamilySafe };
