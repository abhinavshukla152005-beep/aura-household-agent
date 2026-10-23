const $ = (s) => document.querySelector(s);
const els = {
  ring: $('#ring'), spoken: $('#spoken'), cards: $('#cards'), plan: $('#plan'),
  decision: $('#decision'),
  utter: $('#utterance'), send: $('#send'), mic: $('#mic'), session: $('#session'),
  clock: $('#clock'),
  status: $('#status'), mem: $('#mem'), suggest: $('#suggest')
};

const frames = {
  cards: { el: els.cards, ready: false },
  plan: { el: els.plan, ready: false },
  decision: { el: els.decision, ready: false }
};
let pending = null;

function setChip(key, text) {
  const chip = els.status.querySelector(`[data-k="${key}"]`);
  if (chip) chip.textContent = text;
}

async function boot() {
  try {
    const h = await (await fetch('/health')).json();
    setChip('protocol', `MCP ${h.protocol}`);
    setChip('session', h.tokenRequired ? 'auth on' : 'local dev');
    els.cards.src = '/api/resource?uri=' + encodeURIComponent('ui://aura/cards');
    els.plan.src = '/api/resource?uri=' + encodeURIComponent('ui://aura/plan');
    els.decision.src = '/api/resource?uri=' + encodeURIComponent('ui://aura/decision');
    const p = await (await fetch('/api/household')).json();
    els.mem.textContent = JSON.stringify(p, null, 2);
    setChip('tools', `${p.members.length} members · budget ${p.rules.spendBudget} · curfew ${p.rules.screenTimeCurfewLocal}`);
  } catch (e) {
    els.spoken.textContent = 'Server not reachable - run `npm start` first. ' + e.message;
  }
}

window.addEventListener('message', (e) => {
  const m = e.data;
  if (!m || typeof m !== 'object') return;
  if (m.method === 'ui/ready') {
    for (const f of Object.values(frames)) if (f.el.contentWindow === e.source) f.ready = true;
    if (pending && Object.values(frames).every((f) => f.ready)) push(pending);
  }
  if (m.method === 'ui/size-changed') {
    for (const f of Object.values(frames)) {
      if (f.el.contentWindow === e.source) f.el.style.height = Math.max(160, m.params.height) + 'px';
    }
  }
});

function push(payload) {
  for (const [key, f] of Object.entries(frames)) {
    const params = key === 'cards'
      ? { cards: payload.cards, spoken: payload.spoken }
      : key === 'decision'
        ? (payload.decision || { found: false, reason: 'Nothing to explain yet - run a routine, then ask "why did that change?".' })
        : { trace: payload.trace, title: payload.title, spoken: payload.spoken };
    f.el.contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/render', params }, '*');
  }
}

async function ask(utterance) {
  els.ring.classList.add('thinking');
  els.spoken.textContent = `“${utterance}” — thinking…`;
  try {
    const clock = els.clock ? els.clock.value : 'live';
    const body = { utterance, session: els.session.value };
    if (clock !== 'live') body.hour = Number(clock);
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'agent call failed');
    const payload = {
      cards: data.cards,
      trace: data.routine.trace,
      spoken: data.routine.spokenSummary,
      title: data.intent.label,
      decision: data.ctx?.decision || null
    };
    els.spoken.textContent = data.routine.spokenSummary;
    setChip('tools', `MCP · ${data.mcp.toolCount} tools · skill ${Math.round(data.mcp.skillLoaded / 1000)}k chars`);
    if (Object.values(frames).every((f) => f.ready)) push(payload); else pending = payload;
    els.mem.textContent = JSON.stringify({ lastRoutine: data.routine.committed || data.ctx.profile?.lastRoutine, mcp: data.mcp }, null, 2);
  } catch (e) {
    els.spoken.textContent = 'Could not complete the routine: ' + e.message;
  } finally {
    els.ring.classList.remove('thinking');
  }
}

els.send.addEventListener('click', () => els.utter.value.trim() && ask(els.utter.value.trim()));
els.utter.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.value.trim()) { ask(e.target.value.trim()); e.target.value = ''; } });
els.suggest.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') { els.utter.value = e.target.textContent; ask(e.target.textContent); } });

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const rec = new SR();
  rec.lang = 'en-IN';
  rec.interimResults = false;
  els.mic.addEventListener('click', () => {
    els.ring.classList.add('listening');
    try { rec.start(); } catch { /* already running */ }
  });
  rec.onresult = (e) => {
    const said = e.results[0][0].transcript;
    els.utter.value = said;
    ask(said);
  };
  rec.onend = () => els.ring.classList.remove('listening');
  rec.onerror = () => els.ring.classList.remove('listening');
} else {
  els.mic.title = 'Speech recognition needs Chrome or Edge; typing works everywhere';
  els.mic.addEventListener('click', () => { els.utter.placeholder = 'Microphone unavailable here - type instead'; els.utter.focus(); });
}

boot();
