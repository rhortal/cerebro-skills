---
name: cerebro-caveman
description: Compresses internal vault files using caveman style — ~50-75% word reduction on prose. Targets system files only. Never touches work documents.
version: 1.0.0
tags: [cerebro, optimise, compression, caveman]
source: https://github.com/JuliusBrussee/caveman
---

# Cerebro Caveman

Compress internal vault prose. Fragments OK. Filler die. Facts live.

Based on caveman (JuliusBrussee/caveman): `why use many token when few do trick`.

---

## Caveman Rules

Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries, hedging (likely/probably/perhaps). Fragments OK. Short synonyms. Technical terms exact.

Pattern: `[thing] [action] [reason]. [next step].`

- ❌ "The reason this happened is likely because the meeting was missed"
- ✅ "Meeting missed. Carry-forward to Tuesday."

Preserve byte-exact: file paths, dates, names, code blocks, numbers, wiki-links (`[[...]]`), frontmatter.

Never abbreviate: people's names, project names, tool names, quoted speech.

---

## Scope — What To Compress

### ✅ Internal system files (always in scope)

| File | What to compress |
|------|-----------------|
| `Claude System/Vault Evolution.md` | Context lines, What Changed bullets, Learnings |
| `Claude System/User Profile.md` | Prose descriptions |
| `Claude System/Rules and Conventions.md` | Rule explanations |
| `Claude System/Processes.md` | Process descriptions |
| `CLAUDE.md` | Prose paragraphs — NOT tables, code blocks, or bash commands |
| `~/.claude-team/.../memory/*.md` | Body paragraphs, **Why:** and **How to apply:** lines |

### ⚠️ Never compress — skill SKILL.md files

`Claude System/Skills/*/SKILL.md` files are **prompt instructions, not documentation**. They are loaded verbatim as Claude's operating instructions. Even minor compression of workflow steps, conditionals, or output format specs can silently alter behaviour.

**Risk:** "add to tomorrow's reminders if on work-machine, skip on home" → caveman fragment drops the branch condition. No error, wrong behaviour every session.

**Rule:** SKILL.md files are permanently excluded from caveman compression. No exceptions.

If a SKILL.md is genuinely bloated: surface it for manual review. Do not auto-compress.

### ❌ Never touch — work documents

- `Work/1on1s/*.md` — 1:1 notes ([USER]'s words verbatim)
- `Work/Granola/*.md` — meeting notes (source of truth)
- `Daily/*.md` — daily notes
- `Work/Weekly Reviews/*.md` — review documents
- `Work/Projects/*.md` — project documentation
- `Work/People/*.md` — people profiles
- `Work/Strategic Initiatives/**` — strategy documents
- `Templates/*.md` — templates
- Any file [USER] might share externally

Rule: **if in doubt, skip it.**

---

## Usage Modes

### Mode A — Targeted file (`/cerebro-caveman [filepath]`)

1. Read the file
2. Identify prose sections (skip frontmatter, code blocks, tables, lists of specific facts)
3. Compress prose in-place using caveman full style
4. Write back
5. Report: original word count → compressed word count, % saved

### Mode B — Full pass (`/cerebro-caveman`)

Run across all in-scope files. Process each in sequence. Report summary table at end.

Files to hit (in order):
1. `Claude System/Vault Evolution.md`
2. `Claude System/User Profile.md`
3. `Claude System/Rules and Conventions.md`
4. `CLAUDE.md` (prose only, lite mode)
5. Memory files at `~/.claude-team/projects/-Users-your-username-Documents-Obsidian-Cerebro/memory/*.md`

**Not included:** `Claude System/Skills/*/SKILL.md` — excluded permanently (see Scope above).

### Mode C — New content (`/cerebro-caveman new`)

Don't compress existing files. Instead: activate caveman style for the rest of this session when writing to in-scope files. Off for work documents.

---

## What NOT to Compress

Inside any in-scope file, skip:

- Frontmatter (`---` blocks)
- Code blocks (` ``` `)
- Tables — preserve structure; may tighten cell text if obviously verbose
- Bash commands
- Wiki-links `[[...]]`
- Dates and times
- Numbers and metrics
- File paths
- People's names and job titles
- Decision outcomes (these are facts, not prose)
- Anything in a `> quote` block (may be verbatim)

---

## Auto-Clarity Override

Revert to normal prose for:
- Security warnings
- Irreversible action confirmations (e.g. before deleting vault files)
- Steps where fragment order risks misread

Resume caveman after.

---

## Intensity (default: full)

| Level | Use when |
|-------|---------|
| `lite` | CLAUDE.md — needs to remain human-readable by new sessions |
| `full` | Default. Vault Evolution, memory files, skill descriptions |
| `ultra` | Skills Audit, repetitive logs — maximum compression |

Override: `/cerebro-caveman ultra` or `/cerebro-caveman lite`.

---

## Output Format

After each file:
```
[filename]: NNN → MMM words (XX% saved)
```

After full pass:
```
CAVEMAN PASS COMPLETE
Files compressed: N
Total: NNN → MMM words
Saved: ~XX%
```

Then: `/cerebro-commit` to push changes.
