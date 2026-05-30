---
name: cerebro-vault-optimise
description: Periodic vault optimisation — trims context costs, archives stale content, audits skills and plugins. Run quarterly or when sessions feel slow.
version: 1.0.0
tags: [cerebro, maintenance, optimisation, tokens]
---

# Cerebro Vault Optimise

## Usage
```
/cerebro-vault-optimise
```

Run **monthly on a Friday** (every 28 days, or on demand when context costs are high). Next scheduled run: **2026-06-26** (4 weeks from 2026-05-29).

---

## Architecture

```
Phase 1: [Skills Audit Agent] [File Size Agent] [Memory Agent] [Conversation Agent]  ← parallel
    ↓
Phase 2: Execute automated fixes (sequential)
    ↓
Phase 3: Present config changes + structural suggestions for [USER]'s approval
    ↓
Phase 4: Commit
```

**Rule:** Never change plugins, MCP servers, or skill structure without [USER]'s explicit confirmation. Everything else executes automatically.

---

## Phase 1: Parallel Agents

Spawn all three simultaneously. Use `model: haiku` for every agent.

---

### Agent A — Skills Audit Agent

**Returns:** line counts, bloat findings, rewrite candidates

**Steps:**

1. Read `Claude System/Skills/test-manifest.md` — note last audit date.

2. For each SKILL.md in `Claude System/Skills/cerebro-*/SKILL.md`:
   ```bash
   wc -l Claude System/Skills/cerebro-*/SKILL.md | sort -rn | head -20
   ```
   Flag any skill over **200 lines**.

3. For each flagged skill, read it and identify removable sections:
   - Output Structure / How It Works / Tips / Prerequisites / Related — remove if they duplicate what the steps already show
   - Example output blocks that are illustrative only — remove
   - Prose descriptions of what a step does when the step command is self-evident — remove
   - Sequential steps that could be parallelised — note for rewrite

4. Check for skills that are referenced in test-manifest.md as `deprecated` or `RETIRED` — flag for deletion confirmation.

5. **External skills version check** — for skills pulled from public repos, compare the installed version against the upstream source:

   | Skill | Repo |
   |-------|------|
   | `humanizer` | `blader/humanizer` |

   For each: read the local `version:` field from its SKILL.md frontmatter, then fetch the upstream SKILL.md via `gh api repos/{repo}/contents/SKILL.md --jq '.content' | base64 -d` and read its `version:` field. Flag if they differ.

**Output:**
```
SKILLS AUDIT AGENT:
- Oversized skills: [name: N lines / none]
- Removable sections identified: [skill: sections]
- Parallel rewrite candidates: [list / none]
- Deprecated/retired: [list / none]
- Last manifest audit: [date] — [rerun needed Y/N]
- External skills: [skill: local vX.Y.Z → upstream vX.Y.Z (up to date / UPDATE AVAILABLE)]
```

---

### Agent B — File Size Agent

**Returns:** oversized vault files, archive candidates

**Steps:**

1. **Vault Evolution check:**
   ```bash
   wc -l "Claude System/Vault Evolution.md"
   ```
   If over 500 lines: flag for trim (archive entries older than 6 months).

2. **Vault Evolution Archive check:**
   ```bash
   wc -l "Claude System/Vault Evolution Archive.md"
   ```
   If over 2,000 lines: flag oldest year for review (offer to delete, not auto-delete).

3. **Daily notes check:**
   ```bash
   ls Daily/ | awk -F'.' '{print $1}' | sort | head -20
   ```
   Flag any notes older than 90 days that haven't been archived. Archives live outside the vault at `../Archives/cerebro-work/Daily/`.

4. **Memory check:**
   ```bash
   wc -l ~/.claude/projects/-Users-your-username-Documents-Obsidian-Cerebro/memory/MEMORY.md
   ```
   If over 180 lines: read and identify stale or mergeable entries.

