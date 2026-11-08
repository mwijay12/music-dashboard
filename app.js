import {
  initScenes,
  setOrbPaused,
  setReducedMotion,
  resizeScenes,
} from "./scenes.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(pointer: fine)");
const motionParam = new URLSearchParams(window.location.search).get("motion");
let motionOverride = motionParam === "on" || motionParam === "off" ? motionParam : null;
if (!motionOverride) {
  try {
    const stored = window.localStorage.getItem("timbre:motion");
    if (stored === "on" || stored === "off") motionOverride = stored;
  } catch {
    motionOverride = null;
  }
}
const reduced = () => (motionOverride ? motionOverride === "off" : motionQuery.matches);
const gsap = window.gsap;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function applyMotionState() {
  const isReduced = reduced();
  document.documentElement.classList.toggle("motion-on", !isReduced);
  document.documentElement.classList.toggle("motion-off", isReduced);
  setReducedMotion(isReduced);
  $$("[data-motion-toggle]").forEach((button) => {
    button.setAttribute("aria-pressed", String(!isReduced));
    const label = isReduced ? "Enable animations" : "Pause animations";
    button.setAttribute("aria-label", label);
    button.title = isReduced ? "Animations off — click to enable" : "Animations on — click to pause";
  });
  const command = $("[data-motion-command]");
  if (command) command.textContent = isReduced ? "Enable animations" : "Pause animations";
}

applyMotionState();

function setMotion(enabled) {
  motionOverride = enabled ? "on" : "off";
  try {
    window.localStorage.setItem("timbre:motion", motionOverride);
  } catch {}
  applyMotionState();
  const view = $(`[data-view="${state.route}"]`);
  if (!view) return;
  if (!enabled) {
    if (gsap) gsap.killTweensOf($$("[data-reveal]", view));
    $$("[data-reveal]", view).forEach((item) => {
      if (item.getAnimations) item.getAnimations().forEach((animation) => animation.cancel());
      item.dataset.revealed = "true";
      item.style.opacity = "1";
      item.style.transform = "none";
    });
    return;
  }
  revealView(view);
}

const fmtInt = new Intl.NumberFormat("en-US");
const fmtCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Public API";
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.round(hours / 24)}d ago`;
}

const NOW = new Date();
const TODAY = new Date(NOW);
TODAY.setHours(12, 0, 0, 0);

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const weekdayShort = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const tooltipDate = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const longDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

const ROUTES = {
  studio: { title: "Studio", crumb: "Studio" },
  overview: { title: "Overview", crumb: "Overview" },
  streams: { title: "Streams", crumb: "Streams" },
  tracks: { title: "Tracks", crumb: "Tracks" },
  audience: { title: "Audience", crumb: "Audience" },
  activity: { title: "Activity", crumb: "Activity" },
  sources: { title: "Sources", crumb: "Sources" },
};

const RANGE_CONFIG = {
  "7D": { points: 7, step: 1, total: 684210, delta: 6.2, seed: 17, label: "last 7 days" },
  "30D": { points: 30, step: 1, total: 2847193, delta: 18.4, seed: 29, label: "last 30 days" },
  "90D": { points: 13, step: 7, total: 7912440, delta: 31.7, seed: 41, label: "last 90 days" },
};

const METRICS = [
  {
    key: "streams",
    label: "Streams",
    value: 2847193,
    delta: 18.4,
    icon: "i-chart",
    spark: [18, 22, 20, 26, 24, 30, 28, 34, 31, 38, 36, 42],
  },
  {
    key: "listeners",
    label: "Monthly listeners",
    value: 612408,
    delta: 9.2,
    icon: "i-users",
    spark: [40, 38, 42, 44, 41, 46, 48, 47, 52, 51, 55, 58],
  },
  {
    key: "saves",
    label: "Saves",
    value: 84211,
    delta: 24.1,
    icon: "i-bookmark",
    spark: [12, 18, 15, 24, 22, 30, 27, 36, 33, 44, 40, 52],
  },
  {
    key: "revenue",
    label: "Revenue",
    value: 18420,
    delta: 12.8,
    prefix: "$",
    icon: "i-sparkle",
    spark: [20, 24, 22, 28, 26, 31, 30, 33, 35, 34, 38, 41],
  },
];

const TRACKS = [
  {
    name: "Hollow Bloom",
    streams: 1204880,
    share: 42,
    delta: 21.4,
    type: "Single",
    length: "3:42",
    released: "12 Sep 2026",
    thumb: "thumb-a",
    art: "art-a",
    spark: [24, 28, 27, 34, 33, 41, 39, 48, 46, 55, 53, 62],
  },
  {
    name: "Static Garden",
    streams: 842610,
    share: 30,
    delta: 12.8,
    type: "Single",
    length: "4:05",
    released: "22 Aug 2026",
    thumb: "thumb-b",
    art: "art-b",
    spark: [18, 20, 19, 24, 26, 25, 31, 30, 36, 35, 41, 43],
  },
  {
    name: "Low Tide",
    streams: 498204,
    share: 18,
    delta: 4.1,
    type: "EP",
    length: "3:18",
    released: "04 Jul 2026",
    thumb: "thumb-c",
    art: "art-c",
    spark: [12, 14, 13, 15, 17, 16, 18, 19, 18, 21, 20, 22],
  },
  {
    name: "Night Ferry",
    streams: 301499,
    share: 10,
    delta: -2.3,
    type: "Single",
    length: "5:12",
    released: "19 May 2026",
    thumb: "thumb-d",
    art: "art-d",
    spark: [26, 24, 25, 22, 23, 21, 22, 19, 20, 18, 19, 17],
  },
];

const PLATFORMS = [
  { name: "Spotify", letter: "S", mark: "mark-spotify", share: 56, listeners: 355200, delta: 2.4 },
  { name: "Apple Music", letter: "A", mark: "mark-apple", share: 22, listeners: 134700, delta: 14.0 },
  { name: "YouTube", letter: "Y", mark: "mark-youtube", share: 12, listeners: 73500, delta: 8.1 },
  { name: "SoundCloud", letter: "S", mark: "mark-soundcloud", share: 8, listeners: 49800, delta: -1.2 },
];

const CITIES = [
  { name: "London", listeners: 82400, delta: 12.8 },
  { name: "Berlin", listeners: 61200, delta: 9.4 },
  { name: "Tokyo", listeners: 54900, delta: 6.2 },
  { name: "Los Angeles", listeners: 49100, delta: 3.1 },
  { name: "São Paulo", listeners: 38800, delta: 7.8 },
];

const MILESTONES = [
  { label: "1M streams", value: 100, status: "Reached", left: "Hollow Bloom", right: "12 Oct", done: true },
  { label: "1.5M streams", value: 80.3, status: "On track", left: "Hollow Bloom", right: "~18 days" },
  { label: "3M streams", value: 94.9, status: "6 days left", left: "All releases", right: "~6 days" },
  { label: "5M streams", value: 57, status: "In progress", left: "All releases", right: "Q2 2027" },
];

const DEMOGRAPHICS = [
  { label: "18–24", value: 28 },
  { label: "25–34", value: 41 },
  { label: "35–44", value: 18 },
  { label: "45–54", value: 9 },
  { label: "55+", value: 4 },
];

const GROWTH = [380, 405, 420, 438, 452, 471, 489, 508, 529, 551, 578, 612];

const LISTENERS = [
  { initials: "AT", name: "Aiko Tanaka", meta: "Tokyo · Spotify", time: "2m", tone: "la-1" },
  { initials: "LR", name: "Luca Rossi", meta: "Milan · Apple Music", time: "6m", tone: "la-2" },
  { initials: "AO", name: "Amara Okafor", meta: "London · Spotify", time: "11m", tone: "la-3" },
  { initials: "NW", name: "Noah Weber", meta: "Berlin · YouTube", time: "18m", tone: "la-1" },
  { initials: "SA", name: "Sofia Almeida", meta: "São Paulo · Apple Music", time: "24m", tone: "la-2" },
];

const SOURCE_ACCOUNTS = [
  {
    name: "Spotify",
    letter: "S",
    mark: "mark-spotify",
    status: "Connected",
    coverage: 98,
    primary: "2.1M",
    primaryLabel: "streams",
    secondary: "46.2K",
    secondaryLabel: "saves",
    audience: "355.2K",
    sync: "Synced 2m ago",
    note: "Spotify for Artists ? catalog, audience",
  },
  {
    name: "Apple Music",
    letter: "A",
    mark: "mark-apple",
    status: "Connected",
    coverage: 94,
    primary: "612K",
    primaryLabel: "streams",
    secondary: "18.4K",
    secondaryLabel: "saves",
    audience: "134.7K",
    sync: "Synced 8m ago",
    note: "Apple Music for Artists ? Shazam, radio",
  },
  {
    name: "YouTube",
    letter: "Y",
    mark: "mark-youtube",
    status: "Connected",
    coverage: 91,
    primary: "1.4M",
    primaryLabel: "views",
    secondary: "86.2K",
    secondaryLabel: "subscribers",
    audience: "73.5K",
    sync: "Synced 12m ago",
    note: "Official artist channel",
  },
  {
    name: "SoundCloud",
    letter: "S",
    mark: "mark-soundcloud",
    status: "Connected",
    coverage: 88,
    primary: "498K",
    primaryLabel: "plays",
    secondary: "24.8K",
    secondaryLabel: "followers",
    audience: "49.8K",
    sync: "Synced 19m ago",
    note: "Catalog, comments, reposts",
  },
  {
    name: "TikTok",
    letter: "T",
    mark: "mark-tiktok",
    status: "Connected",
    coverage: 76,
    primary: "3.1M",
    primaryLabel: "video views",
    secondary: "1.8K",
    secondaryLabel: "creator videos",
    audience: "212K",
    sync: "Synced 24m ago",
    note: "TikTok for Artists ? sounds, creators",
  },
  {
    name: "Instagram",
    letter: "I",
    mark: "mark-instagram",
    status: "Connected",
    coverage: 72,
    primary: "128K",
    primaryLabel: "followers",
    secondary: "1.2M",
    secondaryLabel: "reach",
    audience: "128K",
    sync: "Synced 31m ago",
    note: "Audience, stories, tagged posts",
  },
];

const SOURCE_HEALTH = [
  { label: "Catalog", value: 100 },
  { label: "Audience", value: 98 },
  { label: "Revenue", value: 95 },
  { label: "Social", value: 91 },
];

const SOURCE_SYNC = [
  { html: "<strong>Spotify</strong> catalog matched 42 tracks", meta: "Catalog", time: "2m" },
  { html: "<strong>Apple Music</strong> audience refreshed", meta: "Audience", time: "8m" },
  { html: "<strong>YouTube</strong> 3 new Shorts detected", meta: "Content", time: "12m" },
  { html: "<strong>SoundCloud</strong> repost spike +18%", meta: "Engagement", time: "19m" },
  { html: "<strong>TikTok</strong> creator videos updated", meta: "Social", time: "24m" },
  { html: "<strong>Instagram</strong> reach imported", meta: "Social", time: "31m" },
];

const ACTIVITY_SEED = [
  {
    type: "milestones",
    icon: "i-sparkle",
    html: "<strong>Hollow Bloom</strong> crossed 1.2M streams",
    meta: "Milestone · Spotify",
    time: "2m",
  },
  {
    type: "saves",
    icon: "i-bookmark",
    html: "<strong>836 new saves</strong> from listeners in Tokyo",
    meta: "Saves · Apple Music",
    time: "9m",
  },
  {
    type: "playlists",
    icon: "i-list",
    html: "<strong>Hollow Bloom</strong> added to <strong>Late Night Drive</strong>",
    meta: "Playlist · Spotify",
    time: "14m",
  },
  {
    type: "followers",
    icon: "i-user-plus",
    html: "<strong>148 new followers</strong> from São Paulo",
    meta: "Followers",
    time: "26m",
  },
  {
    type: "milestones",
    icon: "i-sparkle",
    html: "<strong>Static Garden</strong> passed 800K streams",
    meta: "Milestone · All platforms",
    time: "41m",
  },
  {
    type: "playlists",
    icon: "i-radio",
    html: "<strong>Static Garden</strong> added to <strong>Fresh Finds</strong>",
    meta: "Playlist · Spotify",
    time: "48m",
  },
  {
    type: "saves",
    icon: "i-bookmark",
    html: "<strong>1,024 new saves</strong> from listeners in Berlin",
    meta: "Saves · Apple Music",
    time: "1h",
  },
  {
    type: "milestones",
    icon: "i-sparkle",
    html: "<strong>Hollow Bloom</strong> passed 1.1M streams",
    meta: "Milestone · All platforms",
    time: "1h",
  },
  {
    type: "followers",
    icon: "i-user-plus",
    html: "<strong>76 new followers</strong> from Tokyo",
    meta: "Followers",
    time: "2h",
  },
  {
    type: "milestones",
    icon: "i-sparkle",
    html: "<strong>Low Tide</strong> passed 400K streams",
    meta: "Milestone · All platforms",
    time: "3h",
  },
];

const ACTIVITY_POOL = [
  {
    type: "playlists",
    icon: "i-list",
    html: "<strong>Low Tide</strong> added to <strong>Indie Essentials</strong>",
    meta: "Playlist · Spotify",
  },
  {
    type: "saves",
    icon: "i-bookmark",
    html: "<strong>512 new saves</strong> from listeners in London",
    meta: "Saves · Spotify",
  },
  {
    type: "followers",
    icon: "i-user-plus",
    html: "<strong>92 new followers</strong> from Berlin",
    meta: "Followers",
  },
  {
    type: "milestones",
    icon: "i-sparkle",
    html: "<strong>Night Ferry</strong> passed 300K streams",
    meta: "Milestone · All platforms",
  },
  {
    type: "playlists",
    icon: "i-radio",
    html: "<strong>Static Garden</strong> spun on <strong>KEXP</strong>",
    meta: "Radio · Seattle",
  },
  {
    type: "saves",
    icon: "i-bookmark",
    html: "<strong>1,204 new saves</strong> from listeners in Los Angeles",
    meta: "Saves · Apple Music",
  },
];

const ACTIVITY_STATS = [
  { label: "Events today", value: "128", delta: "12.4%", icon: "i-pulse" },
  { label: "New saves", value: "2,140", delta: "24.1%", icon: "i-bookmark" },
  { label: "Playlist adds", value: "12", delta: "9.1%", icon: "i-list" },
  { label: "New followers", value: "348", delta: "18.7%", icon: "i-user-plus" },
];

const SETTINGS = [
  { key: "milestones", title: "Milestone alerts", sub: "Every 100K streams", checked: true },
  { key: "saves", title: "Save spikes", sub: "When saves jump 20%", checked: true },
  { key: "playlists", title: "Playlist adds", sub: "Whenever a curator adds you", checked: true },
  { key: "digest", title: "Weekly digest", sub: "Monday morning recap", checked: false },
  { key: "product", title: "Product updates", sub: "New Timbre features", checked: false },
];

const state = {
  route: "studio",
  range: "30D",
  live: true,
  playing: true,
  trackFilter: "all",
  activityFilter: "all",
  paletteIndex: 0,
  activeTrack: 0,
};

const activityItems = ACTIVITY_SEED.slice();

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function icon(id, className = "icon") {
  return `<svg class="${className}" aria-hidden="true"><use href="#${id}"/></svg>`;
}

function mulberry32(seed) {
  let value = seed;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function niceStep(value) {
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const normalized = value / magnitude;
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const step = steps.find((candidate) => normalized <= candidate) || 10;
  return step * magnitude;
}

function monotonePath(points) {
  const count = points.length;
  if (!count) return "";
  if (count === 1) return `M${points[0][0]},${points[0][1]}`;

  const dx = [];
  const slopes = [];
  for (let i = 0; i < count - 1; i += 1) {
    dx[i] = points[i + 1][0] - points[i][0];
    slopes[i] = (points[i + 1][1] - points[i][1]) / (dx[i] || 1);
  }

  const tangents = new Array(count);
  tangents[0] = slopes[0];
  tangents[count - 1] = slopes[count - 2];
  for (let i = 1; i < count - 1; i += 1) {
    tangents[i] = slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  }

  for (let i = 0; i < count - 1; i += 1) {
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

  let path = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < count - 1; i += 1) {
    const third = dx[i] / 3;
    const c1x = points[i][0] + third;
    const c1y = points[i][1] + tangents[i] * third;
    const c2x = points[i + 1][0] - third;
    const c2y = points[i + 1][1] - tangents[i + 1] * third;
    path += ` C${c1x},${c1y} ${c2x},${c2y} ${points[i + 1][0]},${points[i + 1][1]}`;
  }
  return path;
}

function sparkGeometry(values, width, height, pad = 3) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => [
    pad + (index / (values.length - 1)) * (width - pad * 2),
    height - pad - ((value - min) / span) * (height - pad * 2),
  ]);
  const line = monotonePath(points);
  const last = points[points.length - 1];
  const area = `${line} L ${last[0]} ${height} L ${points[0][0]} ${height} Z`;
  return { line, area, last, points };
}

function sparkSvg(values, className, width = 100, height = 26, pathClass = "") {
  const { line } = sparkGeometry(values, width, height);
  return `<svg class="${className}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><path class="${pathClass}" d="${line}"/></svg>`;
}

