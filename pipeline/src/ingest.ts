import "dotenv/config";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchSpotifyArtist } from "./connectors/spotify";
import { fetchYouTubeChannel } from "./connectors/youtube";
import { writeSnapshotToFirestore } from "./store/firestore";
import type { ArtistConfig, ArtistSnapshot, PipelineConfig, PublicSnapshot } from "./types";

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function validateArtist(value: unknown, fallbackRole: "self" | "competitor"): ArtistConfig {
  if (!value || typeof value !== "object") throw new Error("Artist config must be an object");
  const artist = value as Partial<ArtistConfig>;

  const id = artist.id?.trim();
  const name = artist.name?.trim();
  if (!id) throw new Error("Artist id is required");
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`Artist id "${id}" can only contain letters, numbers, "-" and "_"`);
  if (!name) throw new Error(`Artist name is required for "${id}"`);

  return {
    id,
    name,
    role: artist.role === "competitor" ? "competitor" : fallbackRole,
    spotifyArtistId: artist.spotifyArtistId?.trim() || undefined,
    youtubeChannelId: artist.youtubeChannelId?.trim() || undefined,
    youtubeHandle: artist.youtubeHandle?.trim() || undefined,
  };
}

function validateConfig(raw: unknown): PipelineConfig {
  if (!raw || typeof raw !== "object") throw new Error("Config must be an object");
  const config = raw as Partial<PipelineConfig>;
  if (!config.artist) throw new Error("Config must include an artist");

  return {
    market: config.market?.trim() || "US",
    artist: validateArtist(config.artist, "self"),
    competitors: Array.isArray(config.competitors)
      ? config.competitors.map((competitor) => validateArtist(competitor, "competitor"))
      : [],
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const configPath = path.resolve(readArg("--config") || "pipeline/artists.json");
  const outputPath = path.resolve(readArg("--out") || "data/live.json");
  const useFirestore = !process.argv.includes("--no-firestore");

  if (!existsSync(configPath)) {
    throw new Error(
      `Missing ${path.relative(process.cwd(), configPath)}. Create it from pipeline/artists.example.json and add public artist/channel IDs.`
    );
  }

  const config = validateConfig(JSON.parse(await readFile(configPath, "utf8")));
  const artists = [config.artist, ...(config.competitors || [])];
  const snapshots: ArtistSnapshot[] = [];

  for (const artist of artists) {
    const errors: string[] = [];
    let spotify: ArtistSnapshot["spotify"];
    let youtube: ArtistSnapshot["youtube"];

    if (artist.spotifyArtistId) {
      try {
        spotify = await fetchSpotifyArtist(artist.spotifyArtistId, config.market);
        console.log(
          `Spotify: ${artist.name} (${
            spotify.followers ? `${spotify.followers.toLocaleString()} followers` : "followers no longer published since Feb 2026"
          })`
        );
      } catch (error) {
        errors.push(`Spotify: ${errorMessage(error)}`);
        console.warn(`Spotify skipped for ${artist.name}: ${errorMessage(error)}`);
      }
    } else {
      errors.push("Spotify: public artist ID not configured");
    }

    if (artist.youtubeChannelId || artist.youtubeHandle) {
      try {
        youtube = await fetchYouTubeChannel({
          channelId: artist.youtubeChannelId,
          handle: artist.youtubeHandle,
        });
        console.log(`YouTube: ${artist.name} (${youtube.views.toLocaleString()} views)`);
      } catch (error) {
        errors.push(`YouTube: ${errorMessage(error)}`);
        console.warn(`YouTube skipped for ${artist.name}: ${errorMessage(error)}`);
      }
    } else {
      errors.push("YouTube: public channel ID/handle not configured");
    }

    if (spotify || youtube) {
      snapshots.push({
        id: artist.id,
        name: artist.name,
        role: artist.role || "competitor",
        spotify,
        youtube,
        errors,
      });
    }
  }

  if (!snapshots.length) {
    throw new Error("No public data was fetched. Add Spotify/YouTube IDs and API credentials, then retry.");
  }

  const snapshot: PublicSnapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    market: config.market || "US",
    artists: snapshots,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Saved ${snapshots.length} artist snapshot(s) to ${path.relative(process.cwd(), outputPath)}`);

  const hasFirebase = Boolean(
    process.env.FIREBASE_PROJECT_ID ||
      process.env.FIREBASE_SERVICE_ACCOUNT ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIRESTORE_EMULATOR_HOST
  );
  if (useFirestore && hasFirebase) {
    const count = await writeSnapshotToFirestore(snapshot);
    console.log(`Firestore: wrote ${count} artist snapshot(s)`);
  } else if (useFirestore) {
    console.log("Firestore skipped: set FIREBASE_PROJECT_ID and credentials to enable it.");
  }
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
