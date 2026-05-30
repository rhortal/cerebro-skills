---
name: cerebro-docusign
description: Find and sign Docusign documents from Outlook emails. Extracts signing URLs from Safelinks-wrapped email links, opens each document in browser, applies signature, and marks emails as read.
version: 1.0.0
tags: [cerebro, docusign, signing, email, outlook, work]
---

# cerebro-docusign

Find and sign pending Docusign documents from your Outlook emails. This skill:
1. Fetches today's emails containing Docusign documents
2. Extracts the actual signing URLs from Outlook's Safelinks wrappers
3. Opens each document in the browser and applies your signature
4. Marks each processed email as read to avoid duplicates

**Work machine only** (work-machine) — requires Outlook email access via Composio.

## Usage

This skill is invoked when you ask to:
- "Sign Docusign documents"
- "Sign my pending invoices"
- "Process Docusign emails"
- "Sign [vendor] invoice"

The skill runs automatically — no manual steps needed. Just confirm when prompted.

## Prerequisites

- Composio connected to Outlook with Mail.Read scope
- Playwright MCP server available for browser automation
- Docusign account with pending documents

## What It Does

1. **Finds Docusign emails** — Searches today's Outlook emails for "Docusign" in subject
2. **Extracts URLs** — Parses email HTML to find href attributes, decodes Safelinks-wrapped URLs
3. **Opens documents** — Navigates to each Docusign signing URL
4. **Applies signature** — Clicks "Sign Here" button, then "Finish"
5. **Marks as read** — Uses Graph API to mark each processed email as read

## Output

Reports each document signed:
```
✅ Vendor1 invoice - Signed
✅ Vendor2 invoice - Signed
✅ Vendor3 invoice - Signed
```

If no documents found:
```
No Docusign documents found in today's emails.
```

## Dependencies

- `cerebro-composio` — for Outlook email access
- Playwright MCP — for browser automation

## Files

- `docusign.js` — Main script that handles the full workflow