#!/usr/bin/env node
/**
 * Renders the demo report to reports/ so you can eyeball the layout without
 * booting the server: `node scripts/render-report.mjs`
 */
import { mkdir, writeFile } from "node:fs/promises";
import { buildReportPdf, reportFileName } from "../serverless/report/pdf.mjs";
import { buildReportData } from "../serverless/report/data.mjs";

await mkdir("reports", { recursive: true });

for (const mode of ["demo", "digest"]) {
  const data = buildReportData({ mode });
  if (!data) {
    console.log(`skipped ${mode}: no data available`);
    continue;
  }
  const pdf = await buildReportPdf(data);
  const target = `reports/${reportFileName(data)}`;
  await writeFile(target, pdf);
  console.log(`${target} — ${(pdf.length / 1024).toFixed(1)} KB (${data.mode})`);
}
