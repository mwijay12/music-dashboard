/**
 * PDF report endpoint.
 *
 * Returns a real, vector PDF document (A4, two pages) rendered server-side with
 * pdfkit — no headless browser, no screenshots, no image assets. The same
 * renderer powers `GET /api/report` on the local Express server.
 */
import { resolveReportData } from "../serverless/report/data.mjs";
import { buildReportPdf, reportFileName } from "../serverless/report/pdf.mjs";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const source = String(req.query?.source || "auto").toLowerCase();
  const inline = ["1", "true", "yes"].includes(String(req.query?.inline || "").toLowerCase());
  if (!["auto", "demo", "digest"].includes(source)) {
    return res.status(400).json({ error: "Unknown source. Use demo, digest or auto." });
  }

  try {
    const data = await resolveReportData({ mode: source });
    if (!data) {
      return res.status(404).json({
        error: "No Audiomack digest has been imported yet. Run `npm run digest -- --file <email.txt>`.",
      });
    }
    const pdf = await buildReportPdf(data);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="${reportFileName(data)}"`
    );
    res.setHeader("Content-Length", pdf.length);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Report-Mode", data.source || data.mode);
    return res.status(200).end(pdf);
  } catch (error) {
    console.error("report.failed", error);
    return res.status(500).json({ error: "Report generation failed." });
  }
}
