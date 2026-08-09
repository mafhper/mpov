import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

const legacyNavigationPaths = new Set(["/mpov/ensaios/", "/mpov/mosaico/", "/mpov/temas/"]);
const outDir = process.env.MPOV_OUT_DIR?.trim() || "./dist";
const cacheDir = process.env.MPOV_CACHE_DIR?.trim() || "./node_modules/.astro";

export default defineConfig({
  site: "https://mafhper.github.io",
  base: "/mpov",
  output: "static",
  outDir,
  cacheDir,
  trailingSlash: "always",
  compressHTML: true,
  devToolbar: { enabled: false },
  integrations: [
    sitemap({
      filter: (page) => !legacyNavigationPaths.has(new URL(page).pathname),
    }),
  ],
});
