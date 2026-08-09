import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import sharp from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const essaysRoot = path.resolve(
  repoRoot,
  process.env.MPOV_CONTENT_ROOT?.trim() || path.join("src", "content", "ensaios"),
);
const configuredSitePath = process.env.MPOV_SITE_CONFIG?.trim();
const localSiteConfigPath = configuredSitePath
  ? path.resolve(repoRoot, configuredSitePath)
  : path.join(repoRoot, "src", "data", "site.json");
const exampleSiteConfigPath = path.join(repoRoot, "src", "data", "site.example.json");
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const preparedExtensions = new Set([".jpg", ".jpeg"]);
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const galleryLayouts = new Set(["sequence", "pages", "margins"]);
const cropModes = new Set(["contain", "cover"]);
const placements = new Set(["auto", "left", "right"]);
const focalPoints = new Set([
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);
const palettes = new Set(["paper", "dusk", "field", "night", "custom"]);
const typographies = new Set(["editorial", "direct", "soft"]);
const headers = new Set(["quiet", "poster", "index"]);
const headerAlignments = new Set(["start", "center", "end"]);
const headerScales = new Set(["compact", "standard", "display"]);
const headerFonts = new Set(["inherit", "serif", "sans"]);
const mosaicGroupings = new Set(["separated", "continuous"]);
const tagPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const hexColorPattern = /^#[0-9a-f]{6}$/i;
const githubHandlePattern = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const warningBytes = 500 * 1024 * 1024;
const maxBuildBytes = 900 * 1024 * 1024;

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

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

async function filesInIfPresent(directory) {
  try {
    await access(directory);
    return filesIn(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function siteConfigPath() {
  try {
    await access(localSiteConfigPath);
    return localSiteConfigPath;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return exampleSiteConfigPath;
  }
}

function frontmatter(markdown, filePath) {
  if (!markdown.startsWith("---")) throw new Error(`${filePath}: frontmatter ausente`);
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) throw new Error(`${filePath}: frontmatter não termina com ---`);
  try {
    return parse(markdown.slice(4, end + 1)) ?? {};
  } catch (error) {
    throw new Error(
      `${filePath}: YAML inválido (${error instanceof Error ? error.message : String(error)})`,
      { cause: error },
    );
  }
}

function isPlaceholderAlt(value) {
  const normalized = value.trim();
  return (
    /^(foto|imagem|image|photo)(\s*[-_]?\s*\d+)?$/i.test(normalized) ||
    normalized === "Descreva esta fotografia."
  );
}

function rgbFromHex(value) {
  return [1, 3, 5].map(
    (position) => Number.parseInt(value.slice(position, position + 2), 16) / 255,
  );
}

function luminance(value) {
  return rgbFromHex(value).reduce((total, channel, index) => {
    const linear = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return total + [0.2126, 0.7152, 0.0722][index] * linear;
  }, 0);
}

function contrast(left, right) {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function validateTheme(theme, label) {
  if (theme == null) return;
  if (!theme || typeof theme !== "object" || Array.isArray(theme)) {
    errors.push(`${label}: tema inválido`);
    return;
  }
  const palette = theme.palette ?? "paper";
  if (!palettes.has(palette)) errors.push(`${label}: paleta inválida “${String(palette)}”`);
  if (theme.typography != null && !typographies.has(theme.typography))
    errors.push(`${label}: tipografia inválida “${String(theme.typography)}”`);
  if (theme.header != null && !headers.has(theme.header))
    errors.push(`${label}: cabeçalho inválido “${String(theme.header)}”`);
  if (theme.headerAlignment != null && !headerAlignments.has(theme.headerAlignment))
    errors.push(`${label}: alinhamento do título inválido “${String(theme.headerAlignment)}”`);
  if (theme.headerScale != null && !headerScales.has(theme.headerScale))
    errors.push(`${label}: escala do título inválida “${String(theme.headerScale)}”`);
  if (theme.headerFont != null && !headerFonts.has(theme.headerFont))
    errors.push(`${label}: fonte do título inválida “${String(theme.headerFont)}”`);
  if (palette !== "custom") return;
  if (!theme.custom || typeof theme.custom !== "object" || Array.isArray(theme.custom)) {
    errors.push(`${label}: paleta personalizada sem cores`);
    return;
  }
  for (const mode of ["light", "dark"]) {
    const colors = theme.custom[mode];
    if (!colors || typeof colors !== "object" || Array.isArray(colors)) {
      errors.push(
        `${label}: paleta personalizada sem versão ${mode === "light" ? "clara" : "escura"}`,
      );
      continue;
    }
    for (const key of ["background", "surface", "text", "muted", "accent"]) {
      if (!hexColorPattern.test(colors[key] ?? ""))
        errors.push(`${label}: cor ${mode} personalizada inválida em “${key}”`);
    }
    if (
      ["background", "surface", "text", "muted", "accent"].every((key) =>
        hexColorPattern.test(colors[key] ?? ""),
      )
    ) {
      if (
        contrast(colors.text, colors.background) < 4.5 ||
        contrast(colors.text, colors.surface) < 4.5
      )
        errors.push(`${label}: texto da paleta ${mode} personalizada abaixo de 4.5:1`);
      if (
        contrast(colors.muted, colors.background) < 4.5 ||
        contrast(colors.muted, colors.surface) < 4.5
      )
        errors.push(`${label}: texto secundário da paleta ${mode} personalizada abaixo de 4.5:1`);
      if (contrast(colors.accent, colors.background) < 3)
        errors.push(`${label}: destaque da paleta ${mode} personalizada abaixo de 3:1`);
    }
  }
}

const errors = [];
const warnings = [];
let totalImageBytes = 0;
let imageCount = 0;
let publishedCount = 0;
const referencedImages = new Set();

try {
  try {
    const site = JSON.parse(await readFile(await siteConfigPath(), "utf8"));
    for (const [key, maxLength] of [
      ["title", 100],
      ["author", 100],
      ["description", 180],
      ["about", 600],
    ]) {
      if (typeof site[key] !== "string" || !site[key].trim())
        errors.push(`src/data/site.json: ${key} é obrigatório`);
      else if (site[key].trim().length > maxLength)
        errors.push(`src/data/site.json: ${key} excede ${maxLength} caracteres`);
    }
    if (site.mosaicGrouping != null && !mosaicGroupings.has(site.mosaicGrouping))
      errors.push("src/data/site.json: separação do mosaico inválida");
    if (
      site.profile != null &&
      (!site.profile || typeof site.profile !== "object" || Array.isArray(site.profile))
    ) {
      errors.push("src/data/site.json: perfil inválido");
    } else if (site.profile) {
      if (site.profile.github && !githubHandlePattern.test(site.profile.github))
        errors.push("src/data/site.json: usuário do GitHub inválido");
      if (
        site.profile.alt != null &&
        (typeof site.profile.alt !== "string" || !site.profile.alt.trim())
      )
        errors.push("src/data/site.json: texto alternativo do perfil inválido");
      else if (typeof site.profile.alt === "string" && site.profile.alt.length > 160)
        errors.push("src/data/site.json: texto alternativo do perfil excede 160 caracteres");
    }
  } catch (error) {
    errors.push(
      `src/data/site.json: inválido (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  const files = await filesInIfPresent(essaysRoot);
  const markdownFiles = files.filter((file) => path.extname(file).toLowerCase() === ".md");
  const imageFiles = files.filter((file) => imageExtensions.has(path.extname(file).toLowerCase()));

  for (const markdownPath of markdownFiles) {
    const relativePath = path.relative(repoRoot, markdownPath);
    let data;
    try {
      data = frontmatter(await readFile(markdownPath, "utf8"), relativePath);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    const essayDir = path.dirname(markdownPath);
    const slug = typeof data.slug === "string" ? data.slug : path.basename(essayDir);
    const draft = data.draft !== false;
    const layout = data.layout ?? "sequence";
    const photos = Array.isArray(data.photos) ? data.photos : [];
    if (!idPattern.test(slug)) errors.push(`${relativePath}: slug inválido “${slug}”`);
    if (!galleryLayouts.has(layout))
      errors.push(`${relativePath}: disposição inválida “${String(layout)}”`);
    if (typeof data.coverId !== "string" || !data.coverId)
      errors.push(`${relativePath}: coverId ausente`);
    if (data.draft === false) publishedCount += 1;
    if (!draft && photos.length === 0)
      errors.push(`${relativePath}: um ensaio publicado precisa ter fotografias`);
    if (data.tags != null) {
      if (!Array.isArray(data.tags) || data.tags.length > 12)
        errors.push(`${relativePath}: temas precisam ter até 12 itens`);
      else {
        const tags = new Set();
        for (const tag of data.tags) {
          if (typeof tag !== "string" || tag.length > 42 || !tagPattern.test(tag))
            errors.push(`${relativePath}: tema inválido “${String(tag)}”`);
          else if (tags.has(tag)) errors.push(`${relativePath}: tema repetido “${tag}”`);
          else tags.add(tag);
        }
      }
    }
    validateTheme(data.theme, relativePath);

    const ids = new Set();
    for (const photo of photos) {
      if (!photo || typeof photo !== "object") {
        errors.push(`${relativePath}: item de foto inválido`);
        continue;
      }
      const id = photo.id;
      if (typeof id !== "string" || !idPattern.test(id))
        errors.push(`${relativePath}: id de foto inválido “${id ?? ""}”`);
      else if (ids.has(id)) errors.push(`${relativePath}: id de foto repetido “${id}”`);
      else ids.add(id);
      if (typeof photo.alt !== "string" || !photo.alt.trim())
        errors.push(`${relativePath}: alt ausente para “${id ?? ""}”`);
      else if (!draft && isPlaceholderAlt(photo.alt))
        errors.push(`${relativePath}: alt genérico não pode ser publicado (“${photo.alt}”)`);
      if (photo.focalPoint != null && !focalPoints.has(photo.focalPoint))
        errors.push(`${relativePath}: ponto focal inválido para “${id ?? ""}”`);
      if (photo.crop != null && !cropModes.has(photo.crop))
        errors.push(`${relativePath}: recorte inválido para “${id ?? ""}”`);
      if (photo.placement != null && !placements.has(photo.placement))
        errors.push(`${relativePath}: posição inválida para “${id ?? ""}”`);
      if (typeof photo.src !== "string" || !photo.src.trim()) {
        errors.push(`${relativePath}: src ausente para “${id ?? ""}”`);
        continue;
      }
      const imagePath = path.resolve(essayDir, photo.src);
      if (!preparedExtensions.has(path.extname(photo.src).toLowerCase())) {
        errors.push(
          `${relativePath}: a imagem publicada precisa ser JPEG preparado (${photo.src})`,
        );
      }
      if (!isWithin(essayDir, imagePath))
        errors.push(`${relativePath}: src fora do diretório do ensaio (${photo.src})`);
      else {
        referencedImages.add(imagePath);
        try {
          await access(imagePath);
        } catch {
          errors.push(`${relativePath}: imagem não encontrada (${photo.src})`);
        }
      }
    }
    if (typeof data.coverId === "string" && photos.length && !ids.has(data.coverId)) {
      errors.push(`${relativePath}: coverId “${data.coverId}” não corresponde a uma foto`);
    }
  }

  for (const imagePath of imageFiles) {
    imageCount += 1;
    const imageBytes = (await stat(imagePath)).size;
    totalImageBytes += imageBytes;
    if (!referencedImages.has(imagePath))
      warnings.push(`${path.relative(repoRoot, imagePath)} não é referenciada por um ensaio`);
    try {
      const metadata = await sharp(imagePath).metadata();
      if (!metadata.width || !metadata.height)
        errors.push(`${path.relative(repoRoot, imagePath)}: dimensões ausentes`);
      if ((metadata.width ?? 0) > 3000 || (metadata.height ?? 0) > 3000)
        errors.push(`${path.relative(repoRoot, imagePath)}: maior lado acima de 3000 px`);
      for (const key of ["exif", "xmp", "iptc", "tifftag", "photoshop", "comment"]) {
        if (metadata[key])
          errors.push(`${path.relative(repoRoot, imagePath)}: metadado privado ${key} presente`);
      }
    } catch (error) {
      errors.push(
        `${path.relative(repoRoot, imagePath)}: imagem inválida (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  if (totalImageBytes >= warningBytes)
    warnings.push(
      `imagens preparadas somam ${(totalImageBytes / 1024 / 1024).toFixed(1)} MiB; revise antes de publicar`,
    );
  if (totalImageBytes >= maxBuildBytes)
    errors.push("imagens preparadas excedem 900 MiB; reduza o conjunto antes de publicar");
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

for (const warning of warnings) console.warn(`Aviso: ${warning}`);
console.log(
  `Conteúdo: ${publishedCount} ensaio(s) publicado(s), ${imageCount} imagem(ns), ${(totalImageBytes / 1024 / 1024).toFixed(1)} MiB`,
);
if (errors.length) {
  for (const error of errors) console.error(`Erro: ${error}`);
  process.exitCode = 1;
}
