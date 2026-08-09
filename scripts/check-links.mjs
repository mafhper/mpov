import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.resolve(repoRoot, process.env.MPOV_OUT_DIR?.trim() || "dist");
const basePath = "/mpov";

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await htmlFiles(fullPath)));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(fullPath);
  }
  return files;
}

function targetFile(url, sourceFile) {
  const [pathname, fragment] = url.split("#", 2);
  let targetPath;
  if (pathname.startsWith(basePath)) {
    targetPath = pathname.slice(basePath.length) || "/";
    targetPath = path.join(distRoot, targetPath.replace(/^\/+/, ""));
  } else if (pathname.startsWith("/")) {
    return { file: null, fragment };
  } else {
    targetPath = path.resolve(path.dirname(sourceFile), pathname || path.basename(sourceFile));
  }
  if (targetPath.endsWith(path.sep)) targetPath = path.join(targetPath, "index.html");
  if (!path.extname(targetPath)) targetPath = path.join(targetPath, "index.html");
  return { file: targetPath, fragment };
}

const errors = [];
try {
  const files = await htmlFiles(distRoot);
  const htmlCache = new Map();
  for (const file of files) htmlCache.set(file, await readFile(file, "utf8"));
  for (const [sourceFile, html] of htmlCache) {
    const links = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
    for (const url of links) {
      if (!url || url.startsWith("#") || /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(url))
        continue;
      const { file: target, fragment } = targetFile(url, sourceFile);
      if (!target) continue;
      try {
        await access(target);
      } catch {
        errors.push(`${path.relative(distRoot, sourceFile)} → ${url}`);
        continue;
      }
      if (fragment) {
        const targetHtml = htmlCache.get(target) ?? (await readFile(target, "utf8"));
        const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (!new RegExp(`(?:id|name)=["']${escaped}["']`).test(targetHtml)) {
          errors.push(`${path.relative(distRoot, sourceFile)} → ${url} (fragment ausente)`);
        }
      }
    }
  }
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

if (errors.length) {
  for (const error of errors) console.error(`Erro: link inválido: ${error}`);
  process.exitCode = 1;
} else {
  console.log("Links e fragmentos locais verificados.");
}
