# Open Source mini-challenge

**GitHub username:** `abhinavshukla152005`

| | |
| --- | --- |
| Primary track repo (Apache-2.0, public) | https://github.com/abhinavshukla152005/aura-household-agent |
| **New additional open-source project** | https://github.com/abhinavshukla152005/mcp-app-cards |
| Contribution URL (the new project's initial commits) | https://github.com/abhinavshukla152005/mcp-app-cards/commits/main |
| License | Apache-2.0 (both repos) |

## What `mcp-app-cards` is

A zero-dependency npm package that provides the missing UI layer for MCP Apps: two
self-contained HTML templates (`cardsTemplate`, `timelineTemplate`) that a server registers as
`ui://` resources with mimeType `text/html;profile=mcp-app`, plus `createHost()` — the host side
of the `ui/ready` → `ui/render` → `ui/size-changed` postMessage bridge.

## Why it exists

Building Aura against `@modelcontextprotocol/sdk` 1.32.1 meant hand-writing the entire MCP Apps
UI mechanism: the three-message handshake, the iframe sizing protocol, the escaping of tool
output into `innerHTML`, and the `<`-in-JSON foot-gun that lets a tool result break out of an
inline `<script>` tag. That mechanism has nothing to do with households or voice, so it was
lifted out of the project, generalised (no Aura strings, no Aura colours, themeable), and
released separately. See friction log entry **F2** in the main repo.

## How it works

- Templates are generated as complete documents with every asset inlined — the test suite
  asserts there is not a single `http(s)://` reference in the output, so a host can render them
  with no network and no CSP exceptions.
- Renderers (`renderCards`, `renderTimeline`) are real exported functions that are stringified
  into the document with `.toString()` at build time. Same code path in the browser and in Node,
  so escaping is unit-testable without a DOM.
- Every interpolated value passes one `esc()`; theme colours are character-sanitised and
  `colorScheme` is allow-listed, so options cannot become CSS or markup injection.
- `createHost()` buffers `render()` until the frame announces `ui/ready`, ignores any message
  whose `event.source` is not its own frame, and floors/clamps the reported height.
- `renderToHtml(kind, data)` preloads data for static previews, email fallbacks and tests.

## Why it matters

Anyone shipping an MCP server that shows anything richer than a text blob re-derives this
handshake, and the failure mode is silent: unescaped tool output inside an iframe that the host
trusts. Extracting it gives server authors ~15 lines instead of ~200, and gives hosts one
place to look for the escaping and origin checks.

## Status

- 17 checks pass with `npm test` (no test framework, no dependencies).
- `npm run example` serves a live two-frame demo at http://localhost:5173/.
- `CONTRIBUTING.md` lists five concrete gaps (third template kind, `event.origin` pinning,
  a `ui/tool-cancel` message, reduced-motion scrolling, hand-written `.d.ts`).

## Relationship to the primary submission

Aura keeps its own copy of the templates in `src/ui/templates.js` so that `npm install && npm
start` works with no local package resolution — the judge-facing demo must not depend on an
unpublished tarball. `mcp-app-cards` is the generalised, independently testable version of that
same code, released under the same license.
