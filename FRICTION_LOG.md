# Friction log

Format per entry: **task → steps taken → expected vs actual → severity → workaround used →
actionable suggestion.** Severity scale: `blocker / high / medium / low`.

---

### F1 — Register the MCP server locally and drive it from a browser
- **Task:** Follow the Alexa+ MCP QuickStart end to end on a laptop with no AWS account.
- **Steps:** Read quickstart → ran `alexa-ai new mcp` → tried to preview the add-on.
- **Expected:** A local way to see the add-on's tools and cards.
- **Actual:** Every documented path to a visible result requires deploying behind public HTTPS,
  completing OAuth, and opening the real client. Nothing runs offline.
- **Severity:** blocker (for a student on a hackathon budget)
- **Workaround:** Wrote our own host: `src/ui/index.html` + `POST /api/agent`, which connects a
  real `StreamableHTTPClientTransport` to our own server and renders the `ui://` templates in
  sandboxed iframes.
- **Suggestion:** Ship `alexa-ai serve` (localhost MCP + a minimal card host), or publish a
  reference simulator as an npm package. The one we wrote is ~200 lines and took less time than
  the deployment path would have.

---

### F2 — Render a card carousel with MCP Apps on SDK 1.32.1
- **Task:** Register a `ui://` resource the way the quickstart implies the SDK supports.
- **Steps:** Searched `@modelcontextprotocol/sdk` for `ui://`, `mcp-app`, `registerAppResource`
  → none exist in 1.32.1 → read the `ext-apps` SEP document → implemented the protocol by hand.
- **Expected:** `server.registerAppResource(...)` or at least a `RESOURCE_MIME_TYPE` constant.
- **Actual:** Only generic `registerResource`, so the mime string
  `text/html;profile=mcp-app`, the ready/render/size-changed postMessage contract and the height
  reporting all had to be hand-written from a spec page.
- **Severity:** high
- **Workaround:** Hand-rolled templates in `src/ui/templates.js`, asserted in `tests/verify.mjs`
  so the contract cannot silently drift.
- **Suggestion:** Re-export `@modelcontextprotocol/ext-apps` helpers from the main SDK, or link it
  prominently from the Alexa+ docs; right now the two documents disagree about what exists.

---

### F3 — Empty 406 from the Streamable HTTP transport
- **Task:** `curl` the `/mcp` endpoint during a manual smoke test.
- **Steps:** POST a valid `initialize` with `Content-Type: application/json`.
- **Expected:** A response, or an error saying what was wrong.
- **Actual:** `406 Not Acceptable`, empty body. Took a source read to learn the transport requires
  `Accept: application/json, text/event-stream`.
- **Severity:** medium
- **Workaround:** Documented the header in the README and added a verify check that *asserts* the
  406 so the behaviour is explicit rather than folklore.
- **Suggestion:** Return a JSON body naming the required `Accept` pair. One sentence saves every
  author a debugging cycle.

---

### F4 — Search the movie catalogue for a media card
- **Task:** Populate the "tonight's picks" carousel with real film metadata.
- **Steps:** Called iTunes Search with `media=movie` for several terms and countries.
- **Expected:** A list of films.
- **Actual:** `resultCount: 0` for every movie query, while `media=music` and `media=all` still
  return results. Nothing in the response says the entity is deprecated.
- **Severity:** medium (unrelated to Amazon's tools, but it broke the demo's data source)
- **Workaround:** Query `media=all&entity=movie,tvSeason,musicVideo`, plus bundled fixtures and an
  `AURA_OFFLINE=1` mode so the demo never depends on a third party's API changing.
- **Suggestion:** If Amazon's own media cards need catalogue data, name a catalogue the docs
  recommend; the add-on guide shows card shapes but never says where titles come from.

---

### F5 — Copy the sample `initialize` payload from the lifecycle doc
- **Task:** Hand-write an init request while debugging F3.
- **Steps:** Copied the doc example, which advertises `protocolVersion: "2025-03-26"`.
- **Expected:** The version the hackathon requires (≥ `2025-11-25`).
- **Actual:** The example is two versions behind; harmless with an SDK, misleading without one.
- **Severity:** low
- **Workaround:** Relied on SDK negotiation and asserted the negotiated value in tests.
- **Suggestion:** Regenerate doc snippets from the same source the SDK ships.

---

### F6 — Find the Agent Skill frontmatter contract
- **Task:** Write a valid `SKILL.md` for an Alexa+ add-on.
- **Steps:** Searched the three Alexa+ add-on pages and the Devices Builder Tools pages for the
  frontmatter schema.
- **Expected:** A field list (`name`, `description`, `license`, `allowed-tools`, `metadata`) and
  validation rules.
- **Actual:** Only folder-layout prose ("SKILL.md + references/ + assets/"). The field list has to
  be inferred from the public Agent Skills convention.
- **Severity:** medium
- **Workaround:** Followed the public convention and made the skill self-describing; the server
  serves it as a resource so a wrong guess costs a re-read, not a broken build.
- **Suggestion:** Publish the frontmatter schema (and a validator command) next to the skill
  examples.

---

### F7 — Request the advertised AWS credits
- **Task:** Fund Bedrock usage for the AWS Builder mini-challenge.
- **Steps:** Followed the rules page link to the credit form on 21 October.
- **Expected:** Up to $150 in promotional credits while supplies last.
- **Actual:** The form is closed — a 7 October banner says credits ran out — but the eligibility
  text and the 21 October deadline are still presented as live.
- **Severity:** high (it changes which mini-challenge is reachable)
- **Workaround:** Kept the design key-less and offline-capable; entered the Open Source mini-challenge
  instead, which needs no account or credit.
- **Suggestion:** Strike the credit paragraph from the rules once the pool is empty, or point at a
  free-tier-only path so the mini-challenge stays reachable.
