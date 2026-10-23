# Judging map

Where to look for each criterion, and the fastest way to see it. Every row is reproducible with
`npm install && npm run verify` (offline, deterministic) or `npm start` + the browser.

## 0. The rules' own Alexa+ list, item by item

The Official Rules (section 6, Stage Two) tell judges to "distinguish creative ideas from obvious
ones". For the Alexa+ track they spell out both sides of that line. Quoted verbatim, and mapped to
the `npm run verify` check number that fails if the capability is removed:

| Rules' wording for a *creative* Alexa+ submission | Aura | `npm run verify` line |
| --- | --- | --- |
| "agentic workflow that orchestrates across services autonomously" | `src/agent.js` — classify → plan → act → observe → **re-plan** → speak, five services in one plan | 10 · *re-plans when the weather contradicts the plan* |
| "context-aware add-on that maintains state across sessions" | `src/memory.js` — members, allergies, pantry, cap, last routine; survives a restart | 11 · *memory survives across sessions*, 9 · *allergen memory vetoes* |
| "purchasing capabilities" | `place_order` behind the household ceiling (`src/memory.js:124`) — over cap returns `needs_confirmation`, the planner cannot set `confirmed` | 7 + 8 · *guardrail blocks an over-cap purchase* / *succeeds once the user confirms* |
| "media support (cards, carousels, etc)" | `src/ui/templates.js` — tile / list / carousel / basket, agent's own pick outlined | 4 · *tool results carry `_meta.ui.resourceUri`* |
| "MCP Apps" | `ui://aura/cards`, `ui://aura/plan`, `ui://aura/decision` served as `text/html;profile=mcp-app`, read back through MCP | 3 · *UI templates use the MCP Apps mime type* |
| "Agent Skills" | `skills/aura-household/SKILL.md` + `references/`, also served as `skill://` and via `load_agent_skill`; `npm run validate:skills` checks its frontmatter against what the server registers | 5 · *Agent Skill is loadable as an MCP resource*, 18 · *validate-skills catches a broken skill* |

(`verify` prints the 19 checks as labels in this fixed order, so the numbers above are the line
positions.)

The rules' *obvious* examples are "single-turn Q&A bot" and "basic MCP wrapper around an existing
API". Neither applies: Aura re-plans mid-run, holds state across sessions, and its 14 tools expose
a policy engine, a memory model and a spending guardrail rather than proxying one API.

Two other rule clauses that are easy to leave on the table, and where they are answered:

- **Behaviour a judge can trigger on demand** — quiet hours, curfew and bedtime card substitution
  are checks #12, #13, #14, and `POST /api/agent` accepts an `hour` field so they demo at 14:00 too.
- **"Submissions with friction logs can earn up to a 10% judging bonus"** — 7 entries in
  [`../FRICTION_LOG.md`](../FRICTION_LOG.md), ranked feature requests in
  [`../FEATURE_REQUESTS.md`](../FEATURE_REQUESTS.md), per-tool feedback in
  [`../PRODUCT_FEEDBACK.md`](../PRODUCT_FEEDBACK.md).

## 1. Tech Implementation — *does it use the required technology effectively?*

Track requirement: a self-hosted MCP server on spec **2025-11-25 or later, Streamable HTTP**.

