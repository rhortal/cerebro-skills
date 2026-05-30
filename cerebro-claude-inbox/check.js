#!/usr/bin/env node

/**
 * cerebro-claude-inbox/check.js — Check [USER]'s forwarded-task inbox
 *
 * Fetches messages from claude-inbox@company.com received after the
 * last-processed datetime, prints them, then updates the tracker.
 * [USER] forwards emails here with task instructions in the body.
 * Never send from this inbox.
 *
 * Usage:
 *   node "Claude System/Skills/cerebro-claude-inbox/check.js"
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { createClient, OUTLOOK_ID, graphGet, toBCNDateTime } = require(
  path.join(__dirname, '../cerebro-composio/composio')
);

const CLAUDE_INBOX  = 'claude-inbox@company.com';
const TRACKER_FILE  = path.join(__dirname, '.tracker.json');
const DEFAULT_DAYS  = 30;

function loadTracker() {
  try {
    const data = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
    if (data.lastProcessed) return data.lastProcessed;
  } catch (_) { /* first run or corrupt file */ }
  const fallback = new Date(Date.now() - DEFAULT_DAYS * 24 * 60 * 60 * 1000);
  return fallback.toISOString();
}

function saveTracker(iso) {
  fs.writeFileSync(TRACKER_FILE, JSON.stringify({ lastProcessed: iso }, null, 2));
}

async function fetchClaudeInbox(client, since) {
  const sinceEncoded = encodeURIComponent(since);
  const endpoint =
    `/v1.0/users/${encodeURIComponent(CLAUDE_INBOX)}/mailFolders/inbox/messages` +
    `?$filter=receivedDateTime%20ge%20${sinceEncoded}` +
    `&$top=20` +
    `&$select=id,subject,from,receivedDateTime,body` +
    `&$orderby=receivedDateTime%20asc`;

  const data = await graphGet(client, OUTLOOK_ID, endpoint);
  return data.value || [];
}

function printMessages(messages) {
  if (messages.length === 0) {
    console.log('Claude inbox clear.');
    return;
  }

  console.log(`Claude inbox: ${messages.length} message${messages.length > 1 ? 's' : ''}\n`);

  messages.forEach((msg, i) => {
    const from    = msg.from?.emailAddress?.address || msg.from?.emailAddress?.name || '(unknown)';
    const subject = msg.subject || '(no subject)';
    const time    = msg.receivedDateTime ? toBCNDateTime(msg.receivedDateTime) : '';
    const body    = (msg.body?.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    console.log(`--- Message ${i + 1} ---`);
    console.log(`From:    ${from}`);
    console.log(`Subject: ${subject}`);
    console.log(`Time:    ${time}`);
    console.log(`Body:\n${body}`);
    console.log('');
  });
}

async function main() {
  const since    = loadTracker();
  const client   = createClient();
  const messages = await fetchClaudeInbox(client, since);
  printMessages(messages);

  if (messages.length > 0) {
    // Advance tracker past the most recent message so it won't be fetched again
    const latest   = messages[messages.length - 1].receivedDateTime;
    const next     = new Date(new Date(latest).getTime() + 1).toISOString();
    saveTracker(next);
  }
}

main().catch(err => {
  console.error('Error checking Claude inbox:', err.message);
  process.exit(1);
});
