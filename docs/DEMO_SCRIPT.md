# Demo video script (target 2:55, hard limit 3:00)

Record at 1440p or 1920×1080, browser zoom 100 %, dark theme. Everything below runs locally
with no keys and no third-party artwork on screen.

## Before you hit record

```bash
cd Aura
AURA_OFFLINE=1 npm start          # deterministic data, no catalogue titles on screen
# start from a clean household: delete data/household.json and restart
```

Open `http://localhost:8787`, DevTools closed, address bar visible (proves localhost, no cloud).
Set the device-bar clock to **23:05 — after curfew** before row 3; that makes both the curfew
re-plan and the `SKIPPED` `place_order` fire on demand, on any machine in any weather.

| # | Time | On screen | Say |
| --- | --- | --- | --- |
| 1 | 0:00–0:13 | Empty app, three frames, chips read `MCP 2025-11-25` | "Aura is a self-hosted MCP server plus an Agent Skill that gives an Alexa+ style assistant a memory, a budget, and a reason to change its mind." |
| 2 | 0:13–0:33 | Click **good morning** → weather tile + headlines + low stock | "One sentence. The agent loads the household profile first — three members, a twenty-five dollar cap, a ten o'clock curfew — then pulls weather, headlines and pantry state through MCP tools over Streamable HTTP." |
| 3 | 0:33–1:15 | Clock 23:05, click **set up a movie night for everyone**; point at the right-hand timeline | "Movie night after curfew is where the interesting part is. Watch the plan. The offline fixture says 74 % rain risk, so mid-run the agent *adds* a step — re-querying for an indoor film — and adds a rainy-evening card. Then, because a child is home after seven, it re-queries with the content filter. Those blue rows are not a scripted sequence; they are re-plans, each carrying its own reason." |
| 4 | 1:15–1:37 | Click **why did that change?** → the third panel fills with the trace | "And I can ask it why. *'Why did that change?'* is not a canned answer — it routes to a `describe_last_decision` MCP tool that reads back the trace the routine stored when it committed. That line — 'Past the 22:00 screen-time curfew, offering audio instead of video' — is the planner's own reason string, not a paraphrase written for the demo." |
| 5 | 1:37–1:55 | Carousel; hover the highlighted card | "The cards come from a `ui://` MCP Apps resource that the client reads over MCP and renders in a sandboxed frame — short spoken answer, rich visual detail, exactly the split voice needs." |
| 6 | 1:55–2:15 | Click **we are out of chai, order snacks** | "Restock shows the guardrails. Peanut brittle is vetoed by name because it is unsafe for Amma, yogurt because of Chikki. The basket is priced in rupees, and above the cap the order comes back `needs_confirmation` — nothing is bought until someone says yes out loud." |
| 7 | 2:15–2:32 | Switch session dropdown to **bedroom**, type **what did we watch last night?** | "New device, new session. It already knows: that is `commit_routine` handing last night's decision to household memory." |
| 8 | 2:32–2:50 | Terminal: `npm run verify` → `19/19 checks passed` | "Nineteen acceptance checks prove the protocol version, the MCP Apps mime type, the guardrail, the allergen veto, the cross-session memory, the skill contract, and that *'why did that change?'* really reaches the tool. `npm start`, then open port 8787 — no keys, no hardware. Thanks for watching." |
| 9 | 2:50–2:55 | Hold on the terminal | (silence; let `19/19 checks passed` stay on screen) |

## The video currently uploaded

It says `15/15 checks passed` and shows 13 tools, and it has no "why did that change?" beat. That was
true when it was captured; the repository now runs **19 checks** and advertises **14 tools**
(`describe_last_decision` was added with Kiro, the skill-contract and explain-path checks after it — see
`KIRO_TASK.md`). If you re-record, use the table above and the counts match the code; if you don't,
this note is the disclosure and the README/`RUN_LOG` files reflect current state.

## Reproducibility notes (nothing here touches the planner)

- **Clock = 23:05** (or `"hour": 23` in the JSON body) → the curfew re-plan and the `SKIPPED`
  `place_order` fire on demand, anywhere.
- **`AURA_OFFLINE=1 npm start`** → the bundled wet-evening fixture (rain risk 74 %) drives the weather
  re-plan exactly as row 3 describes. Without it, the rain re-plan depends on the real weather where you record.
- Row 4 needs a routine to have committed first, so it must come **after** row 3 in the same session
  (`living-room`); asking "why did that change?" on a fresh household honestly says nothing to explain yet.
- Delete `data/household.json` before recording so the memory beat in row 7 is visibly created on camera.

## Recording rules the judges care about

- Show the project **functioning**, on the surface it is intended for (the simulated Alexa+ web
  experience, which the Alexa+ track explicitly allows).
- Under three minutes — judges are not required to watch past 3:00.
- No third-party trademarks or copyrighted music. `AURA_OFFLINE=1` keeps catalogue titles out of
  frame; use no background music, or a licence you own.
- Upload to YouTube (unlisted is fine — it must be publicly viewable by link) or Vimeo, and paste
  the URL into the submission form.

## Optional 20-second tail if time allows

Show `curl ... "hour":23` turning a movie request into an audio offer at curfew — it is the
clearest single proof that household rules drive behaviour.
