# Aura — the household agent that remembers

**Build, Ship, Shape: Amazon Developer Hackathon · Alexa+ track · + Open Source mini-challenge**

> The official rules ask Alexa+ judges to separate *creative* from *obvious*, and name what
> counts as creative: "agentic workflow that orchestrates across services autonomously,
> context-aware add-on that maintains state across sessions, purchasing capabilities, media
> support (cards, carousels, etc), MCP Apps, Agent Skills." **All six are implemented here**, and
> [`docs/JUDGING_MAP.md`](docs/JUDGING_MAP.md) points each one at a file and at the `npm run
> verify` check that fails if it is removed. The two patterns the rules call *obvious* — a
> single-turn Q&A bot, and a basic MCP wrapper around one existing API — are what this is not.

A self-hosted **MCP server** (Streamable HTTP, protocol `2025-11-25`) plus an **Agent Skill**
that gives an Alexa+ style assistant three things it does not have out of the box:

1. **Cross-session household memory** — who lives here, what they're allergic to, the spend
   cap, the screen-time curfew, quiet hours, and what the household decided last night.
2. **Autonomous re-planning** — the agent starts with a plan, then changes it when an
   observation contradicts it, and says *why* in a visible timeline.
3. **A card and carousel layer** — `ui://` MCP App templates so the spoken answer stays short
   while the screen carries the detail, plus a purchase step that refuses to spend without
   an explicit spoken confirmation.

Say *"set up a movie night for everyone"* and Aura checks the weather, discovers a 74 % chance
of rain, swaps the backyard idea for an indoor film, filters out the PG-13 result because a
child is home, drops the priciest snack when the basket blows the ₹2 100 budget, asks before
spending above the cap, and commits the night to memory so tomorrow's *"what did we watch?"*
resolves without a single follow-up question.

```
"Alexa, set up a movie night for everyone"
  ✓ household_profile   Load household rules, members and budget    3 members, budget 25
  ✓ weather_now         Indoors or outdoors decides the plan         Pune: 24.1°, light rain
  ✓ media_search        Candidate titles                            6 result(s)
  ✓ pantry_status       Snacks already in stock                     4 low, allergens peanuts/dairy
  + media_search        RE-PLAN Rain risk 74% → indoor-friendly film
  + learn_fact          RE-PLAN Add a rainy-evening card
  ✓ place_order         Purchase guardrail → needs_confirmation
  ✓ commit_routine      Saved: tomorrow "what did we watch?" just works
```

## Run it

Node 20+ (no API keys, no accounts, no hardware).

```bash
npm install
npm start                    # http://localhost:8787
```

Open <http://localhost:8787> — that page is the **simulated Alexa+ device** the rules allow:
a microphone button (Web Speech API), suggestion chips, the card/carousel surface, the live
agent timeline, and the household memory inspector.

The device bar also has a **household clock** selector (live / 23:05 after the curfew / 07:05). It only
sets the `hour` the planner reasons about — the same value the `curl` example below already accepts — so
the time-dependent re-planning is reproducible whatever weather and timezone the judge's machine has.

Amazon does not ship a local host simulator for this surface, so building the harness was part
of the work, not a shortcut around it: the page is a real `Client` +
`StreamableHTTPClientTransport` that reads the `ui://` templates back *through MCP*, so every
step between the two halves is exercised rather than stubbed. That gap is logged as feature
request #1 and friction F1 in [`FRICTION_LOG.md`](FRICTION_LOG.md).

Two other ways to see it work:

```bash
npm run demo      # headless CLI: 4 spoken turns, ASCII cards, full trace, audit log
npm run verify    # 15 acceptance checks (protocol, MCP Apps mime, guardrails, memory)
```

Deterministic demo data (recommended for recording, because it never shows third-party
catalogue titles):

```bash
AURA_OFFLINE=1 npm start
```

Force the clock to show curfew and quiet-hours behaviour on demand:

```bash
curl -s localhost:8787/api/agent -H 'content-type: application/json' \
  -d '{"utterance":"good morning","session":"kitchen","hour":23}'
```

## Point a real MCP client at it

```bash
npx @modelcontextprotocol/inspector --cli http://localhost:8787/mcp --method tools/list
```

Claude Desktop / Cursor / Kiro config:

```json
{ "mcpServers": { "aura": { "url": "http://localhost:8787/mcp" } } }
```

The Agent Skill is served *by the server* as `skill://aura-household/SKILL.md` and as the
`load_agent_skill` tool, so any agent that connects picks up Aura's planning policy without
reading this repository. To install it as a local skill instead, copy `skills/aura-household/`
into `.kiro/skills/`, `.claude/skills/` or `.github/skills/`.

## How it is built

