import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import * as tools from './tools.js';
import { runTurn } from './agent.js';
import { CARDS_TEMPLATE, PLAN_TEMPLATE, DECISION_TEMPLATE, poster } from './ui/templates.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.AURA_TOKEN || '';
const PROTOCOL = LATEST_PROTOCOL_VERSION;
const PUBLIC_URL = process.env.AURA_PUBLIC_URL || `http://localhost:${PORT}`;

/** The Agent Skill is served as a resource so any agent can adopt Aura's policy
 *  without knowing our repo layout - the "Agent Skills" hook at runtime. */
const SKILL_URI = 'skill://aura-household/SKILL.md';
const lastTurn = { payload: null };

/** Call ToolResult: text for voice-only clients, structuredContent for data-only
 *  rendering, and `_meta.ui` to bind the result to a `ui://` template (MCP Apps). */
const ok = (value, ui) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  structuredContent: typeof value === 'object' ? value : undefined,
  ...(ui ? { _meta: { ui } } : {})
});
const ui = (invoking, invoked, resourceUri = 'ui://aura/cards') => ({ resourceUri, invoking, invoked });

async function readSkill() {
  return readFile(path.join(here, '..', 'skills', 'aura-household', 'SKILL.md'), 'utf8');
}

function newServer() {
  const mcp = new McpServer(
    { name: 'aura-household-agent', title: 'Aura Household Agent', version: '1.0.0' },
    {
      capabilities: {
        tools: {},
        resources: { subscribe: false, listChanged: false },
        prompts: {},
        extensions: { 'mcp-app': { templates: ['ui://aura/cards', 'ui://aura/plan', 'ui://aura/decision'] } }
      },
      instructions: `Aura is a household concierge add-on for Alexa+.
Load the Agent Skill (resource ${SKILL_URI}, or tool load_agent_skill) before planning.
Base workflow: household_profile -> weather_now -> media_search (content filter from household rules)
-> pantry_status -> convert_price -> place_order (spend guardrail) -> commit_routine (cross-session memory).
Autonomy contract: after each observation you may add, replace or skip a planned step, and you must
state the reason in the plan so the household can see why the agent changed course.
Never call place_order with confirmed=true unless the user confirmed the spend out loud.
During quiet hours replace headline lists with a single learn_fact card.`
    }
  );

  mcp.registerTool('household_profile', {
    title: 'Household profile',
    description: 'Members, preferences, allergies, budget cap, screen-time curfew and quiet hours. Call this first.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async () => {
    const r = await tools.householdProfile();
    return ok(r, ui('Reading the household profile', `${r.members.length} household members known`));
  });

  mcp.registerTool('weather_now', {
    title: 'Weather now',
    description: "Current conditions and today's outlook for the household city (or a place you pass).",
    inputSchema: { place: z.string().optional().describe('City name; defaults to the household home city') },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async (a) => {
    const r = await tools.weatherNow(a);
    return ok(r, ui("Checking today's weather", `Weather for ${r.place}`));
  });

  mcp.registerTool('media_search', {
    title: 'Media search',
    description: 'Search movies/music for the household. Results render as a carousel of cards.',
    inputSchema: {
      term: z.string().describe('Free text, e.g. "family animation"'),
      media: z.enum(['movie', 'music']).default('movie'),
      limit: z.number().int().min(1).max(12).default(6),
      familySafe: z.boolean().default(false).describe('Drop explicit / PG-13 / R results')
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async (a) => {
    const r = await tools.mediaSearch(a);
    return ok(r, ui(`Searching ${a.media}`, `${r.count} titles for "${r.term}"`));
  });

  mcp.registerTool('news_briefing', {
    title: 'News briefing',
    description: 'Short headline list for a kitchen card. Skip during quiet hours.',
    inputSchema: { limit: z.number().int().min(1).max(10).default(4) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async (a) => {
    const r = await tools.newsBriefing(a);
    return ok(r, ui('Picking up the headlines', `${r.count} headlines`));
  });

  mcp.registerTool('learn_fact', {
    title: 'Learn a fact',
    description: 'One calm explainer card - the low-stimulation replacement used after the curfew.',
    inputSchema: { topic: z.string().optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async (a) => {
    const r = await tools.learnFact(a);
    return ok(r, ui('Finding something worth knowing', r.title));
  });

  mcp.registerTool('convert_price', {
    title: 'Convert price',
    description: "Convert an amount into the household currency so budget rules are spoken in the user's money.",
    inputSchema: { amount: z.number(), from: z.string().default('USD'), to: z.string().optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async (a) => ok(await tools.priceConvert(a)));

  mcp.registerTool('pantry_status', {
    title: 'Pantry status',
    description: 'Items at or below their reorder level, plus which members each allergen rules out.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async () => {
    const r = await tools.pantryStatus();
    return ok(r, ui('Checking what is low', `${r.low.length} item(s) to restock`));
  });

  mcp.registerTool('remember_preference', {
    title: 'Remember preference',
    description: 'Persist a preference so the next conversation starts with it already known.',
    inputSchema: { member: z.string(), key: z.string(), value: z.any(), session: z.string().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async (a) => ok(await tools.remember(a)));

  mcp.registerTool('place_order', {
    title: 'Place order',
    description: 'Purchase step behind the spend guardrail. Above the household cap it returns needs_confirmation and nothing is bought.',
    inputSchema: {
      items: z.array(z.object({ title: z.string(), price: z.number(), kind: z.string().optional() })),
      totalBase: z.number(),
      confirmed: z.boolean().default(false).describe('Only true after the user said yes out loud'),
      session: z.string().optional()
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
  }, async (a) => {
    const r = await tools.placeOrder(a);
    return ok(r, ui('Checking the spend limit', r.status === 'placed' ? 'Order placed' : 'Waiting for spoken confirmation'));
  });

  mcp.registerTool('commit_routine', {
    title: 'Commit routine to memory',
    description: 'Hand the finished routine to household memory so a later conversation can continue it ("the film we picked last night").',
    inputSchema: {
      routine: z.object({
        name: z.string(),
        spokenSummary: z.string(),
        chosen: z.string().optional(),
        spend: z.number().optional(),
        // Compact per-step trace so describe_last_decision can return exact values.
        trace: z.array(z.object({ tool: z.string(), status: z.string(), why: z.string().nullable().optional() })).optional()
      }),
      session: z.string().optional()
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async (a) => ok(await tools.commitRoutine(a), ui('Remembering tonight', 'Saved to household memory', 'ui://aura/plan')));

  mcp.registerTool('household_audit', {
    title: 'Household audit log',
    description: 'What the agent remembered, blocked and bought, newest first - the transparency surface for a voice agent.',
    inputSchema: { limit: z.number().int().min(1).max(60).default(12) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async (a) => ok(await tools.audit(a), ui('Opening the log', 'Agent actions', 'ui://aura/plan')));

  mcp.registerTool('reset_household', {
    title: 'Reset demo household',
    description: 'Restore the seeded demo household. Useful before a judge run-through.',
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  }, async () => ok(await tools.reset()));

  mcp.registerTool('describe_last_decision', {
    title: 'Describe last decision',
    description: 'Summarise the most recently committed routine: the routine name, tools that ran, any agent re-plan step, any skipped step, and whether place_order was blocked by the spend cap.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async () => {
    const r = await tools.describeLastDecision();
    return ok(r, ui('Describing the last decision', r.found ? r.routineName : 'No routine yet', 'ui://aura/decision'));
  });

  mcp.registerTool('load_agent_skill', {
    title: 'Load Aura Agent Skill',
    description: "Return the Aura Agent Skill's SKILL.md so any agent can adopt Aura's planning policy.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async () => ok({ skill: SKILL_URI, markdown: await readSkill() }));

  // ---- resources ------------------------------------------------------
  mcp.registerResource('aura-cards-ui', 'ui://aura/cards', {
    title: 'Aura card and carousel renderer',
    description: 'Sandboxed HTML template. The host posts {cards, spoken} to ui/render and the frame reports its height.',
    mimeType: 'text/html;profile=mcp-app'
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/html;profile=mcp-app', text: CARDS_TEMPLATE }] }));

  mcp.registerResource('aura-plan-ui', 'ui://aura/plan', {
    title: 'Aura agent plan timeline',
    description: 'Sandboxed HTML template showing every step, every re-plan and the final spoken response.',
    mimeType: 'text/html;profile=mcp-app'
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/html;profile=mcp-app', text: PLAN_TEMPLATE }] }));

  mcp.registerResource('aura-decision-ui', 'ui://aura/decision', {
    title: 'Aura last-decision summary',
    description: 'Sandboxed HTML template showing the most recent committed routine: routine name, tools that ran, re-plan steps, skipped steps, and spend-cap status.',
    mimeType: 'text/html;profile=mcp-app'
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/html;profile=mcp-app', text: DECISION_TEMPLATE }] }));

  mcp.registerResource('aura-skill', SKILL_URI, {
    title: 'Aura Household Agent Skill',
    description: 'The Agent Skill that teaches an assistant when to call each Aura tool.',
    mimeType: 'text/markdown'
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: await readSkill() }] }));

  mcp.registerResource('aura-profile', 'data://aura/profile', {
    title: 'Household profile (JSON)', mimeType: 'application/json'
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await tools.householdProfile(), null, 2) }] }));

  mcp.registerResource('aura-last-turn', 'data://aura/last_turn', {
    title: 'Last agent turn (JSON)', mimeType: 'application/json'
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(lastTurn.payload ?? { note: 'No turn yet - POST /api/agent or use the web app.' }, null, 2) }] }));

  // ---- prompts --------------------------------------------------------
  mcp.registerPrompt('good_morning', { title: 'Good morning briefing', description: 'Brief the household for today.', inputSchema: { session: z.string().optional() } },
    ({ session }) => ({ messages: [{ role: 'user', content: { type: 'text', text: `Run the Aura morning routine for session "${session || 'living-room'}": profile, weather, headlines unless quiet hours, pantry.` } }] }));

  mcp.registerPrompt('movie_night', { title: 'Family movie night', description: 'Plan a movie night the whole household can watch.', inputSchema: { session: z.string().optional() } },
    ({ session }) => ({ messages: [{ role: 'user', content: { type: 'text', text: `Plan a movie night for session "${session || 'living-room'}" honouring allergies, the screen-time curfew, content ratings and the spend budget. Return a carousel of picks.` } }] }));

  mcp.registerPrompt('wind_down', { title: 'Wind down', description: 'Replace screens with audio and one calm card.', inputSchema: {} },
    () => ({ messages: [{ role: 'user', content: { type: 'text', text: 'It is past the screen-time curfew. Offer an audio alternative and one calm fact card, and make no purchases.' } }] }));

  return mcp;
}

// ---- HTTP surface -----------------------------------------------------
const app = express();
app.use(express.json({ limit: '256kb' }));

function authed(req) {
  if (!TOKEN) return true;
  return (req.get('authorization') || '') === `Bearer ${TOKEN}`;
}

app.get('/.well-known/oauth-protected-resource', (_req, res) => {
  res.json({
    resource: `${PUBLIC_URL}/mcp`,
    authorization_servers: [PUBLIC_URL],
    scopes_supported: ['aura.household'],
    bearer_methods_supported: ['header'],
    resource_documentation: PUBLIC_URL
  });
});

// Alexa+ drives the conversation from its own history, so the server is stateless:
// one transport per request, no session id.
app.post('/mcp', async (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const mcp = newServer();
  res.on('close', () => { transport.close(); mcp.close(); });
  await mcp.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/mcp', (_req, res) => res.status(405).json({ error: 'method_not_allowed' }));
app.delete('/mcp', (_req, res) => res.status(405).json({ error: 'method_not_allowed' }));

/** The simulated Alexa+ device. It opens a real MCP client over Streamable HTTP,
 *  negotiates the protocol, loads the Agent Skill, and runs the plan-act-observe-replan
 *  loop through callTool - so the whole hackathon surface is exercised end to end. */
app.post('/api/agent', async (req, res) => {
  const utterance = String(req.body?.utterance || '').slice(0, 400);
  const session = String(req.body?.session || 'living-room').slice(0, 40);
  // Judges can force the clock so curfew / quiet-hours behaviour is demonstrable on demand.
  const hour = Number(req.body?.hour);
  const now = Number.isInteger(hour) && hour >= 0 && hour <= 23
    ? new Date(new Date().setHours(hour, 5, 0, 0))
    : new Date();
  const client = new Client(
    { name: 'aura-simulated-alexa-device', version: '1.0.0' },
    { capabilities: { roots: { listChanged: false } } }
  );
  const headers = TOKEN ? { authorization: `Bearer ${TOKEN}` } : undefined;
  const transport = new StreamableHTTPClientTransport(new URL(`${PUBLIC_URL.replace('localhost', '127.0.0.1')}/mcp`), { requestInit: { headers } });

  try {
    await client.connect(transport);
    const call = async (name, args) => {
      const r = await client.callTool({ name, arguments: args });
      if (r.isError) throw new Error(String(r.content?.[0]?.text || `${name} failed`));
      if (r.structuredContent) return r.structuredContent;
      const text = r.content?.find((c) => c.type === 'text')?.text;
      try { return JSON.parse(text); } catch { return text; }
    };
    const [listed, resources, skill] = await Promise.all([
      client.listTools(),
      client.listResources(),
      client.readResource({ uri: SKILL_URI })
    ]);
    const result = await runTurn(utterance, { call, session, now });
    lastTurn.payload = {
      utterance, session, at: new Date().toISOString(),
      cards: result.cards, spoken: result.routine.spokenSummary, trace: result.routine.trace
    };
    res.json({
      ...result,
      mcp: {
        serverName: client.getServerVersion()?.name,
        protocolVersion: PROTOCOL,
        toolCount: listed.tools.length,
        tools: listed.tools.map((t) => t.name),
        uiTemplates: resources.resources.filter((r) => r.uri.startsWith('ui://')).map((r) => ({ uri: r.uri, mimeType: r.mimeType })),
        skillLoaded: (skill.contents?.[0]?.text || '').length
      }
    });
    await client.close();
  } catch (err) {
    res.status(500).json({ error: err.message, hint: 'Is the server reachable at ' + PUBLIC_URL + '/mcp ?' });
  }
});

/** Read any MCP resource through a real Streamable-HTTP client, so the browser UI
 *  renders the templates the server published rather than a copy of them. */
app.get('/api/resource', async (req, res) => {
  const uri = String(req.query.uri || '');
  if (!/^(ui|data|skill):\/\//.test(uri)) return res.status(400).json({ error: 'uri must be a ui://, data:// or skill:// MCP resource' });
  const client = new Client({ name: 'aura-ui-host', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(`${PUBLIC_URL.replace('localhost', '127.0.0.1')}/mcp`), { requestInit: { headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : undefined } });
  try {
    await client.connect(transport);
    const r = await client.readResource({ uri });
    const c = r.contents?.[0];
    if (!c) return res.status(404).json({ error: `No contents for ${uri}` });
    res.set('Content-Type', c.mimeType || 'text/plain');
    if (c.mimeType?.startsWith('text/html')) {
      res.send(c.text.replace('<head>', '<head><base target="_blank">'));
    } else {
      res.send(c.mimeType === 'application/json' ? JSON.parse(c.text) : c.text);
    }
    await client.close();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/household', async (_req, res) => res.json(await tools.householdProfile()));
app.get('/art/:title.svg', (req, res) => res.type('svg').send(poster(decodeURIComponent(req.params.title))));
app.get('/health', (_req, res) => res.json({ ok: true, protocol: PROTOCOL, tokenRequired: Boolean(TOKEN), publicUrl: PUBLIC_URL }));
app.use(express.static(path.join(here, 'ui')));
app.use((_req, res) => res.status(404).type('text/plain').send('Not found'));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Aura MCP server (Streamable HTTP, protocol ${PROTOCOL})  ->  ${PUBLIC_URL}/mcp`);
  console.log(`Simulated Alexa+ web app                                ->  ${PUBLIC_URL}/`);
  if (TOKEN) console.log('Bearer token auth is ON (AURA_TOKEN set).');
}).on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is busy - retry with PORT=8788`);
  else throw e;
});
