# Routine step lists

Each routine is a starting plan; the re-plan table in `../SKILL.md` still applies.

## morningBriefing — "Alexa, good morning"

| # | tool | why |
| --- | --- | --- |
| 1 | `household_profile` | rules, currency, who is home |
| 2 | `weather_now` | what to wear, whether the bike commute survives |
| 3 | `news_briefing` (limit 4) | kitchen card; **skipped in quiet hours** |
| 4 | `pantry_status` | anything low before the day starts |

Spoken shape: `<temp and condition>. <one headline>. <low stock, max two items>.`

## movieNight — "set up a movie night for everyone"

| # | tool | why |
| --- | --- | --- |
| 1 | `household_profile` | child present? curfew? budget? |
| 2 | `weather_now` | indoor vs backyard decides the shortlist |
| 3 | `media_search` (movie, limit 6) | candidates |
| 4 | `pantry_status` | snacks already in stock are not bought twice |
| 5 | `convert_price` | catalogue price in USD → household currency |
| 6 | `place_order` | guardrail check, usually `needs_confirmation` |
| 7 | `commit_routine` | so tomorrow's "the film we picked" resolves |

Pick rule: family-safe only, +2 if the genre matches a stored member preference,
+1 if streamable, minus price/10.

## musicMood — "play something to study to"

| # | tool | why |
| --- | --- | --- |
| 1 | `household_profile` | per-member volume and music taste |
| 2 | `media_search` (music) | candidates |

Volume comes from the member profile, so never ask for it.

## restock — "we are out of chai"

| # | tool | why |
| --- | --- | --- |
| 1 | `pantry_status` | what is actually at or below reorder level |
| 2 | `convert_price` | cost in the household currency |
| 3 | `place_order` | spend cap applies even for small baskets |

Items carrying an allergen are removed for the affected member and the removal is said out loud.

## windDown — "time for bed"

| # | tool | why |
| --- | --- | --- |
| 1 | `learn_fact` | one calm card instead of a screen |
| 2 | `media_search` (music, "bedtime audio") | audio alternative |

No video, no purchase, under two spoken sentences.

## memory — "what did we watch last time?"

| # | tool | why |
| --- | --- | --- |
| 1 | `household_profile` | returns `lastRoutine` carried across sessions |
| 2 | `household_audit` | only if the user asks what was blocked or bought |