function formatCompact(value) {
  if (!value) return "0";
  // Intl's compact notation already renders 1000 as "1K" and 1204 as "1.2K";
  // the old `.replace(".0K", "K")` only worked for en-US.
  return fmtCompact.format(value);
}

function formatDelta(value) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/**
 * Counters rewrite their text on every frame, which is unusable for a screen
 * reader (and a live region would narrate every frame). So the animated node is
 * hidden from AT and its final value sits in a static, clipped mirror.
 */
function setAccessibleValue(element, text) {
  if (!element) return;
  element.setAttribute("aria-hidden", "true");
  let mirror = element.nextElementSibling;
  if (!mirror || !mirror.classList.contains("sr-value")) {
    mirror = document.createElement("span");
    mirror.className = "sr-value";
    element.insertAdjacentElement("afterend", mirror);
  }
  if (mirror.textContent !== text) mirror.textContent = text;
}

function animateNumber(element, target, options = {}) {
  if (!element) return;
  const {
    from = 0,
    duration = 1.05,
    prefix = "",
    suffix = "",
    decimals = 0,
    compact = false,
  } = options;
  const format = (value) => {
    if (compact) return formatCompact(value);
    if (decimals) return Number(value).toFixed(decimals);
    return fmtInt.format(Math.round(value));
  };
  const final = `${prefix}${format(target)}${suffix}`;
  setAccessibleValue(element, final);
  if (reduced()) {
    element.textContent = final;
    return;
  }
  if (!gsap) {
    const startValue = Number(from) || 0;
    const started = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / (duration * 1000));
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = `${prefix}${format(startValue + (target - startValue) * eased)}${suffix}`;
      if (progress < 1) requestAnimationFrame(tick);
      else element.textContent = final;
    };
    requestAnimationFrame(tick);
    return;
  }
  const proxy = { value: Number(from) || 0 };
  gsap.killTweensOf(proxy);
  gsap.to(proxy, {
    value: target,
    duration,
    ease: "power2.out",
    onUpdate: () => {
      element.textContent = `${prefix}${format(proxy.value)}${suffix}`;
    },
    onComplete: () => {
      element.textContent = final;
    },
  });
}

let toastTimer = 0;

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-on");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-on"), 2600);
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error("Clipboard unavailable");
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  }
}

/* --------------------------------------------------------------------------
   Shared motion helpers
   -------------------------------------------------------------------------- */

function drawPath(path, duration = 1.1, delay = 0) {
  if (!path || !gsap || reduced()) return;
  const length = path.getTotalLength();
  gsap.fromTo(
    path,
    { strokeDasharray: length, strokeDashoffset: length },
    {
      strokeDashoffset: 0,
      duration,
      delay,
      ease: "power2.out",
      onComplete: () => {
        path.style.strokeDasharray = "none";
        path.style.strokeDashoffset = "0";
      },
    }
  );
}

function animateCounters(root = document) {
  $$("[data-counter]", root).forEach((element) => {
    const target = Number(String(element.dataset.counter || "0").replace(/,/g, ""));
    if (!Number.isFinite(target)) return;
    const prefix = element.dataset.prefix || "";
    const suffix = element.dataset.suffix || "";
    const decimals = Number(element.dataset.decimals || 0);
    const compact = element.dataset.format === "compact";
    animateNumber(element, target, { prefix, suffix, decimals, compact, duration: 1.25 });
  });
}

function animateBars(root = document) {
  const bars = $$(
    ".platform-bar i, .city-bar i, .mini-bar i, .progress i, .milestone-bar i, .demo-bar i, .share-bar i, .pulse-goal i, .source-bar i",
    root
  );
  if (!bars.length) return;
  if (!gsap || reduced()) {
    bars.forEach((bar) => {
      bar.style.transform = "none";
    });
    return;
  }
  gsap.fromTo(
    bars,
    { scaleX: 0 },
    {
      scaleX: 1,
      duration: 0.9,
      ease: "power3.out",
      stagger: 0.035,
      transformOrigin: "left center",
      overwrite: true,
    }
  );
}

function animateRings(root = document) {
  const length = 326.73;
  $$("[data-ring]", root).forEach((element) => {
    const percent = Number(element.dataset.ring);
    const circle = $(".ring-fg", element);
    const label = $(".radial-center strong", element);
    if (!circle) return;
    const target = length * (1 - percent / 100);
    if (!gsap || reduced()) {
      circle.style.strokeDashoffset = String(target);
      if (label) label.textContent = percent % 1 ? percent.toFixed(1) : String(Math.round(percent));
      return;
    }
    gsap.fromTo(
      circle,
      { strokeDashoffset: length },
      { strokeDashoffset: target, duration: 1.3, ease: "power3.out", overwrite: true }
    );
    if (label) {
      const proxy = { value: 0 };
      gsap.to(proxy, {
        value: percent,
        duration: 1.2,
        ease: "power2.out",
        onUpdate: () => {
          label.textContent = percent % 1 ? proxy.value.toFixed(1) : String(Math.round(proxy.value));
        },
        onComplete: () => {
          label.textContent = percent % 1 ? percent.toFixed(1) : String(Math.round(percent));
        },
      });
    }
  });
}

function animateSparklines(root = document) {
  $$(".metric-spark path, .trend-cell path", root).forEach((path, index) => {
    drawPath(path, 0.9, index * 0.02);
  });
}

function animateHeat(root = document) {
  const cells = $$(".heat-cell", root);
  if (!cells.length || !gsap || reduced()) return;
  gsap.fromTo(
    cells,
    { opacity: 0, scale: 0.45 },
    {
      opacity: 1,
      scale: 1,
      duration: 0.34,
      stagger: { each: 0.004 },
      ease: "power2.out",
      clearProps: "transform",
      overwrite: true,
    }
  );
}

function animateContentLists(root = document) {
  if (!gsap || reduced()) return;
  const groups = [
    [".mini-track", 0.05],
    [".mini-feed li", 0.04],
    [".feed-item", 0.035],
    ["tbody tr", 0.04],
    [".platform-ring", 0.05],
    [".listener-row", 0.04],
    [".city-row", 0.03],
    [".milestone", 0.05],
    [".demo-row", 0.04],
    [".platform-row", 0.04],
  ];
  groups.forEach(([selector, stagger]) => {
    const items = $$(selector, root);
    if (!items.length) return;
    gsap.fromTo(
      items,
      { opacity: 0, y: 9 },
      {
        opacity: 1,
        y: 0,
        duration: 0.42,
        stagger,
        ease: "power2.out",
        clearProps: "transform",
        overwrite: true,
      }
    );
  });
}

function animateMotion(root = document) {
  if (!root) return;
  animateCounters(root);
  animateBars(root);
  animateRings(root);
  animatePlatformRings(root);
  animateSparklines(root);
  animateHeat(root);
  if ($("#growthChart", root)) animateGrowth(root);
  animateContentLists(root);
}

let revealObserver = null;
let revealToken = 0;
let revealPending = [];
let revealScrollQueued = false;

function revealInstant(item) {
  if (!item || item.dataset.revealed === "true") return;
  item.dataset.revealed = "true";
  if (revealObserver) revealObserver.unobserve(item);
  if (gsap) gsap.set(item, { opacity: 1, y: 0, scale: 1, clearProps: "transform" });
  else {
    item.style.opacity = "1";
    item.style.transform = "none";
  }
  animateMotion(item);
}

function revealAnimated(item, delay = 0) {
  if (!item || item.dataset.revealed === "true") return;
  item.dataset.revealed = "true";
  if (revealObserver) revealObserver.unobserve(item);
  gsap.to(item, {
    opacity: 1,
    y: 0,
    scale: 1,
    duration: 0.62,
    delay,
    ease: "power3.out",
    clearProps: "transform",
    overwrite: true,
  });
  animateMotion(item);
}

