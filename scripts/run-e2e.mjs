import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playwrightCli = path.join(projectRoot, "node_modules", "@playwright", "test", "cli.js");
const testPort = 4323;
const forwardedArguments = process.argv.slice(2);

function run(command, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      resolve({ code: code ?? 1, signal, stdout, stderr });
    });
  });
}

async function listeningProcessIds() {
  if (process.platform !== "win32") return [];

  const command = [
    "$connections = Get-NetTCPConnection -State Listen -LocalPort " +
      testPort +
      " -ErrorAction SilentlyContinue",
    "if ($connections) { $connections | Select-Object -ExpandProperty OwningProcess }",
    "exit 0",
  ].join("; ");
  const result = await run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    {
      capture: true,
    },
  );

  if (result.code !== 0) {
    throw new Error(
      `Não foi possível verificar a porta isolada ${testPort}: ${result.stderr.trim()}`,
    );
  }

  return result.stdout
    .split(/\r?\n/)
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter(Number.isSafeInteger);
}

async function assertTestPortIsFree() {
  const processIds = await listeningProcessIds();
  if (processIds.length > 0) {
    throw new Error(
      `A porta isolada ${testPort} já está em uso (PID ${processIds.join(", ")}). ` +
        "Encerre esse processo antes de iniciar os testes.",
    );
  }
}

async function stopTestServer() {
  const processIds = await listeningProcessIds();
  for (const processId of processIds) {
    const result = await run("taskkill.exe", ["/pid", String(processId), "/T", "/F"], {
      capture: true,
    });
    const stillListening = (await listeningProcessIds()).includes(processId);
    if (result.code !== 0 && stillListening) {
      throw new Error(
        `Não foi possível encerrar o servidor de testes (PID ${processId}): ${result.stderr.trim()}`,
      );
    }
  }

  const remainingProcessIds = await listeningProcessIds();
  if (remainingProcessIds.length > 0) {
    throw new Error(`O servidor de testes não liberou a porta ${testPort}.`);
  }
}

let testResult;
let cleanupError;
let shouldCleanTestServer = false;

try {
  await assertTestPortIsFree();
  shouldCleanTestServer = true;
  testResult = await run(process.execPath, [playwrightCli, "test", ...forwardedArguments]);
} finally {
  if (shouldCleanTestServer) {
    try {
      await stopTestServer();
    } catch (error) {
      cleanupError = error;
    }
  }
}

if (cleanupError) {
  console.error(cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
  process.exit(1);
}

process.exit(testResult?.code ?? 1);
