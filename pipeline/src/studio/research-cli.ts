/**
 * CLI: `npm run studio:research`
 *
 * Reads studio/research.json (seeds + competitor channel IDs), runs the keyless
 * research pass, and writes:
 *   - data/studio/research-<date>.json  (machine-readable, diffable week to week)
 *   - reports/studio-research.md        (what you actually read)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildResearchReport, renderResearchMarkdown } from "./research.ts";

interface ResearchConfig {
  language?: string;
  seeds: string[];
  channels?: Array<{ label?: string; channelId: string }>;
}

async function main() {
  const root = process.cwd();
  const configPath = path.join(root, "studio", "research.json");

  let config: ResearchConfig;
  try {
    config = JSON.parse(await readFile(configPath, "utf8")) as ResearchConfig;
  } catch {
    throw new Error(
      `Missing studio/research.json. Copy studio/research.example.json and add your seeds and competitor channel IDs.`
    );
  }
  if (!Array.isArray(config.seeds) || !config.seeds.length) {
    throw new Error("studio/research.json needs a non-empty `seeds` array.");
  }

  const report = await buildResearchReport({
    seeds: config.seeds,
    channelIds: (config.channels ?? []).map((channel) => channel.channelId),
    hl: config.language,
  });

  const date = report.generatedAt.slice(0, 10);
  await mkdir(path.join(root, "data", "studio"), { recursive: true });
  await mkdir(path.join(root, "reports"), { recursive: true });

  const jsonPath = path.join(root, "data", "studio", `research-${date}.json`);
  const mdPath = path.join(root, "reports", "studio-research.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, renderResearchMarkdown(report), "utf8");

  console.log(`Keywords: ${report.keywords.length}`);
  for (const finding of report.findings) console.log(`• ${finding}`);
  console.log(`\nWrote ${path.relative(root, jsonPath)} and ${path.relative(root, mdPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
