import PDFDocument from "pdfkit";

/**
 * Vector PDF report renderer.
 *
 * Everything on the page — the line chart, bars, sparklines, pills — is drawn
 * as PDF geometry with embedded Helvetica metrics, so the output stays crisp at
 * any zoom and is never a screenshot of the dashboard.
 */

const PAGE = { width: 595.28, height: 841.89 };
const M = 44;
const CONTENT = PAGE.width - M * 2;

const C = {
  page: "#f7f2ea",
  card: "#ffffff",
  ink: "#241b14",
  body: "#4a3c32",
  muted: "#8a7c70",
  faint: "#b5a99d",
  line: "#e7ddcf",
  accent: "#d96132",
  accentSoft: "#f9e6db",
  positive: "#3f7d4e",
  positiveSoft: "#e6f0e8",
  negative: "#b4472f",
  negativeSoft: "#f7e4df",
  cream: "#f3ece1",
};

const fmtCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const fmtInt = new Intl.NumberFormat("en-US");
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const longStamp = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const monthYear = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });
const niceDate = (date) => `${date.getUTCDate()} ${monthYear.format(date).replace(" ", " ")}`;

/** "1 – 7 Nov 2026" when the range sits inside one month, otherwise "28 Oct – 3 Nov 2026". */
function rangeLabel(start, end) {
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  const tail = monthYear.format(end);
  return sameMonth
    ? `${start.getUTCDate()} – ${end.getUTCDate()} ${tail}`
    : `${start.getUTCDate()} ${monthYear.format(start).split(" ")[0]} – ${end.getUTCDate()} ${tail}`;
}

const compact = (value) => fmtCompact.format(value).replace(".0K", "K").replace(".0M", "M");
const axis = (value) =>
  value >= 1000000 ? `${(value / 1000000).toFixed(1).replace(".0", "")}M` : `${Math.round(value / 1000)}K`;
