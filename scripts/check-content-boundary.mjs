import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localPaths = ["src/content/ensaios/", "src/data/site.json", ".mpov-local/"];

function git(args) {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd: repoRoot,
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: error.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

const listed = await git(["ls-files", "-z"]);
if (listed.code !== 0) {
  console.error("Erro: não foi possível verificar os arquivos versionados: " + listed.stderr);
  process.exit(1);
}

const tracked = listed.stdout.split("\0").filter(Boolean);
const exposed = tracked.filter((file) =>
  localPaths.some((localPath) =>
    localPath.endsWith("/") ? file.startsWith(localPath) : file === localPath,
  ),
);
const notIgnored = [];
for (const localPath of localPaths) {
  const candidate = localPath.endsWith("/") ? localPath + "__boundary_check__" : localPath;
  const ignored = await git(["check-ignore", "--no-index", "--quiet", "--", candidate]);
  if (ignored.code !== 0) notIgnored.push(localPath);
}

if (exposed.length || notIgnored.length) {
  for (const file of exposed) console.error("Erro: conteúdo local versionado: " + file);
  for (const file of notIgnored)
    console.error("Erro: fronteira local ausente no .gitignore: " + file);
  process.exitCode = 1;
} else {
  console.log("Fronteira local verificada: identidade e ensaios pessoais estão fora do Git.");
}
