import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

import { DEFAULT_STORE_PATH, mergeDigest, readStore, writeStore } from "./digest-store.js";
import { parseAudiomackDigest } from "./parsers/audiomack-digest.js";

/**
 * Pulls Audiomack weekly digests straight out of the artist mailbox.
 *
 * Audiomack has no digest endpoint and its Data API needs an approved app, so a
 * mailbox rule that files the weekly email into one folder (or forwards it to a
 * dedicated address) is the cheapest honest automation. This runs on the EC2
 * box from cron, no OAuth review and no CASA assessment involved.
 *
 *   npm run inbox -- --dry-run --file pipeline/fixtures/audiomack-digest-2026-11-07.txt
 *   npm run inbox                     # reads UNSEEN mail from DIGEST_SENDER
 *
 * Env: IMAP_HOST, IMAP_PORT (993), IMAP_USER, IMAP_PASSWORD, IMAP_FOLDER
 * (INBOX), DIGEST_SENDER (audiomack), DIGEST_STORE (data/audiomack-digest.json).
 */

interface Options {
  file?: string;
  dryRun: boolean;
  limit: number;
  folder: string;
  sender: string;
  markSeen: boolean;
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index === -1 ? undefined : argv[index + 1];
  };
  return {
    file: value("--file"),
    dryRun: argv.includes("--dry-run"),
    limit: Number(value("--limit") ?? 5),
    folder: value("--folder") ?? process.env.IMAP_FOLDER ?? "INBOX",
    sender: value("--sender") ?? process.env.DIGEST_SENDER ?? "audiomack",
    markSeen: !argv.includes("--keep-unseen"),
  };
}

/** Prefers the plain-text part, falls back to a stripped HTML body. */
export function pickDigestBody(parsed: { text?: string | null; html?: string | false | null }): string {
  const text = (parsed.text || "").trim();
  const looksLikeDigest = /(total\s+plays?|top\s+songs?|weekly)/i.test(text);
  if (text && looksLikeDigest) return text;

  if (typeof parsed.html === "string") {
    const stripped = parsed.html
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(td|tr|p|div|h\d|li)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (stripped) return stripped;
  }

  return text;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Set it in .env or pass --file for a dry run.`);
  return value;
}

async function ingestText(raw: string, options: Options, label: string) {
  const digest = parseAudiomackDigest(raw);
  if (!digest.tracks.length && !digest.totals.plays) {
    console.log(`  skip ${label}: no digest-shaped content found`);
    return false;
  }

  console.log(`  ${label}`);
  console.log(`    account ${digest.account} · period end ${digest.periodEnd ?? "unknown"}`);
  console.log(
    `    plays ${digest.totals.plays} · followers ${digest.totals.followers} · likes ${digest.totals.likes} · tracks ${digest.tracks.length} (sum ${digest.diagnostics.topTrackSum})`
  );

  if (options.dryRun) {
    console.log("    dry run — nothing written");
    return true;
  }

  const store = await readStore(process.env.DIGEST_STORE || DEFAULT_STORE_PATH);
  const next = mergeDigest(store, digest);
  await writeStore(next, process.env.DIGEST_STORE || DEFAULT_STORE_PATH);
  console.log(`    stored — ${next.history.length} week(s) of history`);
  return true;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.file) {
    console.log(`Reading ${path.relative(process.cwd(), path.resolve(options.file))}`);
    await ingestText(await readFile(path.resolve(options.file), "utf8"), options, "file");
    return;
  }

  const client = new ImapFlow({
    host: requireEnv("IMAP_HOST"),
    port: Number(process.env.IMAP_PORT || 993),
    secure: process.env.IMAP_SECURE !== "false",
    auth: {
      user: requireEnv("IMAP_USER"),
      pass: requireEnv("IMAP_PASSWORD"),
    },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock(options.folder);
    try {
      const uids = await client.search({ from: options.sender, seen: false });
      if (!Array.isArray(uids) || !uids.length) {
        console.log(`No unread mail from "${options.sender}" in ${options.folder}.`);
        return;
      }

      const targets = uids.slice(-options.limit);
      console.log(`Found ${uids.length} unread digest(s); processing ${targets.length}.`);

      for (const uid of targets) {
        const message = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!message || !message.source) continue;

        const parsed = await simpleParser(message.source);
        const body = pickDigestBody(parsed);
        const subject = parsed.subject || `uid ${uid}`;
        const ingested = await ingestText(body, options, `${subject}`);

        if (ingested && options.markSeen && !options.dryRun) {
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