function revealFallback(item, delay = 0) {
  if (!item || item.dataset.revealed === "true") return;
  item.dataset.revealed = "true";
  if (revealObserver) revealObserver.unobserve(item);
  if (!item.animate) {
    item.style.opacity = "1";
    item.style.transform = "none";
    animateMotion(item);
    return;
  }
  item.style.opacity = "0";
  item.style.transform = "translateY(22px) scale(0.985)";
  const animation = item.animate(
    [
      { opacity: 0, transform: "translateY(22px) scale(0.985)" },
      { opacity: 1, transform: "none" },
    ],
    { duration: 620, delay, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" }
  );
  animation.onfinish = () => {
    item.style.opacity = "1";
    item.style.transform = "none";
    animateMotion(item);
  };
}

function revealPassedItems() {
  if (!revealPending.length || revealScrollQueued) return;
  revealScrollQueued = true;
  requestAnimationFrame(() => {
    revealScrollQueued = false;
    revealPending = revealPending.filter((item) => {
      if (!item.isConnected || item.dataset.revealed === "true") return false;
      if (item.getBoundingClientRect().bottom < 0) {
        revealInstant(item);
        return false;
      }
      return true;
    });
  });
}

function revealView(view) {
  if (!view) return;
  const token = ++revealToken;
  if (revealObserver) revealObserver.disconnect();
  const items = $$("[data-reveal]", view);
  if (!items.length) return;
  items.forEach((item) => delete item.dataset.revealed);

  if (reduced()) {
    items.forEach((item) => {
      item.dataset.revealed = "true";
      item.style.opacity = "1";
      item.style.transform = "none";
      animateMotion(item);
    });
    revealPending = [];
    return;
  }

  if (gsap) gsap.killTweensOf(items);
  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (token !== revealToken) return;
        if (!entry.isIntersecting) {
          if (entry.boundingClientRect.bottom < 0) revealInstant(entry.target);
          return;
        }
        if (gsap) revealAnimated(entry.target);
        else revealFallback(entry.target);
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
  );

  items.forEach((item, index) => {
    if (gsap) gsap.set(item, { opacity: 0, y: 22, scale: 0.985 });
    else {
      item.style.opacity = "0";
      item.style.transform = "translateY(22px) scale(0.985)";
    }
    const rect = item.getBoundingClientRect();
    const inView = rect.top < window.innerHeight * 0.92 && rect.bottom > 40;
    if (inView) {
      if (gsap) revealAnimated(item, Math.min(index * 0.045, 0.32));
      else revealFallback(item, Math.min(index * 0.045, 0.32));
    } else {
      revealObserver.observe(item);
    }
  });

  revealPending = items.filter((item) => item.dataset.revealed !== "true");
}

/* --------------------------------------------------------------------------
   Overview
   -------------------------------------------------------------------------- */

function renderMetrics() {
  const root = $("#metrics");
  if (!root) return;
  root.innerHTML = METRICS.map((metric) => {
    const prefix = metric.prefix || "";
    return `
      <article class="metric" data-reveal>
        <div class="metric-top">
          <span class="metric-icon">${icon(metric.icon)}</span>
          <span class="badge ${metric.delta >= 0 ? "badge-positive" : "badge-negative"}">
            ${icon(metric.delta >= 0 ? "i-arrow-up-right" : "i-arrow-down-right", "icon icon-xs")}
            ${Math.abs(metric.delta).toFixed(1)}%
          </span>
        </div>
        <div class="metric-value mono" data-counter="${metric.value}" data-prefix="${prefix}">
          ${prefix}${fmtInt.format(metric.value)}
        </div>
        <div class="metric-label">${metric.label}</div>
        ${sparkSvg(metric.spark, "metric-spark")}
      </article>`;
  }).join("");
}

function renderOverviewTracks() {
  const root = $("#overviewTracks");
  if (!root) return;
  root.innerHTML = TRACKS.map(
    (track, index) => `
      <button class="mini-track" type="button" data-open-track="${index}">
        <span class="mini-rank">${String(index + 1).padStart(2, "0")}</span>
        <span class="thumb ${track.thumb}" aria-hidden="true"></span>
        <span class="mini-track-meta">
          <strong>${track.name}</strong>
          <span>${fmtInt.format(track.streams)} streams</span>
        </span>
        <span class="mini-track-trend ${track.delta >= 0 ? "positive" : "negative"}">${formatDelta(track.delta)}</span>
      </button>`
  ).join("");
}

function renderOverviewPlatforms() {
  const root = $("#overviewPlatforms");
  if (!root) return;
  root.innerHTML = PLATFORMS.map(
    (platform) => `
      <div class="mini-platform">
        <span class="platform-mark ${platform.mark}" aria-hidden="true">${platform.letter}</span>
        <div class="mini-platform-meta">
          <strong>${platform.name}</strong>
          <span>${platform.share}%</span>
        </div>
        <span class="mini-platform-value" data-counter="${platform.listeners / 1000}" data-decimals="1" data-suffix="K">${(platform.listeners / 1000).toFixed(1)}K</span>
        <span class="mini-bar"><i style="--value:${platform.share}%"></i></span>
      </div>`
  ).join("");
}

function renderOverviewCity() {
  const root = $("#overviewTopCity");
  if (!root) return;
  const city = CITIES[0];
  root.innerHTML = `
    <div class="mini-city-info">
      <span class="kicker">Fastest growing</span>
      <strong>${city.name}</strong>
      <span>${(city.listeners / 1000).toFixed(1)}K listeners</span>
    </div>
    <span class="mini-city-trend positive">${formatDelta(city.delta)}</span>`;
}

function renderOverviewActivity() {
  const root = $("#overviewActivity");
  if (!root) return;
  root.innerHTML = activityItems
    .slice(0, 4)
    .map(
      (item) => `
        <li>
          <span class="feed-dot" aria-hidden="true"></span>
          <span>${item.html}</span>
          <time>${item.time}</time>
        </li>`
    )
    .join("");
}

function renderWave() {
  const wave = $("#wave");
  if (!wave) return;
  const random = mulberry32(812);
  let markup = "";
  for (let i = 0; i < 38; i += 1) {
    const envelope = 0.45 + 0.55 * Math.abs(Math.sin(i * 0.55 + 0.8));
    const texture = 0.5 + 0.5 * Math.abs(Math.sin(i * 1.9 + 1.3));
    const height = Math.round(7 + envelope * texture * 25 + random() * 3);
    const duration = (0.85 + random() * 0.7).toFixed(2);
    const delay = (-random() * 1.4).toFixed(2);
    const opacity = (0.45 + envelope * 0.5).toFixed(2);
    markup += `<span class="wave-bar" style="height:${height}px;opacity:${opacity};animation-duration:${duration}s;animation-delay:${delay}s"></span>`;
  }
  wave.innerHTML = markup;
  wave.classList.toggle("is-paused", !state.playing);
}

function renderPulseChart(animate = true) {
  const root = $("#overviewChart");
  if (!root) return;
  const width = root.clientWidth || 560;
  const height = root.clientHeight || 132;
  const random = mulberry32(77);
  const count = 26;
  const values = [];
  for (let i = 0; i < count; i += 1) {
    const progress = i / (count - 1);
    const trend = 0.3 + 0.7 * Math.pow(progress, 1.15);
    const rhythm = 1 + 0.08 * Math.sin(progress * Math.PI * 4.4 + 0.8);
    values.push(trend * rhythm * (0.92 + random() * 0.16));
  }
  const pad = 6;
  const points = values.map((value, index) => [
    pad + (index / (count - 1)) * (width - pad * 2),
    height - pad - value * (height - pad * 2),
  ]);
  const line = monotonePath(points);
  const last = points[points.length - 1];
  const area = `${line} L ${last[0]} ${height} L ${points[0][0]} ${height} Z`;

  root.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="pulseGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#d96132" stop-opacity="0.24"/>
          <stop offset="1" stop-color="#d96132" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path class="pulse-area" d="${area}"/>
      <path class="pulse-line" d="${line}"/>
      <circle class="pulse-dot-halo" cx="${last[0]}" cy="${last[1]}" r="8"/>
      <circle class="pulse-dot" cx="${last[0]}" cy="${last[1]}" r="3.2"/>
    </svg>`;

  if (animate) drawPath($(".pulse-line", root), 1.15, 0.1);
}

function duplicateMarquee() {
  const track = $("#marqueeTrack");
  if (!track || track.dataset.ready) return;
  track.innerHTML += track.innerHTML;
  track.dataset.ready = "true";
}

/* --------------------------------------------------------------------------
   Streams
   -------------------------------------------------------------------------- */

const chartState = { data: null, geometry: null };

function buildChartData(range) {
  const config = RANGE_CONFIG[range];
  const count = config.points;
  const random = mulberry32(config.seed);
  const raw = [];

  for (let i = 0; i < count; i += 1) {
    const progress = count === 1 ? 1 : i / (count - 1);
    const trend = 0.72 + 0.55 * Math.pow(progress, 1.12);
    const rhythm = 1 + 0.1 * Math.sin((i / (config.step === 7 ? 1.6 : 7)) * Math.PI * 2 + 1.1);
    const noise = 0.9 + random() * 0.2;
    raw.push(Math.max(0.2, trend * rhythm * noise));
  }

  const rawTotal = raw.reduce((sum, value) => sum + value, 0);
  const current = raw.map((value) => Math.round((value / rawTotal) * config.total));
  current[current.length - 1] += config.total - current.reduce((sum, value) => sum + value, 0);

  const previousTotal = Math.round(config.total / (1 + config.delta / 100));
  const previousRandom = mulberry32(config.seed + 13);
  const previousRaw = raw.map((value) => value * (0.9 + previousRandom() * 0.2));
  const previousRawTotal = previousRaw.reduce((sum, value) => sum + value, 0);
  const previous = previousRaw.map((value) => Math.round((value / previousRawTotal) * previousTotal));
  previous[previous.length - 1] += previousTotal - previous.reduce((sum, value) => sum + value, 0);

  const dates = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(TODAY);
    date.setDate(date.getDate() - (count - 1 - i) * config.step);
    dates.push(date);
  }

  return { current, previous, dates, total: config.total, previousTotal, delta: config.delta, config };
}

function positionSegThumb() {
  const group = $("#rangeGroup");
  if (!group) return;
  const active = $(".seg-btn.is-active", group);
  const thumb = $(".seg-thumb", group);
  if (!active || !thumb) return;
  thumb.style.width = `${active.offsetWidth}px`;
  thumb.style.transform = `translateX(${active.offsetLeft - 3}px)`;
}

function renderStreamChart(animate = true) {
  const svg = $("#streamChart");
  const wrap = svg ? svg.closest(".chart-wrap") : null;
  if (!svg || !wrap) return;
  const width = wrap.clientWidth;
  const height = wrap.clientHeight;
  if (!width || !height) return;

  const data = buildChartData(state.range);
  chartState.data = data;

  const compact = width < 520;
  const pad = { top: 16, right: compact ? 10 : 14, bottom: 26, left: compact ? 38 : 46 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const count = data.current.length;
  const dataMax = Math.max(...data.current, ...data.previous);
  const step = niceStep((dataMax * 1.08) / 4);
  const max = step * 4;
  const xAt = (index) => pad.left + (count === 1 ? innerWidth / 2 : (index / (count - 1)) * innerWidth);
  const yAt = (value) => pad.top + innerHeight - (value / max) * innerHeight;

  const currentPoints = data.current.map((value, index) => [xAt(index), yAt(value)]);
  const previousPoints = data.previous.map((value, index) => [xAt(index), yAt(value)]);
  const currentPath = monotonePath(currentPoints);
  const previousPath = monotonePath(previousPoints);
  const baseY = pad.top + innerHeight;
  const areaPath = `${currentPath} L ${xAt(count - 1)} ${baseY} L ${xAt(0)} ${baseY} Z`;

  let gridMarkup = "";
  for (let i = 0; i <= 4; i += 1) {
    const value = (max / 4) * i;
    const y = yAt(value);
    gridMarkup += `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}"/>`;
    gridMarkup += `<text x="${pad.left - 8}" y="${y}" text-anchor="end" dominant-baseline="middle">${formatCompact(value)}</text>`;
  }

  const labelCount = compact ? 3 : count > 20 ? 5 : 4;
  const labelIndexes = [];
  for (let i = 0; i < labelCount; i += 1) {
    labelIndexes.push(Math.round((i * (count - 1)) / (labelCount - 1)));
  }
  const uniqueIndexes = Array.from(new Set(labelIndexes));
  let labelsMarkup = "";
  uniqueIndexes.forEach((index, position) => {
    const anchor = position === 0 ? "start" : position === uniqueIndexes.length - 1 ? "end" : "middle";
    const label = state.range === "7D" ? weekdayShort.format(data.dates[index]) : shortDate.format(data.dates[index]);
    labelsMarkup += `<text x="${xAt(index)}" y="${height - 6}" text-anchor="${anchor}">${label}</text>`;
  });

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `
    <defs>
      <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d96132" stop-opacity="0.24"/>
        <stop offset="1" stop-color="#d96132" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <g class="chart-grid">${gridMarkup}</g>
    <g class="chart-axis">${labelsMarkup}</g>
    <path class="chart-area" d="${areaPath}"/>
    <path class="chart-prev" d="${previousPath}"/>
    <path class="chart-line" d="${currentPath}"/>
    <g class="chart-hover" hidden>
      <line class="chart-crosshair" y1="${pad.top}" y2="${baseY}"/>
      <circle class="chart-dot" r="3.8"/>
    </g>`;

  chartState.geometry = { pad, innerWidth, innerHeight, width, height, count, xAt, yAt, max };

  const totalElement = $("#streamTotal");
  if (totalElement) {
    const previousValue = Number(totalElement.dataset.value) || 0;
    totalElement.dataset.value = String(data.total);
    animateNumber(totalElement, data.total, { from: previousValue, duration: 0.8 });
  }

  const badge = $(".chart-total-line .badge");
  if (badge) {
    badge.className = "badge badge-positive";
    badge.innerHTML = `${icon("i-arrow-up-right", "icon icon-xs")}${data.delta.toFixed(1)}%`;
  }

  const description = $("#chartDesc");
  if (description) {
    const granularity = state.range === "90D" ? "Weekly streams" : "Daily streams";
    description.textContent = `${granularity} for the ${data.config.label}. The current period is trending ${data.delta} percent above the previous period.`;
  }

  const tableBody = $("#chartData tbody");
  const tableCaption = $("#chartData caption");
  if (tableBody && tableCaption) {
    tableCaption.textContent = `Streams for the ${data.config.label} (${state.range === "90D" ? "weekly" : "daily"} values)`;
    tableBody.replaceChildren(...data.dates.map((date, index) => {
      const row = document.createElement("tr");
      [shortDate.format(date), fmtInt.format(data.current[index]), fmtInt.format(data.previous[index])].forEach((value, column) => {
        const cell = document.createElement(column === 0 ? "th" : "td");
        if (column === 0) cell.scope = "row";
        cell.textContent = value;
        row.appendChild(cell);
      });
      return row;
    }));
  }

  if (animate) {
    const line = $(".chart-line", svg);
    const area = $(".chart-area", svg);
    drawPath(line, 1.05, 0.05);
    if (gsap && !reduced() && area) {
      gsap.fromTo(area, { opacity: 0 }, { opacity: 1, duration: 0.7, delay: 0.15 });
    }
  }

  positionSegThumb();
}