const money = (value) => `$${fmtInt.format(Math.round(value))}`;
const deltaText = (value) => `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;

/* ---------------------------------------------------------------- primitives */

function text(doc, value, x, y, options = {}) {
  const {
    size = 9,
    font = "Helvetica",
    color = C.body,
    width,
    align = "left",
    spacing = 0,
    opacity = 1,
    lineGap = 0,
  } = options;
  doc
    .font(font)
    .fontSize(size)
    .fillColor(color)
    .fillOpacity(opacity)
    .text(String(value), x, y, { width, align, characterSpacing: spacing, lineGap });
  doc.fillOpacity(1);
}

function card(doc, x, y, w, h, options = {}) {
  const { fill = C.card, stroke = C.line, radius = 12, opacity = 1 } = options;
  doc.save();
  doc.fillOpacity(opacity);
  doc.roundedRect(x, y, w, h, radius).fill(fill);
  doc.restore();
  if (stroke) {
    doc.save();
    doc.lineWidth(0.7).strokeColor(stroke).roundedRect(x, y, w, h, radius).stroke();
    doc.restore();
  }
}

function kicker(doc, value, x, y, options = {}) {
  text(doc, value.toUpperCase(), x, y, {
    size: 6.6,
    font: "Helvetica-Bold",
    color: C.muted,
    spacing: 1.1,
    ...options,
  });
}

function pill(doc, value, x, y, tone = "positive") {
  const bg = tone === "positive" ? C.positiveSoft : tone === "negative" ? C.negativeSoft : C.accentSoft;
  const fg = tone === "positive" ? C.positive : tone === "negative" ? C.negative : C.accent;
  doc.font("Helvetica-Bold").fontSize(7);
  const width = doc.widthOfString(value, { characterSpacing: 0.4 }) + 14;
  doc.save();
  doc.roundedRect(x, y, width, 15, 7.5).fill(bg);
  doc.restore();
  text(doc, value, x + 7, y + 4.4, { size: 7, font: "Helvetica-Bold", color: fg, spacing: 0.4 });
  return width;
}

function brand(doc, y, subtitle) {
  doc.save();
  doc.roundedRect(M, y, 22, 22, 7).fill(C.ink);
  doc.restore();
  const bars = [
    { x: M + 6, h: 7 },
    { x: M + 10.5, h: 12 },
    { x: M + 15, h: 9 },
  ];
  bars.forEach((bar) => {
    doc.save();
    doc.roundedRect(bar.x, y + 16 - bar.h, 2.2, bar.h, 1.1).fill("#f6f1e8");
    doc.restore();
  });
  doc.save();
  doc.circle(M + 16.4, y + 5.4, 1.9).fill(C.accent);
  doc.restore();

  text(doc, "timbre", M + 30, y + 4, { size: 15, font: "Helvetica-Bold", color: C.ink, spacing: -0.3 });
  text(doc, ".", M + 30 + doc.widthOfString("timbre", {}) + 0.4, y + 4, {
    size: 15,
    font: "Helvetica-Bold",
    color: C.accent,
  });

  if (subtitle) {
    text(doc, subtitle, M + 30, y + 26, { size: 7.4, color: C.muted, spacing: 0.3 });
  }
}

function pageHead(doc, title, rightLabel, subtitle) {
  doc.save();
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(C.page);
  doc.restore();

  brand(doc, 34, null);
  kicker(doc, rightLabel, PAGE.width - M - 130, 38, { width: 130, align: "right" });

  text(doc, title, M, 78, { size: 25, font: "Helvetica-Bold", color: C.ink, spacing: -0.6 });
  text(doc, subtitle, M, 110, { size: 9.6, color: C.muted });
}

function footer(doc, pageIndex, totalPages, note) {
  const y = PAGE.height - 34;
  doc.save();
  doc.lineWidth(0.6).strokeColor(C.line).moveTo(M, y - 12).lineTo(PAGE.width - M, y - 12).stroke();
  doc.restore();
  text(doc, note, M, y, { size: 7, color: C.faint });
  text(doc, `Page ${pageIndex} of ${totalPages}`, PAGE.width - M - 80, y, {
    size: 7,
    color: C.faint,
    width: 80,
    align: "right",
  });
}

/* -------------------------------------------------------------------- charts */

function monotoneSegments(points) {
  const n = points.length;
  if (n < 2) return [];
  const dx = [];
  const slopes = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx[i] = points[i + 1].x - points[i].x;
    slopes[i] = (points[i + 1].y - points[i].y) / (dx[i] || 1);
  }
  const tangents = new Array(n);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    tangents[i] =
      slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  }
  for (let i = 0; i < n - 1; i += 1) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const alpha = tangents[i] / slopes[i];
    const beta = tangents[i + 1] / slopes[i];
    const magnitude = alpha * alpha + beta * beta;
    if (magnitude > 9) {
      const scale = 3 / Math.sqrt(magnitude);
      tangents[i] = scale * alpha * slopes[i];
      tangents[i + 1] = scale * beta * slopes[i];
    }
  }
  const segments = [];
  for (let i = 0; i < n - 1; i += 1) {
    const third = dx[i] / 3;
    segments.push([
      { x: points[i].x + third, y: points[i].y + tangents[i] * third },
      { x: points[i + 1].x - third, y: points[i + 1].y - tangents[i + 1] * third },
      points[i + 1],
    ]);
  }
  return segments;
}

function tracePath(doc, points) {
  const segments = monotoneSegments(points);
  if (!segments.length) return;
  doc.moveTo(points[0].x, points[0].y);
  segments.forEach(([c1, c2, end]) => doc.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y));
}

function areaPath(doc, points, baseline) {
  tracePath(doc, points);
  doc.lineTo(points[points.length - 1].x, baseline);
  doc.lineTo(points[0].x, baseline);
  doc.closePath();
}

function lineChart(doc, series, previous, box, dates) {
  const { x, y, w, h } = box;
  const padLeft = 38;
  const padRight = 12;
  const padTop = 10;
  const padBottom = 26;
  const plot = {
    x0: x + padLeft,
    x1: x + w - padRight,
    y0: y + padTop,
    y1: y + h - padBottom,
  };

  const all = [...series, ...previous];
  const max = Math.max(...all) * 1.08;
  const min = Math.min(...all) * 0.7;
  const yOf = (value) => plot.y1 - ((value - min) / (max - min)) * (plot.y1 - plot.y0);
  const xOf = (index) => plot.x0 + (index / (series.length - 1)) * (plot.x1 - plot.x0);

  /* grid + y labels */
  const steps = 4;
  for (let i = 0; i <= steps; i += 1) {
    const value = min + ((max - min) / steps) * i;
    const gy = yOf(value);
    doc.save();
    doc.lineWidth(0.5).strokeColor(C.line).moveTo(plot.x0, gy).lineTo(plot.x1, gy).stroke();
    doc.restore();
    text(doc, axis(value), x + 6, gy - 3.4, {
      size: 6.4,
      color: C.faint,
      width: padLeft - 12,
      align: "right",
    });
  }

  /* previous period */
  const prevPoints = previous.map((value, index) => ({ x: xOf(index), y: yOf(value) }));
  doc.save();
  doc.lineWidth(1).strokeColor("#c9bbaa").dash(3, { space: 3 });
  tracePath(doc, prevPoints);
  doc.stroke();
  doc.undash();
  doc.restore();

  /* current period */
  const points = series.map((value, index) => ({ x: xOf(index), y: yOf(value) }));
  doc.save();
  doc.fillOpacity(0.14);
  doc.fillColor(C.accent);
  areaPath(doc, points, plot.y1);
  doc.fill();
  doc.restore();

  doc.save();
  doc.lineWidth(1.9).strokeColor(C.accent).lineJoin("round");
  tracePath(doc, points);
  doc.stroke();
  doc.restore();

  const last = points[points.length - 1];
  doc.save();
  doc.fillOpacity(0.18).circle(last.x, last.y, 6.5).fill(C.accent);
  doc.restore();
  doc.save();
  doc.circle(last.x, last.y, 2.6).fill(C.accent);
  doc.restore();

  /* x labels — six evenly spread ticks including the final day */
  const ticks = new Set([dates.length - 1]);
  for (let i = 0; i < 6; i += 1) ticks.add(Math.round((i * (dates.length - 1)) / 6));
  ticks.forEach((index) => {
    text(doc, shortDate.format(dates[index]), xOf(index) - 18, plot.y1 + 10, {
      size: 6.4,
      color: C.faint,
      width: 36,
      align: "center",
    });
  });
}

function sparkline(doc, values, box, tone) {
  const { x, y, w, h } = box;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => ({
    x: x + (index / (values.length - 1)) * w,
    y: y + h - ((value - min) / span) * h,
  }));
  doc.save();
  doc.lineWidth(1.2).strokeColor(tone).lineJoin("round").lineCap("round");
  tracePath(doc, points);
  doc.stroke();
  doc.restore();
}

function barRow(doc, x, y, w, label, value, percent, tone) {
  text(doc, label, x, y, { size: 8.4, font: "Helvetica-Bold", color: C.ink });
  text(doc, value, x, y, {
    size: 8.4,
    color: C.muted,
    width: w,
    align: "right",
  });
  const trackY = y + 13;
  doc.save();
  doc.roundedRect(x, trackY, w, 4.6, 2.3).fill(C.cream);
  doc.restore();
  doc.save();
  doc.roundedRect(x, trackY, Math.max(3, (w * percent) / 100), 4.6, 2.3).fill(tone);
  doc.restore();
}

function progressBar(doc, x, y, w, percent, tone = C.accent) {
  doc.save();
  doc.roundedRect(x, y, w, 5, 2.5).fill(C.cream);
  doc.restore();
  doc.save();
  doc.roundedRect(x, y, Math.max(2, (w * percent) / 100), 5, 2.5).fill(tone);
  doc.restore();
}

/* -------------------------------------------------------------------- pages */

function renderOverview(doc, data) {
  const start = new Date(`${data.periodStart}T00:00:00Z`);
  const end = new Date(`${data.periodEnd}T00:00:00Z`);
  const labels = data.daily.map((_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    return date;
  });

  pageHead(
    doc,
    "Weekly performance",
    "Weekly report",
    `${data.artist} · ${rangeLabel(start, end)} · all platforms`
  );
  pill(doc, data.source === "demo" ? "DEMO DATA" : "LIVE DATA", PAGE.width - M - 74, 80, data.source === "demo" ? "accent" : "positive");

  /* KPI cards */
  const gap = 9;
  const kpiW = (CONTENT - gap * 3) / 4;
  const kpiY = 138;
  data.metrics.forEach((metric, index) => {
    const x = M + index * (kpiW + gap);
    card(doc, x, kpiY, kpiW, 82);
    kicker(doc, metric.label, x + 11, kpiY + 12, { size: 6.2 });
    const value = metric.format === "money" ? money(metric.value) : compact(metric.value);
    text(doc, value, x + 11, kpiY + 28, {
      size: value.length > 7 ? 17 : 19,
      font: "Helvetica-Bold",
      color: C.ink,
      spacing: -0.4,
    });
    const tone = metric.delta >= 0 ? "positive" : "negative";
    pill(doc, deltaText(metric.delta), x + 11, kpiY + 56, tone);
    text(doc, "vs previous", x + 11 + 46, kpiY + 59, { size: 6.6, color: C.faint });
  });

  /* Chart */
  const chartY = 236;
  const chartH = 224;
  card(doc, M, chartY, CONTENT, chartH);
  kicker(doc, "Daily streams", M + 16, chartY + 15);
  text(doc, "This period", M + 16, chartY + 30, { size: 6.8, color: C.faint });
  doc.save();
  doc.lineWidth(1.4).strokeColor(C.accent).moveTo(M + 16, chartY + 38).lineTo(M + 32, chartY + 38).stroke();
  doc.restore();
  text(doc, "Previous", M + 74, chartY + 30, { size: 6.8, color: C.faint });
  doc.save();
  doc.lineWidth(1).strokeColor("#c9bbaa").dash(3, { space: 3 }).moveTo(M + 74, chartY + 38).lineTo(M + 90, chartY + 38).stroke();
  doc.undash();
  doc.restore();

  text(doc, compact(data.totals.streams), M + CONTENT - 16 - 90, chartY + 14, {
    size: 17,
    font: "Helvetica-Bold",
    color: C.ink,
    width: 90,
    align: "right",
    spacing: -0.3,
  });
  text(doc, "total streams", M + CONTENT - 16 - 90, chartY + 33, {
    size: 6.6,
    color: C.muted,
    width: 90,
    align: "right",
  });

  lineChart(doc, data.daily, data.previousDaily, {
    x: M + 8,
    y: chartY + 48,
    w: CONTENT - 16,
    h: chartH - 56,
  }, labels);

  /* Platform + cities */
  const rowY = 476;
  const rowH = 158;
  const leftW = (CONTENT - 12) * 0.5;
  const rightX = M + leftW + 12;
  const rightW = CONTENT - leftW - 12;

  card(doc, M, rowY, leftW, rowH);
  kicker(doc, "Platform mix", M + 14, rowY + 15);
  text(doc, `${data.platforms.length} sources`, M + leftW - 62, rowY + 14, {
    size: 6.6,
    color: C.faint,
    width: 48,
    align: "right",
  });
  data.platforms.forEach((platform, index) => {
    const y = rowY + 38 + index * 28;
    barRow(doc, M + 14, y, leftW - 28, platform.name, `${compact(platform.listeners)} · ${platform.share}%`, platform.share * 1.6, index === 0 ? C.accent : "#e0c3ae");
  });

  card(doc, rightX, rowY, rightW, rowH);
  kicker(doc, "Top cities", rightX + 14, rowY + 15);
  text(doc, "listeners", rightX + rightW - 62, rowY + 14, {
    size: 6.6,
    color: C.faint,
    width: 48,
    align: "right",
  });
  data.cities.forEach((city, index) => {
    const y = rowY + 36 + index * 23;
    text(doc, String(index + 1).padStart(2, "0"), rightX + 14, y, { size: 7, color: C.faint });
    text(doc, city.name, rightX + 32, y - 1, { size: 8.4, color: C.ink });
    const tone = city.delta >= 0 ? C.positive : C.negative;
    text(doc, deltaText(city.delta), rightX + 32, y + 8, { size: 6.4, color: tone });
    text(doc, compact(city.listeners), rightX + rightW - 62, y - 1, {
      size: 8.4,
      font: "Helvetica-Bold",
      color: C.ink,
      width: 48,
      align: "right",
    });
  });

  /* Highlights */
  const hlY = 646;
  const hlH = 132;
  card(doc, M, hlY, CONTENT, hlH);
  kicker(doc, "What moved", M + 16, hlY + 15);
  const topTrack = data.tracks[0];
  const fastestCity = [...data.cities].sort((a, b) => b.delta - a.delta)[0];
  const bestPlatform = [...data.platforms].sort((a, b) => b.delta - a.delta)[0];
  const saves = data.metrics.find((metric) => metric.key === "saves");
  const streams = data.metrics.find((metric) => metric.key === "streams");
  const highlights = [
    `${topTrack.name} carries ${topTrack.share}% of catalog streams (${compact(topTrack.streams)}).`,
    `${fastestCity.name} is the fastest-growing city at ${deltaText(fastestCity.delta)}, ${compact(fastestCity.listeners)} listeners.`,
    `${bestPlatform.name} grew ${deltaText(bestPlatform.delta)} — the strongest platform trend this week.`,
    saves && streams
      ? `Saves ${deltaText(saves.delta)} while streams grew ${deltaText(streams.delta)} — listeners are keeping more of what they hear.`
      : "Connect a data source to replace these illustrative figures.",
  ];
  highlights.forEach((line, index) => {
    const y = hlY + 34 + index * 23;
    doc.save();
    doc.circle(M + 20, y + 3.4, 2).fill(C.accent);
    doc.restore();
    text(doc, line, M + 30, y - 1, { size: 8.4, color: C.body, width: CONTENT - 48 });
  });

  footer(doc, 1, 2, "Timbre · artist intelligence · generated report");
}

function renderCatalog(doc, data) {
  const totalStreams = data.tracks.reduce((sum, track) => sum + track.streams, 0);
  pageHead(
    doc,
    "Catalog detail",
    "Page 2",
    `${data.tracks.length} releases · ${fmtInt.format(totalStreams)} streams this period`
  );

  /* Table */
  const tableY = 146;
  const cols = {
    rank: M,
    track: M + 26,
    streams: M + 246,
    share: M + 306,
    delta: M + 396,
    spark: M + 452,
  };
  const rowH = 44;

  kicker(doc, "Track", cols.track, tableY - 16);
  kicker(doc, "Streams", cols.streams, tableY - 16, { width: 40, align: "right" });
  kicker(doc, "Share", cols.share, tableY - 16);
  kicker(doc, "30 day", cols.delta, tableY - 16, { width: 40, align: "right" });
  kicker(doc, "Trend", cols.spark, tableY - 16);

  doc.save();
  doc.lineWidth(0.6).strokeColor(C.line).moveTo(M, tableY - 3).lineTo(PAGE.width - M, tableY - 3).stroke();
  doc.restore();

  data.tracks.forEach((track, index) => {
    const y = tableY + index * rowH;
    if (index > 0) {
      doc.save();
      doc.lineWidth(0.5).strokeColor(C.line).moveTo(M, y - 6).lineTo(PAGE.width - M, y - 6).stroke();
      doc.restore();
    }
    text(doc, String(index + 1).padStart(2, "0"), cols.rank, y + 4, { size: 7.4, color: C.faint });
    text(doc, track.name, cols.track, y, { size: 9.8, font: "Helvetica-Bold", color: C.ink });
    text(doc, `${track.type} · ${track.length}`, cols.track, y + 14, { size: 7, color: C.muted });
    text(doc, fmtInt.format(track.streams), cols.streams, y + 2, {
      size: 8.8,
      color: C.body,
      width: 40,
      align: "right",
    });
    doc.save();
    doc.roundedRect(cols.share, y + 5, 54, 4.4, 2.2).fill(C.cream);
    doc.restore();
    doc.save();
    doc.roundedRect(cols.share, y + 5, Math.max(3, (54 * track.share) / 100), 4.4, 2.2).fill(index === 0 ? C.accent : "#dfbda6");
    doc.restore();
    text(doc, `${track.share}%`, cols.share, y + 13, { size: 6.8, color: C.muted });

    const tone = track.delta >= 0 ? C.positive : C.negative;
    text(doc, deltaText(track.delta), cols.delta, y + 2, {
      size: 8.4,
      font: "Helvetica-Bold",
      color: tone,
      width: 40,
      align: "right",
    });
    sparkline(doc, track.spark, { x: cols.spark, y: y + 3, w: 56, h: 16 }, tone);
  });

  const totalY = tableY + data.tracks.length * rowH + 4;
  doc.save();
  doc.lineWidth(0.6).strokeColor(C.line).moveTo(M, totalY - 8).lineTo(PAGE.width - M, totalY - 8).stroke();
  doc.restore();
  text(doc, `${data.tracks.length} releases`, M, totalY, { size: 7.4, color: C.muted });
  text(doc, fmtInt.format(totalStreams), cols.streams - 20, totalY, {
    size: 8.4,
    font: "Helvetica-Bold",
    color: C.ink,
    width: 60,
    align: "right",
  });

  /* Milestones */
  const msY = 364;
  card(doc, M, msY, CONTENT, 126);
  kicker(doc, "Milestones", M + 16, msY + 15);
  data.milestones.forEach((milestone, index) => {
    const y = msY + 38 + index * 28;
    text(doc, milestone.label, M + 16, y, { size: 8.4, font: "Helvetica-Bold", color: C.ink });
    text(doc, milestone.detail, M + 16, y + 10, { size: 6.6, color: C.muted });
    progressBar(doc, M + 200, y + 4, CONTENT - 300, milestone.value, milestone.value >= 100 ? C.positive : C.accent);
    text(doc, `${milestone.value.toFixed(milestone.value % 1 ? 1 : 0)}%`, M + CONTENT - 104, y, {
      size: 8,
      font: "Helvetica-Bold",
      color: C.ink,
      width: 30,
      align: "right",
    });
    text(doc, milestone.status, M + CONTENT - 70, y + 0.5, {
      size: 6.8,
      color: C.muted,
      width: 54,
      align: "right",
    });
  });

  /* Coverage: where each number comes from */
  const covY = 504;
  card(doc, M, covY, CONTENT, 168);
  kicker(doc, "Source coverage", M + 16, covY + 15);
  kicker(doc, "Route", M + 124, covY + 15);
  text(doc, "state", M + CONTENT - 76, covY + 14, {
    size: 6.6,
    color: C.faint,
    width: 60,
    align: "right",
  });
  doc.save();
  doc.lineWidth(0.5).strokeColor(C.line).moveTo(M + 16, covY + 31).lineTo(M + CONTENT - 16, covY + 31).stroke();
  doc.restore();
  const toneFor = { planned: C.accent, manual: C.body, unavailable: C.faint };
  (data.coverage || []).forEach((row, index) => {
    const y = covY + 42 + index * 29;
    text(doc, row.platform, M + 16, y, { size: 8.4, font: "Helvetica-Bold", color: C.ink });
    text(doc, row.route, M + 124, y + 0.6, { size: 7.8, color: C.muted, width: CONTENT - 230 });
    const tone = toneFor[row.state] || C.muted;
    doc.save();
    doc.circle(M + CONTENT - 74, y + 3.6, 2.2).fill(tone);
    doc.restore();
    text(doc, row.state, M + CONTENT - 68, y, { size: 6.8, color: tone, width: 52, align: "right" });
  });

  /* Method note */
  const noteY = 690;
  card(doc, M, noteY, CONTENT, 88, { fill: "#fbf6ee" });
  kicker(doc, "How this report is built", M + 16, noteY + 14);
  const notes = [
    data.source === "demo"
      ? "Data source: bundled demo dataset — no platform credentials are configured on this deployment."
      : "Data source: live snapshot from the ingest pipeline (public metadata only).",
    `Generated ${longStamp.format(new Date(data.generatedAt))} UTC · every chart, bar and sparkline is PDF vector geometry, not a screenshot.`,
    "To replace the demo numbers, point LIVE_SNAPSHOT_URL at the pipeline output and regenerate.",
  ];
  notes.forEach((line, index) => {
    const y = noteY + 32 + index * 17;
    doc.save();
    doc.circle(M + 20, y + 3, 1.8).fill(C.faint);
    doc.restore();
    text(doc, line, M + 30, y - 1, { size: 7.8, color: C.body, width: CONTENT - 48 });
  });

  footer(doc, 2, 2, "Timbre · artist intelligence · vector report");
}


/* --------------------------------------------------------- digest-shaped PDF */

function renderDigestOverview(doc, data) {
  const start = new Date(`${data.periodStart}T00:00:00Z`);
  const end = new Date(`${data.periodEnd}T00:00:00Z`);
  pageHead(doc, "Weekly digest", "Audiomack · imported", `${data.artist} · ${rangeLabel(start, end)}`);
  pill(doc, "FROM WEEKLY EMAIL", PAGE.width - M - 110, 80, "accent");

  const gap = 9;
  const kpiW = (CONTENT - gap * 3) / 4;
  const kpiY = 138;
  data.kpis.forEach((kpi, index) => {
    const x = M + index * (kpiW + gap);
    card(doc, x, kpiY, kpiW, 82);
    kicker(doc, kpi.label, x + 11, kpiY + 12, { size: 6.2 });
    text(doc, kpi.value, x + 11, kpiY + 30, {
      size: kpi.value.length > 6 ? 17 : 21,
      font: "Helvetica-Bold",
      color: C.ink,
      spacing: -0.4,
    });
    text(doc, kpi.caption, x + 11, kpiY + 58, { size: 6.8, color: C.faint });
  });

  /* Track bars */
  const cardY = 240;
  const cardH = 272;
  card(doc, M, cardY, CONTENT, cardH);
  kicker(doc, "Plays by track · lifetime", M + 16, cardY + 15);
  text(doc, "share of catalog", M + CONTENT - 110, cardY + 14, {
    size: 6.6,
    color: C.faint,
    width: 94,
    align: "right",
  });

  const maxPlays = Math.max(...data.tracks.map((track) => track.plays));
  const barW = CONTENT - 190;
  data.tracks.forEach((track, index) => {
    const y = cardY + 44 + index * 44;
    text(doc, String(index + 1).padStart(2, "0"), M + 16, y, { size: 7, color: C.faint });
    text(doc, track.name, M + 36, y - 1, { size: 9.4, font: "Helvetica-Bold", color: C.ink, width: barW });
    doc.save();
    doc.roundedRect(M + 36, y + 17, barW, 5, 2.5).fill(C.cream);
    doc.restore();
    doc.save();
    doc.roundedRect(M + 36, y + 17, Math.max(3, (barW * track.plays) / maxPlays), 5, 2.5).fill(index === 0 ? C.accent : "#dfbda6");
    doc.restore();
    text(doc, fmtInt.format(track.plays), M + CONTENT - 92, y - 1, {
      size: 9,
      font: "Helvetica-Bold",
      color: C.ink,
      width: 60,
      align: "right",
    });
    text(doc, `${track.share}%`, M + CONTENT - 92, y + 13, { size: 6.8, color: C.muted, width: 60, align: "right" });
  });

  /* Insights */
  const insY = 528;
  card(doc, M, insY, CONTENT, 124);
  kicker(doc, "What this tells you", M + 16, insY + 15);
  const top = data.tracks[0];
  const second = data.tracks[1];
  const gapPct = ((data.totals.plays / data.totals.lifetimePlays) * 100).toFixed(1);
  const insights = [
    `${top.name} is ${top.share}% of lifetime plays (${fmtInt.format(top.plays)} of ${fmtInt.format(data.totals.lifetimePlays)}).`,
    second
      ? `The gap to ${second.name} is ${fmtInt.format(top.plays - second.plays)} plays — a playlist pitch on one track moves the whole account.`
      : "Only one track has plays so far — the catalog is the first thing to grow.",
    `${data.totals.plays} plays landed in the 7-day window (${gapPct}% of lifetime), and followers/likes are flat at ${data.totals.followers}/${data.totals.likes}.`,
  ];
  insights.forEach((line, index) => {
    const y = insY + 36 + index * 28;
    doc.save();
    doc.circle(M + 20, y + 3.4, 2).fill(C.accent);
    doc.restore();
    text(doc, line, M + 30, y - 1, { size: 8.2, color: C.body, width: CONTENT - 48, lineGap: 1 });
  });

  /* What is still missing */
  const missY = 668;
  card(doc, M, missY, CONTENT, 116, { fill: "#fbf6ee" });
  kicker(doc, "What this report cannot show yet", M + 16, missY + 15);
  const missing = [
    "A daily play curve — Audiomack publishes weekly totals, so the pipeline polls and diffs instead.",
    "City and country splits — no public endpoint; Spotify for Artists and YouTube Analytics do provide them.",
    "Follower growth trend — one digest gives a point, not a line.",
  ];
  missing.forEach((line, index) => {
    const y = missY + 36 + index * 24;
    doc.save();
    doc.circle(M + 20, y + 3.2, 1.8).fill(C.faint);
    doc.restore();
    text(doc, line, M + 30, y - 1, { size: 7.9, color: C.body, width: CONTENT - 48 });
  });

  footer(doc, 1, 2, "Timbre · Audiomack weekly digest · imported from email");
}

function renderDigestCatalog(doc, data) {
  pageHead(
    doc,
    "Catalog detail",
    "Page 2",
    `${data.tracks.length} tracks · ${fmtInt.format(data.totals.lifetimePlays)} lifetime plays`
  );

  const tableY = 146;
  const cols = { rank: M, track: M + 26, plays: M + 256, share: M + 336, pct: M + 426 };
  const rowH = 40;

  kicker(doc, "Track", cols.track, tableY - 16);
  kicker(doc, "Plays", cols.plays, tableY - 16, { width: 56, align: "right" });
  kicker(doc, "Share of catalog", cols.share, tableY - 16);
  kicker(doc, "%", cols.pct, tableY - 16, { width: 30, align: "right" });

  doc.save();
  doc.lineWidth(0.6).strokeColor(C.line).moveTo(M, tableY - 3).lineTo(PAGE.width - M, tableY - 3).stroke();
  doc.restore();

  data.tracks.forEach((track, index) => {
    const y = tableY + index * rowH;
    if (index > 0) {
      doc.save();
      doc.lineWidth(0.5).strokeColor(C.line).moveTo(M, y - 6).lineTo(PAGE.width - M, y - 6).stroke();
      doc.restore();
    }
    text(doc, String(index + 1).padStart(2, "0"), cols.rank, y + 4, { size: 7.4, color: C.faint });
    text(doc, track.name, cols.track, y + 1, { size: 9.6, font: "Helvetica-Bold", color: C.ink, width: cols.plays - cols.track - 12 });
    text(doc, fmtInt.format(track.plays), cols.plays, y + 2, { size: 8.8, color: C.body, width: 56, align: "right" });
    doc.save();
    doc.roundedRect(cols.share, y + 5, 76, 4.4, 2.2).fill(C.cream);
    doc.restore();
    doc.save();
    doc.roundedRect(cols.share, y + 5, Math.max(3, (76 * track.share) / 100), 4.4, 2.2).fill(index === 0 ? C.accent : "#dfbda6");
    doc.restore();
    text(doc, `${track.share}%`, cols.pct, y + 1, { size: 8, color: C.muted, width: 30, align: "right" });
  });

  const totalY = tableY + data.tracks.length * rowH + 6;
  doc.save();
  doc.lineWidth(0.6).strokeColor(C.line).moveTo(M, totalY - 10).lineTo(PAGE.width - M, totalY - 10).stroke();
  doc.restore();
  text(doc, `${data.tracks.length} tracks`, M, totalY, { size: 7.4, color: C.muted });
  text(doc, fmtInt.format(data.totals.lifetimePlays), cols.plays, totalY, {
    size: 8.4,
    font: "Helvetica-Bold",
    color: C.ink,
    width: 56,
    align: "right",
  });

  /* Pipeline explainer */
  const pipeY = totalY + 34;
  card(doc, M, pipeY, CONTENT, 146);
  kicker(doc, "How this PDF was made", M + 16, pipeY + 15);
  const steps = [
    "1 · Audiomack emails the weekly stats to the artist mailbox.",
    "2 · The mailbox rule hands the plain-text body to pipeline/src/parsers/audiomack-digest.ts.",
    "3 · The parser stores data/audiomack-digest.json (latest + one entry per week).",
    "4 · This endpoint renders that JSON as vector PDF — no browser, no screenshots.",
  ];
  steps.forEach((line, index) => {
    const y = pipeY + 34 + index * 24;
    text(doc, line, M + 16, y, { size: 7.9, color: C.body, width: CONTENT - 32 });
  });

  /* Scope warning + roadmap */
  const warnY = pipeY + 160;
  card(doc, M, warnY, CONTENT, 86, { fill: "#fbf6ee" });
  kicker(doc, "Read the numbers correctly", M + 16, warnY + 14);
  text(
    doc,
    `The digest's headline ${data.totals.plays} plays covers seven days; the per-track numbers are lifetime (${fmtInt.format(data.totals.lifetimePlays)} total). They are different clocks, not a contradiction — keep them in separate columns.`,
    M + 16,
    warnY + 30,
    { size: 7.8, color: C.body, width: CONTENT - 32, lineGap: 1.5 }
  );

  const roadY = warnY + 100;
  card(doc, M, roadY, CONTENT, 144);
  kicker(doc, "To turn this into a full report", M + 16, roadY + 15);
  const roadmap = [
    { label: "Audiomack Data API", route: "daily poll of plays + followers", state: "needs app keys" },
    { label: "Spotify for Artists", route: "weekly CSV upload", state: "manual" },
    { label: "YouTube Analytics", route: "OAuth, views + watch time", state: "planned" },
    { label: "Mailbox (IMAP)", route: "auto-forward this digest", state: "ready" },
  ];
  roadmap.forEach((row, index) => {
    const y = roadY + 36 + index * 26;
    text(doc, row.label, M + 16, y, { size: 8.2, font: "Helvetica-Bold", color: C.ink });
    text(doc, row.route, M + 148, y + 0.4, { size: 7.6, color: C.muted });
    text(doc, row.state, M + CONTENT - 106, y + 0.4, { size: 6.8, color: C.faint, width: 90, align: "right" });
  });

  footer(doc, 2, 2, "Timbre · Audiomack weekly digest · vector report");
}

/* --------------------------------------------------------------------- entry */

export function buildReportPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      bufferPages: true,
      info: {
        Title: `${data.artist} — weekly performance report`,
        Author: "Timbre",
        Subject: "Streaming performance report",
        Keywords: "timbre, artist intelligence, report",
        CreationDate: new Date(data.generatedAt),
      },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (data.mode === "digest") {
      renderDigestOverview(doc, data);
      doc.addPage();
      renderDigestCatalog(doc, data);
    } else {
      renderOverview(doc, data);
      doc.addPage();
      renderCatalog(doc, data);
    }

    doc.end();
  });
}

export const reportFileName = (data) =>
  `timbre-report-${data.periodEnd}-${data.artist.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
