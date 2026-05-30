# Granola Archiver Skill

Archives Granola meeting summaries and transcripts into `Work/Meetings/` in the vault.

See **SKILL.md** for the full workflow Claude follows.

## Scripts

- **`scripts/granola-append-transcript.sh`** — reads `cache-v6.json` from the local Granola app and appends a `## Full Transcript` section to a meeting file. Transcript text never passes through Claude's context.
- **`scripts/sync_granola.py`** — gap analysis helper; compares Granola's meeting list against what's already archived.

## References

- **`references/archiving-procedures.md`** — step-by-step procedures for various archiving scenarios (full week, targeted subset, batch processing).
