# Kiro task — `describe_last_decision`

Given verbatim to Kiro (Kiro CLI, signed in with AWS Builder ID on the Free tier) against this
repository. Prompt text is recorded here so the integration is auditable: what was asked, what came
back, and what was accepted.

## Prompt

> In this Node 20 ESM repository (`aura-household-agent`), add a new MCP tool named
> `describe_last_decision`. It takes no arguments. It reads the household audit log through the same
> path `household_audit` uses (`src/memory.js`) and returns the most recent committed routine:
> the routine name, the tools that ran in order, which trace step had status `added-by-agent` and its
> `why`, which step was `skipped`, and whether `place_order` was blocked by the spend cap.
>
> Follow the existing conventions exactly, do not invent a new style:
>
> 1. Register it in `src/tools.js` beside the other tools, with a zod input schema.
> 2. Return the standard triple every tool here returns: `content[]` for a voice-only client,
>    `structuredContent` for a data-only host, and `_meta.ui.resourceUri` bound to a new
>    `ui://aura/decision` template.
> 3. Add `ui://aura/decision` in `src/ui/templates.js` as `text/html;profile=mcp-app`, self-contained
>    with no remote assets, matching how `ui://aura/cards` and `ui://aura/plan` are written.
> 4. Add the spoken summary to the agent's vocabulary where `household_audit` is summarised.
> 5. Add one check to `tests/verify.mjs` that calls `describe_last_decision` after the guardrail test
>    and **fails if the blocked purchase is not reported**. Keep the existing check numbering working:
>    the file must still print `N/N checks passed`.
> 6. Do not change the planner, the guardrail logic, or any existing tool's output shape.
>
> Keep it to the smallest correct implementation, then list the files you changed.

## What Kiro produced, what was accepted

Two headless sessions, `kiro-cli chat -a --no-interactive`, run in the repository working directory on
2026-10-23. The verbatim prompts are [`KIRO_TASK_PROMPT.txt`](KIRO_TASK_PROMPT.txt) and
[`KIRO_TASK_PROMPT_2.txt`](KIRO_TASK_PROMPT_2.txt); full transcripts were kept in `kiro_run1.log` /
`kiro_run2.log` while working.

### Session 1 — first cut, 16/16

Files Kiro changed: `src/tools.js` (new `describeLastDecision()` + `TOOL_NAMES`), `src/server.js`
(tool registration, resource registration, `mcp-app` extension list), `src/ui/templates.js`
(`DECISION_TEMPLATE`), `tests/verify.mjs` (check 9).

**Rejected as shipped.** Two returned fields were not facts:

- `addedByAgent` was `RegExp(/rain|curfew|quiet|filter|indoor/).test(last.summary)` — a guess about what the
  planner had done, phrased as "The summary suggests a weather or rules-driven re-plan occurred."
- `skippedStep: null` with a comment claiming trace granularity was not stored anywhere.

It passed its own test and would have impressed nobody who read the source, which is exactly the failure
mode to avoid in something whose whole point is auditability.

### Session 2 — made exact, 17/17

Told to persist the real trace and stop inferring. Kiro changed `src/memory.js`, `src/agent.js`,
`src/server.js`, `src/tools.js`, `src/ui/templates.js`, `tests/verify.mjs`:

- the routine's `{ tool, status, why }` trace is now stored at commit time and read back by
  `describe_last_decision`;
- `toolsInOrder` is the executed order, `addedByAgent` and `skippedSteps` are arrays carrying the planner's
  own reason strings; the regex is gone;
- legacy data without a stored trace returns `traceAvailable: false`, and says so in the spoken
  `content[]` rather than inventing a story;
- **the bug it found on its own:** its new check 17 failed because the `commit_routine` Zod schema did not
  declare `trace`, so the MCP SDK stripped the field before the handler saw it. It read `server.js`, said
  "The Zod schema for `routine` does NOT include `trace`... I need to add `trace` to the Zod schema",
  fixed it, and the check then failed on a second, real difference (no `skipped` step in that scenario),
  which it resolved by asserting against a scenario that genuinely has one.

### Session 3 — the skill validator, 18/18

Prompt: [`KIRO_TASK_PROMPT_3.txt`](KIRO_TASK_PROMPT_3.txt). Scope was feature request #8: `SKILL.md`
frontmatter has no validator, so a typo means the agent silently ignores the skill.

Delivered `scripts/validate-skills.mjs` (no new dependencies, hand-written frontmatter parser), the
`validate:skills` npm script, and verify check 18, which builds a broken skill in a temp directory,
runs the validator against it and asserts exit 1 with the offending key named — a real positive control,
not a smoke test.

Two things worth recording about the output:

- Kiro derived the contract from `src/server.js` (the `skill://aura-household/SKILL.md` URI, the path it
  reads, the server name) rather than inventing rules, and its report cited those lines.
- It left behind a second, near-identical copy of the parser's block-reading function (~50 unused lines)
  and could not run `npm run validate:skills` itself because PowerShell execution policy blocks npm
  scripts on this machine — it said so in its "what I could not verify" section instead of claiming the
  alias worked. I deleted the dead function and ran `npm run validate:skills` here: exit 0, 7 checks pass.

### What I did, not Kiro

Kiro ran no git command — the prompts forbid commit/push/branch, and `git status` confirmed it only edited
files. Verification afterwards was manual: `npm run verify` (18/18 at that commit; 19/19 now, after I added the
`explain` voice path and check 19 myself), `npm run validate:skills`, `npm run demo`, a fresh clone of the
pushed commit, and a read of the diff. Tool/resource/prompt counts in the README were corrected by hand
after measuring the running server (14 tools, 6 resources, 3 prompts, 3 `ui://` templates) instead of
trusting the docs.

### Credits consumed

Not readable. The CLI session authenticated with the **GitHub social identity**
(`kiro-cli whoami`: "Logged in with GitHub"), so the meter on the Builder ID account at
`app.kiro.dev/settings/account` still reports `0 used / 50 covered in plan` and does not cover these
sessions. Stated as a gap in the evidence rather than presented as a number.

