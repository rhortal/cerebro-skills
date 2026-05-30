---
name: cerebro-weekly-review
description: Use when the user asks to generate the weekly review, Actions & Insights, or Urgent Tasks documents. Runs on Fridays only.
version: 2.0.0
tags: [cerebro, weekly, review, granola]
---

# Cerebro Weekly Review

## Usage
```
/cerebro-weekly-review
```

Runs on **Fridays only** (or with explicit override from [USER]).

---

## Architecture: Parallel Phases

The weekly review runs in **four phases**. Phase 1 gathers all source material in parallel. Phase 2 synthesises the two primary documents. Phase 3 produces parallel deliverables from the synthesis. Phase 4 wraps up.

```
Phase 0: Initialise (sequential — day check, week numbers, prerequisites)
    ↓
Phase 1: [Meetings Agent] [Context Agent]  ← parallel
    ↓
Phase 2: Actions & Insights (WXX) + Urgent Tasks (WXX+1)  (sequential — synthesis)
    ↓
Phase 3: [Narrative Agent] [Newsletter Agent]  ← parallel
    ↓
Phase 4: Content Harvest → Index → Commit  (sequential)
```

---

## Phase 0: Initialise

### Day Check

```bash
date "+%A"
```

If not Friday: confirm with [USER] before proceeding. Log the override.

### Week Numbers

```bash
date "+%Y-W%V"                    # current week (WXX)
date -v+7d "+%Y-W%V"              # next week (WXX+1)
date "+%Y"                        # year for index
```

Zero-pad all week numbers: W06 not W6.

### Determine Date Range

```bash
# Monday of current week
date -v-$(date +%u)d+1d "+%Y-%m-%d"
# Friday of current week
date -v-$(date +%u)d+5d "+%Y-%m-%d"
```

### Check Prerequisites

Before spawning Phase 1 agents, verify:

```bash
ls Work/Granola/ | grep "$(date -v-$(date +%u)d+1d '+%Y')-W" 2>/dev/null || \
ls Work/Granola/ | grep "$(date -v-1d '+%Y-%m-%d')" | grep -v transcript
```

Also check that `Work/Weekly Reviews/` exists. If missing files or Granola notes are sparse, note it but continue.

---

## Phase 1: Parallel Agents

Spawn all three agents simultaneously. Use `model: haiku` for every agent.

---

### Agent A — Meetings Agent

**Returns:** all Granola notes from this week, extracted action items, [Manager] candidates, wins

**Steps:**

Find all Granola notes from this week (Mon–Fri):
```bash
MONDAY=$(date -v-$(date +%u)d+1d "+%Y-%m-%d")
FRIDAY=$(date -v-$(date +%u)d+5d "+%Y-%m-%d")
ls Work/Granola/ | grep -v transcript | \
  awk -v mon="$MONDAY" -v fri="$FRIDAY" '$0 >= mon && $0 <= fri'
```

Read **all** returned files (notes only — never `-transcript.md` files).

From each meeting note, extract:
- **Decisions made** — explicit and implied
- **Action items** — owner, what, by when
- **[Manager] agenda candidates** — strategic, cross-functional, resource requests, risks
- **Wins** — specific people + achievements
- **Key metrics/numbers** mentioned

**Output:**
```
MEETINGS AGENT:
- Meetings read: [count and names]
- Decisions: [list]
- Action items: [list with owners]
- [Manager] candidates: [list / none]
- Wins: [list / none]
- Metrics: [numbers mentioned]
```

---

### Agent B — Context Agent

**Returns:** previous Urgent Tasks (carry-overs), last week's A&I, previous weekly review link

**Steps:**

