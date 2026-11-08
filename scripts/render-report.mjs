#!/usr/bin/env node
/**
 * Renders the demo report to reports/ so you can eyeball the layout without
 * booting the server: `node scripts/render-report.mjs`
 */
import { mkdir, writeFile } from "node:fs/promises";
import { buildReportPdf, reportFileName } from "../serverless/report/pdf.mjs";
import { buildReportData } from "../serverless/report/data.mjs";

const data = buildReportData();
const pdf = await buildReportPdf(data);
await mkdir("reports", { recursive: true });
const target = `reports/${reportFileName(data)}`;
await writeFile(target, pdf);
console.log(`${target} — ${(pdf.length / 1024).toFixed(1)} KB, ${data.daily.length} days`);