function hideChartHover() {
  const tip = $("#chartTip");
  const hover = $("#streamChart .chart-hover");
  if (tip) tip.hidden = true;
  if (hover) hover.setAttribute("hidden", "");
}

function initChartHover() {
  const svg = $("#streamChart");
  const wrap = svg ? svg.closest(".chart-wrap") : null;
  const tip = $("#chartTip");
  if (!svg || !wrap || !tip) return;

  const move = (event) => {
    const geometry = chartState.geometry;
    const data = chartState.data;
    if (!geometry || !data) return;

    const rect = wrap.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    if (
      px < geometry.pad.left - 10 ||
      px > rect.width - geometry.pad.right + 10 ||
      py < 0 ||
      py > rect.height
    ) {
      hideChartHover();
      return;
    }

    const index = clamp(
      Math.round(((px - geometry.pad.left) / geometry.innerWidth) * (geometry.count - 1)),
      0,
      geometry.count - 1
    );
    const x = geometry.xAt(index);
    const y = geometry.yAt(data.current[index]);

    const hover = $(".chart-hover", svg);
    const line = $(".chart-crosshair", svg);
    const dot = $(".chart-dot", svg);
    if (!hover || !line || !dot) return;

    line.setAttribute("x1", String(x));
    line.setAttribute("x2", String(x));
    dot.setAttribute("cx", String(x));
    dot.setAttribute("cy", String(y));
    hover.removeAttribute("hidden");

    tip.innerHTML = `<span>${tooltipDate.format(data.dates[index])}</span>
      <strong>${fmtInt.format(data.current[index])}</strong>
      <span>Previous ${fmtInt.format(data.previous[index])}</span>`;
    tip.hidden = false;

    const tipWidth = tip.offsetWidth;
    const left = clamp(x, tipWidth / 2 + 8, rect.width - tipWidth / 2 - 8);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(y, 54)}px`;
  };

  let touchHideTimer = 0;
  wrap.addEventListener("pointermove", move);
  wrap.addEventListener("pointerleave", hideChartHover);
  wrap.addEventListener("pointercancel", hideChartHover);

  /* Touch has no hover: a tap shows the tooltip, then it fades on its own. */
  wrap.addEventListener("pointerdown", (event) => {
    move(event);
    if (event.pointerType !== "touch") return;
    window.clearTimeout(touchHideTimer);
    touchHideTimer = window.setTimeout(hideChartHover, 2600);
  });
}

function initRange() {
  const group = $("#rangeGroup");
  if (!group) return;
  $$(".seg-btn", group).forEach((button) => {
    button.addEventListener("click", () => {
      if (button.classList.contains("is-active")) return;
      $$(".seg-btn", group).forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      state.range = button.dataset.range;
      hideChartHover();
      positionSegThumb();
      renderStreamChart(true);
    });
  });

  if ("ResizeObserver" in window) {
    let timer = 0;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        hideChartHover();
        renderStreamChart(false);
        positionSegThumb();
      }, 100);
    });
    observer.observe($("#streamChart").closest(".chart-wrap"));
  }

  window.addEventListener("resize", positionSegThumb);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(positionSegThumb);
  }
}

function renderStreamPlatforms() {
  const root = $("#streamPlatforms");
  if (!root) return;
  root.innerHTML = PLATFORMS.map(
    (platform) => `
      <div class="platform-row">
        <span class="platform-mark ${platform.mark}" aria-hidden="true">${platform.letter}</span>
        <div class="platform-meta">
          <div class="platform-line">
            <strong>${platform.name}</strong>
            <span><span data-counter="${platform.listeners / 1000}" data-decimals="1" data-suffix="K">${(platform.listeners / 1000).toFixed(1)}K</span> · ${platform.share}%</span>
          </div>
          <div class="platform-bar"><i style="--value:${platform.share}%"></i></div>
        </div>
        <span class="platform-delta ${platform.delta >= 0 ? "positive" : "negative"}">${formatDelta(platform.delta)}</span>
      </div>`
  ).join("");
}

function renderCities(rootSelector) {
  const root = $(rootSelector);
  if (!root) return;
  const max = Math.max(...CITIES.map((city) => city.listeners));
  root.innerHTML = CITIES.map(
    (city, index) => `
      <li class="city-row">
        <span class="city-rank">${String(index + 1).padStart(2, "0")}</span>
        <div class="city-meta">
          <div class="city-line">
            <strong>${city.name}</strong>
            <span data-counter="${city.listeners / 1000}" data-decimals="1" data-suffix="K">${(city.listeners / 1000).toFixed(1)}K</span>
          </div>
          <div class="city-bar"><i style="--value:${(city.listeners / max) * 100}%"></i></div>
        </div>
        <span class="city-delta positive">${formatDelta(city.delta)}</span>
      </li>`
  ).join("");
}

function renderMilestones(rootSelector, limit = 4) {
  const root = $(rootSelector);
  if (!root) return;
  root.innerHTML = MILESTONES.slice(0, limit)
    .map(
      (item) => `
        <div class="milestone ${item.done ? "is-done" : ""}">
          <div class="milestone-head">
            <strong>${item.label}</strong>
            <span>${item.status}</span>
          </div>
          <div class="milestone-bar"><i style="--value:${item.value}%"></i></div>
          <div class="milestone-meta"><span>${item.left}</span><span>${item.right}</span></div>
        </div>`
    )
    .join("");
}

function renderHeatmap() {
  const grid = $("#heatGrid");
  if (!grid) return;
  const dayBase = [42, 68, 54, 72, 61, 78, 58];
  const random = mulberry32(20261104);
  const monday = new Date(TODAY);
  const offset = (TODAY.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - offset - 77);

  let markup = "";
  for (let week = 0; week < 12; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(monday);
      date.setDate(date.getDate() + week * 7 + day);
      if (date > TODAY) {
        markup += `<span class="heat-cell is-future" aria-hidden="true"></span>`;
        continue;
      }
      const trend = 0.68 + (week / 11) * 0.5;
      const noise = 0.82 + random() * 0.36;
      const level = Math.round(clamp(dayBase[day] * trend * noise, 6, 100));
      const streams = Math.round(320 + level * 92);
      const bucket = level < 40 ? "h1" : level < 55 ? "h2" : level < 72 ? "h3" : "h4";
      markup += `<span class="heat-cell ${bucket}" data-streams="${streams}" data-date="${date.toISOString()}" aria-hidden="true"></span>`;
    }
  }
  grid.innerHTML = markup;

  const tip = $("#heatTip");
  const figure = grid.closest(".heatmap-figure");
  if (!tip || !figure) return;

  const show = (event) => {
    const cell = event.target.closest(".heat-cell");
    if (!cell || !cell.dataset.streams) {
      tip.hidden = true;
      return;
    }
    const cellRect = cell.getBoundingClientRect();
    const figureRect = figure.getBoundingClientRect();
    tip.innerHTML = `<strong>${fmtInt.format(Number(cell.dataset.streams))}</strong> streams · ${tooltipDate.format(new Date(cell.dataset.date))}`;
    tip.hidden = false;
    tip.style.left = `${clamp(cellRect.left - figureRect.left + cellRect.width / 2, 70, figureRect.width - 70)}px`;
    tip.style.top = `${Math.max(cellRect.top - figureRect.top, 24)}px`;
  };

  let touchHideTimer = 0;
  grid.addEventListener("pointerover", show);
  grid.addEventListener("pointermove", show);
  grid.addEventListener("pointerleave", () => {
    tip.hidden = true;
  });
  grid.addEventListener("pointerdown", (event) => {
    show(event);
    if (event.pointerType !== "touch") return;
    window.clearTimeout(touchHideTimer);
    touchHideTimer = window.setTimeout(() => {
      tip.hidden = true;
    }, 2600);
  });
}

/* --------------------------------------------------------------------------
   Tracks
   -------------------------------------------------------------------------- */

function filteredTracks() {
  return TRACKS.map((track, index) => ({ track, index })).filter(({ track }) => {
    if (state.trackFilter === "rising") return track.delta > 0;
    if (state.trackFilter === "cooling") return track.delta < 0;
    return true;
  });
}

function renderTrackTable(animate = true) {
  const body = $("#trackTableBody");
  if (!body) return;
  const rows = filteredTracks();
  body.innerHTML = rows
    .map(({ track, index }) => {
      const spark = sparkSvg(track.spark, "", 84, 24, track.delta >= 0 ? "up" : "down");
      return `
        <tr>
          <td class="col-rank"><span class="rank-number">${String(index + 1).padStart(2, "0")}</span></td>
          <td>
            <button class="track-row-button" type="button" data-open-track="${index}">
              <span class="thumb ${track.thumb}" aria-hidden="true"></span>
              <span class="track-cell-meta">
                <strong>${track.name}</strong>
                <span>${track.type} · ${track.length}<em class="track-mobile-delta ${track.delta >= 0 ? "delta-up" : "delta-down"}">${formatDelta(track.delta)}</em></span>
              </span>
            </button>
          </td>
          <td class="num">${fmtInt.format(track.streams)}</td>
          <td class="num col-share">
            <span class="share-cell">
              <span>${track.share}%</span>
              <span class="share-bar"><i style="--value:${track.share}%"></i></span>
            </span>
          </td>
          <td class="col-trend"><span class="trend-cell">${spark}</span></td>
          <td class="num col-delta ${track.delta >= 0 ? "delta-up" : "delta-down"}">${formatDelta(track.delta)}</td>
        </tr>`;
    })
    .join("");

  if (animate && gsap && !reduced()) {
    gsap.fromTo(
      $$("tr", body),
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.45, stagger: 0.05, ease: "power2.out", clearProps: "transform" }
    );
    animateBars(body);
  }
}

function initTrackFilters() {
  const group = $("#trackFilter");
  if (!group) return;
  $$(".chip", group).forEach((chip) => {
    chip.setAttribute("aria-pressed", String(chip.classList.contains("is-active")));
    chip.addEventListener("click", () => {
      if (chip.classList.contains("is-active")) return;
      $$(".chip", group).forEach((item) => {
        const active = item === chip;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      state.trackFilter = chip.dataset.filter;
      renderTrackTable(true);
    });
  });
}

function renderReleases() {
  const root = $("#releaseGrid");
  if (!root) return;
  root.innerHTML = TRACKS.map(
    (track, index) => `
      <article class="release-card" data-reveal data-track-index="${index}">
        <div class="release-art ${track.art}">
          <span class="release-tag">${track.type}</span>
          <button class="release-play" type="button" data-play-feature aria-label="Play preview of ${track.name}">
            ${icon("i-play")}
          </button>
        </div>
        <div class="release-info">
          <strong>${track.name}</strong>
          <span>${track.released} · ${formatCompact(track.streams)} streams</span>
        </div>
      </article>`
  ).join("");
}

function trackSparkSvg(track, width = 560, height = 132) {
  const { line, area, last } = sparkGeometry(track.spark, width, height, 6);
  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="trackGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#d96132" stop-opacity="0.22"/>
          <stop offset="1" stop-color="#d96132" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path fill="url(#trackGradient)" d="${area}"/>
      <path class="chart-line" d="${line}"/>
      <circle class="chart-dot" cx="${last[0]}" cy="${last[1]}" r="3.4"/>
    </svg>`;
}