1. Read `Work/Weekly Reviews/Urgent Tasks (WXX-1).md` (last week's Urgent Tasks):
   - Extract all unchecked `[ ]` items — these are carry-overs
   - Note items marked done `[x]`

2. Read `Work/Weekly Reviews/Actions & Insights (WXX-1).md` if it exists — context for this week's synthesis.

3. Read `Work/Weekly Reviews/Weekly Reviews Index.md` — identify last entry for correct links.

**Output:**
```
CONTEXT AGENT:
- Previous UT carry-overs: [list of unchecked items]
- Previous UT completed: [list]
- Previous A&I themes: [brief summary]
- Last index entry: [week + date]
```

---


## Phase 2: Synthesis (Sequential)

Run after all Phase 1 agents complete. Use Meetings Agent + Context Agent outputs.

### Generate Actions & Insights (WXX)

File: `Work/Weekly Reviews/Actions & Insights (WXX).md`

```markdown
---
week: "YYYY-WXX"
date: YYYY-MM-DD
tags: [work, weekly-review, actions]
---

# Actions & Insights — Week WXX

## 💡 Key Insights
[5–8 one-liners. Each is a finding, not a fact. Format: **Bold theme**: one sentence explanation.]

## ✅ Completed This Week
[Bullet list — specific wins, shipped items, closed loops. Named owners. No vague "progress on X".]

## ⚡ Decisions Made
[Bullet list — what was decided, by whom, any dependencies. Flag ⏳ for pending.]

## 🔥 Actions Required
[Grouped by urgency. 🔴 Critical (by when) / 🟡 Important / 🟢 Ongoing]
[Named owner for every item. Specific by-when where known.]

## 🚧 Blockers & Risks
[Only real blockers — something actively preventing progress. Owner + what's needed.]

## 📊 Metrics
[Concrete numbers from this week. metric: value — context ↑↓→]
```

**Rules:** Under 40 lines. One-liners only in Key Insights. No paragraphs. No sub-headings inside sections.

### Generate Urgent Tasks (WXX+1)

File: `Work/Weekly Reviews/Urgent Tasks (WXX+1).md`

```markdown
---
week: "YYYY-WXX+1"
date: YYYY-MM-DD
tags: [work, weekly-review, tasks]
---

# Urgent Tasks — Week WXX+1

## 🔴 Critical
- [ ] [Owner]: [specific task] — by [date/day]

## 🟡 Important
- [ ] [Owner]: [specific task]

## 🟢 Carry-overs
[Items from previous Urgent Tasks that weren't completed — include original week]
- [ ] [Owner]: [task] _(from WXX)_

## 📋 Reminders
[Calendar reminders, recurring tasks, prep needed for next week]
```

**Rules:** Every item has a named owner. Vague items ("follow up on X") are forbidden — who, what, by when. Carry-overs explicitly marked.

---

## Phase 3: Parallel Deliverables

Spawn three agents simultaneously after Phase 2 completes. Use `model: haiku` for every agent.

---

### Agent E — Narrative Agent

**Returns:** full narrative review document

**File:** `Work/Weekly Reviews/YYYY-WXX (Mon-Fri).md`

```markdown
---
week: "YYYY-WXX"
date-range: "Mon DD Mmm – Fri DD Mmm YYYY"
tags: [work, weekly-review, narrative]
---

# YYYY-WXX (Mon DD Mmm – Fri DD Mmm)

## Executive Summary

**Theme**: [3–5 word theme capturing the week's character]

[2–3 sentences. What kind of week was it? Write this last — it should capture the week's character, not list events.]

---

## Major Themes

### 1. [Theme Title]
[3–6 bullets. Specific facts, numbers, names. Sub-bullets for detail. Name themes specifically — not "Product Updates" but "Placement Test Launch Readiness".]

[4–6 themes total]

---

## Key Decisions Made

| Decision | Impact | Owner |
|----------|--------|-------|
| [what was decided] | [what changes] | [who] |

[5–10 decisions. Flag ⏳ for pending.]

---

## Action Items & Next Steps

### 🔴 Critical / Urgent
### 🟡 Important
### 🟢 Ongoing

---

## People & Relationships

### Key Relationships This Week

| Person | Role | Context This Week | Next Action |
|--------|------|-------------------|-------------|

[Only people who featured meaningfully. 6–12 rows typical.]

---

## Metrics & Performance

[Bullet list of concrete numbers. metric: value — context — direction ↑↓→]

---

## External Context

[Travel, holidays, org changes, market events — anything not internal-operational.]

---

## Insights & Reflections

### 📊 Operational
[2–3 numbered paragraphs. Bold theme statement + 2–4 sentences of analysis. What's the pattern? What is this symptom of?]

### 🎯 Strategic
[2–3 numbered paragraphs. Zoom out — what does this week tell you about direction?]

### 👥 People & Culture
[2–3 numbered paragraphs. Dynamics, morale, leadership signals. Where did the team live up to [COMPANY] values — [VALUE_1], [VALUE_2], [VALUE_3], [VALUE_4]?]

---

## Next Week Priorities

1. [Priority — specific, named]
[5 priorities total]

---

## 🎉 Wins & Celebrations

[Name people. Name achievements. Specific — not "good work on the release" but who did what. Aim for **at least 10 items** — cast wide: small acts of initiative, cross-team support, customer-facing moments, process improvements, not just big launches.]

[COMPANY] values lens:
- 💙 **[VALUE_1]** — looked out for a colleague, supported customer experience
- 🔴 **[VALUE_2]** — hard decision made, risk taken, challenge surfaced
- 🤝 **[VALUE_3]** — integrity shown, accountability taken
- 🔍 **[VALUE_4]** — something learned, new approach tried

Include a **Share?** column so [USER] can mark which ones to call out publicly.

| Person / Team | What they did | Value | Share? |
|---------------|---------------|-------|--------|
| [Name] | [Specific achievement] | Be [X] | [ ] |

---

## Related
- [[Actions & Insights (WXX)]]
- [[Urgent Tasks (WXX+1)]]
- [[YYYY-WXX-1 (prev Mon-Fri)]]
```

**Rules:** Executive Summary written last. Insights = analysis, not summary. Tone: direct, analytical. Not a press release.

---

### Agent F — Newsletter Agent (Work + Friday only)

Invoke `cerebro-newsletter-summary`. It reads `newsletters-prod@company.com` since last run (max 7 days) and writes to `Work/Newsletters/YYYY-WXX.md`.

Surface as: `📰 Newsletters: X newsletters summarised → Work/Newsletters/YYYY-WXX.md`

Skip silently if already run today or nothing new found.

---


## Phase 4: Sequential Wrap-Up

Run after Phase 3 completes.

### Content Harvest

Seed cerebro-writing's Content Queue with insights from this week's work.

1. **Pick best LinkedIn atom** from A&I Key Insights — counter-intuitive, grounded, 3 sentences. Format: hook → evidence → implication.

2. **Scan Narrative Insights & Wins** for additional seeds. Good candidates: decisions against conventional wisdom, interesting wins, frameworks tested in practice.

3. **Append seeds to** cerebro-writing `Thought Challenger/Content Queue.md` under 🟡 Needs Shaping. One bullet per seed: angle + source note.

---

### Update Weekly Reviews Index

Read `Work/Weekly Reviews/Weekly Reviews Index.md`. Prepend at top of current year's section:

```markdown
### Week XX ([Mon date]–[Fri date], YYYY)
- [[YYYY-WXX (Mon date-Fri date)]] — narrative review
- [[Actions & Insights (WXX)]]
- [[Urgent Tasks (WXX+1)]]
- [[Team Note (WXX)]] — team & SLT recognition note
```

If no current year section: add `## YYYY` above previous year.

---

---

## Verification Checklist

- [ ] Day check passed (or [USER] confirmed override)
- [ ] Week numbers zero-padded (W06 not W6)
- [ ] All Granola notes for the week read (notes only — no transcripts)
- [ ] Previous Urgent Tasks carry-overs included in new UT
- [ ] `Work/Weekly Reviews/Actions & Insights (WXX).md` — punchy, under 40 lines
- [ ] `Work/Weekly Reviews/Urgent Tasks (WXX+1).md` — specific, named owners, by-when dates
- [ ] `Work/Weekly Reviews/YYYY-WXX (Mon-Fri).md` — full narrative with Wins & Celebrations
- [ ] All files have correct frontmatter and cross-links
- [ ] Content seeds added to cerebro-writing Content Queue
- [ ] Newsletter summary complete (or skipped)
- [ ] `Weekly Reviews Index.md` updated — new entry at top

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| A&I too long — paragraphs, sub-headings | Strip to one-liners. Move depth to narrative. |
| Narrative too listy | Should read like analysis, not a meeting transcript |
| Urgent Tasks vague ("follow up on X") | Who, what, by when — always |
| Files saved to `Work/` root | Files belong in `Work/Weekly Reviews/` |
| Wrong week number on Urgent Tasks | Urgent Tasks = WXX+1 |
| Week number not zero-padded | W06 not W6 — affects sorting and links |
| Not reading previous Urgent Tasks | Carry-overs must appear in new document |
| Index entry added at bottom | Newest goes at top of year section |
| Insights are summaries | Insights = analysis — what does it mean, not what happened |
| Phase 3 agents run sequentially | Narrative, Newsletter, and WordPress run in parallel |
