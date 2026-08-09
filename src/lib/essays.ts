import { getCollection, type CollectionEntry } from "astro:content";

export type EssayEntry = CollectionEntry<"essays">;
export type PhotoEntry = EssayEntry["data"]["photos"][number];

export async function getVisibleEssays() {
  const entries = await getCollection("essays", (entry) => !entry.data.draft);
  return entries.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function getCover(essay: EssayEntry) {
  return essay.data.photos.find((photo) => photo.id === essay.data.coverId) ?? essay.data.photos[0];
}

export function essaySlug(essay: EssayEntry) {
  return essay.data.slug ?? essay.id.replace(/\/index$/, "");
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(date)
    .replace(" de ", " ");
}

export function photoUrl(essayId: string, photoId: string) {
  return `/ensaios/${essayId}/#${photoId}`;
}
