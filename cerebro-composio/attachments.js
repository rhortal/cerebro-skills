#!/usr/bin/env node

/**
 * cerebro-composio/attachments.js
 *
 * Reliable email attachment utilities for Microsoft Graph API via Composio.
 *
 * ─── IMPORTANT NOTES BEFORE USING ────────────────────────────────────────────
 *
 *  1. hasAttachments:false does NOT mean no inline images
 *     Inline images (src="cid:...") are NOT counted in message.hasAttachments.
 *     Always call listAttachments() if the email body contains an <img>.
 *
 *  2. $select=contentBytes breaks on the /attachments endpoint
 *     The $select query casts to the base 'attachment' type, not 'fileAttachment',
 *     so contentBytes is unavailable. To get contentBytes you MUST fetch the full
 *     attachment object WITHOUT $select.
 *
 *  3. Use OUTLOOK_DOWNLOAD_OUTLOOK_ATTACHMENT (not proxyExecute) for downloading
 *     The native Composio action routes through S3 — no proxy timeout, no base64 bloat.
 *     fetchAttachment() uses this path automatically. The proxyExecute path WILL timeout
 *     on files ≥50KB regardless of the client timeout setting.
 *
 * ─── USAGE ───────────────────────────────────────────────────────────────────
 *
 *   const { createClient, OUTLOOK_ID } = require('./composio');
 *   const { listAttachments, fetchAttachment } = require('./attachments');
 *
 *   const client  = createClient();
 *   const list    = await listAttachments(client, messageId);
 *   // [{ id, name, contentType, isInline, size }, ...]
 *
 *   const outPath = '/tmp/agenda.png';
 *   await fetchAttachment(client, messageId, list[0].id, list[0].name, outPath);
 *   // File saved to outPath (uses native OUTLOOK_DOWNLOAD_OUTLOOK_ATTACHMENT action)
 *
 * ─── CLI ─────────────────────────────────────────────────────────────────────
 *
 *   node attachments.js --message <id> --list
 *   node attachments.js --message <id> --attachment <attId> --out /tmp/file.png
 */

const path = require('path');
const fs   = require('fs');
const { Composio, createClient, graphGet, OUTLOOK_ID, USER_ID } = require(path.join(__dirname, 'composio'));

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * List all attachments for a message (including inline images).
 * Returns lightweight metadata — does NOT fetch binary content.
 *
 * Safe to call even when message.hasAttachments === false:
 * inline images (cid: references) are always returned here.
 *
 * @param {Composio} client
 * @param {string} messageId
 * @returns {Array<{ id, name, contentType, isInline, size }>}
 */
async function listAttachments(client, messageId) {
  // NOTE: $select works here because we only use base 'attachment' fields
  // (id, name, contentType, isInline, size — all exist on the base type).
  // Do NOT add 'contentBytes' to this $select — it will break the query.
  const data = await graphGet(
    client,
    OUTLOOK_ID,
    `/v1.0/me/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,isInline,size`
  );
  return (data.value || []).map(a => ({
    id:          a.id,
    name:        a.name || 'unnamed',
    contentType: a.contentType || 'application/octet-stream',
    isInline:    !!a.isInline,
    size:        a.size || 0
  }));
}

/**
 * Fetch a single attachment and save it to disk.
 *
 * Uses OUTLOOK_DOWNLOAD_OUTLOOK_ATTACHMENT (native Composio action) which routes
 * through S3 — no proxy timeout, works for files of any size.
 * Composio saves the file to ~/.composio/files/ and we copy it to outputPath.
 *
 * @param {Composio} client
 * @param {string}   messageId
 * @param {string}   attachmentId  - from listAttachments()
 * @param {string}   fileName      - desired filename (e.g. 'agenda.png')
 * @param {string}   outputPath    - full local file path to write to
 * @returns {string} outputPath on success
 * @throws on Composio error or missing file
 */
async function fetchAttachment(client, messageId, attachmentId, fileName, outputPath) {
  const result = await client.tools.execute('OUTLOOK_DOWNLOAD_OUTLOOK_ATTACHMENT', {
    userId: USER_ID,
    arguments: {
      user_id:       'me',
      message_id:    messageId,
      attachment_id: attachmentId,
      file_name:     fileName
    },
    dangerouslySkipVersionCheck: true
  });

  if (!result?.successful) {
    throw new Error(`Attachment download failed: ${result?.error || 'unknown error'}`);
  }

  const localPath = result.data?.file?.uri;
  if (!localPath || !fs.existsSync(localPath)) {
    throw new Error(`Composio saved file not found at expected path: ${localPath}`);
  }

  fs.copyFileSync(localPath, outputPath);
  return outputPath;
}

/**
 * Convenience: find the first attachment matching a content type prefix.
 * e.g. findByType(attachments, 'image/') or findByType(attachments, 'application/pdf')
 */
function findByType(attachments, contentTypePrefix) {
  return attachments.find(a => a.contentType.startsWith(contentTypePrefix)) || null;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  let messageId, attachmentId, outputPath, listOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--message'    && args[i + 1]) messageId    = args[++i];
    if (args[i] === '--attachment' && args[i + 1]) attachmentId = args[++i];
    if (args[i] === '--out'        && args[i + 1]) outputPath   = args[++i];
    if (args[i] === '--list')                      listOnly     = true;
  }

  if (!messageId) {
    console.error('Usage: node attachments.js --message <id> --list');
    console.error('       node attachments.js --message <id> --attachment <attId> --out /tmp/file.png');
    process.exit(1);
  }

  const client = createClient();

  if (listOnly || !attachmentId) {
    const list = await listAttachments(client, messageId);
    if (list.length === 0) {
      console.log('No attachments found (including inline images).');
    } else {
      console.log(`${list.length} attachment(s):\n`);
      for (const a of list) {
        const inline = a.isInline ? ' [inline]' : '';
        console.log(`  ${a.name}${inline}`);
        console.log(`    id:   ${a.id}`);
        console.log(`    type: ${a.contentType}  size: ${(a.size / 1024).toFixed(1)} KB`);
      }
    }
    return;
  }

  if (!outputPath) {
    console.error('--out <path> required when fetching attachment content');
    process.exit(1);
  }

  // Derive filename from outputPath if not explicitly provided
  const fileName = require('path').basename(outputPath);
  const saved = await fetchAttachment(client, messageId, attachmentId, fileName, outputPath);
  console.log(`✅ Saved to ${saved}`);
}

if (require.main === module) {
  main().catch(err => { console.error('❌', err.message); process.exit(1); });
}

module.exports = { listAttachments, fetchAttachment, findByType };
