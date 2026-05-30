#!/usr/bin/env node

/**
 * draft-email.js — Create an Outlook draft via Microsoft Graph API
 *
 * Saves to Drafts folder WITHOUT sending. Never use OUTLOOK_SEND_EMAIL for
 * drafts — it sends immediately (202 = queued). This uses POST /me/messages
 * which always creates a draft (201 = saved).
 *
 * Usage:
 *   node draft-email.js --to "a@x.com,b@x.com" --subject "Hi" --body "Text"
 *   node draft-email.js --to "a@x.com" --subject "Hi" --body-file ./body.txt
 *   node draft-email.js --to "a@x.com" --subject "Hi" --html --body "<b>Hi</b>"
 *   node draft-email.js --check-auth
 *
 * Options:
 *   --to          Comma-separated recipient email addresses (required)
 *   --subject     Email subject (required)
 *   --body        Inline body text
 *   --body-file   Path to a file containing the body
 *   --html        Treat body as HTML (default: plain text)
 *   --cc          Comma-separated CC addresses (optional)
 *   --check-auth  Verify Graph API access and exit
 */

const path = require('path');
const fs = require('fs');
const { createClient } = require(path.join(__dirname, 'composio'));

const OUTLOOK_ACCOUNT_ID = 'YOUR_CLAUDE_INBOX_ACCOUNT_ID';

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { html: true, checkAuth: false, to: [], cc: [] };

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const val = args[i + 1];
    if (flag === '--to' && val)        { opts.to = val.split(',').map(s => s.trim()); i++; }
    else if (flag === '--cc' && val)   { opts.cc = val.split(',').map(s => s.trim()); i++; }
    else if (flag === '--subject' && val) { opts.subject = val; i++; }
    else if (flag === '--body' && val) { opts.body = val; i++; }
    else if (flag === '--body-file' && val) { opts.bodyFile = val; i++; }
    else if (flag === '--html')        { opts.html = true; }
    else if (flag === '--check-auth')  { opts.checkAuth = true; }
  }

  return opts;
}

// ── Graph API proxy ───────────────────────────────────────────────────────────

async function graphRequest(composio, endpoint, method, body) {
  const result = await composio.tools.proxyExecute({
    connectedAccountId: OUTLOOK_ACCOUNT_ID,
    endpoint,
    method,
    parameters: [{ name: 'Content-Type', value: 'application/json', in: 'header' }],
    ...(body ? { body } : {})
  });

  if (result.status >= 400) {
    const msg = result.data?.error?.message || JSON.stringify(result.data);
    throw new Error(`Graph ${result.status}: ${msg}`);
  }

  return result;
}

// ── Auth check ────────────────────────────────────────────────────────────────

async function checkAuth(composio) {
  const result = await graphRequest(composio, '/v1.0/me', 'GET');
  return { email: result.data?.mail, displayName: result.data?.displayName };
}

// ── Build recipient list ──────────────────────────────────────────────────────

function toRecipients(emails) {
  return emails.map(address => ({ emailAddress: { address } }));
}

// ── Create draft ──────────────────────────────────────────────────────────────

async function createDraft(composio, { subject, body, contentType, to, cc }) {
  const payload = {
    subject,
    body: { contentType, content: body },
    toRecipients: toRecipients(to),
    ...(cc.length ? { ccRecipients: toRecipients(cc) } : {})
  };

  const result = await graphRequest(composio, '/v1.0/me/messages', 'POST', payload);

  if (result.data?.isDraft !== true) {
    throw new Error('Unexpected: message was not saved as draft');
  }

  return result.data;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  const composio = createClient();

  if (opts.checkAuth) {
    const auth = await checkAuth(composio);
    console.log(`✓ Authenticated as ${auth.displayName} <${auth.email}>`);
    return;
  }

  // Resolve body
  let body = opts.body || '';
  if (opts.bodyFile) {
    body = fs.readFileSync(path.resolve(opts.bodyFile), 'utf8');
  }

  // Validate
  const missing = [];
  if (!opts.subject)   missing.push('--subject');
  if (!body)           missing.push('--body or --body-file');
  if (missing.length) {
    console.error(`Missing required arguments: ${missing.join(', ')}`);
    process.exit(1);
  }

  const draft = await createDraft(composio, {
    subject: opts.subject,
    body,
    contentType: opts.html ? 'HTML' : 'Text',
    to: opts.to,
    cc: opts.cc
  });

  console.log(`✓ Draft saved (id: ${draft.id?.slice(0, 40)}...)`);
  console.log(`  Subject : ${draft.subject}`);
  console.log(`  To      : ${opts.to.join(', ')}`);
  if (opts.cc.length) console.log(`  CC      : ${opts.cc.join(', ')}`);
  console.log(`  Open Outlook → Drafts to review and send.`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
