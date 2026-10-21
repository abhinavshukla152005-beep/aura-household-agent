# Feature requests

Ranked for the Alexa+ MCP toolkit and Agent Skills surface.

| # | Request | Why it matters to Aura | Priority |
| --- | --- | --- | --- |
| 1 | **A local host simulator** (`alexa-ai serve`, or a reference MCP-Apps host package) | Aura's card/carousel layer and its re-plan timeline are only meaningful in a host. We had to build the host (`src/ui/`) before we could tell whether the add-on was any good. Everything after request #1 is cheaper if this exists. | **Critical** |
| 2 | **MCP Apps helpers in the core SDK** — `registerAppResource`, a `RESOURCE_MIME_TYPE` constant, and a typed `ui/render` + size-changed bridge | We implemented the protocol from a specification page and had to pin it with tests so it cannot drift silently. Authors should not be reverse-engineering the render contract. | **Critical** |
| 3 | **Documented localhost auth mode** (bearer token acceptable, OAuth 2.1 required only at submit) | The current docs make a compliant-looking server impossible to exercise without a public HTTPS endpoint and a full AS with PKCE-S256. We shipped `AURA_TOKEN` + `/.well-known/oauth-protected-resource` to approximate it. | **Important** |
| 4 | **Server-side `structuredContent` → card preview** in the simulator | Data-only rendering is the fastest path to a good voice answer, but you cannot see what Alexa+ will synthesise from your `structuredContent` without deploying. Aura returns both shapes from every tool. | **Important** |
| 5 | **A first-class "household / multi-profile" concept** in the add-on manifest (members, roles, shared rules) | Cross-session memory is the whole product, but today it is a JSON file we own. A platform primitive for *who is in the room* would remove an entire class of per-add-on guesswork. | **Important** |
| 6 | **Purchase confirmation as a typed interaction** (host asks, returns a signed yes) | `place_order`'s guardrail is only as strong as our own convention that `confirmed: true` means the user said yes. A host-provided confirmation token would make spending voice agents safe by default. | **Important** |
| 7 | **Time/timezone override in the web preview** | Curfew and quiet-hours logic is clock-dependent, so we added an `hour` field to `/api/agent` purely so the behaviour is demoable on demand. Judges (and users) see time-based policies as magic only if you can re-trigger them. | Nice-to-have |
| 8 | **Skill validator** (`alexa-ai skills validate ./skills`) | F6: the frontmatter contract is inferred, so a typo in `SKILL.md` is discovered by the agent quietly ignoring the skill. | Nice-to-have |
| 9 | **Latency budget meter in the preview** | The docs require < 500 ms round trips; we instrumented `ms` per step in our own timeline to get a feel for it. A built-in histogram would make the constraint actionable. | Nice-to-have |