function openTrackDialog(index) {
  const track = TRACKS[index];
  const dialog = $("#trackDialog");
  if (!track || !dialog) return;
  state.activeTrack = index;

  $("#trackDialogTitle").textContent = track.name;
  $("#trackDialogMeta").textContent = `Mira Vale · ${track.type} · ${track.length} · Released ${track.released}`;
  $("#trackDialogStats").innerHTML = `
    <div class="td-stat"><span>Streams</span><strong>${fmtInt.format(track.streams)}</strong></div>
    <div class="td-stat"><span>Catalog share</span><strong>${track.share}%</strong></div>
    <div class="td-stat"><span>30 days</span><strong class="${track.delta >= 0 ? "delta-up" : "delta-down"}">${formatDelta(track.delta)}</strong></div>`;

  const chart = $("#trackDialogChart");
  if (chart) chart.innerHTML = trackSparkSvg(track);

  const next = Math.ceil((track.streams + 1) / 500000) * 500000;
  const percent = (track.streams / next) * 100;
  const label = $("#trackDialogProgressLabel");
  const value = $("#trackDialogProgressValue");
  const bar = $("#trackDialogProgress");
  if (label) label.textContent = `Next milestone · ${formatCompact(next)}`;
  if (value) value.textContent = `${percent.toFixed(1)}%`;
  if (bar) bar.style.setProperty("--value", `${percent}%`);

  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");

  requestAnimationFrame(() => {
    animateBars(dialog);
    drawPath($(".chart-line", chart), 1, 0.05);
  });
}

/* --------------------------------------------------------------------------
   Audience
   -------------------------------------------------------------------------- */

const RING_COLORS = {
  Spotify: "oklch(0.62 0.14 150)",
  "Apple Music": "oklch(0.44 0.03 300)",
  YouTube: "oklch(0.62 0.2 28)",
  SoundCloud: "oklch(0.68 0.15 55)",
};

function renderGlobeCities() {
  const root = $("#globeCities");
  if (!root) return;
  root.innerHTML = CITIES.slice(0, 4)
    .map(
      (city) =>
        `<span class="globe-city"><i></i>${city.name} <strong>${(city.listeners / 1000).toFixed(1)}K</strong></span>`
    )
    .join("");
}

function renderPlatformRings() {
  const root = $("#audiencePlatforms");
  if (!root) return;
  root.innerHTML = PLATFORMS.map((platform) => {
    const target = 125.66 * (1 - platform.share / 100);
    return `
      <div class="platform-ring">
        <div class="ring-mini" data-share="${platform.share}" style="--ring-color:${RING_COLORS[platform.name]};--offset:${target}">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle class="mini-bg" cx="24" cy="24" r="20"/>
            <circle class="mini-fg" cx="24" cy="24" r="20"/>
          </svg>
          <strong>${platform.share}%</strong>
        </div>
        <span>${platform.name} <em>${(platform.listeners / 1000).toFixed(1)}K</em></span>
      </div>`;
  }).join("");
}

function animatePlatformRings(root = document) {
  $$(".ring-mini", root).forEach((ring, index) => {
    const share = Number(ring.dataset.share);
    const target = 125.66 * (1 - share / 100);
    const circle = $(".mini-fg", ring);
    const label = $("strong", ring);
    if (!circle) return;
    if (!gsap || reduced()) {
      circle.style.strokeDashoffset = String(target);
      if (label) label.textContent = `${Math.round(share)}%`;
      return;
    }
    gsap.fromTo(
      circle,
      { strokeDashoffset: 125.66 },
      { strokeDashoffset: target, duration: 1.1, delay: index * 0.08, ease: "power3.out", overwrite: true }
    );
    if (label) animateNumber(label, share, { suffix: "%", duration: 1.05 });
  });
}

function renderDemographics() {
  const root = $("#demographics");
  if (!root) return;
  root.innerHTML = DEMOGRAPHICS.map(
    (item) => `
      <div class="demo-row">
        <span class="demo-label">${item.label}</span>
        <div class="demo-bar"><i style="--value:${item.value}%"></i></div>
        <span class="demo-value" data-counter="${item.value}" data-suffix="%">${item.value}%</span>
      </div>`
  ).join("");
}

function renderGrowth() {
  const root = $("#growthChart");
  if (!root) return;
  const max = Math.max(...GROWTH);
  root.innerHTML = GROWTH.map(
    (value, index) =>
      `<span class="growth-bar" style="--h:${(value / max) * 100}%;" title="${value}K listeners" aria-hidden="true" data-index="${index}"></span>`
  ).join("");
}

function animateGrowth(root = document) {
  const bars = $$("#growthChart .growth-bar", root);
  if (!bars.length) return;
  if (!gsap || reduced()) {
    bars.forEach((bar) => {
      bar.style.transform = "none";
    });
    return;
  }
  gsap.fromTo(
    bars,
    { scaleY: 0 },
    { scaleY: 1, duration: 0.8, stagger: 0.035, ease: "power3.out", transformOrigin: "bottom center", overwrite: true }
  );
}

function renderListeners() {
  const root = $("#newListeners");
  if (!root) return;
  root.innerHTML = LISTENERS.map(
    (listener) => `
      <li class="listener-row">
        <span class="listener-avatar ${listener.tone}" aria-hidden="true">${listener.initials}</span>
        <div class="listener-meta">
          <strong>${listener.name}</strong>
          <span>${listener.meta}</span>
        </div>
        <span class="listener-time">${listener.time}</span>
      </li>`
  ).join("");
}

/* --------------------------------------------------------------------------
   Activity
   -------------------------------------------------------------------------- */

function renderActivityStats() {
  const root = $("#activityStats");
  if (!root) return;
  root.innerHTML = ACTIVITY_STATS.map(
    (stat) => `
      <article class="stat-card" data-reveal>
        <div class="metric-top">
          <span class="metric-icon">${icon(stat.icon)}</span>
          <span class="badge badge-positive">${icon("i-arrow-up-right", "icon icon-xs")}${stat.delta}</span>
        </div>
        <div class="stat-value mono" data-counter="${String(stat.value).replace(/,/g, "")}">${stat.value}</div>
        <div class="stat-label">${stat.label}</div>
      </article>`
  ).join("");
}

function renderFeed(highlight = false) {
  const feed = $("#feed");
  if (!feed) return;
  const items = activityItems.filter((item) => {
    if (state.activityFilter === "all") return true;
    return item.type === state.activityFilter;
  });
  feed.innerHTML = items
    .map(
      (item) => `
        <li class="feed-item" data-type="${item.type}">
          <span class="feed-icon" aria-hidden="true">${icon(item.icon)}</span>
          <div class="feed-body">
            <p>${item.html}</p>
            <span class="feed-meta">${item.meta}</span>
          </div>
          <time>${item.time}</time>
        </li>`
    )
    .join("");

  if (highlight && feed.firstElementChild && gsap && !reduced()) {
    gsap.fromTo(
      feed.firstElementChild,
      { opacity: 0, y: -10 },
      { opacity: 1, y: 0, duration: 0.45, ease: "power2.out", clearProps: "transform" }
    );
  }
}

