#!/usr/bin/env node

/**
 * cerebro-composio: Shared Composio utilities — v2.0.0
 *
 * Central location for @composio/core. All cerebro scripts require from here.
 * node_modules are pre-installed and always present — NEVER run npm install elsewhere.
 *
 * ─── REQUIRE PATH BY LOCATION ─────────────────────────────────────────────────
 *   Skills/*           → '../cerebro-composio/composio'
 *   Claude System/     → './Skills/cerebro-composio/composio'
 *   scripts/           → '../Claude System/Skills/cerebro-composio/composio'
 *
 * ─── EXPORTS ──────────────────────────────────────────────────────────────────
 *   Composio           — SDK constructor (use via createClient() instead)
 *   createClient(ms?)  — returns Composio instance, optional timeout override
 *   USER_ID            — 'user-cerebro'
 *   TZ                 — 'Europe/Madrid'
 *
 *   Account ID constants (use these, never hardcode):
 *   OUTLOOK_ID         — 'YOUR_CLAUDE_INBOX_ACCOUNT_ID'   (primary Outlook / Graph)
 *   SHAREPOINT_ID      — 'YOUR_SHAREPOINT_ACCOUNT_ID'
 *   GMAIL_ID           — 'YOUR_GMAIL_ACCOUNT_ID'
 *   GCAL_ID            — 'YOUR_GCAL_ACCOUNT_ID'
 *
 *   Graph API helpers (always use these — they handle errors correctly):
 *   graphGet(client, accountId, endpoint)         → data object / array
 *   graphPost(client, accountId, endpoint, body)  → data object
 *
 *   Date/time helpers (BCN = Europe/Madrid timezone):
 *   todayBCN()                  → 'YYYY-MM-DD'
 *   bcnMidnightUTC(dateStr?)    → ISO string (BCN midnight → UTC; covers CET+CEST)
 *   hoursAgoUTC(n)              → ISO string
 *   toBCNDateTime(utcIso)       → 'Wed, 25 Mar, 09:00' (human readable)
 *   toBCNTime(utcIso)           → 'HH:MM'
 *   toBCNDate(utcIso)           → 'YYYY-MM-DD'
 *
 *   Auth helpers:
 *   getConnectedAccount(client, toolkitSlug, requireActive?)  → account | null
 *   checkOutlookAuth(client)    → { connected: bool, accountId, error? }
 *   NOTE: toolkit slugs are LOWERCASE: 'outlook', 'gmail', 'slack' — not uppercase.
 *
 * ─── CORRECT proxyExecute PATTERN ─────────────────────────────────────────────
 *
 *   // GET
 *   const result = await client.tools.proxyExecute({
 *     connectedAccountId: OUTLOOK_ID,
 *     endpoint: '/v1.0/me/messages?$filter=...',
 *     method: 'GET',
 *     parameters: []          // required — omit and it throws
 *   });
 *   const data = result.data; // { value: [...] } or single object
 *
 *   // POST
 *   const result = await client.tools.proxyExecute({
 *     connectedAccountId: OUTLOOK_ID,
 *     endpoint: '/v1.0/me/messages',
 *     method: 'POST',
 *     parameters: [{ name: 'Content-Type', value: 'application/json', in: 'header' }],
 *     body: JSON.stringify(payload)
 *   });
 *
 *   WRONG — these do NOT exist:
 *     client.connectedAccounts.proxyExecute(...)  ← wrong object
 *     client.getEntity(...)                       ← wrong method
 *     toolName: 'GRAPH_API'                       ← valid but use connectedAccountId pattern
 *
 * ─── GRAPH API FILTER GOTCHAS ─────────────────────────────────────────────────
 *
 *   FAILS — Graph returns InefficientFilter error:
 *     $filter=contains(subject,'keyword')
 *     $search="keyword"  (on messages endpoint without special headers)
 *
 *   WORKS:
 *     $filter=receivedDateTime ge 2026-03-25T00:00:00Z and isRead eq false
 *     Then filter .value array client-side:
 *       .filter(m => m.subject?.toLowerCase().includes('keyword'))
 *
 * ─── ATTACHMENT GOTCHAS ───────────────────────────────────────────────────────
 *
 *   1. hasAttachments: false does NOT mean no inline images (cid: references)
 *      Always call listAttachments() if email body contains <img src="cid:">
 *
 *   2. $select=contentBytes on /attachments BREAKS the response
 *      Graph casts to base 'attachment' type; contentBytes only on fileAttachment.
 *      Fix: fetch full attachment WITHOUT $select.
 *
 *   3. Large attachments (>50KB) timeout with default 60s client
 *      80KB PNG → ~110KB base64 JSON → Composio proxy timeout
 *      Fix: createClient(120000) for 2-minute timeout
 *
 * ─── TIMEOUT ──────────────────────────────────────────────────────────────────
 *   Default is 60 000ms. For attachment fetches, always use createClient(120000).
 */

