import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { runTurn } from '../src/agent.js';

const PORT = Number(process.env.PORT || 8791);
const URL_MCP = `http://127.0.0.1:${PORT}/mcp`;
const repoRoot = path.dirname(fileURLToPath(import.meta.url)) + '/..';

const child = spawn(process.execPath, [path.join(repoRoot, 'src', 'server.js')], {
  cwd: repoRoot,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe']
});
child.stdout.on('data', (d) => process.env.AURA_DEBUG && process.stdout.write(d));
child.stderr.on('data', (d) => process.stderr.write(d));

const wait = async (ms = 25000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/health`); if (r.ok) return r.json(); } catch { /* not up yet */ }
    await new Promise((res) => setTimeout(res, 150));
  }
  throw new Error('server did not come up');
};

function asciiCards(cards) {
  const line = (s) => '  ' + s;
  return cards.map((c) => {
    if (c.type === 'carousel') {
      return line(`[carousel] ${c.title}\n` + c.items.map((i, n) => line(`   ${i.chosen ? '>' : ' '} ${n + 1}. ${i.title}  ${i.sub}  $${i.price}`)).join('\n'));
    }
    if (c.type === 'list') {
      return line(`[list] ${c.title}\n` + c.items.map((i) => line(`     - ${i.title}  ${i.sub}`)).join('\n'));
    }
    return line(`[tile] ${c.title} :: ${c.body}\n` + line(`     ${c.meta}`));
  }).join('\n');
}

function asciiTrace(trace) {
  const glyph = { ok: '✓', 'added-by-agent': '+', skipped: '⊘', error: '✗', placed: '✓', needs_confirmation: '?' };
  return trace.map((s) => `  ${glyph[s.status] || '·'} ${s.tool.padEnd(18)} ${s.status === 'added-by-agent' ? 'RE-PLAN ' : ''}${(s.why || s.summary || '')}`)
    .filter((l) => !l.includes('undefined'))
    .join('\n');
}

async function main() {
  const health = await wait();
  console.log(`\n=== Aura demo ===\nserver ${health.protocol} · Streamable HTTP · ${health.publicUrl}`);

  const client = new Client({ name: 'aura-demo-cli', version: '1.0.0' }, { capabilities: { roots: { listChanged: false } } });
  await client.connect(new StreamableHTTPClientTransport(new URL(URL_MCP)));

  const tools = await client.listTools();
  const resources = await client.listResources();
  console.log(`tools: ${tools.tools.length}   resources: ${resources.resources.length}`);
  console.log('ui templates: ' + resources.resources.filter((r) => r.uri.startsWith('ui://')).map((r) => `${r.uri} (${r.mimeType})`).join(', '));

  const call = async (name, args) => {
    const r = await client.callTool({ name, arguments: args });
    return r.structuredContent ?? JSON.parse(r.content[0].text);
  };

  const turns = [
    'good morning',
    'set up a movie night for everyone',
    'we are out of chai, order snacks',
    'what did we watch last night?'
  ];

  for (const utterance of turns) {
    console.log(`\n--- "Alexa, ${utterance}" ---`);
    const res = await runTurn(utterance, { call, session: 'living-room' });
    console.log(`intent: ${res.intent.intent} (${res.intent.label})`);
    console.log(asciiTrace(res.routine.trace));
    console.log(asciiCards(res.cards));
    console.log(`\n  spoken: ${res.routine.spokenSummary}`);
  }

  const mem = await call('household_audit', { limit: 6 });
  console.log('\n--- audit log (what the agent remembered, blocked, bought) ---');
  for (const e of mem.entries) console.log(`  ${e.at.slice(11, 19)}  ${e.verb.padEnd(16)} ${e.detail}`);

  await client.close();
  child.kill();
  console.log('\ndemo complete\n');
}

main().catch((e) => { console.error(e); child.kill(); process.exit(1); });