function initActivityFilters() {
  const group = $("#activityFilter");
  if (!group) return;
  $$(".chip", group).forEach((chip) => {
    chip.setAttribute("aria-pressed", String(chip.classList.contains("is-active")));
    chip.addEventListener("click", () => {
      if (chip.classList.contains("is-active")) return;
      $$(".chip", group).forEach((item) => {
        const active = item === chip;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      state.activityFilter = chip.dataset.filter;
      renderFeed();
    });
  });
}

function renderSettings() {
  const root = $("#settingsList");
  if (!root) return;
  root.innerHTML = SETTINGS.map(
    (setting) => `
      <label class="switch-row">
        <span class="switch-copy">
          <strong>${setting.title}</strong>
          <span>${setting.sub}</span>
        </span>
        <span class="switch">
          <input type="checkbox" data-setting="${setting.key}" ${setting.checked ? "checked" : ""}>
          <span class="switch-track"><span class="switch-knob"></span></span>
        </span>
      </label>`
  ).join("");
}

function compactValue(value) {
  const number = parseFloat(value);
  if (/m$/i.test(value)) return number * 1000000;
  if (/k$/i.test(value)) return number * 1000;
  return number;
}

function renderSourceAccounts() {
  const root = $("#sourceAccounts");
  if (!root) return;
  root.innerHTML = SOURCE_ACCOUNTS.map(
    (account) => `
      <article class="card source-account" data-reveal data-tilt data-source="${account.name}">
        <div class="source-account-head">
          <span class="platform-mark ${account.mark}" aria-hidden="true">${account.letter}</span>
          <div class="source-account-meta">
            <strong>${account.name}</strong>
            <span>${account.note}</span>
          </div>
          <span class="source-status"><i></i>${account.status}</span>
        </div>
        <div class="source-account-stats">
          <div><strong data-counter="${compactValue(account.primary)}" data-format="compact">${account.primary}</strong><span>${account.primaryLabel}</span></div>
          <div><strong data-counter="${compactValue(account.secondary)}" data-format="compact">${account.secondary}</strong><span>${account.secondaryLabel}</span></div>
          <div><strong data-counter="${compactValue(account.audience)}" data-format="compact">${account.audience}</strong><span>${account.audienceLabel || "listeners"}</span></div>
        </div>
        <div class="source-bar" aria-hidden="true"><i style="--value:${account.coverage}%"></i></div>
        <div class="source-account-tags"><span>${account.coverage}% coverage</span><span>${account.sync}</span></div>
      </article>`
  ).join("");
}

function renderSourceHealth() {
  const root = $("#sourceHealth");
  if (!root) return;
  root.innerHTML = SOURCE_HEALTH.map(
    (item) => `
      <div class="demo-row">
        <span class="demo-label">${item.label}</span>
        <div class="demo-bar"><i style="--value:${item.value}%"></i></div>
        <span class="demo-value" data-counter="${item.value}" data-suffix="%">${item.value}%</span>
      </div>`
  ).join("");
}

function renderSourceSync() {
  const root = $("#sourceSyncLog");
  if (!root) return;
  root.innerHTML = SOURCE_SYNC.map(
    (item) => `
      <li>
        <span class="feed-dot"></span>
        <span>${item.html}</span>
        <time>${item.time}</time>
      </li>`
  ).join("");
}

function renderSources() {
  renderSourceAccounts();
  renderSourceHealth();
  renderSourceSync();
}

/* --------------------------------------------------------------------------
   Public data
   -------------------------------------------------------------------------- */

let publicSignalsLoaded = false;

function sourceCard(name) {
  return $$("#sourceAccounts .source-account").find((card) => card.dataset.source === name) || null;
}

function setSourceMetric(card, index, value, label) {
  const cell = card.querySelectorAll(".source-account-stats > div")[index];
  if (!cell) return;
  const strong = cell.querySelector("strong");
  const name = cell.querySelector("span");
  if (name && label) name.textContent = label;
  if (!strong) return;
  if (Number.isFinite(value)) {
    strong.textContent = fmtCompact.format(value);
    strong.dataset.counter = String(value);
    strong.dataset.format = "compact";
  } else {
    strong.textContent = "—";
    delete strong.dataset.counter;
    delete strong.dataset.format;
  }
}

function setSourceTextMetric(card, index, value, label) {
  const cell = card.querySelectorAll(".source-account-stats > div")[index];
  if (!cell) return;
  const strong = cell.querySelector("strong");
  const name = cell.querySelector("span");
  if (name && label) name.textContent = label;
  if (!strong) return;
  strong.textContent = value || "—";
  strong.title = value || "";
  delete strong.dataset.counter;
  delete strong.dataset.format;
}

function setSourceStatus(card, label, live) {
  const status = card.querySelector(".source-status");
  if (!status) return;
  status.innerHTML = `<i></i>${escapeHtml(label)}`;
  status.classList.toggle("is-muted", !live);
}

function setSourceDetails(card, note, coverage, firstTag, secondTag) {
  const noteElement = card.querySelector(".source-account-meta span");
  if (noteElement) noteElement.textContent = note;
  const bar = card.querySelector(".source-bar i");
  if (bar) bar.style.setProperty("--value", `${Math.max(0, Math.min(100, coverage))}%`);
  const tags = card.querySelectorAll(".source-account-tags span");
  if (tags[0]) tags[0].textContent = firstTag;
  if (tags[1]) tags[1].textContent = secondTag;
}

function hydrateSourceAccount(artist) {
  const spotifyCard = sourceCard("Spotify");
  if (spotifyCard) {
    const data = artist.spotify;
    setSourceMetric(spotifyCard, 0, data?.followers, "followers");
    setSourceMetric(spotifyCard, 1, data?.popularity, "popularity");
    setSourceTextMetric(spotifyCard, 2, data?.topTracks?.[0]?.name, "top track");
    setSourceStatus(spotifyCard, data ? "Synced" : "No data", Boolean(data));
    setSourceDetails(
      spotifyCard,
      data ? `${artist.name} · public catalog` : "Add a Spotify artist ID",
      data ? Math.min(100, 55 + (data.topTracks.length ? 20 : 0) + (data.albums.length ? 25 : 0)) : 0,
      data ? `${data.albums.length} releases scanned` : "Awaiting public ID",
      data ? "Spotify Web API" : "Public metadata"
    );
  }

  const youtubeCard = sourceCard("YouTube");
  if (youtubeCard) {
    const data = artist.youtube;
    setSourceMetric(youtubeCard, 0, data?.views, "channel views");
    setSourceMetric(youtubeCard, 1, data?.subscribers, "subscribers");
    setSourceMetric(youtubeCard, 2, data?.videos, "videos");
    setSourceStatus(youtubeCard, data ? "Synced" : "No data", Boolean(data));
    setSourceDetails(
      youtubeCard,
      data ? `${artist.name} · ${data.handle || "public channel"}` : "Add a YouTube channel ID",
      data ? 100 : 0,
      data ? `${data.recentVideos.length} recent videos scanned` : "Awaiting public ID",
      data ? "YouTube Data API" : "Public metadata"
    );
  }
}

function renderPublicSignals(snapshot) {
  const card = $("#publicSignals");
  const list = $("#publicSignalList");
  const meta = $("#publicSignalsMeta");
  if (!card || !list) return;

  const artists = snapshot.artists.filter((artist) => artist.spotify || artist.youtube);
  if (!artists.length) return;

  if (meta) meta.textContent = relativeTime(snapshot.generatedAt);
  list.innerHTML = artists
    .map((artist) => {
      const spotify = artist.spotify;
      const youtube = artist.youtube;
      const sources = [spotify ? "Spotify" : null, youtube ? "YouTube" : null].filter(Boolean).join(" + ");
      return `
        <div class="public-signal-row${artist.role === "self" ? " is-self" : ""}">
          <div class="public-signal-artist">
            <strong>${escapeHtml(artist.name)}</strong>
            <span>${artist.role === "self" ? "You" : "Competitor"} · ${sources || "No public data"}</span>
          </div>
          <div class="public-signal-metric"><strong>${spotify ? fmtCompact.format(spotify.followers) : "—"}</strong><span>followers</span></div>
          <div class="public-signal-metric"><strong>${spotify ? spotify.popularity : "—"}</strong><span>popularity</span></div>
          <div class="public-signal-metric"><strong>${youtube ? fmtCompact.format(youtube.views) : "—"}</strong><span>channel views</span></div>
        </div>`;
    })
    .join("");

  card.hidden = false;
  card.dataset.revealed = "true";
  card.style.opacity = "1";
  card.style.transform = "none";
}

function isValidSnapshot(snapshot) {
  return Boolean(
    snapshot &&
      snapshot.schemaVersion === 1 &&
      Array.isArray(snapshot.artists) &&
      snapshot.artists.length
  );
}

function setDataMode(mode, snapshot) {
  const live = mode === "live";
  const pill = $("#dataPill");
  const label = $("#dataPillLabel");
  if (pill) {
    pill.dataset.mode = live ? "live" : "demo";
    pill.title = live
      ? `Public snapshot generated ${new Date(snapshot.generatedAt).toLocaleString()} — public metadata only, not private streaming totals`
      : "Demo dataset — numbers are illustrative until the ingest pipeline writes data/live.json";
  }
  if (label) label.textContent = live ? "Live data" : "Demo data";
  document.documentElement.dataset.dataMode = live ? "live" : "demo";

  const note = $("#sourceModeNote");
  if (note) {
    note.dataset.mode = live ? "live" : "demo";
    note.innerHTML = live
      ? `<span class="note-dot"></span>Public snapshot generated ${escapeHtml(
          new Date(snapshot.generatedAt).toLocaleString()
        )} — followers, popularity and channel views are real. Streams, saves and geography still need artist-authorised access.`
      : `<span class="note-dot"></span>Demo connections — the source cards below are illustrative until a platform is authorised.`;
  }
}

/* Prefer the server route (which can proxy a hosted snapshot); fall back to the
   static file so the dashboard also works on a plain static host. */
async function fetchSnapshot(signal) {
  const endpoints = ["api/snapshot", "data/live.json"];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal });
      if (!response.ok) continue;
      const snapshot = await response.json();
      if (isValidSnapshot(snapshot)) return snapshot;
    } catch {
      /* Try the next endpoint. */
    }
  }
  return null;
}

async function loadPublicSignals() {
  if (publicSignalsLoaded) return;
  setDataMode("demo");
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3500);
  try {
    const snapshot = await fetchSnapshot(controller.signal);
    if (!snapshot) return;

    publicSignalsLoaded = true;
    const self = snapshot.artists.find((artist) => artist.role === "self") || snapshot.artists[0];
    if (self) hydrateSourceAccount(self);
    renderPublicSignals(snapshot);
    setDataMode("live", snapshot);
    document.documentElement.dataset.publicSignals = "live";
    window.dispatchEvent(new CustomEvent("timbre:public-data", { detail: snapshot }));
  } catch {
    /* Keep the demo state when no public snapshot is available yet. */
  } finally {
    window.clearTimeout(timer);
  }
}

/* Local planning only. Nothing here creates an n8n job or schedules a post. */
function initStudioPlanner() {
  const form = $("#studioForm");
  const list = $("#studioIdeas");
  const message = $("#studioMessage");
  if (!form || !list || !message) return;
  const key = "timbre:studio-ideas:v1";
  let ideas = [];
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    if (Array.isArray(saved)) ideas = saved.filter((item) => item && typeof item.title === "string");
  } catch {
    message.textContent = "Could not read saved drafts on this browser.";
  }
  function render() {
    list.replaceChildren();
    if (!ideas.length) {
      const empty = document.createElement("p");
      empty.className = "studio-empty";
      empty.textContent = "Hakuna ideas bado. Anza na wazo moja hapo upande wa planner.";
      list.append(empty);
      return;
    }
    ideas.forEach((idea, index) => {
      const item = document.createElement("article");
      item.className = "studio-idea";
      const title = document.createElement("strong");
      title.textContent = idea.title;
      const meta = document.createElement("p");
      meta.textContent = `${idea.lane || "Music / YouTube"}${idea.date ? ` · Target: ${idea.date}` : ""} · Draft`;
      item.append(title, meta);
      if (idea.notes) { const notes = document.createElement("p"); notes.className = "studio-idea-notes"; notes.textContent = idea.notes; item.append(notes); }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "studio-remove";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${idea.title}`);
      remove.addEventListener("click", () => {
        const next = ideas.filter((_, i) => i !== index);
        try { localStorage.setItem(key, JSON.stringify(next)); ideas = next; render(); message.textContent = "Draft removed."; }
        catch { message.textContent = "Could not save changes in this browser."; }
      });
      item.append(remove);
      list.append(item);
    });
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    if (!title) { message.textContent = "Please enter a content idea."; return; }
    const next = [{ title, lane: String(data.get("lane") || ""), date: String(data.get("date") || ""), notes: String(data.get("notes") || "").trim() }, ...ideas];
    try { localStorage.setItem(key, JSON.stringify(next)); ideas = next; form.reset(); render(); message.textContent = "Draft saved on this browser — not scheduled or sent."; }
    catch { message.textContent = "Could not save this draft. Check browser storage settings."; }
  });
  $("#studioPlanButton")?.addEventListener("click", () => { $("#studio-planner").scrollIntoView({ behavior: reduced() ? "auto" : "smooth" }); form.elements.title.focus({ preventScroll: true }); });
  render();
}

/* --------------------------------------------------------------------------
   Router & chrome
   -------------------------------------------------------------------------- */

function routeFromHash() {
  const value = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return ROUTES[value] ? value : "studio";
}

function routeProgress() {
  const bar = $("#routeProgress");
  const fill = bar ? bar.querySelector("span") : null;
  if (!bar || !fill || !gsap || reduced()) return;
  gsap.killTweensOf([bar, fill]);
  gsap.set(bar, { opacity: 1 });
  gsap.fromTo(
    fill,
    { scaleX: 0.04 },
    {
      scaleX: 1,
      duration: 0.55,
      ease: "power2.inOut",
      onComplete: () => {
        gsap.to(bar, { opacity: 0, duration: 0.3, delay: 0.08 });
        gsap.set(fill, { scaleX: 0 });
      },
    }
  );
}

function enterView(route) {
  const view = $(`[data-view="${route}"]`);
  if (!view) return;

  if (route === "overview") {
    renderPulseChart(true);
  }

  if (route === "streams") {
    renderStreamChart(true);
    positionSegThumb();
  }

  if (route === "tracks") {
    renderTrackTable(false);
  }

  if (route === "audience") {
    renderGrowth();
    renderPlatformRings();
  }

  if (route === "activity") {
    renderFeed();
  }
}

let routeTransitionId = 0;

function setRoute(route, initial = false) {
  if (!ROUTES[route]) route = "studio";
  const view = $(`[data-view="${route}"]`);
  if (!view) return;
  const outgoing = $$("[data-view]").find((section) => !section.hidden && section !== view);
  const animateRoute = Boolean(!initial && outgoing && gsap && !reduced());
  const transitionId = ++routeTransitionId;
  state.route = route;
  document.body.classList.toggle("is-studio", route === "studio");

  $$("[data-view]").forEach((section) => {
    section.hidden = animateRoute ? section !== outgoing : section !== view;
    if (section !== view && section !== outgoing && gsap) gsap.set(section, { clearProps: "all" });
  });

  $$("[data-route-link]").forEach((link) => {
    const active = link.dataset.routeLink === route;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  const crumb = $("#crumbCurrent");
  if (crumb) crumb.textContent = ROUTES[route].crumb;
  document.title = `${ROUTES[route].title} — Timbre`;
  const announcement = $("#routeAnnouncement");
  if (announcement && !initial) announcement.textContent = `${ROUTES[route].title} page`;

  const dialog = $("#trackDialog");
  if (dialog && dialog.open) dialog.close();
  hideChartHover();
  closeSidebar(false);
  window.scrollTo({ top: 0, behavior: "auto" });
  if (!initial) routeProgress();

  requestAnimationFrame(() => {
    if (transitionId !== routeTransitionId) return;

    if (animateRoute) {
      gsap.killTweensOf(outgoing);
      gsap.set(outgoing, { opacity: 1, y: 0 });
      gsap.to(outgoing, {
        opacity: 0,
        y: -10,
        duration: 0.2,
        ease: "power2.in",
        onComplete: () => {
          if (transitionId !== routeTransitionId) return;
          outgoing.hidden = true;
          gsap.set(outgoing, { clearProps: "all" });
          view.hidden = false;
          enterView(route);
          gsap.set(view, { opacity: 0, y: 16 });
          gsap.to(view, {
            opacity: 1,
            y: 0,
            duration: 0.46,
            ease: "power3.out",
            clearProps: "opacity,transform",
            onStart: () => revealView(view),
          });
          resizeScenes();
        },
      });
      return;
    }

    view.hidden = false;
    if (gsap) gsap.set(view, { clearProps: "opacity,transform" });
    enterView(route);
    revealView(view);
    resizeScenes();
  });
}

function go(route) {
  if (!ROUTES[route]) return;
  if (window.location.hash === `#/${route}`) {
    setRoute(route);
    return;
  }
  window.location.hash = `#/${route}`;
}

function initHeader() {
  const hour = NOW.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const title = $("#overviewTitle");
  const date = $("#todayLabel");
  if (title) title.textContent = `${greeting}, Mira.`;
  if (date) date.textContent = longDate.format(NOW);

  const platform =
    (navigator.userAgentData && navigator.userAgentData.platform) ||
    navigator.platform ||
    "";
  const isMac = /mac|iphone|ipad/i.test(platform);
  $$("[data-kbd]").forEach((element) => {
    element.textContent = isMac ? "⌘K" : "Ctrl K";
  });
}

/* --------------------------------------------------------------------------
   Sidebar
   -------------------------------------------------------------------------- */

let closeScrimTimer = 0;

function closeSidebar(restoreFocus = true) {
  const sidebar = $("#sidebar");
  const scrim = $("#scrim");
  const menuButton = $("#menuBtn");
  if (!sidebar || !sidebar.classList.contains("is-open")) return;

  sidebar.classList.remove("is-open");
  if (menuButton) {
    menuButton.setAttribute("aria-expanded", "false");
    if (restoreFocus) menuButton.focus();
  }
  document.body.classList.remove("is-locked");
  if (scrim) {
    scrim.classList.remove("is-open");
    window.clearTimeout(closeScrimTimer);
    closeScrimTimer = window.setTimeout(() => {
      if (!sidebar.classList.contains("is-open")) scrim.hidden = true;
    }, 300);
  }
}

function openSidebar() {
  const sidebar = $("#sidebar");
  const scrim = $("#scrim");
  const menuButton = $("#menuBtn");
  const closeButton = $("#sidebarClose");
  if (!sidebar || !scrim) return;

  sidebar.classList.add("is-open");
  if (menuButton) menuButton.setAttribute("aria-expanded", "true");
  window.clearTimeout(closeScrimTimer);
  scrim.hidden = false;
  requestAnimationFrame(() => scrim.classList.add("is-open"));
  document.body.classList.add("is-locked");
  window.setTimeout(() => {
    if (closeButton) closeButton.focus();
  }, 60);
}

function initSidebar() {
  const sidebar = $("#sidebar");
  const scrim = $("#scrim");
  const menuButton = $("#menuBtn");
  const closeButton = $("#sidebarClose");
  if (!sidebar || !scrim || !menuButton) return;

  menuButton.addEventListener("click", openSidebar);
  if (closeButton) closeButton.addEventListener("click", () => closeSidebar(true));
  scrim.addEventListener("click", () => closeSidebar(true));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sidebar.classList.contains("is-open")) closeSidebar(true);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1024) closeSidebar(false);
  });

  $$("[data-route-link]").forEach((link) => {
    link.addEventListener("click", () => {
      if (window.innerWidth <= 1024) closeSidebar(false);
      const route = link.dataset.routeLink;
      if (route && window.location.hash === `#/${route}`) {
        window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
      }
    });
  });
}

