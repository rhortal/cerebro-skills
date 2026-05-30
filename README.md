# Cerebro Skills

A collection of Claude Code skills for an Obsidian-based professional second brain. Each skill is an invocable `/command` that runs a structured workflow — fetching calendar events, reading email, preparing 1:1s, doing daily prep, and more.

These skills live inside an Obsidian vault's `Claude System/Skills/` directory and are loaded automatically by Claude Code.

---

## What's here

| Skill | What it does |
|-------|-------------|
| `cerebro-daily-prep` | Morning pipeline: calendar, comms, vault scan, daily note |
| `cerebro-lunch-check` | Midday reset: morning recap, inbox refresh, afternoon priorities |
| `cerebro-session-review` | End-of-session: update 1:1 notes, knowledge files, commit |
| `cerebro-weekly-review` | Friday synthesis: A&I doc, urgent tasks, narrative review |
| `cerebro-1on1-prep` | Prep 1:1 session entries from calendar, Granola, inbox, Slack |
| `cerebro-commit` | Stage, commit, and push vault changes to git |
| `cerebro-composio` | Shared utilities: Outlook/Gmail/Google Calendar/SharePoint via Composio |
| `cerebro-calendar` | Fetch Outlook calendar events with timezone conversion |
| `cerebro-granola-archiver` | Archive Granola meeting notes and transcripts to the vault |
| `cerebro-newsletter-summary` | Fetch and summarise newsletters from Outlook |
| `cerebro-claude-inbox` | Check a dedicated forwarded-task email inbox |
| `cerebro-claude-users-hub` | Generate and post a weekly Slack challenge |
| `cerebro-open-surgery` | Post availability reminders to Slack |
| `cerebro-outlook-draft` | Create Outlook draft emails (never sends) |
| `cerebro-docusign` | Find and sign pending DocuSign documents |
| `cerebro-caveman` | Compress internal vault prose to reduce token costs |
| `cerebro-vault-optimise` | Periodic maintenance: trim bloat, audit plugins, clean stale content |

---

## Architecture

Each skill follows the same pattern:

```
cerebro-<name>/
  SKILL.md          # the skill definition — loaded as Claude's instructions
  *.js / *.py / *.sh  # supporting scripts called by the skill
  .env.example      # required env vars (where applicable)
```

Claude Code loads `SKILL.md` when the user runs `/cerebro-<name>`. The markdown is the prompt — it tells Claude exactly what to do, step by step.

The heavier-traffic skills (daily-prep, lunch-check, session-review, weekly-review) use a **parallel agent architecture**: they spawn multiple `model: haiku` subagents simultaneously for independent data-gathering phases, then synthesise in the main context.

---

## Dependencies

### Composio

Most skills use [Composio](https://composio.dev) to connect Microsoft 365 (Outlook, Calendar, Teams, SharePoint), Google (Gmail, Calendar), and Slack.

**Priority order for all skills:**

1. **CLI** (`~/.composio/composio execute …`) — default on any machine where the CLI is installed and authenticated. Fastest, no API key needed.
2. **SDK / API key** (`COMPOSIO_API_KEY`) — fallback when the CLI is unavailable (e.g. a machine where Composio isn't installed) or when the CLI session has expired. The Node scripts use this path automatically.

#### Install the CLI (primary machine)

```bash
# Install CLI
curl -fsSL https://get.composio.dev | sh

# Authenticate
~/.composio/composio login

# Connect your apps
~/.composio/composio add outlook
~/.composio/composio add slack
```

#### Set the API key (backup / non-CLI machines)

Only required when the CLI is not available or its session has expired. See `.env.example`:

```bash
export COMPOSIO_API_KEY=your_key_here
# Or store in macOS Keychain (the Node scripts check there automatically):
security add-generic-password -a composio -s COMPOSIO_API_KEY -w "your_key_here"
```

#### Node SDK

The `cerebro-composio/` skill is the **single source of truth** for `@composio/core`. Install its dependencies once:

```bash
cd cerebro-composio && npm install
```

All other scripts `require('../cerebro-composio/composio')` — never install `@composio/core` elsewhere.

### Node.js

Required for the JS scripts. Node 18+ recommended.

### Granola

`cerebro-granola-archiver` uses the [Granola](https://granola.so) MCP server. Granola must be installed and the MCP server authenticated.

### Obsidian CLI

Vault read/write uses the `obsidian` CLI. Install it from your Obsidian settings or via the community plugins.

---

## Setup

1. Clone this repo into your vault's `Claude System/Skills/` directory — or copy individual skills there.
2. Register each skill in your `.claude/settings.json`:

```json
{
  "skills": [
    { "name": "cerebro-daily-prep", "path": "Claude System/Skills/cerebro-daily-prep/SKILL.md" },
    { "name": "cerebro-lunch-check", "path": "Claude System/Skills/cerebro-lunch-check/SKILL.md" }
  ]
}
```

3. Adapt placeholders (see below).

---

## Adapting to your setup

These skills were built for a specific vault structure. Before using them, replace:

| Placeholder | What to set |
|-------------|------------|
| `[USER]` | Your name |
| `[COMPANY]` | Your company name |
| `[Manager]` | Your manager's name |
| `[DR1]`–`[DR6]` | Your direct reports' names |
| `work-machine` | Your work machine's hostname (`scutil --get LocalHostName`) |
| `home-machine` | Your home machine's hostname |
| `YOUR_OUTLOOK_ACCOUNT_ID` | Composio connected account ID for Outlook |
| `YOUR_GMAIL_ACCOUNT_ID` | Composio connected account ID for Gmail |
| `YOUR_GCAL_ACCOUNT_ID` | Composio connected account ID for Google Calendar |
| `YOUR_SHAREPOINT_ACCOUNT_ID` | Composio connected account ID for SharePoint |
| `YOUR_CLAUDE_INBOX_ACCOUNT_ID` | Composio account ID for delegated inbox |
| `YOUR_SLACK_USER_ID` | Your Slack member ID (Settings → Profile) |
| `YOUR_*_CHANNEL_ID` | Slack channel IDs (right-click channel → Copy link) |
| `YOUR_SEARXNG_HOST` | Your SearXNG instance URL (used in `cerebro-claude-users-hub`) |
| `claude-inbox@company.com` | The email address you forward tasks to (for `cerebro-claude-inbox`) |

Composio account IDs: run `~/.composio/composio connections` to list your connected account IDs.

### Company values

`cerebro-weekly-review` and `cerebro-daily-prep` reference company values as `[VALUE_1]`–`[VALUE_4]` placeholders. Replace these with your own in those skill files.

### Vault structure

The skills assume this layout:

```
vault/
  Daily/            YYYY-MM-DD.md
  Work/
    1on1s/          one file per person
    Granola/        auto-synced by Granola plugin
    People/         person profiles
    Weekly Reviews/
    Meetings/
  Claude System/
    Skills/         ← this repo lives here
    User Profile.md
    Rules and Conventions.md
    Vault Evolution.md
```

---

## 1:1 prep — person-specific instructions

`cerebro-1on1-prep` supports per-person instruction files in `people/`:

```
cerebro-1on1-prep/
  people/
    manager.md      # extra data sources + instructions for your manager 1:1
    dr1.md          # same for each direct report
    ...
  SKILL.md
```

Each file adds data sources on top of the universal steps (Granola, inbox, last session). Examples: "also check the team OKR doc", "always surface unresolved decisions from last 3 sessions".

---

## License

MIT
