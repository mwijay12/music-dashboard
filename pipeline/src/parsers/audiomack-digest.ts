/**
 * Audiomack weekly digest parser.
 *
 * Audiomack emails a weekly stats summary but exposes no digest endpoint, so the
 * cheapest reliable ingestion path is: forward the email to a label/mailbox,
 * pull the plain-text part, and parse it here. This parser is deliberately
 * forgiving about whitespace, separators and Swahili/English wording, and it
 * records diagnostics when the numbers cannot be reconciled — the classic case
 * being "total plays" (a 7-day window) sitting next to lifetime per-song play
 * counts.
 */

export interface DigestTrack {
  title: string;
  plays: number;
}

export interface DigestTotals {
  plays: number;
  followers: number;
  likes: number;
}

export interface AudiomackDigest {
  account: string;
  periodEnd: string | null;
  totals: DigestTotals;
  tracks: DigestTrack[];
  diagnostics: {
    topTrackSum: number;
    /** True when per-song plays add up to more than the reported weekly total. */
    scopeMismatch: boolean;
    notes: string[];
  };
}

const TRACK_HEADING = /(top\s+(songs?|tracks?)|most\s+played|nyimbo\s+bora)/i;

const LABEL_LINES =
  /^(total\s+plays?|plays?|new\s+followers?|total\s+followers?|followers?|total\s+likes?|likes?|reposts?|favorites?|uploads?)\b/i;

const NUMBER = "([0-9][0-9.,\\s]*)";

function toNumber(value: string): number {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? Number.parseInt(digits, 10) : 0;
}

function matchNumber(text: string, labels: string[]): number | null {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:=–-]?\\s*${NUMBER}`, "i");
    const match = text.match(pattern);
    if (match) return toNumber(match[1]);
  }
  return null;
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/** Finds "7 Nov 2026" / "Nov 7, 2026" / "07/11/2026" and returns an ISO date. */
export function findPeriodEnd(text: string): string | null {
  const dayFirst = text.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/i);
  const monthFirst = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i);

  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;

  if (dayFirst) {
    day = Number(dayFirst[1]);
    month = MONTHS.indexOf(dayFirst[2].slice(0, 3).toLowerCase()) + 1;
    year = Number(dayFirst[3]);
  } else if (monthFirst) {
    month = MONTHS.indexOf(monthFirst[1].slice(0, 3).toLowerCase()) + 1;
    day = Number(monthFirst[2]);
    year = Number(monthFirst[3]);
  } else {
    const numeric = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/);
    if (numeric) {
      day = Number(numeric[1]);
      month = Number(numeric[2]);
      year = Number(numeric[3]);
    }
  }

  if (!day || !month || !year) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : iso;
}

function parseAccount(lines: string[]): string {
  const candidate = lines.find((line) => {
    if (!line || line.length < 2) return false;
    if (LABEL_LINES.test(line)) return false;
    if (TRACK_HEADING.test(line)) return false;
    if (/^[\d\s.,–-]+$/.test(line)) return false;
    if (/^(weekly|your|hi|hello|hey)\b/i.test(line) && line.length < 24) return false;
    return line.length <= 90;
  });
  return candidate ?? "Unknown account";
}

/**
 * Song rows look like "Lango la Mbinguni   300", "1. Mwamba — 160 plays" or
 * "Jesus in me!  110". Titles may contain punctuation, apostrophes and numbers.
 */
export function parseTrackLine(line: string): DigestTrack | null {
  const cleaned = line
    .replace(/^[\s•*·\-–—]+/, "")
    .replace(/^\d{1,2}[.)]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 3) return null;
  if (LABEL_LINES.test(cleaned)) return null;
  if (TRACK_HEADING.test(cleaned) && cleaned.split(" ").length <= 4) return null;

  const match = cleaned.match(/^(.*?)\s*(?:[—–|·:]\s*|\s)([\d][\d,.\s]*)\s*(?:plays?|streams?)?\s*$/i);
  if (!match) return null;

  const title = match[1].replace(/[\s—–|·:]+$/, "").trim();
  const plays = toNumber(match[2]);
  if (!title || title.length < 2) return null;
  if (!plays) return null;
  if (title.split(" ").length > 14) return null;

  return { title, plays };
}

export function parseAudiomackDigest(raw: string): AudiomackDigest {
  const text = raw.replace(/\r\n?/g, "\n");
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const flat = lines.join("\n");
  const account = parseAccount(lines);

  const plays = matchNumber(flat, ["total\\s+plays?", "plays?\\s+this\\s+week", "plays?"]) ?? 0;
  const followers = matchNumber(flat, ["new\\s+followers?", "followers?"]) ?? 0;
  const likes = matchNumber(flat, ["total\\s+likes?", "likes?", "favorites?"]) ?? 0;

  const headingIndex = lines.findIndex((line) => TRACK_HEADING.test(line));
  const trackLines = headingIndex >= 0 ? lines.slice(headingIndex + 1) : lines;
  const tracks: DigestTrack[] = [];
  for (const line of trackLines) {
    const track = parseTrackLine(line);
    if (track) tracks.push(track);
  }

  const topTrackSum = tracks.reduce((sum, track) => sum + track.plays, 0);
  const notes: string[] = [];
  const scopeMismatch = topTrackSum > plays * 2 && tracks.length > 0;

  if (scopeMismatch) {
    notes.push(
      `Per-song plays total ${topTrackSum} but the digest reports ${plays} plays for the period — the headline number is window-scoped (7 days) while song counts are lifetime. Store both, and never subtract one from the other.`
    );
  }
  if (!tracks.length) {
    notes.push("No song rows were detected; check whether the email template changed.");
  }
  if (!findPeriodEnd(text)) {
    notes.push("No period end date found in the digest; falling back to the email date.");
  }

  return {
    account,
    periodEnd: findPeriodEnd(text),
    totals: { plays, followers, likes },
    tracks,
    diagnostics: { topTrackSum, scopeMismatch, notes },
  };
}
