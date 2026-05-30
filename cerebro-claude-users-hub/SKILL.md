---
name: cerebro-claude-users-hub
description: "Monday skill: researches Claude discussions, generates PM-focused weekly challenge, posts to #claude-users-hub after approval. Auto-triggered on Mondays."
version: 1.0.0
tags: [cerebro, slack, claude, community, monday, challenges]
---

# cerebro-claude-users-hub

Generates #claude-users-hub challenge. Research-backed, non-dev PM angle, [INDUSTRY] context. Approval gate before posting.

## Usage

```
/cerebro-claude-users-hub
```

Auto-triggered every Monday inside `cerebro-daily-prep`. Manual invocation is valid on any day of the week. The Monday-only restriction applies only when triggered automatically from `cerebro-daily-prep`.

---

## Step 0 — Check Archive

Read `Work/Claude Users Hub/challenges-archive.md`.

1. If the file doesn't exist, create it with this header and continue with an empty past-topics list:
   ```
   # #claude-users-hub — Weekend Challenge Archive

   One entry per posted challenge. Append-only — never edit past entries.
   ```
2. Extract all challenge titles from `## YYYY-MM-DD — [Title]` headings.
3. Pass this list into Step 2 as a hard constraint: **do not generate a challenge on any topic already listed**.

If the archive has ≥ 5 entries, include in the synthesis prompt: "Past topics covered: [list]. Choose something meaningfully distinct."

Zero real entries is a valid state — proceed normally with an empty past-topics list.

---

## Step 1 — Research

Run **3 SearXNG searches** in parallel. Endpoint: `http://YOUR_SEARXNG_HOST/search?format=json`. Apply `time_range=month` to all three.

```
Query 1: site:reddit.com/r/ClaudeAI Claude tips use cases product manager
Query 2: site:reddit.com Claude AI [INDUSTRY] "product management" OR "non-technical"
Query 3: Anthropic Claude new features changelog
```

Extract top 5 per query — title & snippet only. Look for: non-dev themes, new features, non-technical PM ideas.

**Fallback:** If empty, use built-in knowledge. Note at bottom: _Note: research returned no results — challenge based on Claude's built-in knowledge._

---

## Step 2 — Synthesise Challenge Brief

Generate one brief using research + past-topics list. Don't repeat prior topics.

**Structure:**
```
### 🎯 Weekly Challenge — [title]

**The idea in one sentence:** [hook]

**Why it's interesting:** [2–3 sentences — learning value for PMs in [INDUSTRY]]

**Try this:**
1. [Step]
2. [Step]
3. Optional stretch: [harder variant]

**Share back:** [thread prompt question]

_Inspired by: [source credit]_
```

**Notes:** Non-dev audience, no code. Curious tone. Max 200 words. Slack-fit. Italic via `_underscore_`, not `**asterisk**`.

---

## Step 3 — Review Loop

Surface the brief in the daily brief under `### 🎲 Monday Challenge` and wait for [USER]'s response before taking any action.

```
### 🎲 Monday Challenge — #claude-users-hub

[full brief from Step 2]

---
Ready to post?
✅ Yes, post it
✏️ Tweak — describe what to change
🔄 New topic — regenerate entirely
```

Include the full brief from Step 2 as-is, including its `### 🎯` heading.

- **On approval ("yes", "post it", "looks good", etc.):** proceed to Step 4.
- **On tweak:** incorporate feedback, regenerate the brief only (no new research unless the topic fundamentally changes). Loop back to Step 3. Max 2 revision loops — if still not approved after 2, surface as-is and ask [USER] to post manually.
- **On new topic:** re-synthesise from Step 2 with a different angle (re-run Step 1 if the request implies a different research area). Loop back to Step 3.

---

## Step 4 — Post to Slack

### 4a. Resolve channel ID

First check MEMORY.md (loaded in conversation context at session start) for a cached `#claude-users-hub` channel ID. If found, use it directly and skip the lookup.

If no cached ID — try in order:
1. MCP: `mcp__plugin_slack_slack__slack_search_channels` with query `claude-users-hub`
2. MCP fallback: `mcp__plugin_slack_slack__slack_search_public_and_private` with `in:#claude-users-hub limit:1`
3. CLI fallback: `~/.composio/composio execute SLACK_FIND_CHANNELS -d '{"query": "claude-users-hub"}'`

If all resolution attempts fail, stop and report to [USER]: "Could not resolve #claude-users-hub — check channel name or membership before posting."

**After a successful lookup (first time only):** add the resolved ID to MEMORY.md under the Slack Integration section as a new bullet:
`- **Channel IDs (lookup cache):** \`#claude-users-hub\` → \`[resolved ID]\``
If that bullet already exists, append to it instead.

### 4b. Convert to Slack mrkdwn

Convert: `**bold**` → `*bold*`, `### Heading` → `*Heading*` (no hash), `---` → remove. Italic and emoji unchanged.

### 4c. Send

**MCP (preferred):**
```
mcp__plugin_slack_slack__slack_send_message
  channel: [resolved channel ID]
  text: [challenge brief converted to mrkdwn]
```

**CLI fallback:**
```bash
~/.composio/composio execute SLACK_SEND_MESSAGE \
  -d '{"channel": "[channel ID]", "text": "[mrkdwn text]"}'
```

Confirm to [USER]: "✅ Posted to #claude-users-hub."

---

## Step 5 — Archive

Append the posted challenge to `Work/Claude Users Hub/challenges-archive.md`:

```markdown
## YYYY-MM-DD — [Challenge Title]

[Full challenge brief, exactly as generated in Step 2 — plain markdown, not Slack mrkdwn]

---
```

Replace `YYYY-MM-DD` with today's date. Use the markdown version of the brief (not the mrkdwn-converted version sent to Slack).

The archive is **append-only** — never edit or delete past entries.

Use markdown formatting as written in Step 2 — do not alter italic syntax when archiving.

If the archive write fails, report to [USER] before ending the skill — do not silently skip archiving.
