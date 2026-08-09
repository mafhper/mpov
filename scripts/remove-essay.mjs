import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function run(args, cwd = repoRoot) {
  return spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
}

function fail(message) {
  console.error(`Erro: ${message}`);
  process.exitCode = 1;
}

const slug = argument("slug");
const prepare = process.argv.includes("--prepare");
const foto = argument("foto");

if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  fail("uso: npm run remove:essay -- --slug <slug> [--prepare]");
} else if (foto) {
  fail(
    "a remoção de uma única foto exige editar a versão desejada do ensaio no clone descartável; este guard não automatiza esse passo",
  );
} else {
  const essayPath = path.join(repoRoot, "src", "content", "ensaios", slug);
  try {
    await access(essayPath);
  } catch {
    fail(`ensaio não encontrado no checkout: ${slug}`);
  }

  if (!process.exitCode) {
    const status = run(["status", "--porcelain"]).stdout.trim();
    if (status)
      fail("o checkout precisa estar limpo antes do preflight de remoção; nada foi alterado");
    const remote = run(["remote", "get-url", "origin"]).stdout.trim();
    if (!remote) fail("origin não configurado; nada foi alterado");

    if (!process.exitCode && !prepare) {
      console.log(`Preflight apenas informativo para src/content/ensaios/${slug}.`);
      console.log("Nenhum arquivo, branch ou remoto foi alterado.");
      console.log(
        "Quando a remoção estiver decidida, rode com --prepare para criar um clone descartável e reescrever somente esse caminho.",
      );
    } else if (!process.exitCode) {
      const version = run(["filter-repo", "--version"]);
      if (version.status !== 0) {
        fail(
          "git-filter-repo não está disponível. Instale-o antes do preflight; nada foi alterado.",
        );
      } else {
        const cloneDir = await mkdtemp(path.join(os.tmpdir(), "mpov-remove-"));
        const clone = run(["clone", "--mirror", remote, cloneDir], repoRoot);
        if (clone.status !== 0) {
          await rm(cloneDir, { recursive: true, force: true });
          fail(`não foi possível criar o clone descartável: ${clone.stderr.trim()}`);
        } else {
          const relativeEssayPath = path.relative(repoRoot, essayPath).replaceAll(path.sep, "/");
          const filtered = run(
            ["filter-repo", "--force", "--path", relativeEssayPath, "--invert-paths"],
            cloneDir,
          );
          if (filtered.status !== 0) {
            fail(`git-filter-repo falhou no clone descartável: ${filtered.stderr.trim()}`);
          } else {
            const objects = run(["rev-list", "--objects", "--all"], cloneDir).stdout;
            if (
              objects
                .split(/\r?\n/)
                .some(
                  (line) =>
                    line.endsWith(` ${relativeEssayPath}`) ||
                    line.includes(` ${relativeEssayPath}/`),
                )
            ) {
              fail("a validação encontrou referências ao caminho removido no clone; não publique");
            } else {
              await readFile(path.join(cloneDir, "config"), "utf8");
              console.log("Preflight concluído no clone descartável.");
              console.log(`Clone mantido para inspeção: ${cloneDir}`);
              console.log(
                "Revise refs, conteúdo e blobs. Este script nunca faz push nem force-with-lease.",
              );
              console.log(
                "Após autorização explícita, publique o histórico reescrito manualmente e valide Pages, 404 e mosaico.",
              );
            }
          }
        }
      }
    }
  }
}