```
src/server.js      McpServer + Streamable HTTP (stateless), 13 tools, 5 resources, 3 prompts,
                   /api/agent (simulated device), /api/resource (MCP Apps host), bearer-token option
src/agent.js       classify -> plan -> act -> observe -> re-plan -> speak
src/memory.js      household profile, sessions, audit log, spend cap, allergen vetoes
src/tools.js       one implementation shared by the MCP surface and the agent
src/services/      open-meteo (weather), iTunes Search (catalogue), HN Algolia (headlines),
                   Wikipedia REST (explainer card), open.er-api (household currency)
src/ui/            index.html + app.js: the simulated Alexa+ device; templates.js: ui:// resources
skills/aura-household/SKILL.md   the Agent Skill (+ references/ for progressive disclosure)
scripts/demo.mjs   headless end-to-end run    tests/verify.mjs   acceptance checks
```

Every tool result returns `content[]` (for voice-only clients), `structuredContent`
(for data-only rendering) and `_meta.ui.resourceUri` (to bind the result to a `ui://`
template) — the three ways an MCP host can present the same answer.

**Why stateless?** Alexa+ owns the conversation and replays context from its own history, so a
per-connection session would fight it. Household state therefore lives in `data/household.json`,
not in the transport.

**Why no LLM in the loop?** The planner is a policy engine, so judges can run it offline with
zero keys and still see genuine plan/observe/re-plan behaviour. `src/agent.js` documents the
two functions (`classify`, `replan`) you swap out to drive the same tools from Bedrock or any
tool-calling model — the tool surface, guardrails and memory are unchanged.

## Testing instructions for judges

| What | How | Expected |
| --- | --- | --- |
| Protocol + transport | `npm run verify` check 1, or `curl localhost:8787/health` | `protocol: 2025-11-25` over Streamable HTTP |
| MCP Apps cards | Ask *"set up a movie night"* in the web app | right-hand carousel renders inside a sandboxed frame from `ui://aura/cards` |
| Autonomous re-plan | set **household clock = 23:05** in the device bar, then ask *"set up a movie night"* | `ADDED-BY-AGENT` row (audio instead of video) and a `SKIPPED` `place_order` — reproducible on any machine, in any weather |
| Autonomous re-plan, weather-driven | `AURA_OFFLINE=1 npm start`, ask *"set up a movie night"* | wet-evening fixture triggers the indoor-swap re-plan |
| Spend guardrail | `npm run verify` checks 7–8, or ask *"order snacks"* | `needs_confirmation` above the cap; nothing bought until `confirmed: true` |
| Allergen memory | ask *"we are out of chai, order snacks"* | peanut brittle and yogurt vetoed *by name of the member they're unsafe for* |
| Cross-session memory | movie night in `living-room`, then *"what did we watch last night?"* in `bedroom` | answers from carried memory, no questions back |
| Curfew / quiet hours | `curl` the `hour: 23` example above | headlines skipped, calm card substituted, video converted to audio |

`npm run verify` prints `15/15 checks passed` and exits non-zero on any regression.
[`docs/JUDGING_MAP.md`](docs/JUDGING_MAP.md) maps each judging criterion to the files and the
check that evidences it.

## Hackathon compliance

| Requirement | Where |
| --- | --- |
| Self-hosted MCP server, spec ≥ `2025-11-25`, Streamable HTTP | `src/server.js`; asserted by `tests/verify.mjs` |
| Agent Skill | `skills/aura-household/SKILL.md`, also served as `skill://` + `load_agent_skill` |
| Track technology used **at runtime** in code, not just README | the simulated device is a real `StreamableHTTPClientTransport` client; `ui://` resources are read over MCP to render the panel |
| Simulated Alexa+ experience in a web app | `src/ui/index.html` (allowed alternate path) |
| Media support: cards, carousels | `_meta.ui.resourceUri` → `ui://aura/cards`, `ui://aura/plan` |
| Purchasing capability | `place_order` behind a spend cap + explicit confirmation |
| Context-aware, state across sessions | `src/memory.js`, `commit_routine`, `household_audit` |
| Public repo with an open-source licence | this repository, `LICENSE` (Apache-2.0) |
| Clear setup and run instructions | this file |
| Open Source mini-challenge | see `docs/OPEN_SOURCE.md` (companion repo + contribution) |
| Product feedback / friction logs / feature requests | `PRODUCT_FEEDBACK.md`, `FRICTION_LOG.md`, `FEATURE_REQUESTS.md` |

## Third-party services

All free and key-less: Open-Meteo (weather/geocoding), iTunes Search API (catalogue),
Hacker News Algolia (headlines), Wikipedia REST (explainer), open.er-api.com (currency).
Artwork is generated locally as SVG (`/art/:title.svg`) so the demo never shows third-party
posters — set `AURA_ALLOW_REMOTE_ART=1` to use catalogue art instead. The household, its
members and every media title in the fixtures are invented for the demo.

## Feedback, licence, author

Read [`PRODUCT_FEEDBACK.md`](PRODUCT_FEEDBACK.md) for what worked and what did not while
building against the Alexa+ MCP toolkit docs, [`FRICTION_LOG.md`](FRICTION_LOG.md) for the
seven entries with severity and workarounds, and [`FEATURE_REQUESTS.md`](FEATURE_REQUESTS.md)
for the asks ranked Critical/Important/Nice-to-have.

Apache-2.0 · Abhinav Shukla · Pune, India · October 2026
