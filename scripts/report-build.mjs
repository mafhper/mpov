import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(repoRoot, "dist");
const warningBytes = 500 * 1024 * 1024;
const maxBuildBytes = 900 * 1024 * 1024;
const imageExtensions = new Set([".jpg", ".jpeg", ".webp", ".avif", ".png"]);

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

try {
  const files = await filesIn(distRoot);
  let totalBytes = 0;
  let imageBytes = 0;
  let imageCount = 0;
  for (const file of files) {
    const size = (await stat(file)).size;
    totalBytes += size;
    if (imageExtensions.has(path.extname(file).toLowerCase())) {
      imageBytes += size;
      imageCount += 1;
    }
  }
  const totalMiB = totalBytes / 1024 / 1024;
  const imageMiB = imageBytes / 1024 / 1024;
  console.log(
    `Build: ${files.length} arquivo(s), ${totalMiB.toFixed(1)} MiB no dist, ${imageCount} imagem(ns) / ${imageMiB.toFixed(1)} MiB`,
  );
  if (imageBytes >= warningBytes) console.warn("Aviso: imagens geradas atingiram 500 MiB");
  if (totalBytes >= maxBuildBytes) {
    console.error(
      "Erro: dist atingiu 900 MiB; o deploy deve ser bloqueado antes do limite do Pages",
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    `Erro: não foi possível medir o build (${error instanceof Error ? error.message : String(error)})`,
  );
  process.exitCode = 1;
}
