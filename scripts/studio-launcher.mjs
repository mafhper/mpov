import { spawn } from "node:child_process";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(projectRoot, "scripts", "studio-server.mjs");
const port = Number(process.env.MPOV_STUDIO_PORT ?? 4322);
const origin = `http://127.0.0.1:${port}`;
const openOnReady = !process.argv.includes("--no-open");

async function studioIsReady() {
  try {
    const response = await fetch(origin + "/api/state", { signal: AbortSignal.timeout(700) });
    return response.ok;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "xdg-open";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", `start "" "${url}"`] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

function showLaunchError() {
  if (process.platform !== "win32") return;
  const message =
    "Não foi possível abrir o Estúdio local. Confirme que este projeto recebeu a instalação inicial das dependências e tente novamente.";
  const encoded = Buffer.from(message, "utf16le").toString("base64");
  const command =
    "$message=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('" +
    encoded +
    "')); Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show($message,'Meu ponto de vista') | Out-Null";
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-WindowStyle", "Hidden", "-Command", command],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  child.unref();
}

async function waitForStudio() {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (await studioIsReady()) return true;
    await delay(250);
  }
  return false;
}

if (!(await studioIsReady())) {
  const server = spawn(process.execPath, [serverPath, "--no-open"], {
    cwd: projectRoot,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  server.unref();
}

if (await waitForStudio()) {
  console.log(`Estúdio local disponível em ${origin}`);
  if (openOnReady) openBrowser(origin + "/");
} else {
  showLaunchError();
  process.exitCode = 1;
}
