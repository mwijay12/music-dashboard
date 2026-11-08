import assert from "node:assert/strict";
import test from "node:test";

import {
  analyseFeed,
  buildResearchReport,
  mergeSuggestions,
  parseChannelFeed,
  renderResearchMarkdown,
} from "./research.ts";

/* Two uploads, a Friday 18:00 EAT and a Monday 09:00 EAT, plus a dud. */
const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
 <title>Test Channel</title>
 <entry>
  <id>yt:video:aaa</id>
  <yt:videoId>aaa</yt:videoId>
  <title>Kwaya Minus One &amp; Backing Track</title>
  <published>2026-11-06T15:00:00+00:00</published>
  <media:statistics views="12000"/>
 </entry>
 <entry>
  <id>yt:video:bbb</id>
  <yt:videoId>bbb</yt:videoId>
  <title>Amapiano Gospel Loop 10 Hours</title>
  <published>2026-11-02T06:00:00+00:00</published>
  <media:statistics views="4000"/>
 </entry>
 <entry>
  <id>yt:video:ccc</id>
  <yt:videoId>ccc</yt:videoId>
  <title>Short clip</title>
  <published>2026-10-20T06:00:00+00:00</published>
  <media:statistics views="500"/>
 </entry>
</feed>`;

test("channel feed parses views, ids and entities", () => {
  const feed = parseChannelFeed(feedXml, "UCtest");
  assert.equal(feed.videos.length, 3);
  assert.equal(feed.videos[0].videoId, "aaa");
  assert.equal(feed.videos[0].views, 12000);
  assert.equal(feed.videos[0].title, "Kwaya Minus One & Backing Track");
  assert.equal(feed.videos[0].url, "https://www.youtube.com/watch?v=aaa");
  // newest first
  assert.equal(feed.videos[2].videoId, "ccc");
});

test("feed stats: cadence, median and best EAT hour", () => {
  const feed = parseChannelFeed(feedXml, "UCtest");
  const stats = analyseFeed(feed, { now: new Date("2026-11-08T00:00:00Z") });

  assert.equal(stats.uploads, 3);
  assert.equal(stats.medianViews, 4000);
  assert.equal(stats.meanViews, 5500);
  assert.equal(stats.topVideo?.videoId, "aaa");

  // 2026-11-06T15:00Z is 18:00 EAT (Friday); 06:00Z is 09:00 EAT.
  assert.equal(stats.byWeekday.Fri, 1);
  assert.equal(stats.byWeekday.Mon, 1);
  assert.equal(stats.byWeekday.Tue, 1);
  assert.equal(stats.viewsByHour[18], 12000);
  // two uploads landed at 09:00 EAT: 4000 and 500 → median 2250
  assert.equal(stats.viewsByHour[9], 2250);
  assert.equal(stats.bestHour, 18);

  // all three are inside the last 30 days of the frozen `now`
  assert.equal(stats.recent.length, 3);
  assert.ok(stats.uploadsPerWeek > 0);
});

test("empty feed does not throw", () => {
  const stats = analyseFeed({ channelId: "UCnone", videos: [] });
  assert.equal(stats.uploads, 0);
  assert.equal(stats.bestHour, null);
});

test("suggestions merge: appearing under several seeds outranks a lone top hit", () => {
  const merged = mergeSuggestions([
    { seed: "kwaya", text: "kwaya minus one", rank: 0 },
    { seed: "gospel", text: "kwaya minus one", rank: 3 },
    { seed: "kwaya", text: "kwaya songs", rank: 1 },
  ]);
  assert.equal(merged[0].text, "kwaya minus one");
  assert.equal(merged[0].seeds.length, 2);
  assert.ok(merged[0].score > merged[1].score);
});

function fakeFetch(routes: Array<[string, { status?: number; body: string }]>) {
  const calls: string[] = [];
  const impl = async (url: string | URL) => {
    calls.push(String(url));
    for (const [pattern, handler] of routes) {
      if (String(url).includes(pattern)) {
        return {
          ok: (handler.status ?? 200) < 400,
          status: handler.status ?? 200,
          text: async () => handler.body,
        };
      }
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  return Object.assign(impl as unknown as typeof fetch, { calls });
}

test("a blocked endpoint degrades to 'no data', it does not throw", async () => {
  const fetchImpl = fakeFetch([
    ["suggestqueries", { status: 500, body: "" }],
    ["feeds/videos.xml", { status: 404, body: "" }],
  ]);
  const report = await buildResearchReport({
    seeds: ["kwaya minus one", "amapiano gospel"],
    channelIds: ["UCnone"],
    fetchImpl,
    now: new Date("2026-11-08T00:00:00Z"),
  });

  assert.equal(report.keywords.length, 0);
  assert.equal(report.channels[0].stats.uploads, 0);
  assert.match(report.findings.join(" "), /autocomplete returned nothing|no channel feeds/i);
});

test("the full report combines demand, competition and readable findings", async () => {
  const fetchImpl = fakeFetch([
    ["q=kwaya%20minus%20one", { body: JSON.stringify(["kwaya minus one", ["kwaya minus one swahili", "kwaya minus one amapiano"]]) }],
    ["q=amapiano%20gospel", { body: JSON.stringify(["amapiano gospel", ["kwaya minus one swahili", "amapiano gospel mix"]]) }],
    ["feeds/videos.xml", { body: feedXml }],
  ]);

  const report = await buildResearchReport({
    seeds: ["kwaya minus one", "amapiano gospel"],
    channelIds: ["UCtest"],
    fetchImpl,
    now: new Date("2026-11-08T00:00:00Z"),
  });

  assert.equal(report.keywords.length, 3);
  // the phrase that shows up under both seeds wins
  assert.equal(report.keywords[0].text, "kwaya minus one swahili");
  assert.equal(report.channels[0].stats.uploads, 3);

  const joined = report.findings.join(" ");
  assert.match(joined, /Demand:/);
  assert.match(joined, /18:00 EAT/);
  assert.match(joined, /biggest recent video/i);

  const markdown = renderResearchMarkdown(report);
  assert.match(markdown, /## What people search/);
  assert.match(markdown, /kwaya minus one swahili/);
  assert.match(markdown, /UCtest/);
  assert.match(markdown, /## What to do with this/);
});
