# Product feedback

Required by the submission rules. Written while building Aura on 21 October 2026.

## Which developer tools, APIs and SDKs did you use, and for what?

| Tool / API | Used for |
| --- | --- |
| **Alexa+ MCP toolkit documentation** (`mcp-toolkit-quickstart`, `mcp-toolkit-client-lifecycle`, `mcp-addon-design-guide`) | The contract Aura implements: Streamable HTTP, OAuth 2.1 expectations, protected-resource metadata, `ui://` + `_meta.ui` rendering, latency budget |
| **Agent Skills format** (`SKILL.md` + `references/`) | Aura's planning policy, loaded by the agent at runtime as `skill://aura-household/SKILL.md` and via the `load_agent_skill` tool |
| **`@modelcontextprotocol/sdk` 1.32.1** (`server/mcp.js`, `server/streamableHttp.js`, `client/index.js`, `client/streamableHttp.js`) | The server, and the simulated Alexa+ device that connects to it over real Streamable HTTP |
| **MCP Apps convention** (`text/html;profile=mcp-app`, SEP 2026-01-26) | `ui://aura/cards` and `ui://aura/plan` rendered in sandboxed iframes with a postMessage bridge |
| **`alexa-ai` CLI** (`@alexa-ai/cli`) | Evaluated for `new mcp` / `deploy` scaffolding; not used in the final path — see "what needs work" |
| Amazon Devices Builder Tools (MCP + Agent Skills for AI assistants) | Read through for the Fire TV/Vega guidance Aura's skill mirrors; our own skill is hand-written |

Free public services used at runtime: Open-Meteo, iTunes Search, Hacker News Algolia,
Wikipedia REST, open.er-api.com.

## What worked well?

- **The docs are short enough to finish.** Zero-to-hello-world on a compliant MCP server: create `McpServer`, register a tool, mount `StreamableHTTPServerTransport`
  on `POST /mcp`, connect. That is a genuinely good onboarding curve for a brand-new surface.
- **`_meta.ui.resourceUri` + `structuredContent` is the right shape.** Writing one tool that
  serves a voice-only client, a data-only renderer *and* a custom HTML card without changing the
  tool signature made the design click. The three-tier fallback is the single best idea in the
  spec and it is not talked about enough.
- **Protocol negotiation just works.** `LATEST_PROTOCOL_VERSION` in SDK 1.32.1 is `2025-11-25`,
  and the client/server negotiate down without any manual header juggling.
- **Stateless mode fits voice.** Because Alexa+ replays context from the conversation instead of
  holding an MCP session, `sessionIdGenerator: undefined` was the correct call and it made the
  server trivially horizontally scalable. The docs' framing of host-managed session state helped.
- **Agent Skills as plain Markdown.** A skill is a text file an author can reason about, diff and
  version — no SDK, no build step. Being able to *serve* the same file over MCP so a remote agent
  loads the policy was a two-line addition.
- **The simulator gap was an opportunity.** Because nothing ships to simulate a voice host, we
  built one — and it turned out to be the most persuasive part of the demo.

## What needs work?

1. **No local host simulator.** The only way to see an Alexa+ add-on render is to deploy to
   Lambda behind public HTTPS and open the real app. A desktop/CLI host that speaks Streamable
   HTTP + `ui://` would cut hackathon onboarding from hours to minutes.
2. **`@alexa-ai/cli` assumes an AWS account and a public endpoint.** `new mcp` is fine, but
   `deploy`/`submit` immediately require credentials, so a student with no card cannot complete
   the documented path at all. A `serve locally` mode (or a documented "connect any MCP client"
   recipe) would fix that.
3. **MCP Apps helpers are missing from the core SDK.** `@modelcontextprotocol/sdk` 1.32.1 has no
   `ui://` type, no `text/html;profile=mcp-app` constant, no app-resource registration helper.
   We hand-rolled all of it. The `ext-apps` package exists but is not linked from the quickstart.
4. **The OAuth requirement is stated as a hard gate with no local escape hatch.** Requiring
   protected-resource metadata, an AS with PKCE-S256, and a public HTTPS URL *before you can see
   anything work* rules out the ordinary "run it on localhost and poke it" loop. Bearer-token
   mode should be documented as acceptable for local development.
5. **Doc/example protocol version drift.** The lifecycle page's sample `initialize` still shows
   `2025-03-26` while the hackathon requires ≥ `2025-11-25`. Harmless (negotiation saves you) but
   it makes authors double-check something they shouldn't have to.
6. **A 406 with no body.** A Streamable HTTP POST missing `Accept: application/json,
   text/event-stream` fails with an empty 406. Every author hits this once. Say so in the response.
7. **The AWS credit programme closed mid-hackathon** (7 October update: "out of credit codes")
   while the rules page still describes requesting credits through 21 October. Entrants aiming at
   the AWS Builder mini-challenge find out late.

## How was your onboarding experience (zero to hello world)?

A `tools/list`-visible MCP server answering over Streamable HTTP came together quickly; the time went into
removing the parts that only existed to satisfy a host that never calls them (session handling,
SSE fallback, JSON-RPC batching assumptions). The steepest part was not the
Alexa+ docs — it was reconstructing the MCP Apps host protocol (ready → render → size-changed)
from a specification document, because no reference host ships with the SDK.

## Would you build with these devices and services again?

**Yes, enthusiastically** — the MCP + Agent Skills surface is the right abstraction, and building
an add-on felt like writing an ordinary API with a much better answer to "how does the user see
this?". With a local host simulator and SDK helpers for app resources, I would ship the next one
in a fraction of the time, and I would not need a browser-based fake device to prove it works.
