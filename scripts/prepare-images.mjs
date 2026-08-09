import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const essaysRoot = path.join(repoRoot, "src", "content", "ensaios");
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function fail(message) {
  console.error(`Erro: ${message}`);
  process.exitCode = 1;
}

async function collectImages(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectImages(fullPath)));
    else if (entry.isFile() && allowedExtensions.has(path.extname(entry.name).toLowerCase()))
      files.push(fullPath);
  }
  return files.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

const sourceArgument = argument("origem");
const essaySlug = argument("ensaio");
const force = process.argv.includes("--force") || process.argv.includes("--forcar");

if (!sourceArgument || !essaySlug) {
  fail("uso: npm run prepare:images -- --origem <pasta> --ensaio <slug> [--force]");
} else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(essaySlug)) {
  fail("o slug precisa usar apenas letras minúsculas, números e hífens");
} else {
  const sourceDir = path.resolve(process.cwd(), sourceArgument);
  const essayDir = path.resolve(essaysRoot, essaySlug);
  const outputDir = path.join(essayDir, "photos");
  try {
    const sourceInfo = await stat(sourceDir);
    if (!sourceInfo.isDirectory()) throw new Error("não é uma pasta");
    if (isWithin(repoRoot, sourceDir)) {
      throw new Error(
        "a origem precisa estar fora do checkout para evitar incluir originais por engano",
      );
    }
    const essayInfo = await stat(essayDir);
    if (!essayInfo.isDirectory()) throw new Error(`ensaio não encontrado: ${essaySlug}`);
    const sourceFiles = await collectImages(sourceDir);
    if (!sourceFiles.length) throw new Error("nenhuma imagem compatível foi encontrada");
    await mkdir(outputDir, { recursive: true });

    const existing = await readdir(outputDir);
    if (existing.length && !force) {
      throw new Error(
        `a pasta de saída já contém ${existing.length} arquivo(s); use --force apenas se quiser substituir a preparação`,
      );
    }

    for (let index = 0; index < sourceFiles.length; index += 1) {
      const destination = path.join(outputDir, `foto-${String(index + 1).padStart(2, "0")}.jpg`);
      await sharp(sourceFiles[index])
        .rotate()
        .toColourspace("srgb")
        .resize({ width: 3000, height: 3000, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85, progressive: true, mozjpeg: true })
        .toFile(destination);
      console.log(
        `${index + 1}/${sourceFiles.length}  ${path.basename(sourceFiles[index])} → ${path.relative(repoRoot, destination)}`,
      );
    }
    console.log(
      "Preparação concluída. Agora ordene as fotos no frontmatter e revise alt, legendas e contexto.",
    );
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
