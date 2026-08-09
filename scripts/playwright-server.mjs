import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTestContent, generatedContentRoot } from "./create-test-content.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const astroPath = path.join(projectRoot, "node_modules", "astro", "bin", "astro.mjs");
const hostArgument = process.argv.indexOf("--host");
const portArgument = process.argv.indexOf("--port");
const host = hostArgument === -1 ? "127.0.0.1" : process.argv[hostArgument + 1];
const port = portArgument === -1 ? "4321" : process.argv[portArgument + 1];
const generatedOutDir = path.join(projectRoot, "tests", ".generated-dist");
const generatedCacheDir = path.join(projectRoot, "tests", ".generated-cache");
const testEnvironment = {
  ...process.env,
  MPOV_CONTENT_ROOT: "./tests/.generated-content/ensaios",
  MPOV_SITE_CONFIG: "./tests/.generated-content/site.json",
  MPOV_OUT_DIR: "./tests/.generated-dist",
  MPOV_CACHE_DIR: "./tests/.generated-cache",
};
let stopping = false;
let buildProcess;
let server;

function spawnAstro(arguments_) {
  return spawn(process.execPath, [astroPath, ...arguments_], {
    cwd: projectRoot,
    env: testEnvironment,
    stdio: "inherit",
    windowsHide: true,
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

async function buildSite() {
  buildProcess = spawnAstro(["build"]);
  const result = await waitForExit(buildProcess);
  buildProcess = undefined;
  if (result.code !== 0) {
    throw new Error(`a build de teste terminou com código ${result.code}`);
  }
}

function startServer() {
  server = spawnAstro(["preview", "--host", host, "--port", port]);
  server.on("error", (error) => {
    console.error(`Não foi possível iniciar o servidor de teste: ${error.message}`);
    void shutdown(1);
  });
  server.on("exit", (code) => {
    if (!stopping && code !== 0) {
      console.error(`O processo do servidor terminou com código ${code ?? "desconhecido"}`);
      void shutdown(1);
    }
  });
}

async function isReady() {
  try {
    const response = await fetch(`http://${host}:${port}/mpov/`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await isReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("o servidor local não respondeu em 120 segundos");
}

async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of [server, buildProcess]) {
    if (child && child.exitCode === null && !child.killed) {
      child.kill();
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
  }
  await Promise.all([
    rm(generatedContentRoot, { recursive: true, force: true }),
    rm(generatedOutDir, { recursive: true, force: true }),
    rm(generatedCacheDir, { recursive: true, force: true }),
  ]);
  process.exit(exitCode);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

try {
  await Promise.all([
    rm(generatedOutDir, { recursive: true, force: true }),
    rm(generatedCacheDir, { recursive: true, force: true }),
  ]);
  await createTestContent();
  await buildSite();
  startServer();
  await waitForServer();
  console.log(`Servidor de teste disponível em http://${host}:${port}/mpov/`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  await shutdown(1);
}

setInterval(() => {}, 60_000);
