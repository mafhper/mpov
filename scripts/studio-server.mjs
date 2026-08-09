import { createServer } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import sharp from "sharp";
import YAML from "yaml";
import {
  PublicationError,
  buildPublicationReview,
  connectGithub,
  fingerprintLocalSource,
  inspectPublicBuild,
  publicationStatus,
  publishReviewedSnapshot,
  verifyPublishedSite,
} from "./publication-service.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDirectory, "..");
const studioAssetsRoot = path.resolve(defaultRepoRoot, "studio");
const defaultPort = 4322;
const maxJsonBytes = 1_000_000;
const maxUploadBytes = 240 * 1024 * 1024;
const maxPhotoBytes = 80 * 1024 * 1024;
const validDisplay = new Set(["full", "wide", "portrait"]);
const validLayout = new Set(["sequence", "pages", "margins"]);
const validCrop = new Set(["contain", "cover"]);
const validPlacement = new Set(["auto", "left", "right"]);
const validFocalPoint = new Set([
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
const validPalette = new Set(["paper", "dusk", "field", "night", "custom"]);
const validTypography = new Set(["editorial", "direct", "soft"]);
const validHeader = new Set(["quiet", "poster", "index"]);
const validHeaderAlignment = new Set(["start", "center", "end"]);
const validHeaderScale = new Set(["compact", "standard", "display"]);
const validHeaderFont = new Set(["inherit", "serif", "sans"]);
const validMosaicGrouping = new Set(["separated", "continuous"]);
const inputExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);
const outputExtensions = new Set([".jpg", ".jpeg"]);
const placeholderAlt = "Descreva esta fotografia.";
const tagPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const hexColorPattern = /^#[0-9a-f]{6}$/i;
const githubHandlePattern = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function argument(name) {
  const index = process.argv.indexOf("--" + name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function readPort() {
  const value = Number(argument("port") ?? defaultPort);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error("A porta precisa estar entre 1 e 65535.");
  }
  return value;
}

const repoRoot = path.resolve(argument("root") ?? defaultRepoRoot);
const port = readPort();
const openOnStart = !process.argv.includes("--no-open");
const essaysRoot = path.join(repoRoot, "src", "content", "ensaios");
const siteConfigPath = path.join(repoRoot, "src", "data", "site.json");
const siteExamplePath = path.join(repoRoot, "src", "data", "site.example.json");
const buildRoot = path.join(repoRoot, "dist");
const localStateRoot = path.join(repoRoot, ".mpov-local");
const buildMetadataPath = path.join(localStateRoot, "build.json");
const studioToken = randomBytes(32).toString("base64url");
let publicOrigin = "http://127.0.0.1:" + port;
let buildState = { status: "idle", finishedAt: null, output: "", success: null };
let publicationReview = null;
let publicationActivity = { status: "idle", output: "", result: null };
let githubConnection = { status: "idle", message: "" };

function invalidateBuild() {
  publicationReview = null;
  if (buildState.status !== "running") {
    buildState = { status: "stale", finishedAt: buildState.finishedAt, output: "", success: null };
  }
}

async function restoreBuildState() {
  try {
    const existingBuild = await stat(path.join(buildRoot, "index.html"));
    if (existingBuild.isFile()) {
      const [metadataSource, build, sourceFingerprint] = await Promise.all([
        readFile(buildMetadataPath, "utf8"),
        inspectPublicBuild(buildRoot),
        fingerprintLocalSource(siteConfigPath, essaysRoot),
      ]);
      const metadata = JSON.parse(metadataSource);
      const current =
        metadata.buildFingerprint === build.fingerprint &&
        metadata.sourceFingerprint === sourceFingerprint;
      buildState = current
        ? {
            status: "ready",
            finishedAt: metadata.finishedAt ?? existingBuild.mtime.toISOString(),
            output: "",
            success: true,
            fingerprint: build.fingerprint,
            sourceFingerprint,
            fileCount: build.fileCount,
            bytes: build.bytes,
          }
        : {
            status: "stale",
            finishedAt: metadata.finishedAt ?? existingBuild.mtime.toISOString(),
            output: "",
            success: null,
          };
    }
  } catch {
    if (await exists(path.join(buildRoot, "index.html"))) {
      buildState = { status: "stale", finishedAt: null, output: "", success: null };
    }
  }
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeSlug(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function safePath(root, ...parts) {
  const target = path.resolve(root, ...parts);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new HttpError(400, "Caminho inválido.");
  }
  return target;
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function required(value, label, maxLength) {
  const result = text(value).trim();
  if (!result) throw new HttpError(400, label + " é obrigatório.");
  if (result.length > maxLength) {
    throw new HttpError(400, label + " pode ter no máximo " + maxLength + " caracteres.");
  }
  return result;
}

function optional(value, label, maxLength) {
  const result = text(value).trim();
  if (result.length > maxLength) {
    throw new HttpError(400, label + " pode ter no máximo " + maxLength + " caracteres.");
  }
  return result || undefined;
}

function selected(value, values, fallback, label) {
  const result = text(value).trim();
  if (!result) return fallback;
  if (!values.has(result)) throw new HttpError(400, label + " inválido.");
  return result;
}

function normalizeTags(value) {
  if (value == null || value === "") return [];
  if (!Array.isArray(value)) throw new HttpError(400, "Os temas precisam ser uma lista.");
  if (value.length > 12) throw new HttpError(400, "Use no máximo 12 temas por ensaio.");
  const tags = [];
  for (const raw of value) {
    const normalized = slugify(text(raw).trim().replace(/^#+/, ""));
    if (!normalized || normalized.length > 42 || !tagPattern.test(normalized)) {
      throw new HttpError(400, "Cada tema precisa usar palavras, números e hífens.");
    }
    if (!tags.includes(normalized)) tags.push(normalized);
  }
  return tags;
}

function normalizeGithubHandle(value) {
  const handle = text(value).trim().replace(/^@/, "");
  if (!handle) return "";
  if (!githubHandlePattern.test(handle)) {
    throw new HttpError(400, "O usuário do GitHub não parece válido.");
  }
  return handle;
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

function customColor(value, label) {
  const color = text(value).trim();
  if (!hexColorPattern.test(color)) {
    throw new HttpError(400, label + " precisa usar uma cor hexadecimal como #1b1a18.");
  }
  return color.toLowerCase();
}

function normalizeThemeColors(value, mode) {
  const colors = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  if (!colors) {
    throw new HttpError(400, `Escolha as cinco cores da paleta ${mode}.`);
  }
  const custom = {
    background: customColor(colors.background, "A cor de fundo"),
    surface: customColor(colors.surface, "A cor de superfície"),
    text: customColor(colors.text, "A cor do texto"),
    muted: customColor(colors.muted, "A cor do texto secundário"),
    accent: customColor(colors.accent, "A cor de destaque"),
  };
  if (
    contrast(custom.text, custom.background) < 4.5 ||
    contrast(custom.text, custom.surface) < 4.5
  ) {
    throw new HttpError(
      400,
      `O texto da paleta ${mode} precisa ter contraste de pelo menos 4.5:1.`,
    );
  }
  if (
    contrast(custom.muted, custom.background) < 4.5 ||
    contrast(custom.muted, custom.surface) < 4.5
  ) {
    throw new HttpError(
      400,
      `O texto secundário da paleta ${mode} precisa ter contraste de pelo menos 4.5:1.`,
    );
  }
  if (contrast(custom.accent, custom.background) < 3)
    throw new HttpError(
      400,
      `A cor de destaque da paleta ${mode} precisa ter contraste de pelo menos 3:1.`,
    );
  return custom;
}

function normalizeTheme(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const palette = selected(input.palette, validPalette, "paper", "A paleta");
  const typography = selected(input.typography, validTypography, "editorial", "A tipografia");
  const header = selected(input.header, validHeader, "quiet", "O cabeçalho");
  const headerAlignment = selected(
    input.headerAlignment,
    validHeaderAlignment,
    "start",
    "O alinhamento do título",
  );
  const headerScale = selected(
    input.headerScale,
    validHeaderScale,
    "standard",
    "A escala do título",
  );
  const headerFont = selected(input.headerFont, validHeaderFont, "inherit", "A fonte do título");
  const base = { palette, typography, header, headerAlignment, headerScale, headerFont };
  if (palette !== "custom") return base;
  const custom = input.custom && typeof input.custom === "object" ? input.custom : null;
  if (!custom) {
    throw new HttpError(400, "Escolha versões clara e escura para a paleta personalizada.");
  }
  return {
    ...base,
    custom: {
      light: normalizeThemeColors(custom.light, "clara"),
      dark: normalizeThemeColors(custom.dark, "escura"),
    },
  };
}

function validDate(value) {
  const result = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
    throw new HttpError(400, "A data precisa estar no formato AAAA-MM-DD.");
  }
  const parsed = new Date(result + "T12:00:00Z");
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== result) {
    throw new HttpError(400, "A data não é válida.");
  }
  return result;
}

function storedDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const result = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(result) ? result.slice(0, 10) : "";
}

function fileName(value) {
  const incoming = text(value).replaceAll("\\", "/");
  const result = path.basename(incoming);
  if (!result || result !== incoming.split("/").at(-1)) {
    throw new HttpError(400, "Nome de arquivo inválido.");
  }
  if (!outputExtensions.has(path.extname(result).toLowerCase())) {
    throw new HttpError(400, "A fotografia precisa ser um JPEG preparado pelo estúdio.");
  }
  return result;
}

function slugify(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function essayDirectory(slug) {
  if (!safeSlug(slug)) throw new HttpError(400, "Identificador de ensaio inválido.");
  return safePath(essaysRoot, slug);
}

function essayFile(slug) {
  return safePath(essayDirectory(slug), "index.md");
}

function photosDirectory(slug) {
  return safePath(essayDirectory(slug), "photos");
}

function photoPath(slug, name) {
  return safePath(photosDirectory(slug), fileName(name));
}

function mediaUrl(slug, name) {
  return "/media/" + encodeURIComponent(slug) + "/" + encodeURIComponent(name);
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function writeAtomically(target, content) {
  const temporary = target + "." + randomBytes(6).toString("hex") + ".tmp";
  await writeFile(temporary, content, "utf8");
  await rename(temporary, target);
}

function parseFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new HttpError(500, "O ensaio não tem metadados válidos.");
  try {
    return { data: YAML.parse(match[1]) ?? {}, context: match[2].trim() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new HttpError(500, "Não foi possível ler os metadados: " + message);
  }
}

function sourceFileName(value) {
  return fileName(text(value).replace(/^\.\//, ""));
}

function storedPhoto(value, slug) {
  const id = text(value?.id);
  if (!safeSlug(id))
    throw new HttpError(500, "Uma fotografia de " + slug + " tem identificador inválido.");
  const name = sourceFileName(value?.src);
  const display = selected(value?.display, validDisplay, "full", "A apresentação da fotografia");
  return {
    id,
    fileName: name,
    alt: text(value?.alt),
    caption: optional(value?.caption, "Legenda", 600),
    focalPoint: selected(value?.focalPoint, validFocalPoint, "center", "O ponto focal"),
    crop: selected(value?.crop, validCrop, "contain", "O recorte"),
    placement: selected(value?.placement, validPlacement, "auto", "A posição"),
    display,
    url: mediaUrl(slug, name),
  };
}

function serializeEssay(essay) {
  const layout = validLayout.has(essay.layout) ? essay.layout : "sequence";
  const tags = normalizeTags(essay.tags);
  const theme = normalizeTheme(essay.theme);
  const serializedTheme = {
    ...(theme.palette !== "paper" ? { palette: theme.palette } : {}),
    ...(theme.typography !== "editorial" ? { typography: theme.typography } : {}),
    ...(theme.header !== "quiet" ? { header: theme.header } : {}),
    ...(theme.headerAlignment !== "start" ? { headerAlignment: theme.headerAlignment } : {}),
    ...(theme.headerScale !== "standard" ? { headerScale: theme.headerScale } : {}),
    ...(theme.headerFont !== "inherit" ? { headerFont: theme.headerFont } : {}),
    ...(theme.custom ? { custom: theme.custom } : {}),
  };
  const data = {
    slug: essay.slug,
    title: essay.title,
    date: essay.date,
    ...(essay.location ? { location: essay.location } : {}),
    ...(essay.excerpt ? { excerpt: essay.excerpt } : {}),
    draft: essay.draft,
    ...(layout !== "sequence" ? { layout } : {}),
    ...(tags.length ? { tags } : {}),
    ...(Object.keys(serializedTheme).length ? { theme: serializedTheme } : {}),
    coverId: essay.coverId,
    photos: essay.photos.map((photo) => ({
      id: photo.id,
      src: "./photos/" + photo.fileName,
      alt: photo.alt,
      ...(photo.caption ? { caption: photo.caption } : {}),
      ...(photo.focalPoint && photo.focalPoint !== "center"
        ? { focalPoint: photo.focalPoint }
        : {}),
      ...(photo.crop && photo.crop !== "contain" ? { crop: photo.crop } : {}),
      ...(photo.placement && photo.placement !== "auto" ? { placement: photo.placement } : {}),
      ...(photo.display !== "full" ? { display: photo.display } : {}),
    })),
  };
  const context = essay.context.trim();
  return (
    "---\n" +
    YAML.stringify(data, { lineWidth: 0 }).trimEnd() +
    "\n---\n" +
    (context ? "\n" + context + "\n" : "")
  );
}

async function readEssay(slug) {
  const source = await readFile(essayFile(slug), "utf8");
  const parsed = parseFrontmatter(source);
  const data = parsed.data;
  const storedSlug = text(data.slug) || slug;
  if (storedSlug !== slug || !safeSlug(storedSlug)) {
    throw new HttpError(500, "O ensaio " + slug + " tem um slug inválido.");
  }
  const photos = Array.isArray(data.photos)
    ? data.photos.map((photo) => storedPhoto(photo, slug))
    : [];
  return {
    slug,
    title: text(data.title),
    date: storedDate(data.date),
    location: text(data.location),
    excerpt: text(data.excerpt),
    draft: data.draft !== false,
    layout: validLayout.has(data.layout) ? data.layout : "sequence",
    tags: normalizeTags(data.tags),
    theme: normalizeTheme(data.theme),
    coverId: text(data.coverId) || photos[0]?.id || "foto-01",
    photos,
    context: parsed.context,
    revision: hash(source),
  };
}

async function listEssays() {
  await mkdir(essaysRoot, { recursive: true });
  const entries = await readdir(essaysRoot, { withFileTypes: true });
  const essays = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !safeSlug(entry.name)) continue;
    if (await exists(safePath(essaysRoot, entry.name, "index.md"))) {
      essays.push(await readEssay(entry.name));
    }
  }
  return essays.sort(
    (left, right) =>
      right.date.localeCompare(left.date) || left.title.localeCompare(right.title, "pt-BR"),
  );
}

async function readSite() {
  const source = await readFile(siteConfigPath, "utf8");
  let data;
  try {
    data = JSON.parse(source);
  } catch {
    throw new HttpError(500, "A configuração da publicação não é um JSON válido.");
  }
  const author = text(data.author);
  return {
    title: text(data.title),
    author,
    description: text(data.description),
    about: text(data.about),
    mosaicGrouping: validMosaicGrouping.has(data.mosaicGrouping)
      ? data.mosaicGrouping
      : "separated",
    profile: {
      github: normalizeGithubHandle(data.profile?.github),
      alt: text(data.profile?.alt) || `Retrato de ${author}`,
    },
    revision: hash(source),
  };
}

async function writeSite(payload) {
  const author = required(payload.author, "Autoria", 100);
  const site = {
    title: required(payload.title, "Nome da publicação", 100),
    author,
    description: required(payload.description, "Descrição", 180),
    about: required(payload.about, "Texto sobre", 600),
    mosaicGrouping: selected(
      payload.mosaicGrouping,
      validMosaicGrouping,
      "separated",
      "A separação do mosaico",
    ),
    profile: {
      github: normalizeGithubHandle(payload.profile?.github),
      alt:
        optional(payload.profile?.alt, "Texto alternativo da foto de perfil", 160) ??
        `Retrato de ${author}`,
    },
  };
  await writeAtomically(siteConfigPath, JSON.stringify(site, null, 2) + "\n");
  invalidateBuild();
  return readSite();
}

function verifyRevision(current, expected) {
  if (!expected || expected !== current) {
    throw new HttpError(
      409,
      "Este conteúdo mudou desde que foi aberto. Recarregue antes de salvar.",
    );
  }
}

async function verifyPhotos(slug, photos) {
  for (const photo of photos) {
    if (!(await exists(photoPath(slug, photo.fileName)))) {
      throw new HttpError(400, "A fotografia " + photo.fileName + " não existe mais no ensaio.");
    }
  }
}

function normalizeEssay(slug, payload) {
  const source = Array.isArray(payload.photos) ? payload.photos : [];
  const ids = new Set();
  const names = new Set();
  const photos = source.map((value, index) => {
    const id = text(value?.id);
    if (!safeSlug(id) || ids.has(id)) {
      throw new HttpError(
        400,
        "A fotografia " + (index + 1) + " tem identificador inválido ou repetido.",
      );
    }
    ids.add(id);
    const name = fileName(value?.fileName);
    if (names.has(name)) throw new HttpError(400, "Uma fotografia foi incluída duas vezes.");
    names.add(name);
    return {
      id,
      fileName: name,
      alt: required(value?.alt, "Descrição da fotografia " + (index + 1), 500),
      caption: optional(value?.caption, "Legenda da fotografia " + (index + 1), 600),
      focalPoint: selected(value?.focalPoint, validFocalPoint, "center", "O ponto focal"),
      crop: selected(value?.crop, validCrop, "contain", "O recorte"),
      placement: selected(value?.placement, validPlacement, "auto", "A posição"),
      display: selected(value?.display, validDisplay, "full", "A apresentação da fotografia"),
    };
  });
  const draft = payload.draft !== false;
  const coverId = text(payload.coverId) || photos[0]?.id || "foto-01";
  if (photos.length && !photos.some((photo) => photo.id === coverId)) {
    throw new HttpError(400, "A fotografia de capa precisa pertencer ao ensaio.");
  }
  if (!draft) {
    if (!photos.length)
      throw new HttpError(400, "Um ensaio público precisa ter ao menos uma fotografia.");
    if (photos.some((photo) => photo.alt === placeholderAlt)) {
      throw new HttpError(400, "Revise a descrição de cada fotografia antes de publicar.");
    }
  }
  return {
    slug,
    title: required(payload.title, "Título", 140),
    date: validDate(payload.date),
    location: optional(payload.location, "Local", 120),
    excerpt: optional(payload.excerpt, "Resumo", 180),
    draft,
    layout: validLayout.has(payload.layout) ? payload.layout : "sequence",
    tags: normalizeTags(payload.tags),
    theme: normalizeTheme(payload.theme),
    coverId,
    photos,
    context: text(payload.context).trim(),
  };
}

async function saveEssay(slug, payload) {
  const essay = normalizeEssay(slug, payload);
  await verifyPhotos(slug, essay.photos);
  await writeAtomically(essayFile(slug), serializeEssay(essay));
  invalidateBuild();
  return readEssay(slug);
}

async function uniqueSlug(title) {
  const stem = slugify(title);
  if (!stem) throw new HttpError(400, "Não foi possível criar um endereço a partir do título.");
  let candidate = stem;
  let count = 2;
  while (await exists(essayDirectory(candidate))) {
    candidate = stem + "-" + count;
    count += 1;
  }
  return candidate;
}

async function createEssay(payload) {
  const title = required(payload.title, "Título", 140);
  const date = validDate(payload.date);
  const slug = await uniqueSlug(title);
  await mkdir(essayDirectory(slug), { recursive: false });
  await writeAtomically(
    essayFile(slug),
    serializeEssay({ slug, title, date, draft: true, coverId: "foto-01", photos: [], context: "" }),
  );
  invalidateBuild();
  return readEssay(slug);
}

async function addPhotos(slug, revision, files) {
  const current = await readEssay(slug);
  verifyRevision(current.revision, revision);
  if (!files.length) throw new HttpError(400, "Escolha ao menos uma fotografia.");
  if (files.some((file) => file.size > maxPhotoBytes)) {
    throw new HttpError(413, "Cada fotografia pode ter no máximo 80 MiB.");
  }
  await mkdir(photosDirectory(slug), { recursive: true });
  const created = [];
  try {
    for (const file of files) {
      const extension = path.extname(file.name).toLowerCase();
      if (!inputExtensions.has(extension)) {
        throw new HttpError(400, (file.name || "Este arquivo") + " não é uma imagem compatível.");
      }
      const id = "foto-" + randomBytes(5).toString("hex");
      const name = id + ".jpg";
      const input = Buffer.from(await file.arrayBuffer());
      await sharp(input, { limitInputPixels: 120_000_000 })
        .rotate()
        .toColourspace("srgb")
        .resize({ width: 3000, height: 3000, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85, progressive: true, mozjpeg: true })
        .toFile(photoPath(slug, name));
      created.push({
        id,
        fileName: name,
        alt: placeholderAlt,
        caption: undefined,
        focalPoint: "center",
        crop: "contain",
        placement: "auto",
        display: "full",
      });
    }
    const previousPhotos = current.photos.map((photo) => ({
      id: photo.id,
      fileName: photo.fileName,
      alt: photo.alt,
      caption: photo.caption,
      focalPoint: photo.focalPoint,
      crop: photo.crop,
      placement: photo.placement,
      display: photo.display,
    }));
    await writeAtomically(
      essayFile(slug),
      serializeEssay({
        ...current,
        photos: [...previousPhotos, ...created],
        coverId: current.photos.length ? current.coverId : created[0].id,
      }),
    );
    invalidateBuild();
    return readEssay(slug);
  } catch (error) {
    await Promise.all(
      created.map((photo) => unlink(photoPath(slug, photo.fileName)).catch(() => undefined)),
    );
    throw error;
  }
}

async function removePhoto(slug, photoId, revision) {
  if (!safeSlug(photoId)) throw new HttpError(400, "Identificador de fotografia inválido.");
  const current = await readEssay(slug);
  verifyRevision(current.revision, revision);
  const removed = current.photos.find((photo) => photo.id === photoId);
  if (!removed) throw new HttpError(404, "A fotografia não existe neste ensaio.");
  if (!current.draft && current.photos.length === 1) {
    throw new HttpError(409, "Retire o ensaio inteiro em vez de remover sua única fotografia.");
  }
  const photos = current.photos
    .filter((photo) => photo.id !== photoId)
    .map((photo) => ({
      id: photo.id,
      fileName: photo.fileName,
      alt: photo.alt,
      caption: photo.caption,
      focalPoint: photo.focalPoint,
      crop: photo.crop,
      placement: photo.placement,
      display: photo.display,
    }));
  await writeAtomically(
    essayFile(slug),
    serializeEssay({
      ...current,
      photos,
      coverId: current.coverId === photoId ? (photos[0]?.id ?? "foto-01") : current.coverId,
    }),
  );
  await unlink(photoPath(slug, removed.fileName)).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
  invalidateBuild();
  return readEssay(slug);
}

async function removeEssay(slug, revision) {
  const current = await readEssay(slug);
  verifyRevision(current.revision, revision);
  await rm(essayDirectory(slug), { recursive: true, force: false });
  invalidateBuild();
}

async function jsonBody(req) {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > maxJsonBytes) throw new HttpError(413, "A solicitação é grande demais.");
  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > maxJsonBytes) throw new HttpError(413, "A solicitação é grande demais.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "Os dados enviados não são JSON válido.");
  }
}

async function multipartBody(req) {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > maxUploadBytes)
    throw new HttpError(413, "O envio de fotografias ultrapassa 240 MiB.");
  const request = new Request(publicOrigin + req.url, {
    method: req.method,
    headers: req.headers,
    body: Readable.toWeb(req),
    duplex: "half",
  });
  try {
    return await request.formData();
  } catch {
    throw new HttpError(400, "Não foi possível ler as fotografias enviadas.");
  }
}

function sameToken(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyLocalRequest(req) {
  if (req.headers.origin !== publicOrigin) {
    throw new HttpError(403, "Esta ação só pode ser feita pelo estúdio local.");
  }
  if (!sameToken(text(req.headers["x-mpov-studio-token"]), studioToken)) {
    throw new HttpError(403, "A sessão do estúdio não é válida.");
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, content, type) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
  });
  res.end(content);
}

function mimeType(target) {
  const extension = path.extname(target).toLowerCase();
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".jpeg": "image/jpeg",
      ".jpg": "image/jpeg",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".webp": "image/webp",
      ".xml": "application/xml; charset=utf-8",
    }[extension] ?? "application/octet-stream"
  );
}