const path = require('path');
const { Composio } = require(path.join(__dirname, 'node_modules/@composio/core'));

// ── Constants ─────────────────────────────────────────────────────────────────

const USER_ID = 'user-cerebro';
const TZ      = 'Europe/Madrid';

// Connected account IDs — use these, never hardcode inline
// NOTE: proxyExecute is blocked on this Composio account — use CLI or Outlook MCP for reads
const OUTLOOK_ID     = 'YOUR_OUTLOOK_ACCOUNT_ID';
const SHAREPOINT_ID  = 'YOUR_SHAREPOINT_ACCOUNT_ID';
const GMAIL_ID       = 'YOUR_GMAIL_ACCOUNT_ID';
const GCAL_ID        = 'YOUR_GCAL_ACCOUNT_ID';

// ── API key resolution ────────────────────────────────────────────────────────

function getApiKey() {
  if (process.env.COMPOSIO_API_KEY) return process.env.COMPOSIO_API_KEY;
  try {
    const { execSync } = require('child_process');
    return execSync('security find-generic-password -a composio -s COMPOSIO_API_KEY -w', {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    throw new Error('COMPOSIO_API_KEY not found in env or macOS Keychain');
  }
}

// ── Client factory ────────────────────────────────────────────────────────────

/**
 * Create a Composio client.
 * @param {number} [timeoutMs=60000] — use 120000 for attachment fetches
 */
function createClient(timeoutMs = 60000) {
  return new Composio({ apiKey: getApiKey(), timeout: timeoutMs });
}

// ── Graph API helpers ─────────────────────────────────────────────────────────

/**
 * Execute a Graph API GET request via Composio proxy.
 *
 * Always use this instead of raw proxyExecute — it handles error surfacing
 * (Graph returns 200 with { error: { code, message } } on failure).
 *
 * @param {Composio} client
 * @param {string}   accountId  — use OUTLOOK_ID, SHAREPOINT_ID, etc.
 * @param {string}   endpoint   — MUST start with /v1.0/
 * @returns {object} result.data (unwrapped)
 * @throws {Error}   on Graph API error or network failure
 */
async function graphGet(client, accountId, endpoint) {
  const result = await client.tools.proxyExecute({
    connectedAccountId: accountId,
    endpoint,
    method:     'GET',
    parameters: []
  });

  if (result.data?.error) {
    const e = result.data.error;
    throw new Error(`Graph API error [${e.code}]: ${e.message}`);
  }

  return result.data;
}

/**
 * Execute a Graph API POST request via Composio proxy.
 *
 * @param {Composio} client
 * @param {string}   accountId
 * @param {string}   endpoint   — MUST start with /v1.0/
 * @param {object}   body       — will be JSON.stringified
 * @returns {object} result.data (unwrapped)
 * @throws {Error}   on Graph API error
 */
async function graphPost(client, accountId, endpoint, body) {
  const result = await client.tools.proxyExecute({
    connectedAccountId: accountId,
    endpoint,
    method:     'POST',
    parameters: [{ name: 'Content-Type', value: 'application/json', in: 'header' }],
    body:       JSON.stringify(body)
  });

  if (result.data?.error) {
    const e = result.data.error;
    throw new Error(`Graph API error [${e.code}]: ${e.message}`);
  }

  return result.data;
}

/**
 * Execute a Graph API PATCH request via Composio proxy.
 *
 * @param {Composio} client
 * @param {string}   accountId
 * @param {string}   endpoint   — MUST start with /v1.0/
 * @param {object}   body       — will be JSON.stringified
 * @returns {object} result.data (unwrapped)
 * @throws {Error}   on Graph API error or network failure
 */
async function graphPatch(client, accountId, endpoint, body) {
  const result = await client.tools.proxyExecute({
    connectedAccountId: accountId,
    endpoint,
    method:     'PATCH',
    parameters: [{ name: 'Content-Type', value: 'application/json', in: 'header' }],
    body:       body  // plain object — Composio handles serialization internally
  });

  if (result.data?.error) {
    const e = result.data.error;
    throw new Error(`Graph API error [${e.code}]: ${e.message}`);
  }

  return result.data;
}

// ── Date / timezone helpers ───────────────────────────────────────────────────

/** Today's date in BCN timezone. Returns 'YYYY-MM-DD'. */
function todayBCN() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
}

/**
 * BCN midnight → UTC ISO string.
 * Uses 22:00 UTC the day before — covers both CET (+1) and CEST (+2).
 * @param {string} [dateStr] — 'YYYY-MM-DD'; defaults to today in BCN
 */
function bcnMidnightUTC(dateStr) {
  const d = dateStr || todayBCN();
  if (d.includes('T')) return new Date(d).toISOString(); // already ISO
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day - 1, 22, 0, 0)).toISOString();
}

