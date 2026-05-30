#!/usr/bin/env node

/**
 * fetch-newsletters.js — Fetch and summarise newsletters from Outlook
 *
 * Usage:
 *   node fetch-newsletters.js --since 2026-04-03
 *   node fetch-newsletters.js --check-auth
 */

const path = require('path');
const fs = require('fs');
const {
  createClient, OUTLOOK_ID, graphGet, bcnMidnightUTC
} = require(path.join(__dirname, '../cerebro-composio/composio'));

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { checkAuth: false, since: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check-auth') opts.checkAuth = true;
    else if (args[i] === '--since' && args[i+1]) opts.since = args[++i];
  }
  return opts;
}

async function main() {
  const opts = parseArgs();

  const client = createClient();

  if (opts.checkAuth) {
    try {
      const me = await graphGet(client, OUTLOOK_ID, '/v1.0/me');
      console.log(`✓ Auth check passed: ${me.userPrincipalName}`);
      process.exit(0);
    } catch (err) {
      console.error(`✗ Auth check failed: ${err.message}`);
      process.exit(1);
    }
  }

  try {
    // Calculate date filter
    let sinceDate = opts.since;
    if (!sinceDate) {
      const now = new Date();
      sinceDate = now.toISOString().split('T')[0];
    }

    const sinceISO = `${sinceDate}T00:00:00Z`;

    // Fetch recent emails (client-side filter to avoid InefficientFilter error)
    const filter = `receivedDateTime ge ${sinceISO}`;
    const endpoint = `/v1.0/me/messages?$filter=${encodeURIComponent(filter)}&$top=100&$orderby=receivedDateTime desc`;

    const data = await graphGet(client, OUTLOOK_ID, endpoint);

    // Filter for newsletters-prod client-side
    if (data.value) {
      data.value = data.value.filter(msg =>
        msg.from?.emailAddress?.address === 'newsletters-prod@company.com'
      );
    }

    if (!data.value || data.value.length === 0) {
      console.log('[]');
      process.exit(0);
    }

    // Return minimal newsletter info
    const newsletters = data.value.map(msg => ({
      id: msg.id,
      subject: msg.subject,
      receivedDateTime: msg.receivedDateTime,
      receivedDate: msg.receivedDateTime.split('T')[0]
    }));

    console.log(JSON.stringify(newsletters, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