/* --------------------------------------------------------------------------
   Account
   -------------------------------------------------------------------------- */

let accountFocusReturn = null;

function accountInitials(name, email) {
  const source = (name || email || "").trim();
  if (!source) return "DM";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function applyAccount(data) {
  const user = data?.authenticated && data.user ? data.user : null;
  const name = user?.name || "Demo mode";
  const email = user?.email || "Not signed in";
  const initials = user ? accountInitials(user.name, user.email) : "DM";
  const authenticated = Boolean(user);

  $$("[data-account-name]").forEach((element) => { element.textContent = name; });
  $$("[data-account-email]").forEach((element) => { element.textContent = email; });
  $$("[data-account-avatar]").forEach((element) => { element.textContent = initials; });
  $$("[data-account-status]").forEach((element) => {
    element.textContent = authenticated ? "Signed in" : "Local workspace";
  });

  const badge = $("#accountBadge");
  if (badge) badge.textContent = authenticated ? "Google" : "Demo";

  const note = $("#accountNote");
  if (note) {
    note.textContent = authenticated
      ? `Signed in as ${email}. YouTube Analytics access is next.`
      : "Sign in with Google to keep your workspace tied to you.";
  }

  const primary = $("#accountPrimary");
  if (primary) primary.hidden = authenticated;

  const logout = $("#accountLogout");
  if (logout) {
    logout.hidden = !authenticated;
    logout.disabled = false;
    logout.textContent = "Log out";
  }

  const mode = $("#accountMode");
  if (mode) mode.textContent = authenticated ? "Synced" : "Local";

  const trigger = $("#accountTrigger");
  if (trigger) {
    trigger.setAttribute("aria-label", authenticated ? `Account menu for ${name}` : "Account menu, demo mode");
  }

  document.documentElement.dataset.account = authenticated ? "in" : "out";
}

async function loadAccount() {
  try {
    const response = await fetch("/api/me", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    applyAccount(data);
    if (data?.authRequired && !data.authenticated) {
      const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(`/login.html?next=${encodeURIComponent(here)}`);
    }
  } catch {
    /* Static-only servers do not expose account state; keep demo defaults. */
  }
}

function openAccountMenu(returnFocus = null) {
  const menu = $("#accountMenu");
  const trigger = $("#accountTrigger");
  const sidebarAccount = $("#sidebarAccount");
  if (!menu) return;

  accountFocusReturn = returnFocus;
  menu.hidden = false;
  trigger?.setAttribute("aria-expanded", "true");
  sidebarAccount?.setAttribute("aria-expanded", "true");

  const firstAction = !$("#accountPrimary")?.hidden ? $("#accountPrimary") : $("#accountLogout");
  window.requestAnimationFrame(() => firstAction?.focus());
}

function closeAccountMenu(restoreFocus = true) {
  const menu = $("#accountMenu");
  const trigger = $("#accountTrigger");
  const sidebarAccount = $("#sidebarAccount");
  if (!menu || menu.hidden) return;

  menu.hidden = true;
  trigger?.setAttribute("aria-expanded", "false");
  sidebarAccount?.setAttribute("aria-expanded", "false");

  if (restoreFocus) (accountFocusReturn || trigger)?.focus();
  accountFocusReturn = null;
}

function initAccount() {
  const trigger = $("#accountTrigger");
  const menu = $("#accountMenu");
  const sidebarAccount = $("#sidebarAccount");
  const logout = $("#accountLogout");
  if (!trigger || !menu) return;

  loadAccount();

  trigger.addEventListener("click", () => {
    if (menu.hidden) openAccountMenu(trigger);
    else closeAccountMenu(true);
  });

  sidebarAccount?.addEventListener("click", () => {
    if (window.innerWidth <= 1024) closeSidebar(false);
    if (menu.hidden) openAccountMenu(sidebarAccount);
    else closeAccountMenu(true);
  });

  document.addEventListener("click", (event) => {
    if (menu.hidden) return;
    const target = event.target;
    if (menu.contains(target) || trigger.contains(target) || sidebarAccount?.contains(target)) return;
    closeAccountMenu(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      event.stopPropagation();
      closeAccountMenu(true);
    }
  });

  logout?.addEventListener("click", async () => {
    logout.disabled = true;
    logout.textContent = "Logging out…";
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      /* Navigate anyway; the session cookie may still be cleared server-side. */
    }
    window.location.assign("/");
  });
}

/* --------------------------------------------------------------------------
   Live updates & preview
   -------------------------------------------------------------------------- */

let listenerTimer = 0;
let activityTimer = 0;
let activityCursor = 0;

function syncLiveUI() {
  $$("[data-live-toggle]").forEach((button) => {
    button.setAttribute("aria-pressed", String(state.live));
    button.setAttribute("aria-label", state.live ? "Pause live updates" : "Resume live updates");
    const label = button.querySelector("[data-live-label]");
    if (label) {
      label.textContent = button.closest(".topbar")
        ? state.live
          ? "Live"
          : "Paused"
        : state.live
          ? "Pause live"
          : "Resume live";
    }
    const use = button.querySelector("use");
    if (use && button.classList.contains("btn")) {
      use.setAttribute("href", state.live ? "#i-pause" : "#i-play");
    }
  });

  const liveCommand = $("[data-live-command]");
  if (liveCommand) liveCommand.textContent = state.live ? "Pause live updates" : "Resume live updates";

  const sub = $("#activitySub");
  if (sub) sub.textContent = state.live ? "Live across your releases" : "Live updates paused";
}

function tickListeners() {
  const elements = $$("[data-live-listeners]");
  if (!elements.length) return;
  const current = Number(elements[0].dataset.value || 1284);
  const next = clamp(current + Math.floor(Math.random() * 9) - 4, 1180, 1420);
  elements.forEach((element) => {
    element.dataset.value = String(next);
    element.textContent = fmtInt.format(next);
  });
}

function addLiveActivity() {
  const item = ACTIVITY_POOL[activityCursor % ACTIVITY_POOL.length];
  activityCursor += 1;
  activityItems.unshift({ ...item, time: "Just now" });
  if (activityItems.length > 10) activityItems.pop();
  renderOverviewActivity();
  if (state.route === "activity") renderFeed(true);
}

function stopLiveTimers() {
  window.clearInterval(listenerTimer);
  window.clearInterval(activityTimer);
  listenerTimer = 0;
  activityTimer = 0;
}

function startLiveTimers() {
  stopLiveTimers();
  listenerTimer = window.setInterval(() => {
    if (!document.hidden) tickListeners();
  }, 4500);
  activityTimer = window.setInterval(() => {
    if (!document.hidden) addLiveActivity();
  }, 9000);
}

function setLive(live) {
  state.live = live;
  if (live) startLiveTimers();
  else stopLiveTimers();
  syncLiveUI();
}

function syncPreviewUI() {
  const card = $("#onRepeat");
  const wave = $("#wave");
  const button = $("#repeatPause");
  if (card) {
    card.classList.toggle("is-playing", state.playing);
    card.classList.toggle("is-paused", !state.playing);
  }
  if (wave) wave.classList.toggle("is-paused", !state.playing);
  if (button) {
    button.setAttribute("aria-pressed", String(state.playing));
    button.setAttribute("aria-label", state.playing ? "Pause preview" : "Play preview");
    const use = button.querySelector("use");
    if (use) use.setAttribute("href", state.playing ? "#i-pause" : "#i-play");
  }
  const command = $("[data-preview-command]");
  if (command) command.textContent = state.playing ? "Pause preview" : "Resume preview";
  setOrbPaused(!state.playing);
}

function setPlaying(playing, announce = false) {
  state.playing = playing;
  syncPreviewUI();
  if (announce) showToast(playing ? "Preview playing" : "Preview paused");
}

function initLive() {
  $$("[data-live-listeners]").forEach((element) => {
    element.dataset.value = "1284";
  });
  $$("[data-live-toggle]").forEach((button) => {
    button.addEventListener("click", () => setLive(!state.live));
  });
  setLive(true);
}

/* --------------------------------------------------------------------------
   Command palette
   -------------------------------------------------------------------------- */

function syncPaletteLabels() {
  const live = $("[data-live-command]");
  const preview = $("[data-preview-command]");
  if (live) live.textContent = state.live ? "Pause live updates" : "Resume live updates";
  if (preview) preview.textContent = state.playing ? "Pause preview" : "Resume preview";
}

function visibleCommands() {
  return $$(".cmd").filter((button) => !button.hidden);
}

function selectCommand(button) {
  $$(".cmd").forEach((item) => item.classList.toggle("is-selected", item === button));
  if (button) button.scrollIntoView({ block: "nearest" });
}

function filterPalette(value) {
  const query = value.trim().toLowerCase();
  const buttons = $$(".cmd");
  buttons.forEach((button) => {
    const label = button.querySelector(".cmd-label");
    button.hidden = Boolean(label) && !label.textContent.toLowerCase().includes(query);
  });

  $$(".cmd-group").forEach((group) => {
    const anyVisible = $$(".cmd", group).some((button) => !button.hidden);
    group.hidden = !anyVisible;
    const label = group.previousElementSibling;
    if (label && label.classList.contains("palette-label")) label.hidden = !anyVisible;
  });

  const empty = $("#paletteEmpty");
  if (empty) empty.hidden = visibleCommands().length > 0;
  selectCommand(visibleCommands()[0] || null);
}

function openPalette() {
  const palette = $("#palette");
  const input = $("#paletteInput");
  if (!palette || !input || palette.open) return;
  const trackDialog = $("#trackDialog");
  if (trackDialog && trackDialog.open) return;
  syncPaletteLabels();
  palette.showModal();
  input.value = "";
  filterPalette("");
  requestAnimationFrame(() => input.focus());
}

function closePalette() {
  const palette = $("#palette");
  if (palette && palette.open) palette.close();
}

function runCommand(button) {
  if (!button) return;
  const route = button.dataset.routeCommand;
  const action = button.dataset.action;
  closePalette();
  if (route) {
    go(route);
    return;
  }
  if (action === "export") exportCsv();
  else if (action === "report-pdf") openPdfReport("demo");
  else if (action === "report-digest") openPdfReport("digest");
  else if (action === "share") shareReport();
  else if (action === "toggle-live") setLive(!state.live);
  else if (action === "toggle-preview") setPlaying(!state.playing, true);
  else if (action === "toggle-motion") setMotion(reduced());
}

function initPalette() {
  const palette = $("#palette");
  const input = $("#paletteInput");
  if (!palette || !input) return;

  $$("[data-open-palette]").forEach((button) => button.addEventListener("click", openPalette));

  $$(".cmd").forEach((button) => {
    button.addEventListener("mouseenter", () => selectCommand(button));
    button.addEventListener("click", () => runCommand(button));
  });

  input.addEventListener("input", () => filterPalette(input.value));
  input.addEventListener("keydown", (event) => {
    const available = visibleCommands();
    if (!available.length) return;
    let index = available.findIndex((button) => button.classList.contains("is-selected"));
    if (index < 0) index = 0;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectCommand(available[(index + 1) % available.length]);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selectCommand(available[(index - 1 + available.length) % available.length]);
    } else if (event.key === "Enter") {
      event.preventDefault();
      runCommand(available[index]);
    }
  });

  palette.addEventListener("click", (event) => {
    if (event.target === palette) closePalette();
  });

  document.addEventListener("keydown", (event) => {
    const active = document.activeElement;
    const typing =
      active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (palette.open) closePalette();
      else openPalette();
    } else if (event.key === "/" && !typing && !palette.open) {
      event.preventDefault();
      openPalette();
    }
  });
}

