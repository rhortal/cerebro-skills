---
name: cerebro-commit
description: Use when committing and pushing Cerebro vault changes to the remote git repository. This is a knowledge vault, not a codebase — no PR, no code review, no tests. Just document what changed and push.
---

# Cerebro Commit & Push

## Overview

Commits all pending vault changes with a descriptive message and pushes to remote, resolving any sync issues first. This is an **Obsidian knowledge vault** — the workflow is: sync → stage → message → push. Nothing else.

## What This Is NOT

- **Not a code commit** — no `feat:`, `fix:`, `chore:` prefixes
- **Not a PR workflow** — no pull request, no review, no approval
- **Not a code review** — no linting, no tests, no verification step
- **Not selective staging** — stage everything (`git add -A`)

## CRITICAL: Never Leave Files Behind

**ALL files must always be committed and pushed.** No exceptions, no partial commits.

Before committing, you MUST verify there are no untracked or modified files:
1. Run `git status` and review the output carefully
2. If ANY files appear (untracked, modified, deleted), they MUST all be staged with `git add -A`
3. Verify the staged list matches what you expect — nothing less, nothing excluded
4. Commit only AFTER confirming all changes are staged

A partial commit means data loss. The vault is the source of truth — nothing should sit uncommitted locally.

## GitHub Identity

Before any git operations, verify and set the correct GitHub identity:

1. Run `gh auth status` to check current identity
2. If the active account is NOT `your-username`:
   - Run `gh auth switch --user your-username`
   - Record the original identity (to restore later)
3. After push completes, if we switched away from the original identity, switch back

This ensures commits are attributed to the `your-username` GitHub account.

## Process

**On OpenCode:** Use direct `git` commands. Never delegate to an agent.

1. Run `git status` to see all changes
2. Stage everything: `git add -A`
3. Create commit with descriptive message
4. Push to remote

**On Claude Code:** Delegate to the `cerebro-git` agent (model: haiku). Spawn it with a prompt that includes:
- What files changed (summarise from context — the agent will also run `git status` itself)
- The session's main work (what was captured, updated, or organised)

### Commit message guidance to pass to the agent

The message should read like a **brief handover note** — what was captured, updated, or organised. Use plain language.

**Structure:**

```
<one-line summary of the session's main work>

- <specific change 1>
- <specific change 2>
- <specific change 3>
```

**Vocabulary to use:**
- "Added note on…", "Updated…", "Archived…", "Captured…"
- "New entry in…", "Synced…", "Organised…", "Processed…"
- "Session work: …", "Daily note for…", "Resources for…"

**Vocabulary to avoid:**
- `feat:`, `fix:`, `chore:`, `refactor:` — these are for code
- "Implemented", "Deployed", "Released" — wrong register for a knowledge vault
- Generic: "Updated vault", "Various changes" — be specific about what

**Examples:**

```
Add Agentic Engineering reading resources + March 1 Karakeep entries

- New doc: Work/Projects/WoW 2.0/Agentic Engineering - Reading & Resources
- Added gentleman-guardian-angel and agent-teams-lite to Sections 3 and 5
- Synced changes to Notion page for team sharing
```

```
Process daily note + archive Feb 27 Granola meetings

- Processed 2026-02-27.md: 4 items routed to tasks and people
- Archived: [DR4] 1:1, [DR2] check-in (Work/Meetings/)
- Updated W09 meeting index
- Weekly review reminders added to today's note
```

```
Weekend session: home tasks, personal notes, Stuff.md cleanup

- Processed Stuff.md: 6 items cleared (travel, people, tools)
- New note: Personal/Travel/weekend ideas
- Updated Personal/People/[DR3].md with training sponsorship context
```

## Done

No further steps. No PR. No review. The push is the end of the workflow.
