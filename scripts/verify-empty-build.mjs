import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const astroPath = path.join(projectRoot, "node_modules", "astro", "bin", "astro.mjs");
const linkCheckPath = path.join(projectRoot, "scripts", "check-links.mjs");
const outDir = path.join(projectRoot, "tests", ".generated-empty-dist");
const contentRoot = path.join(projectRoot, "tests", ".generated-empty-content");
const cacheDir = path.join(projectRoot, "tests", ".generated-empty-cache");
const environment = {
  ...process.env,
  MPOV_CONTENT_ROOT: "./tests/.generated-empty-content/ensaios",
  MPOV_SITE_CONFIG: "./tests/.generated-empty-content/site.json",
  MPOV_OUT_DIR: "./tests/.generated-empty-dist",
  MPOV_CACHE_DIR: "./tests/.generated-empty-cache",
};

function build() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [astroPath, "build"], {
      cwd: projectRoot,
      env: environment,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

function checkLinks() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [linkCheckPath], {
      cwd: projectRoot,
      env: environment,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

try {
  await rm(outDir, { recursive: true, force: true });
  await rm(contentRoot, { recursive: true, force: true });
  await rm(cacheDir, { recursive: true, force: true });
  await mkdir(path.join(contentRoot, "ensaios"), { recursive: true });
  const result = await build();
  if (result.code !== 0) throw new Error("A build vazia falhou:\n" + result.output);
  const links = await checkLinks();
  if (links.code !== 0) {
    throw new Error("A verificação de links da build vazia falhou:\n" + links.output);
  }
  const [home, sitemap] = await Promise.all([
    readFile(path.join(outDir, "index.html"), "utf8"),
    readFile(path.join(outDir, "sitemap-0.xml"), "utf8"),
  ]);
  if (!home.includes("Por enquanto, nada por aqui.")) {
    throw new Error("A página vazia não apresenta a mensagem editorial esperada.");
  }
  if (sitemap.includes("/ensaios/")) {
    throw new Error("O sitemap vazio ainda contém uma rota de ensaio.");
  }
  console.log("Publicação vazia verificada: home, 404 e sitemap foram gerados sem ensaios.");
} finally {
  await Promise.all([
    rm(outDir, { recursive: true, force: true }),
    rm(contentRoot, { recursive: true, force: true }),
    rm(cacheDir, { recursive: true, force: true }),
  ]);
}
