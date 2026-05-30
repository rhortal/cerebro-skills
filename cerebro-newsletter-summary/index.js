#!/usr/bin/env node

/**
 * cerebro-newsletter-summary — Main skill entry point
 *
 * Fetches newsletters since the last run (max 7 days) and writes a summary to:
 * - Work: Work/Newsletters/YYYY-WXX.md (Outlook: newsletters-prod@company.com)
 * - Home: Personal/Newsletters/YYYY-WXX.md (Gmail: category:updates)
 *
 * State tracking via Claude System/newsletter_state.json
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Import shared utilities
const {
  createClient, OUTLOOK_ID, graphGet
} = require(path.join(__dirname, '../cerebro-composio/composio'));

// ── Constants ─────────────────────────────────────────────────────────────────

const VAULT_ROOT = path.join(__dirname, '../../../');
const STATE_FILE = path.join(VAULT_ROOT, 'Claude System', 'newsletter_state.json');
const WORK_OUTPUT_DIR = path.join(VAULT_ROOT, 'Work', 'Newsletters');
const HOME_OUTPUT_DIR = path.join(VAULT_ROOT, 'Personal', 'Newsletters');

// ── Utility: Detect context (work vs home) ─────────────────────────────────

function detectContext() {
  try {
    const hostname = execSync('scutil --get LocalHostName 2>/dev/null || hostname').toString().trim();
    return hostname === 'work-machine' ? 'work' : 'home';
  } catch {
    return 'home';
  }
}

// ── Utility: Get ISO week ──────────────────────────────────────────────────

function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { week: String(weekNum).padStart(2, '0'), year: d.getFullYear() };
}

// ── Utility: Load/save state ───────────────────────────────────────────────

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return { home: { last_run: '2026-01-01' }, work: { last_run: '2026-01-01' } };
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

// ── Utility: Format today's date ───────────────────────────────────────────

function getToday() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

// ── Main: Work (Outlook) workflow ──────────────────────────────────────────

async function fetchWorkNewsletters() {
  const context = 'work';
  const state = loadState();
  const today = getToday();

  // Check if already run today
  if (state[context].last_run === today) {
    return { status: 'skipped', reason: 'Already run today' };
  }

  const lastRun = state[context].last_run;
  const sinceDate = new Date(new Date(lastRun).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const maxLookback = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const actualSince = sinceDate > maxLookback ? sinceDate : maxLookback;

  const sinceISO = `${actualSince}T00:00:00Z`;

  try {
    const client = createClient();

    // Fetch recent emails (client-side filter to avoid InefficientFilter)
    const filter = `receivedDateTime ge ${sinceISO}`;
    const endpoint = `/v1.0/me/messages?$filter=${encodeURIComponent(filter)}&$top=100&$orderby=receivedDateTime desc`;
    const data = await graphGet(client, OUTLOOK_ID, endpoint);

    // Filter for newsletters-prod
    const newsletters = (data.value || []).filter(msg =>
      msg.from?.emailAddress?.address === 'newsletters-prod@company.com'
    );

    if (newsletters.length === 0) {
      // Update state and skip
      state[context].last_run = today;
      saveState(state);
      return { status: 'nothing_new', since: actualSince };
    }

    // Write summaries (placeholder — full implementation would read body and summarise)
    const { week, year } = getISOWeek(new Date());
    const filename = `${year}-W${week}.md`;
    const outputPath = path.join(WORK_OUTPUT_DIR, filename);

    if (!fs.existsSync(WORK_OUTPUT_DIR)) {
      fs.mkdirSync(WORK_OUTPUT_DIR, { recursive: true });
    }

    // Initialize or append to file
    let content = '';
    if (!fs.existsSync(outputPath)) {
      content = `# Newsletter Summary — Week ${week}, ${year}\n_Last updated: ${today}_\n\n---\n`;
    } else {
      content = fs.readFileSync(outputPath, 'utf8');
      // Update timestamp
      content = content.replace(/_Last updated: \d{4}-\d{2}-\d{2}_/, `_Last updated: ${today}_`);
      content += '\n\n---\n';
    }

    // Add newsletter summaries (simplified placeholders)
    for (const nl of newsletters) {
      const date = nl.receivedDateTime.split('T')[0];
      content += `\n### [Newsletter] — ${date}\n\n**${nl.subject}**\n- [Content summary pending]\n`;
    }

    fs.writeFileSync(outputPath, content, 'utf8');

    // Update state
    state[context].last_run = today;
    saveState(state);

    return { status: 'success', count: newsletters.length, file: outputPath };
  } catch (err) {
    console.error(`Error fetching work newsletters: ${err.message}`);
    return { status: 'error', error: err.message };
  }
}

// ── Main entry point ──────────────────────────────────────────────────────

async function main() {
  const context = detectContext();

  console.log(`Context: ${context}`);

  if (context === 'work') {
    const result = await fetchWorkNewsletters();

    if (result.status === 'success') {
      console.log(`NEWSLETTERS: ${result.count} newsletters summarised → ${result.file}`);
    } else if (result.status === 'nothing_new') {
      console.log(`NEWSLETTERS: nothing new since ${result.since}`);
    } else if (result.status === 'skipped') {
      console.log(`NEWSLETTERS: ${result.reason}`);
    } else {
      console.log(`NEWSLETTERS: error — ${result.error}`);
    }
  } else {
    // Home context (Gmail) — placeholder
    console.log('NEWSLETTERS: skipped — home context not yet implemented');
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
