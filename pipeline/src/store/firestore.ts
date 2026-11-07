import { readFile } from "node:fs/promises";
import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { PublicSnapshot } from "../types";

async function getApp(): Promise<App> {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();

  if (serviceAccountPath) {
    const serviceAccount = JSON.parse(await readFile(serviceAccountPath, "utf8")) as ServiceAccount & {
      project_id?: string;
    };
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: projectId || serviceAccount.project_id,
    });
  }

  return initializeApp({ projectId });
}

export async function writeSnapshotToFirestore(snapshot: PublicSnapshot) {
  const app = await getApp();
  const db = getFirestore(app);
  const batch = db.batch();
  const snapshotId = snapshot.generatedAt.replace(/[:.]/g, "-");

  for (const artist of snapshot.artists) {
    const artistRef = db.collection("artists").doc(artist.id);
    batch.set(
      artistRef,
      {
        id: artist.id,
        name: artist.name,
        role: artist.role,
        market: snapshot.market,
        updatedAt: FieldValue.serverTimestamp(),
        publicSnapshotAt: snapshot.generatedAt,
        spotify: artist.spotify
          ? {
              id: artist.spotify.id,
              followers: artist.spotify.followers,
              popularity: artist.spotify.popularity,
              topTrack: artist.spotify.topTracks[0]?.name ?? null,
            }
          : null,
        youtube: artist.youtube
          ? {
              channelId: artist.youtube.channelId,
              subscribers: artist.youtube.subscribers,
              views: artist.youtube.views,
              videos: artist.youtube.videos,
            }
          : null,
        errors: artist.errors,
      },
      { merge: true }
    );

    const publicSnapshot = JSON.parse(JSON.stringify(artist)) as typeof artist;
    batch.set(artistRef.collection("publicSnapshots").doc(snapshotId), {
      ...publicSnapshot,
      generatedAt: snapshot.generatedAt,
      market: snapshot.market,
    });
  }

  await batch.commit();
  return snapshot.artists.length;
}
