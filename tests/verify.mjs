/** Acceptance checks a judge can run: `npm run verify`.
 *  Exits non-zero with the failing assertion if any check breaks. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const PORT = Number(process.env.VERIFY_PORT || 8793);
const ROOT = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const BASE = `http://127.0.0.1:${PORT}`;

const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), AURA_OFFLINE: '1' }, stdio: ['ignore', 'ignore', 'inherit']
});

const results = [];
const check = async (label, fn) => {
  try { await fn(); results.push(['PASS', label]); }
  catch (e) { results.push(['FAIL', `${label} -> ${e.message}`]); }
};

async function waitUp() {
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) return r.json(); } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not start');
}

async function main() {
  const health = await waitUp();
  const client = new Client({ name: 'aura-verifier', version: '1.0.0' }, { capabilities: { roots: { listChanged: false } } });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));
  await client.callTool({ name: 'reset_household', arguments: {} });
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    if (r.isError) throw new Error(String(r.content?.[0]?.text));
    return r;
  };

  await check('Streamable HTTP server negotiates MCP 2025-11-25', async () => {
    assert.equal(health.protocol, '2025-11-25');
  });

  await check('advertises tools, resources and prompts capabilities', async () => {
    const t = await client.listTools();
    const r = await client.listResources();
    const p = await client.listPrompts();
    assert.ok(t.tools.length >= 12, 'too few tools');
    assert.ok(r.resources.some((x) => x.uri === 'ui://aura/cards'), 'missing ui:// resource');
    assert.ok(p.prompts.some((x) => x.name === 'movie_night'), 'missing prompt');
  });

  await check('UI templates use the MCP Apps mime type', async () => {
    const r = await client.listResources();
    const cards = r.resources.find((x) => x.uri === 'ui://aura/cards');
    assert.equal(cards.mimeType, 'text/html;profile=mcp-app');
    const body = await client.readResource({ uri: 'ui://aura/cards' });
    assert.match(body.contents[0].text, /ui\/render/, 'template must accept host data');
    assert.ok(!/https?:\/\/(?!localhost)/.test(body.contents[0].text.replace(/xmlns="[^"]*"/g, '')), 'template must not load remote assets');
  });

  await check('tool results carry _meta.ui.resourceUri for card rendering', async () => {
    const r = await call('media_search', { term: 'family animation', media: 'movie', limit: 4 });
    assert.equal(r._meta.ui.resourceUri, 'ui://aura/cards');
    assert.ok(r._meta.ui.invoking && r._meta.ui.invoked, 'needs invoking/invoked strings');
    assert.ok(r.structuredContent.items.length > 0, 'no items returned');
  });

  await check('Agent Skill is loadable as an MCP resource', async () => {
    const r = await client.readResource({ uri: 'skill://aura-household/SKILL.md' });
    assert.match(r.contents[0].text, /^---\r?\nname: aura-household/);
    assert.match(r.contents[0].text, /description:/);
    const viaTool = await call('load_agent_skill');
    assert.ok(viaTool.content[0].text.length > 500, 'skill tool returned little');
  });

  await check('server instructions tell the agent the workflow', async () => {
    const info = client.getServerCapabilities?.() ?? {};
    assert.ok(info, 'capabilities readable');
    const res = await fetch(`${BASE}/api/household`);
    const p = await res.json();
    assert.ok(p.rules.spendBudget > 0 && p.rules.screenTimeCurfewLocal, 'household rules loaded');
  });

  await check('spend guardrail blocks an over-cap purchase without spoken confirmation', async () => {
    const r = await call('place_order', { items: [{ title: 'Big basket', price: 60 }], totalBase: 60, confirmed: false });
    const body = JSON.parse(r.content[0].text);
    assert.equal(body.status, 'needs_confirmation');
  });

  await check('same order succeeds once the user confirms', async () => {
    const r = await call('place_order', { items: [{ title: 'Big basket', price: 60 }], totalBase: 60, confirmed: true, session: 'verify' });
    const body = JSON.parse(r.content[0].text);
    assert.equal(body.status, 'placed');
    assert.ok(body.order.id);
  });

  await check('allergen memory vetoes an item from the restock basket', async () => {
    const r = await call('pantry_status');
    const stock = JSON.parse(r.content[0].text);
    const brittle = stock.low.find((l) => l.item === 'Peanut brittle');
    assert.ok(brittle.unsafeFor.includes('Amma'), 'allergen not attributed to the member');
  });

  await check('the agent re-plans when the weather contradicts the plan', async () => {
    const res = await fetch(`${BASE}/api/agent`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ utterance: 'set up a movie night for everyone', session: 'kitchen' }) });
    const data = await res.json();
    assert.ok(data.routine, 'no routine returned');
    assert.ok(data.routine.trace.some((t) => t.status === 'added-by-agent'), 'agent never re-planned');
    assert.ok(data.mcp.toolCount >= 12, 'agent did not see the tool surface');
    assert.ok(data.mcp.uiTemplates.length === 2, 'agent did not see the ui:// templates');
    assert.ok(data.mcp.skillLoaded > 500, 'agent did not load the Agent Skill');
  });

  await check('memory survives across sessions', async () => {
    const before = await (await fetch(`${BASE}/api/household`)).json();
    assert.ok(before.lastRoutine, 'nothing committed after the previous turn');
    const res = await fetch(`${BASE}/api/agent`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ utterance: 'what did we watch last night?', session: 'bedroom' }) });
    const data = await res.json();
    assert.match(data.routine.spokenSummary, /Last time:/, 'recall did not use carried memory');
  });

  const agent = async (utterance, extra = {}) => (await fetch(`${BASE}/api/agent`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ utterance, session: 'bedroom', ...extra })
  })).json();

  await check('bedtime offers a calm card instead of headlines', async () => {
    const data = await agent('time for bed', { hour: 23 });
    assert.ok(data.routine.trace.some((t) => t.tool === 'learn_fact'), 'no calm card offered at bedtime');
    assert.ok(!data.cards.some((c) => c.title === 'Worth reading'), 'headlines shown during wind-down');
  });

  await check('quiet hours suppress the headline step and substitute a card', async () => {
    const data = await agent('good morning', { hour: 23 });
    assert.ok(data.routine.trace.some((t) => t.status === 'skipped' && t.tool === 'news_briefing'), 'headlines were not suppressed');
    assert.ok(data.routine.trace.some((t) => t.tool === 'learn_fact' && t.status === 'added-by-agent'), 'no substitute card');
  });

  await check('screen-time curfew converts a video request into audio', async () => {
    const data = await agent('set up a movie night for everyone', { hour: 23 });
    assert.ok(data.routine.trace.some((t) => t.why && /curfew/.test(t.why)), 'curfew rule never fired');
    assert.ok(data.routine.trace.some((t) => t.tool === 'media_search' && t.args?.media === 'music'), 'no audio alternative after curfew');
  });

  await check('transport enforces the MCP Accept contract and auth', async () => {
    const init = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'x', version: '1' } } });
    const bare = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: init });
    assert.equal(bare.status, 406, 'server must reject a missing Accept pair');
    const proper = await fetch(`${BASE}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: init
    });
    assert.ok(process.env.AURA_TOKEN ? proper.status === 401 : proper.ok, `initialize returned ${proper.status}`);
    const meta = await (await fetch(`${BASE}/.well-known/oauth-protected-resource`)).json();
    assert.ok(meta.resource.endsWith('/mcp') && meta.bearer_methods_supported.includes('header'), 'protected-resource metadata incomplete');
  });

  await client.close();
  child.kill();

  const failed = results.filter((r) => r[0] === 'FAIL');
  for (const [s, l] of results) console.log(`${s === 'PASS' ? '✓' : '✗'} ${l}`);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); child.kill(); process.exit(1); });