5. **CLAUDE.md check:**
   ```bash
   wc -l CLAUDE.md
   ```
   If over 150 lines: read and flag sections for consolidation (don't auto-trim).

**Output:**
```
FILE SIZE AGENT:
- Vault Evolution: [N lines — trim needed Y/N]
- Vault Evolution Archive: [N lines — delete review Y/N]
- Unarchived daily notes >90 days: [list / none]
- MEMORY.md: [N lines — trim needed Y/N]
- CLAUDE.md: [N lines — review needed Y/N]
```

---

### Agent C — Config Agent

**Returns:** plugin and MCP audit — **report only, no changes**

**Steps:**

1. Read **global** `~/.claude/settings.json` and **local** `.claude/settings.json` (vault root, if it exists):
   - List all `enabledPlugins` that are `true` — check if [USER] has used them recently (search Vault Evolution for references)
   - List all `enabledPlugins` that are `false` but still present — flag any that could be removed entirely to clean the file
   - Check for duplicate plugin entries across both files
   - Note if a setting in the local file overrides or conflicts with the global file

2. Check both settings files for MCP servers — list any not referenced in CLAUDE.md or recent session reviews.

3. Read `CLAUDE.md` access priority table — note any integrations listed as unavailable or deprecated.

4. Check `.claude/agents/` (local) and `~/.claude/agents/` (global) for agent definition files — flag any that appear unused or duplicated.

**Output:**
```
CONFIG AGENT:
- Global settings: [path] / Local settings: [path or "not present"]
- Plugins enabled: [list with scope: global/local]
- Unused enabled plugins (candidate to disable): [list / none]
- Unused false entries (candidate to remove): [list / none]
- Local/global conflicts: [list / none]
- MCP servers not in use: [list / none]
- Unused agent definitions: [list / none]
- CLAUDE.md deprecated integrations: [list / none]
```

---

### Agent D — Conversation Agent

**Returns:** vault improvement suggestions from recent sessions — **report only, no automated changes**

**Steps:**

1. Determine the last run date from the skill file header (`Next scheduled run` minus 28 days, or read `Claude System/Vault Evolution.md` for the last vault-optimise entry).

2. Read recent conversation transcripts from the project store since that date:
   ```bash
   # Claude Code stores project transcripts under:
   ls ~/.claude/projects/$(pwd | sed 's|/|-|g' | sed 's|^-||')/
   ```
   Read the most recent transcripts (up to 10, newest first). Focus on: errors, repeated friction, workarounds [USER] used, skills that failed or were skipped, instructions [USER] had to repeat.

3. Identify improvement candidates in these categories:
   - **Skill gaps** — tasks [USER] did manually that a skill could automate, or skills that failed mid-run
   - **Friction patterns** — steps [USER] had to clarify, correct, or repeat across sessions
   - **Stale content** — vault notes or skill instructions that contradict what actually happened in sessions
   - **Memory gaps** — facts [USER] stated that aren't captured in MEMORY.md

4. For each finding, classify it:
   - **Auto-fix** — can be applied without confirmation (e.g. updating a memory entry, fixing a stale fact in a skill)
   - **Needs confirmation** — structural change to a skill, new skill, plugin/config change

**Output:**
```
CONVERSATION AGENT:
- Sessions reviewed: [N, date range]
- Auto-fixable findings: [list or none]
- Needs-confirmation findings: [list or none]
- Memory gaps: [list or none]
```

---

## Phase 2: Automated Fixes

Execute these without asking. Report what was done.

### Skills — Trim Bloated Skills

For each skill flagged by Agent A as over 200 lines with removable sections:
1. Read the skill
2. Remove the identified sections
3. Verify the core workflow steps are intact
4. Save — keep version number, update date

**Do not** restructure a skill's workflow steps without [USER]'s review. Trim only.

### Skills — Rewrite if Parallel Architecture Missing

For skills flagged as sequential when they could be parallel:
- If the skill is one of the three core daily workflow skills (daily-prep, lunch-check, session-review): rewrite using parallel agent architecture (see cerebro-session-review v2.0.0 as reference)
- Otherwise: note for [USER]'s review, don't auto-rewrite

### Vault Evolution — Trim if Needed

If `Vault Evolution.md` is over 500 lines:
1. Identify cutoff: entries older than 6 months from today
2. Extract those entries to `Vault Evolution Archive.md` (append, with a header separator for the new batch)
3. Replace trimmed section with: `*Entries before [date] archived in [[Vault Evolution Archive]]*`

### Daily Notes — Archive Old Notes

If unarchived daily notes older than 90 days exist:
```bash
mkdir -p "../Archives/cerebro-work/Daily"
```
Move each one to `../Archives/cerebro-work/Daily/` silently. No confirmation needed — archiving is reversible.

### Memory — Trim if Over 180 Lines

If MEMORY.md is over 180 lines:
1. Read all entries
2. Identify: duplicates, entries superseded by newer ones, entries about resolved one-off issues
3. Remove or merge — keep entries that are still load-bearing rules
4. Report what was removed

### External Skills — Update if Outdated

If Agent A flagged any external skill as having a newer upstream version, for each outdated skill:
1. Clone the repo into a temp directory: `gh repo clone {repo} $(mktemp -d)`
2. Copy the contents into `.claude/skills/{skill}/`, overwriting existing files
3. Remove the temp directory
4. Report: "Updated {skill} from vX.Y.Z → vX.Y.Z"

No confirmation needed — these are third-party skills pulled verbatim; updating is always safe.

### Skills Manifest — Refresh if Stale

If test-manifest.md last audit date is over 28 days ago:
Re-run the 22-skill audit and update the file. Update next scheduled date.

### Conversation Insights — Apply Auto-fixes

For each finding classified as **auto-fix** by Agent D:
- Memory gaps → add the missing entry to MEMORY.md (follow the standard frontmatter format)
- Stale facts in skill files → update the specific line/section
- Do not restructure skills or add new steps without confirmation

Report each change made: `Fixed: [what, where]`

---

## Phase 3: Changes Requiring Approval

After Phase 2 completes, present a consolidated list of everything that requires [USER]'s confirmation:

```
CHANGES NEEDING YOUR APPROVAL:

Config:
  [ ] Disable plugin: example-plugin@anthropic — never referenced in sessions
  [ ] Remove false entry: old-plugin@official — no longer installed
  [ ] Remove MCP server: server-name — not in CLAUDE.md

Conversation insights (structural):
  [ ] [Skill name] — [what to change and why, sourced from session N on date]
  [ ] New skill candidate: [name] — [what it would do, observed need]

Reply: "yes all", "yes [item]", or "skip [item]"
```

Wait for [USER]'s reply. Apply only what is confirmed.

---

## Phase 4: Wrap Up

Update `test-manifest.md` with new next-run date: `+28 days from today (next Friday)`.
Update the `Next scheduled run` date in this skill file's header.

---

## Verification Checklist

- [ ] All oversized skills trimmed (or flagged)
- [ ] Vault Evolution.md under 500 lines
- [ ] Memory.md under 180 lines
- [ ] Old daily notes archived
- [ ] Conversation insights: auto-fixes applied, structural suggestions presented
- [ ] Config changes presented and awaiting confirmation (or applied if confirmed)
- [ ] Skills manifest refreshed if stale
- [ ] Next run date updated in skill file and test-manifest.md

