import type { Artwork, Profile, Settings } from "../types";
const KEY = "little-color-club";
const defaultProfile: Profile = {
  id: "artist-1",
  name: "Little artist",
  avatar: "🐰",
};
export function loadPreferences(): {
  profiles: Profile[];
  activeProfile: string;
  settings: Settings;
} {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    const profiles =
      Array.isArray(raw.profiles) && raw.profiles.length
        ? raw.profiles.filter(
            (p: Profile) => p.id && typeof p.name === "string",
          )
        : [defaultProfile];
    return {
      profiles: profiles.length ? profiles : [defaultProfile],
      activeProfile: raw.activeProfile || "artist-1",
      settings: {
        sound: false,
        hints: true,
        difficulty: "all",
        ...raw.settings,
      },
    };
  } catch {
    return {
      profiles: [defaultProfile],
      activeProfile: defaultProfile.id,
      settings: { sound: false, hints: true, difficulty: "all" },
    };
  }
}
export function savePreferences(
  profiles: Profile[],
  activeProfile: string,
  settings: Settings,
) {
  localStorage.setItem(
    KEY,
    JSON.stringify({ profiles, activeProfile, settings }),
  );
}
let dbPromise: Promise<IDBDatabase> | undefined;
function openDb() {
  if (!dbPromise)
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("little-color-club-art", 1);
      req.onupgradeneeded = () =>
        req.result.createObjectStore("artworks", { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = undefined;
        reject(req.error);
      };
    });
  return dbPromise;
}
export async function getArtworks(): Promise<Artwork[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("artworks").objectStore("artworks").getAll();
    req.onsuccess = () =>
      resolve(
        req.result.sort((a: Artwork, b: Artwork) => b.updatedAt - a.updatedAt),
      );
    req.onerror = () => reject(req.error);
  });
}
export async function saveArtwork(art: Artwork) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("artworks", "readwrite");
    tx.objectStore("artworks").put(art);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function deleteArtwork(id: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("artworks", "readwrite");
    tx.objectStore("artworks").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