/* --------------------------------------------------------------------------
   Share & export
   -------------------------------------------------------------------------- */

function reportSummary() {
  const topTrack = TRACKS.reduce((best, track) => !best || track.streams > best.streams ? track : best, null);
  const topCity = CITIES.reduce((best, city) => !best || city.listeners > best.listeners ? city : best, null);
  return [
    "Timbre — Mira Vale · last 30 days (demo data)",
    ...METRICS.map((metric) => `${metric.label}: ${metric.prefix || ""}${fmtInt.format(metric.value)} (${formatDelta(metric.delta)})`),
    ...(topTrack ? [`Top track: ${topTrack.name} — ${fmtInt.format(topTrack.streams)} streams`] : []),
    ...(topCity ? [`Top city: ${topCity.name} — ${formatCompact(topCity.listeners)} listeners`] : []),
  ].join("\n");
}

async function shareReport(track) {
  const text = track
    ? [
        `Timbre — ${track.name}`,
        `Mira Vale · ${track.type} · ${track.length}`,
        `Streams: ${fmtInt.format(track.streams)}`,
        `Catalog share: ${track.share}%`,
        `30-day change: ${formatDelta(track.delta)}`,
      ].join("\n")
    : reportSummary();
  const copied = await copyText(text);
  showToast(copied ? (track ? "Track summary copied" : "Report summary copied") : "Could not access the clipboard");
}

function exportCsv() {
  const rows = [
    ["Metric", "Value", "Change"],
    ...METRICS.map((metric) => [metric.label, `${metric.prefix || ""}${fmtInt.format(metric.value)}`, formatDelta(metric.delta)]),
    [],
    ["Track", "Streams", "Share", "30d change"],
    ...TRACKS.map((track) => [track.name, String(track.streams), `${track.share}%`, formatDelta(track.delta)]),
    [],
    ["Platform", "Listeners", "Share", "30d change"],
    ...PLATFORMS.map((platform) => [
      platform.name,
      String(platform.listeners),
      `${platform.share}%`,
      formatDelta(platform.delta),
    ]),
    [],
    ["City", "Listeners", "30d change"],
    ...CITIES.map((city) => [city.name, String(city.listeners), formatDelta(city.delta)]),
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `timbre-report-${TODAY.toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("CSV report downloaded");
}

/**
 * Server-rendered PDF report. The file is a real vector document built by
 * /api/report — not a screenshot. We open it in a new tab (the browser's PDF
 * viewer) because blob downloads are blocked inside sandboxed preview iframes
 * and on some mobile browsers; the header action is a plain link, so it still
 * works with JavaScript disabled.
 */
function openPdfReport(source = "demo") {
  const url = `/api/report?source=${encodeURIComponent(source)}&inline=1&t=${Date.now()}`;
  /* No "noopener" feature string: with it the call returns null by spec, which
     would look like a blocked popup even when the tab opened fine. */
  const win = window.open(url, "_blank");
  if (win) {
    try {
      win.opener = null;
    } catch {
      /* cross-origin window: nothing to do */
    }
    showToast(source === "digest" ? "Digest PDF opened in a new tab" : "PDF report opened in a new tab");
    return;
  }
  /* Popup blocked (or in an iframe without allow-popups): same-tab navigation
     still renders the PDF in the browser viewer. */
  window.location.assign(url);
}

/* --------------------------------------------------------------------------
   Interactions
   -------------------------------------------------------------------------- */

function initActions() {
  $$("[data-share]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = button.closest("dialog");
      if (dialog && dialog.open) shareReport(TRACKS[state.activeTrack]);
      else shareReport();
    });
  });

  $$("[data-export]").forEach((button) => button.addEventListener("click", exportCsv));

  $$("[data-report-pdf]").forEach((link) => {
    link.addEventListener("click", (event) => {
      /* Let real new-tab/middle clicks behave natively. */
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      openPdfReport(new URL(link.href, window.location.origin).searchParams.get("source") || "demo");
    });
  });

  $$("[data-connect-source]").forEach((button) => {
    button.addEventListener("click", () => {
      /* Honest placeholder until the OAuth connectors exist (see README). */
      showToast("Source OAuth is not configured yet — see README › Making it functional");
    });
  });

  const repeat = $("#repeatPause");
  if (repeat) repeat.addEventListener("click", () => setPlaying(!state.playing, true));

  document.addEventListener("click", (event) => {
    const trackTrigger = event.target.closest("[data-open-track]");
    if (trackTrigger) {
      event.preventDefault();
      openTrackDialog(Number(trackTrigger.dataset.openTrack));
      return;
    }
    const playTrigger = event.target.closest("[data-play-feature]");
    if (playTrigger) {
      event.preventDefault();
      setPlaying(!state.playing, true);
    }
  });

  const closeTrack = $("#trackDialogClose");
  if (closeTrack) {
    closeTrack.addEventListener("click", () => {
      const dialog = $("#trackDialog");
      if (dialog) dialog.close();
    });
  }

  const trackDialog = $("#trackDialog");
  if (trackDialog) {
    trackDialog.addEventListener("click", (event) => {
      if (event.target === trackDialog) trackDialog.close();
    });
  }

  const settings = $("#settingsList");
  if (settings) {
    settings.addEventListener("change", (event) => {
      const input = event.target.closest("input[data-setting]");
      if (!input) return;
      const setting = SETTINGS.find((item) => item.key === input.dataset.setting);
      if (!setting) return;
      setting.checked = input.checked;
      showToast(`${setting.title} ${input.checked ? "on" : "off"}`);
    });
  }

  $$("[data-motion-toggle]").forEach((button) => {
    button.addEventListener("click", () => setMotion(reduced()));
  });
}

function initTilt() {
  if (!gsap || reduced() || !finePointer.matches) return;
  $$("[data-tilt]").forEach((card) => {
    let rect = null;
    card.addEventListener("pointerenter", () => {
      rect = card.getBoundingClientRect();
    });
    card.addEventListener("pointermove", (event) => {
      if (!rect) rect = card.getBoundingClientRect();
      const dx = (event.clientX - rect.left) / rect.width - 0.5;
      const dy = (event.clientY - rect.top) / rect.height - 0.5;
      gsap.to(card, {
        rotateX: dy * -4.5,
        rotateY: dx * 5.5,
        transformPerspective: 900,
        duration: 0.45,
        ease: "power2.out",
        overwrite: "auto",
      });
    });
    card.addEventListener("pointerleave", () => {
      rect = null;
      gsap.to(card, { rotateX: 0, rotateY: 0, duration: 0.7, ease: "power3.out", overwrite: "auto" });
    });
  });
}

function initMagnetic() {
  if (!gsap || reduced() || !finePointer.matches) return;
  $$("[data-magnetic]").forEach((button) => {
    const xTo = gsap.quickTo(button, "x", { duration: 0.35, ease: "power2.out" });
    const yTo = gsap.quickTo(button, "y", { duration: 0.35, ease: "power2.out" });
    button.addEventListener("pointermove", (event) => {
      const rect = button.getBoundingClientRect();
      xTo((event.clientX - rect.left - rect.width / 2) * 0.16);
      yTo((event.clientY - rect.top - rect.height / 2) * 0.28);
    });
    button.addEventListener("pointerleave", () => {
      xTo(0);
      yTo(0);
    });
  });
}

function initCursor() {
  if (!gsap || reduced() || !finePointer.matches) return;
  const glow = $("#cursorGlow");
  if (!glow) return;
  gsap.set(glow, { xPercent: -50, yPercent: -50 });
  const xTo = gsap.quickTo(glow, "x", { duration: 0.5, ease: "power3.out" });
  const yTo = gsap.quickTo(glow, "y", { duration: 0.5, ease: "power3.out" });
  window.addEventListener(
    "pointermove",
    (event) => {
      glow.classList.add("is-on");
      xTo(event.clientX);
      yTo(event.clientY);
    },
    { passive: true }
  );
  document.addEventListener("mouseleave", () => glow.classList.remove("is-on"));
}

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

async function init() {
  renderMetrics();
  renderOverviewTracks();
  renderOverviewPlatforms();
  renderOverviewCity();
  renderOverviewActivity();
  renderStreamPlatforms();
  renderCities("#streamCities");
  renderCities("#audienceCities");
  renderMilestones("#streamMilestones", 3);
  renderMilestones("#activityMilestones", 4);
  renderHeatmap();
  renderTrackTable(false);
  renderReleases();
  renderGlobeCities();
  renderPlatformRings();
  renderDemographics();
  renderGrowth();
  renderListeners();
  renderActivityStats();
  renderFeed();
  renderSettings();
  renderSources();
  renderWave();
  duplicateMarquee();

  initStudioPlanner();
  initAccount();
  await loadPublicSignals();

  initHeader();
  initRange();
  initChartHover();
  initTrackFilters();
  initActivityFilters();
  initSidebar();
  initPalette();
  initLive();
  setPlaying(true);
  initActions();
  initTilt();
  initMagnetic();
  initCursor();
  initScenes();
  setReducedMotion(reduced());

  if (!window.location.hash) window.history.replaceState(null, "", "#/studio");
  setRoute(routeFromHash(), true);

  window.addEventListener("hashchange", () => setRoute(routeFromHash()));
  window.addEventListener("scroll", revealPassedItems, { passive: true });

  motionQuery.addEventListener("change", () => {
    if (motionOverride) return;
    applyMotionState();
    const view = $(`[data-view="${state.route}"]`);
    if (reduced()) {
      if (gsap) gsap.killTweensOf($$("[data-reveal]", view));
      $$("[data-reveal]", view).forEach((element) => {
        element.dataset.revealed = "true";
        element.style.opacity = "1";
        element.style.transform = "none";
      });
    } else if (view) {
      revealView(view);
    }
  });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (state.route === "overview") renderPulseChart(false);
    }, 140);
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      positionSegThumb();
      if (state.route === "overview") renderPulseChart(false);
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

