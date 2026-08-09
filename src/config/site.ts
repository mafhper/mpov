import { readFile } from "node:fs/promises";
import path from "node:path";

type MosaicGrouping = "separated" | "continuous";

interface SiteContent {
  title: string;
  author: string;
  description: string;
  about: string;
  mosaicGrouping?: MosaicGrouping;
  profile?: {
    github?: string;
    alt?: string;
  };
}

async function loadSiteContent(): Promise<SiteContent> {
  const configured = process.env.MPOV_SITE_CONFIG?.trim();
  const localPath = configured
    ? path.resolve(process.cwd(), configured)
    : path.resolve(process.cwd(), "src/data/site.json");
  const examplePath = path.resolve(process.cwd(), "src/data/site.example.json");
  try {
    return JSON.parse(await readFile(localPath, "utf8")) as SiteContent;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
    return JSON.parse(await readFile(examplePath, "utf8")) as SiteContent;
  }
}

const content = await loadSiteContent();

export const siteConfig = {
  ...content,
  mosaicGrouping: content.mosaicGrouping ?? "separated",
  profile: {
    github: content.profile?.github ?? "",
    alt: content.profile?.alt ?? `Retrato de ${content.author}`,
  },
  url: "https://mafhper.github.io/mpov",
  base: "/mpov",
};

export function withBase(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${siteConfig.base}${normalized}`;
}

export function absoluteUrl(path = "/") {
  return new URL(withBase(path), `${siteConfig.url}/`).toString();
}

export function githubProfileUrl(handle: string) {
  return `https://github.com/${encodeURIComponent(handle)}.png?size=512`;
}