/**
 * Returns ISO timestamp for N hours ago.
 * @param {number} n
 */
function hoursAgoUTC(n) {
  return new Date(Date.now() - n * 60 * 60 * 1000).toISOString();
}

/**
 * Format UTC ISO string as BCN date+time: 'Wed, 25 Mar, 09:00'
 */
function toBCNDateTime(utcIso) {
  return new Date(utcIso).toLocaleString('en-GB', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: TZ
  });
}

/**
 * Format UTC ISO string as BCN time: 'HH:MM'
 */
function toBCNTime(utcIso) {
  return new Date(utcIso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: TZ
  });
}

/**
 * Format UTC ISO string as BCN date: 'YYYY-MM-DD'
 */
function toBCNDate(utcIso) {
  return new Date(utcIso).toLocaleDateString('sv-SE', { timeZone: TZ });
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

/**
 * Returns the connected account for a given toolkit slug, or null.
 * IMPORTANT: toolkit slugs are lowercase — 'outlook', 'gmail', 'slack'.
 * Uppercase returns null.
 *
 * @param {Composio} client
 * @param {string}   toolkitSlug  — lowercase: 'outlook', 'gmail', etc.
 * @param {boolean}  [requireActive=true]
 */
async function getConnectedAccount(client, toolkitSlug, requireActive = true) {
  const accounts = await client.connectedAccounts.list({ userId: USER_ID });
  const items = accounts?.items || [];
  return items.find(a =>
    a.toolkit?.slug === toolkitSlug &&
    (!requireActive || a.status === 'ACTIVE')
  ) || null;
}

/**
 * Quick auth check — returns { connected: bool, accountId, error? }
 */
async function checkOutlookAuth(client) {
  try {
    const account = await getConnectedAccount(client, 'outlook');
    return { connected: !!account, accountId: account?.id || null };
  } catch (e) {
    return { connected: false, error: e.message };
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  Composio,
  createClient,
  USER_ID,
  TZ,
  OUTLOOK_ID,
  SHAREPOINT_ID,
  GMAIL_ID,
  GCAL_ID,
  graphGet,
  graphPost,
  graphPatch,
  todayBCN,
  bcnMidnightUTC,
  hoursAgoUTC,
  toBCNDateTime,
  toBCNTime,
  toBCNDate,
  getConnectedAccount,
  checkOutlookAuth
};
