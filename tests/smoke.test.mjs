import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("a identidade e os limites editoriais estão no código", async () => {
  const site = JSON.parse(await readFile(path.join(repoRoot, "src", "data", "site.json"), "utf8"));
  const layout = await readFile(path.join(repoRoot, "src", "layouts", "BaseLayout.astro"), "utf8");
  assert.equal(site.title, "Meu ponto de vista");
  assert.equal(site.author, "Matheus Lima");
  assert.match(site.about, /Elas ficam públicas até que não fiquem/);
  assert.match(layout, /index, follow, noimageindex/);
});

test("a interface não depende de ornamentos proibidos", async () => {
  const css = await readFile(path.join(repoRoot, "src", "styles", "global.css"), "utf8");
  const source = await readFile(
    path.join(repoRoot, "src", "components", "SiteHeader.astro"),
    "utf8",
  );
  assert.doesNotMatch(css, /scroll-behavior\s*:\s*smooth/);
  assert.doesNotMatch(source, /Sparkles/);
});
