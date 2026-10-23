# Demo video script (target 2:40, hard limit 3:00)

Record at 1440p or 1920×1080, browser zoom 100 %, dark theme. Everything below runs locally
with no keys and no third-party artwork on screen.

## Before you hit record

```bash
cd Aura
AURA_OFFLINE=1 npm start          # deterministic data, no catalogue titles on screen
# start from a clean household: delete data/household.json and restart
```
Open `http://localhost:8787`, DevTools closed, address bar visible (proves localhost, no cloud).

| # | Time | On screen | Say |
| --- | --- | --- | --- |
| 1 | 0:00–0:15 | Empty app, chips read `MCP 2025-11-25` | "Aura is a self-hosted MCP server plus an Agent Skill that gives an Alexa+ style assistant a memory, a budget, and a reason to change its mind." |
| 2 | 0:15–0:35 | Click **good morning** → weather tile + headlines + low stock | "One sentence. The agent loads the household profile first — three members, a twenty-five dollar cap, a ten o'clock curfew — then pulls live weather, headlines, and pantry state through MCP tools over Streamable HTTP." |
| 3 | 0:35–1:20 | Click **set up a movie night for everyone**; point at the right-hand timeline | "Movie night is where the interesting part is. Watch the plan." Scroll the timeline. "Rain risk is seventy-four percent, so mid-run the agent *adds* a step — re-querying for an indoor film — and adds a rainy-evening card. Then, because a child is home after seven, it re-queries again with the content filter. Those blue rows are not a scripted sequence; they are re-plans, each with its reason." |
| 4 | 1:20–1:45 | Carousel; hover the highlighted card | "The cards come from a `ui://` MCP Apps resource that the client reads over MCP and renders in a sandboxed frame — short spoken answer, rich visual detail, exactly the split voice needs." |
| 5 | 1:45–2:05 | Click **we are out of chai, order snacks** | "Restock shows the guardrails. Peanut brittle is vetoed by name because it is unsafe for Amma, yogurt because of Chikki. The basket is priced in rupees, and above the cap the order comes back `needs_confirmation` — nothing is bought until someone says yes out loud." |
| 6 | 2:05–2:25 | Switch session dropdown to **bedroom**, type **what did we watch last night?** | "New device, new session. It already knows: that is `commit_routine` handing last night's decision to household memory." |
| 7 | 2:25–2:40 | Terminal: `npm run verify` → `15/15 checks passed` | "Fifteen acceptance checks prove the protocol version, the MCP Apps mime type, the guardrail, the allergen veto and the cross-session memory. `npm start`, then open port 8787 — no keys, no hardware. Thanks for watching." |

## If a judge drives it themselves
The recorded video says `15/15 checks passed` and shows 13 tools. That was true when it was captured; the
repository now runs **17 checks** and advertises **14 tools** (`describe_last_decision` was added after the
recording, built with Kiro — see `KIRO_TASK.md`). The video was not re-recorded, so the counts differ from
`npm run verify` today; the README and `RUN_LOG` files reflect current state.

The rain-driven re-plan in row 3 needs a rainy *observation*, which depends on the weather at the
machine it runs on. Two ways to make it reproducible, neither of which touches the planner:
- **household clock = 23:05** in the device bar (or `"hour": 23` in the JSON body) → the curfew
  re-plan and the `SKIPPED` `place_order` fire on demand, anywhere.
- **`AURA_OFFLINE=1 npm start`** → the bundled wet-evening fixture (rain risk 74%) drives the
  weather re-plan exactly as the video shows.

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