function withoutAnsi(value) {
  const escape = String.fromCharCode(27);
  return value.replace(new RegExp(`${escape}\\[[0-?]*[ -/]*[@-~]`, "g"), "");
}

function studioBuildOutput(output, emptyEssays, success) {
  if (!emptyEssays || !success) return output;
  return output
    .replace(
      /^\d{2}:\d{2}:\d{2}\s+\[WARN\]\s+\[glob-loader\]\s+No files found matching "\*\*\/\*\.md" in directory "src[\\/]+content[\\/]+ensaios"\r?\n/gm,
      "",
    )
    .replace(
      /The collection "essays" does not exist or is empty\. Please check your content config file for errors\.\r?\n?/g,
      "",
    )
    .trim();
}

async function sendFile(res, target, cacheControl) {
  const info = await stat(target);
  if (!info.isFile()) throw new HttpError(404, "Arquivo não encontrado.");
  res.writeHead(200, {
    "Cache-Control": cacheControl,
    "Content-Length": info.size,
    "Content-Type": mimeType(target),
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(target).pipe(res);
}

async function studioIndex(res) {
  const template = await readFile(path.join(studioAssetsRoot, "index.html"), "utf8");
  sendText(
    res,
    200,
    template.replace("__MPOV_STUDIO_TOKEN__", JSON.stringify(studioToken)),
    "text/html; charset=utf-8",
  );
}

async function studioAsset(res, pathname) {
  const assets = { "/studio.css": "studio.css", "/studio.js": "studio.js" };
  const name = assets[pathname];
  if (!name) throw new HttpError(404, "Recurso local não encontrado.");
  await sendFile(res, safePath(studioAssetsRoot, name), "no-store");
}

async function media(res, segments) {
  if (segments.length !== 3) throw new HttpError(404, "Fotografia não encontrada.");
  const slug = segments[1];
  const name = fileName(segments[2]);
  const essay = await readEssay(slug);
  if (!essay.photos.some((photo) => photo.fileName === name)) {
    throw new HttpError(404, "Fotografia não encontrada.");
  }
  await sendFile(res, photoPath(slug, name), "private, no-store");
}

async function buildFile(pathname) {
  const suffix = pathname.slice("/mpov".length).replace(/^\/+/, "");
  const target = safePath(buildRoot, suffix || "index.html");
  if (await exists(target)) {
    const info = await stat(target);
    if (info.isFile()) return target;
    if (info.isDirectory() && (await exists(path.join(target, "index.html"))))
      return path.join(target, "index.html");
  }
  if (!path.extname(target) && (await exists(path.join(target, "index.html")))) {
    return path.join(target, "index.html");
  }
  return null;
}

async function preview(res, pathname) {
  const target = await buildFile(pathname);
  if (target) {
    await sendFile(res, target, "no-store");
    return;
  }
  const notFound = path.join(buildRoot, "404.html");
  if (await exists(notFound)) {
    const content = await readFile(notFound);
    res.writeHead(404, { "Cache-Control": "no-store", "Content-Type": "text/html; charset=utf-8" });
    res.end(content);
    return;
  }
  throw new HttpError(404, "Ainda não há uma prévia gerada.");
}

function run(command, args, cwd) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        shell: false,
        windowsHide: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      resolve({ code: 1, output: message });
      return;
    }
    let output = "";
    const append = (chunk) => {
      output = (output + withoutAnsi(chunk.toString())).slice(-24000);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) => resolve({ code: 1, output: output + "\n" + error.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function resetGeneratedBuildFiles() {
  const generatedPaths = [
    path.join(repoRoot, ".astro"),
    path.join(repoRoot, "node_modules", ".astro"),
    path.join(repoRoot, "node_modules", ".vite"),
    buildRoot,
  ];
  await Promise.all(generatedPaths.map((target) => rm(target, { recursive: true, force: true })));
}

function npmRunArguments(script) {
  if (process.env.npm_execpath) {
    return { command: process.execPath, args: [process.env.npm_execpath, "run", script] };
  }
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", `npm run ${script}`],
    };
  }
  return { command: "npm", args: ["run", script] };
}

async function build() {
  if (buildState.status === "running") throw new HttpError(409, "Uma build já está em andamento.");
  publicationReview = null;
  buildState = { status: "running", finishedAt: null, output: "", success: null };
  await resetGeneratedBuildFiles();
  const emptyEssays = (await listEssays()).length === 0;
  const { command, args } = npmRunArguments("build");
  const result = await run(command, args, repoRoot);
  const finishedAt = new Date().toISOString();
  if (result.code === 0) {
    const [buildInspection, sourceFingerprint] = await Promise.all([
      inspectPublicBuild(buildRoot),
      fingerprintLocalSource(siteConfigPath, essaysRoot),
    ]);
    buildState = {
      status: "ready",
      finishedAt,
      output: studioBuildOutput(result.output, emptyEssays, true),
      success: true,
      fingerprint: buildInspection.fingerprint,
      sourceFingerprint,
      fileCount: buildInspection.fileCount,
      bytes: buildInspection.bytes,
    };
    await mkdir(localStateRoot, { recursive: true });
    await writeAtomically(
      buildMetadataPath,
      JSON.stringify(
        {
          finishedAt,
          buildFingerprint: buildInspection.fingerprint,
          sourceFingerprint,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    buildState = {
      status: "failed",
      finishedAt,
      output: studioBuildOutput(result.output, emptyEssays, false),
      success: false,
    };
  }
  return buildState;
}

async function changes() {
  const result = await run("git", ["status", "--short"], repoRoot);
  return result.code === 0 ? result.output.trim().split(/\r?\n/).filter(Boolean) : [];
}

async function statePayload() {
  const [site, essays, changed] = await Promise.all([readSite(), listEssays(), changes()]);
  return {
    site,
    essays: essays.map((essay) => ({
      slug: essay.slug,
      title: essay.title,
      date: essay.date,
      location: essay.location,
      excerpt: essay.excerpt,
      draft: essay.draft,
      coverId: essay.coverId,
      revision: essay.revision,
      photoCount: essay.photos.length,
    })),
    build: buildState,
    changes: changed,
  };
}

function publicReviewSummary(review) {
  if (!review) return null;
  return {
    id: review.id,
    createdAt: review.createdAt,
    repository: review.repository,
    branch: review.branch,
    build: {
      fingerprint: review.build.fingerprint,
      fileCount: review.build.fileCount,
      bytes: review.build.bytes,
    },
    manifest: review.manifest,
    diff: review.diff,
  };
}

async function publicationPayload() {
  return {
    ...(await publicationStatus(repoRoot)),
    connection: githubConnection,
    activity: publicationActivity,
    review: publicReviewSummary(publicationReview),
  };
}

function startGithubConnection() {
  if (githubConnection.status === "connecting") return;
  githubConnection = {
    status: "connecting",
    message: "Conclua o acesso na janela oficial do GitHub.",
  };
  void connectGithub(repoRoot)
    .then((login) => {
      githubConnection = { status: "connected", message: `Conectado como ${login}.` };
    })
    .catch((error) => {
      githubConnection = {
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      };
    });
}

async function reviewCurrentPublication() {
  if (buildState.status !== "ready" || !buildState.success) {
    throw new HttpError(409, "Gere e revise uma prévia atual antes de publicar.");
  }
  publicationActivity = { status: "reviewing", output: "", result: null };
  const [sourceFingerprint, buildInspection] = await Promise.all([
    fingerprintLocalSource(siteConfigPath, essaysRoot),
    inspectPublicBuild(buildRoot),
  ]);
  if (
    sourceFingerprint !== buildState.sourceFingerprint ||
    buildInspection.fingerprint !== buildState.fingerprint
  ) {
    invalidateBuild();
    publicationActivity = { status: "failed", output: "", result: null };
    throw new HttpError(409, "O conteúdo mudou depois da build. Gere a prévia novamente.");
  }

  const validation = npmRunArguments("publish:check");
  const checked = await run(validation.command, validation.args, repoRoot);
  if (checked.code !== 0) {
    publicationActivity = { status: "failed", output: checked.output, result: null };
    throw new HttpError(409, "A revisão encontrou algo que precisa ser corrigido.");
  }
  const [site, essays] = await Promise.all([readSite(), listEssays()]);
  try {
    publicationReview = await buildPublicationReview({ repoRoot, buildRoot, site, essays });
  } catch (error) {
    publicationActivity = {
      status: "failed",
      output: error instanceof Error ? error.message : String(error),
      result: null,
    };
    throw error;
  }
  publicationReview.sourceFingerprint = sourceFingerprint;
  publicationActivity = { status: "reviewed", output: checked.output, result: null };
  return publicReviewSummary(publicationReview);
}

async function publishCurrentReview(payload) {
  if (payload.confirm !== true) throw new HttpError(400, "Confirme a publicação atual.");
  if (!publicationReview || payload.reviewId !== publicationReview.id) {
    throw new HttpError(409, "A revisão expirou. Revise a publicação novamente.");
  }
  const sourceFingerprint = await fingerprintLocalSource(siteConfigPath, essaysRoot);
  if (sourceFingerprint !== publicationReview.sourceFingerprint) {
    invalidateBuild();
    throw new HttpError(409, "O conteúdo mudou depois da revisão. Gere a prévia novamente.");
  }
  publicationActivity = { status: "publishing", output: "", result: null };
  try {
    const result = await publishReviewedSnapshot({
      repoRoot,
      buildRoot,
      review: publicationReview,
    });
    publicationReview = null;
    publicationActivity = { status: "published", output: "", result };
    return result;
  } catch (error) {
    publicationActivity = {
      status: "failed",
      output: error instanceof Error ? error.message : String(error),
      result: null,
    };
    throw error;
  }
}

async function verifyCurrentPublication() {
  publicationActivity = { status: "verifying", output: "", result: null };
  const result = await verifyPublishedSite(repoRoot);
  publicationActivity = {
    status: result.success ? "verified" : "verification-failed",
    output: result.errors.join("\n"),
    result,
  };
  return result;
}

async function api(req, res, url) {
  const method = req.method ?? "GET";
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (method === "GET" && url.pathname === "/api/state") {
    sendJson(res, 200, await statePayload());
    return;
  }
  if (method === "GET" && url.pathname === "/api/publication") {
    sendJson(res, 200, await publicationPayload());
    return;
  }
  if (
    method === "GET" &&
    segments.length === 3 &&
    segments[0] === "api" &&
    segments[1] === "essays"
  ) {
    sendJson(res, 200, { essay: await readEssay(segments[2]) });
    return;
  }

  verifyLocalRequest(req);

  if (method === "POST" && url.pathname === "/api/essays") {
    sendJson(res, 201, { essay: await createEssay(await jsonBody(req)) });
    return;
  }
  if (method === "PUT" && url.pathname === "/api/site") {
    const payload = await jsonBody(req);
    verifyRevision((await readSite()).revision, payload.revision);
    sendJson(res, 200, { site: await writeSite(payload) });
    return;
  }
  if (
    method === "PUT" &&
    segments.length === 3 &&
    segments[0] === "api" &&
    segments[1] === "essays"
  ) {
    const payload = await jsonBody(req);
    verifyRevision((await readEssay(segments[2])).revision, payload.revision);
    sendJson(res, 200, { essay: await saveEssay(segments[2], payload) });
    return;
  }
  if (
    method === "POST" &&
    segments.length === 4 &&
    segments[0] === "api" &&
    segments[1] === "essays" &&
    segments[3] === "photos"
  ) {
    const form = await multipartBody(req);
    const files = form
      .getAll("files")
      .filter(
        (value) =>
          value && typeof value.arrayBuffer === "function" && typeof value.name === "string",
      );
    sendJson(res, 201, { essay: await addPhotos(segments[2], text(form.get("revision")), files) });
    return;
  }
  if (
    method === "DELETE" &&
    segments.length === 5 &&
    segments[0] === "api" &&
    segments[1] === "essays" &&
    segments[3] === "photos"
  ) {
    const payload = await jsonBody(req);
    sendJson(res, 200, { essay: await removePhoto(segments[2], segments[4], payload.revision) });
    return;
  }
  if (
    method === "DELETE" &&
    segments.length === 3 &&
    segments[0] === "api" &&
    segments[1] === "essays"
  ) {
    const payload = await jsonBody(req);
    if (payload.confirm !== true) throw new HttpError(400, "Confirme a retirada do ensaio.");
    await removeEssay(segments[2], payload.revision);
    sendJson(res, 200, { removed: segments[2] });
    return;
  }
  if (method === "POST" && url.pathname === "/api/build") {
    sendJson(res, 200, { build: await build() });
    return;
  }
  if (method === "POST" && url.pathname === "/api/github/connect") {
    startGithubConnection();
    sendJson(res, 202, { connection: githubConnection });
    return;
  }
  if (method === "POST" && url.pathname === "/api/publication/review") {
    sendJson(res, 200, { review: await reviewCurrentPublication() });
    return;
  }
  if (method === "POST" && url.pathname === "/api/publication/publish") {
    sendJson(res, 200, { publication: await publishCurrentReview(await jsonBody(req)) });
    return;
  }
  if (method === "POST" && url.pathname === "/api/publication/verify") {
    sendJson(res, 200, { verification: await verifyCurrentPublication() });
    return;
  }
  if (method === "POST" && url.pathname === "/api/shutdown") {
    sendJson(res, 200, { stopping: true });
    setTimeout(() => server.close(() => process.exit(0)), 30);
    return;
  }
  throw new HttpError(404, "Rota local não encontrada.");
}

async function handler(req, res) {
  try {
    const url = new URL(req.url ?? "/", publicOrigin);
    const method = req.method ?? "GET";
    if (!["GET", "POST", "PUT", "DELETE"].includes(method)) {
      throw new HttpError(405, "Método não permitido.");
    }
    if (method === "GET" && url.pathname === "/") return await studioIndex(res);
    if (method === "GET" && (url.pathname === "/studio.css" || url.pathname === "/studio.js")) {
      return await studioAsset(res, url.pathname);
    }
    if (method === "GET" && url.pathname.startsWith("/media/")) {
      return await media(res, url.pathname.split("/").filter(Boolean).map(decodeURIComponent));
    }
    if (method === "GET" && (url.pathname === "/mpov" || url.pathname.startsWith("/mpov/"))) {
      return await preview(res, url.pathname);
    }
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    throw new HttpError(404, "Página local não encontrada.");
  } catch (error) {
    const knownError = error instanceof HttpError || error instanceof PublicationError;
    const status = knownError ? error.status : 500;
    const message = knownError ? error.message : "O estúdio encontrou um erro inesperado.";
    if (res.headersSent) {
      res.destroy();
      return;
    }
    sendJson(res, status, { error: message });
  }
}

await mkdir(essaysRoot, { recursive: true });
if (!(await exists(siteConfigPath))) {
  if (!(await exists(siteExamplePath))) {
    throw new Error("Não encontrei " + path.relative(repoRoot, siteExamplePath) + ".");
  }
  await mkdir(path.dirname(siteConfigPath), { recursive: true });
  await copyFile(siteExamplePath, siteConfigPath);
}
await restoreBuildState();

const server = createServer(handler);
server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  publicOrigin = "http://127.0.0.1:" + actualPort;
  console.log("Estúdio local disponível em " + publicOrigin);
  if (openOnStart) {
    const command =
      process.platform === "win32"
        ? "cmd.exe"
        : process.platform === "darwin"
          ? "open"
          : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", publicOrigin] : [publicOrigin];
    const opener = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    opener.unref();
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