| Evidence | Where |
| --- | --- |
| Real `McpServer` from `@modelcontextprotocol/sdk`, not a REST lookalike | `src/server.js:1` imports, `newServer()` |
| Streamable HTTP transport, **stateless** (`sessionIdGenerator: undefined`) | `src/server.js` `/mcp` route |
| Negotiated protocol version asserted, not assumed | `tests/verify.mjs` check 1, `GET /health` → `"protocol":"2025-11-25"` |
| 14 tools with zod schemas, `structuredContent` **and** `content[]` **and** `_meta.ui` | `src/server.js` `registerTool` calls, `ok()` at `src/server.js:28` |
| 6 resources + 3 prompts advertised in `capabilities` | `src/server.js:47` (incl. `extensions['mcp-app']`) |
| MCP Apps UI profile: `ui://` templates served as `text/html;profile=mcp-app` | `src/ui/templates.js`, `GET /api/resource?uri=` |
| Agent Skill in the standard `SKILL.md` format, also served over MCP | `skills/aura-household/SKILL.md`, `skill://aura-household/SKILL.md`, `load_agent_skill` tool |
| The demo device is a **genuine MCP client**, so nothing is faked between the two halves | `src/server.js` `/api/agent` → `Client` + `StreamableHTTPClientTransport` |
| Agentic loop: classify → plan → act → observe → **re-plan** → speak | `src/agent.js:20,34,70,82` |
| Auth surface (`AURA_TOKEN` bearer) and `/.well-known/oauth-protected-resource` | `src/server.js` |

Fastest proof: `npm run verify` → 19 checks, all of which fail if the MCP surface is removed.

## 2. Design — *complete, coherent experience; interaction model fits the device*

Voice-first, so the ordering rule is: **say it, then show it, never make the screen required.**

- `content[]` carries the full spoken answer; cards are additive. A blind user gets everything.
- Card kinds map to attention spans: `tile` for one fact, `list` for headlines, `carousel` for
  "pick one of these" (the agent's own pick is outlined, `chosen`), `basket` for a purchase.
- The plan timeline is shown *because* autonomy needs to be legible: `added-by-agent` steps are
  visually distinct from planned ones, and skipped steps say why.
- Time-of-day is a first-class input: quiet hours (22:30–07:00) suppress headlines and substitute
  a fact card; the 22:00 screen-time curfew converts a video request into audio. Force it with
  the `hour` field on `POST /api/agent` so it is demonstrable on demand, not at 23:00 only.
- Session context (living-room / bedroom / kitchen) changes volume and content policy, mirroring
  how a real household has different devices.
- Nothing loads from the network in the UI: local SVG posters, no fonts, no CDN.

## 3. Potential Impact — *credible, specific customer need*

The pitch is not "a smarter speaker", it is the four things a shared household voice device
actually gets wrong today:

1. **It has no memory between sessions.** "Amma hates that podcast" is re-learned every time.
   Aura keeps per-member preferences, pantry stock and the last routine in one store
   (`src/memory.js`), so turn N+1 across a reboot still knows them.
2. **It has no policy.** A voice device that can order things without a ceiling is a liability.
   Aura refuses any basket over `maxAmountNoPrompt` until the user says yes out loud, and
   `place_order` literally cannot be marked confirmed by the planner — only by the user's reply.
3. **It ignores who is in the room.** Allergen memory (`unsafeFor`) removes an item from the
   restock basket before it is ever offered; the family-safe filter runs before ranking.
4. **It can't be audited.** Every order, veto and confirmation is in `household_audit`, so a
   parent can ask what the device did and why.

Each of those is a product decision a platform team could ship, and each is one verify check.

## 4. Quality of Idea — *is the idea itself good?*

- The interesting question isn't "can a speaker fetch weather", it's **"how much autonomy do you
  give a device that can spend money and change someone else's settings?"** Aura answers it with
  a policy engine instead of a vibe.
- The same 14 tools serve three different surfaces — MCP client, Agent Skill, simulated device —
  which is what an integration that survives contact with a real platform looks like.
- The planner is deterministic on purpose: the re-plan rules are reviewable, testable and cheap,
  and the two swap points for an LLM (`classify`, `replan`) are named in the README.

## Optional-credit map

| Submission item | File |
| --- | --- |
| Product feedback (every tool/API/SDK used) | `PRODUCT_FEEDBACK.md` |
| Friction log (7 entries, up to 10% judging bonus) | `FRICTION_LOG.md` |
| Feature requests, ranked by urgency | `FEATURE_REQUESTS.md` |
| Demo storyboard, ≤ 3 min | `docs/DEMO_SCRIPT.md` |
| Open Source mini-challenge | `docs/OPEN_SOURCE.md` |
