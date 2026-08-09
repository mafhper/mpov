import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(repoRoot, "dist");
const textExtensions = new Set([".html", ".js", ".css", ".json", ".xml", ".txt"]);
const privateMarkers = [
  "/api/",
  "MPOV_STUDIO_TOKEN",
  "studio-server.mjs",
  "127.0.0.1:4322",
  "/studio.js",
  "/studio.css",
];

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesIn(fullPath)));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

const errors = [];
for (const filePath of await filesIn(distRoot)) {
  if (!textExtensions.has(path.extname(filePath).toLowerCase())) continue;
  const content = await readFile(filePath, "utf8");
  for (const marker of privateMarkers) {
    if (content.includes(marker)) {
      errors.push(path.relative(repoRoot, filePath) + " contém marcador privado: " + marker);
    }
  }
}

if (errors.length) {
  for (const error of errors) console.error("Erro: " + error);
  process.exitCode = 1;
} else {
  console.log("Limite do estúdio local verificado: nenhum arquivo privado entrou no dist.");
}
