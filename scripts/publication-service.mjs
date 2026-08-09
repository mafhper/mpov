import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export const publicationBranch = "gh-pages";
const maxPublishedBytes = 900 * 1024 * 1024;
const privateSegments = new Set([
  ".git",
  ".github",
  ".mpov-local",
  ".dev",
  "_dev",
  ".agents",
  ".codex",
  ".gemini",
  ".claude",
  ".qwen",
  ".kimi",
  ".roo",
  ".cursor",
  ".windsurf",
  ".claude-code",
  "node_modules",
  "studio",
]);
const privateNames = new Set([".env", "agents.md", "gemini.md", "claude.md", "qwen.md", "kimi.md"]);

export class PublicationError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.status = status;
  }
}

function withoutAnsi(value) {
  const escape = String.fromCharCode(27);
  return value.replace(new RegExp(`${escape}\\[[0-?]*[ -/]*[@-~]`, "g"), "");
}

export function runCommand(command, args, cwd, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: options.env ?? process.env,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let settled = false;
    let timer;
    const append = (chunk) => {
      output = (output + withoutAnsi(chunk.toString())).slice(-48_000);
    };
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, output: output.trim() });
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) => {
      append(error.message);
      finish(1);
    });
    child.on("close", (code) => finish(code ?? 1));
    if (options.input != null) child.stdin.end(options.input);
    else child.stdin.end();
    timer = setTimeout(() => {
      append(`\nO comando excedeu ${Math.round((options.timeoutMs ?? 30_000) / 1000)} segundos.`);
      child.kill();
      finish(1);
    }, options.timeoutMs ?? 30_000);
  });
}

function outputSha(result) {
  if (result.code !== 0) return null;
  const value = result.output.trim().split(/\s+/)[0];
  return /^[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : null;
}

function jsonResult(result) {
  if (result.code !== 0 || !result.output) return null;
  try {
    return JSON.parse(result.output);
  } catch {
    return null;
  }
}

export function parseGitHubRemote(value) {
  const remote = String(value ?? "").trim();
  const match = remote.match(
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([a-z\d](?:[a-z\d-]{0,38}))\/([a-z\d._-]+?)(?:\.git)?$/i,
  );
  if (!match) return null;
  const owner = match[1];
  const repository = match[2];
  return {
    owner,
    repository,
    fullName: `${owner}/${repository}`,
    htmlUrl: `https://github.com/${owner}/${repository}`,
    remote,
  };
}

export function githubNoreplyEmail(login, userId) {
  const safeLogin = String(login ?? "").trim();
  const safeUserId = String(userId ?? "").trim();
  return `${/^\d+$/.test(safeUserId) ? `${safeUserId}+` : ""}${safeLogin}@users.noreply.github.com`;
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function treeFiles(root) {
  if (!(await exists(root))) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = path.join(root, entry.name);
    const info = await lstat(target);
    if (info.isSymbolicLink()) {
      throw new PublicationError(
        `A publicação contém um link simbólico: ${path.relative(root, target)}.`,
      );
    }
    if (info.isDirectory()) files.push(...(await treeFiles(target)));
    else if (info.isFile()) files.push(target);
  }
  return files;
}

async function hashFiles(root, files) {
  const digest = createHash("sha256");
  let bytes = 0;
  for (const file of files) {
    const relative = path.relative(root, file).replaceAll(path.sep, "/");
    const info = await stat(file);
    bytes += info.size;
    digest.update(relative);
    digest.update("\0");
    for await (const chunk of createReadStream(file)) digest.update(chunk);
    digest.update("\0");
  }
  return { fingerprint: digest.digest("hex"), bytes };
}

export async function inspectPublicBuild(buildRoot) {
  const files = await treeFiles(buildRoot);
  if (!files.length || !(await exists(path.join(buildRoot, "index.html")))) {
    throw new PublicationError("Gere uma prévia válida antes de publicar.");
  }
  if (!(await exists(path.join(buildRoot, "404.html")))) {
    throw new PublicationError("A build não contém a página 404 esperada.");
  }
  for (const file of files) {
    const relative = path.relative(buildRoot, file).replaceAll(path.sep, "/");
    const segments = relative.toLowerCase().split("/");
    if (
      segments.some((segment) => privateSegments.has(segment)) ||
      segments.some((segment) => privateNames.has(segment) || segment.startsWith(".env."))
    ) {
      throw new PublicationError(`Arquivo privado encontrado na build: ${relative}.`);
    }
  }
  const hashed = await hashFiles(buildRoot, files);
  if (hashed.bytes >= maxPublishedBytes) {
    throw new PublicationError("A build ultrapassa o limite de segurança de 900 MiB.");
  }
  return {
    ...hashed,
    fileCount: files.length,
    paths: files.map((file) => path.relative(buildRoot, file).replaceAll(path.sep, "/")),
  };
}

export async function fingerprintLocalSource(siteConfigPath, essaysRoot) {
  const root = path.dirname(path.dirname(path.dirname(essaysRoot)));
  const files = [siteConfigPath, ...(await treeFiles(essaysRoot))].filter(Boolean);
  const available = [];
  for (const file of files) if (await exists(file)) available.push(file);
  return (await hashFiles(root, available)).fingerprint;
}

export function createPublicationManifest(site, essays) {
  const published = essays
    .filter((essay) => essay.draft === false)
    .map((essay) => ({
      slug: essay.slug,
      title: essay.title,
      photos: (essay.photos ?? []).map((photo) => photo.id),
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug));
  return {
    site: { title: site.title, author: site.author },
    essays: published,
    essayCount: published.length,
    photoCount: published.reduce((total, essay) => total + essay.photos.length, 0),
  };
}

export function diffPublicationManifests(previous, current) {
  if (!previous) {
    return {
      knownPrevious: false,
      addedEssays: current.essayCount,
      changedEssays: 0,
      removedEssays: 0,
      addedPhotos: current.photoCount,
      removedPhotos: 0,
      removedSlugs: [],
    };
  }
  const before = new Map(previous.essays.map((essay) => [essay.slug, essay]));
  const after = new Map(current.essays.map((essay) => [essay.slug, essay]));
  let addedEssays = 0;
  let changedEssays = 0;
  let removedEssays = 0;
  let addedPhotos = 0;
  let removedPhotos = 0;
  const removedSlugs = [];

  for (const [slug, essay] of after) {
    const oldEssay = before.get(slug);
    if (!oldEssay) {
      addedEssays += 1;
      addedPhotos += essay.photos.length;
      continue;
    }
    const oldPhotos = new Set(oldEssay.photos);
    const newPhotos = new Set(essay.photos);
    const additions = essay.photos.filter((photo) => !oldPhotos.has(photo)).length;
    const removals = oldEssay.photos.filter((photo) => !newPhotos.has(photo)).length;
    addedPhotos += additions;
    removedPhotos += removals;
    if (oldEssay.title !== essay.title || additions || removals) changedEssays += 1;
  }
  for (const [slug, essay] of before) {
    if (after.has(slug)) continue;
    removedEssays += 1;
    removedPhotos += essay.photos.length;
    removedSlugs.push(slug);
  }
  return {
    knownPrevious: true,
    addedEssays,
    changedEssays,
    removedEssays,
    addedPhotos,
    removedPhotos,
    removedSlugs,
  };
}

function localStatePath(repoRoot) {
  return path.join(repoRoot, ".mpov-local", "publication.json");
}

async function readLocalState(repoRoot) {
  try {
    return JSON.parse(await readFile(localStatePath(repoRoot), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return null;
  }
}

async function writeLocalState(repoRoot, state) {
  const target = localStatePath(repoRoot);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = target + ".tmp-" + randomBytes(4).toString("hex");
  await writeFile(temporary, JSON.stringify(state, null, 2) + "\n");
  await rm(target, { force: true });
  await rename(temporary, target);
}

function sourceReadiness({
  gitAvailable,
  parsedRemote,
  localHead,
  branch,
  remoteMainSha,
  changes,
}) {
  if (!gitAvailable) return "git-unavailable";
  if (!parsedRemote) return "invalid-origin";
  if (!localHead) return "no-local-main";
  if (branch !== "main") return "wrong-source-branch";
  if (!remoteMainSha) return "no-remote-main";
  if (localHead !== remoteMainSha) return "source-not-synchronized";
  if (changes.length) return "source-changed";
  return "ready";
}

export async function publicationStatus(repoRoot) {
  const localState = await readLocalState(repoRoot);
  const gitVersion = await runCommand("git", ["--version"], repoRoot);
  const gitAvailable = gitVersion.code === 0;
  if (!gitAvailable) {
    return {
      branch: publicationBranch,
      github: { available: false, connected: false, login: null },
      repository: { valid: false, sourceReady: false, sourceReason: "git-unavailable" },
      pages: { configured: false },
      published: localState,
    };
  }

  const [remoteResult, headResult, branchResult, changesResult, ghVersion] = await Promise.all([
    runCommand("git", ["remote", "get-url", "origin"], repoRoot),
    runCommand("git", ["rev-parse", "--verify", "HEAD"], repoRoot),
    runCommand("git", ["branch", "--show-current"], repoRoot),
    runCommand("git", ["status", "--porcelain", "--untracked-files=all"], repoRoot),
    runCommand("gh", ["--version"], repoRoot),
  ]);
  const parsedRemote = remoteResult.code === 0 ? parseGitHubRemote(remoteResult.output) : null;
  const localHead = outputSha(headResult);
  const branch = branchResult.code === 0 ? branchResult.output.trim() : null;
  const changes =
    changesResult.code === 0
      ? changesResult.output.split(/\r?\n/).filter(Boolean)
      : ["status-unavailable"];

  const [remoteMainResult, remotePublicationResult, loginResult] = await Promise.all([
    parsedRemote
      ? runCommand("git", ["ls-remote", "--heads", "origin", "refs/heads/main"], repoRoot)
      : Promise.resolve({ code: 1, output: "" }),
    parsedRemote
      ? runCommand(
          "git",
          ["ls-remote", "--heads", "origin", `refs/heads/${publicationBranch}`],
          repoRoot,
        )
      : Promise.resolve({ code: 1, output: "" }),
    ghVersion.code === 0
      ? runCommand("gh", ["api", "user", "--jq", ".login"], repoRoot)
      : Promise.resolve({ code: 1, output: "" }),
  ]);
  const remoteMainSha = outputSha(remoteMainResult);
  const remotePublicationSha = outputSha(remotePublicationResult);
  const connected = loginResult.code === 0 && Boolean(loginResult.output.trim());

  let repositoryView = null;
  let pagesView = null;
  if (connected && parsedRemote) {
    const [repositoryResult, pagesResult] = await Promise.all([
      runCommand(
        "gh",
        [
          "repo",
          "view",
          parsedRemote.fullName,
          "--json",
          "nameWithOwner,url,isPrivate,viewerPermission",
        ],
        repoRoot,
      ),
      runCommand("gh", ["api", `repos/${parsedRemote.fullName}/pages`], repoRoot),
    ]);
    repositoryView = jsonResult(repositoryResult);
    pagesView = jsonResult(pagesResult);
  }

  const sourceReason = sourceReadiness({
    gitAvailable,
    parsedRemote,
    localHead,
    branch,
    remoteMainSha,
    changes,
  });
  const permission = repositoryView?.viewerPermission ?? null;
  const canWrite = ["ADMIN", "MAINTAIN", "WRITE"].includes(permission);
  return {
    branch: publicationBranch,
    github: {
      available: ghVersion.code === 0,
      connected,
      login: connected ? loginResult.output.trim() : null,
    },
    repository: {
      valid: Boolean(parsedRemote && repositoryView),
      remote: parsedRemote?.remote ?? null,
      fullName: parsedRemote?.fullName ?? null,
      url: repositoryView?.url ?? parsedRemote?.htmlUrl ?? null,
      private: repositoryView?.isPrivate ?? null,
      permission,
      canWrite,
      branch,
      localHead,
      remoteMainSha,
      publicationSha: remotePublicationSha,
      changeCount: changes.length,
      sourceReady: sourceReason === "ready" && canWrite,
      sourceReason:
        sourceReason === "ready" && !canWrite ? "write-permission-required" : sourceReason,
    },
    pages: {
      configured: Boolean(pagesView),
      status: pagesView?.status ?? null,
      buildType: pagesView?.build_type ?? null,
      sourceBranch: pagesView?.source?.branch ?? null,
      sourcePath: pagesView?.source?.path ?? null,
      url: pagesView?.html_url ?? null,
      usesPublicationBranch:
        pagesView?.build_type === "legacy" &&
        pagesView?.source?.branch === publicationBranch &&
        pagesView?.source?.path === "/",
    },
    published: localState,
  };
}

export async function connectGithub(repoRoot) {
  const current = await runCommand("gh", ["api", "user", "--jq", ".login"], repoRoot);
  if (current.code === 0) return current.output.trim();
  const login = await runCommand(
    "gh",
    ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web"],
    repoRoot,
    { timeoutMs: 10 * 60_000 },
  );
  if (login.code !== 0) {
    throw new PublicationError(
      "O login oficial do GitHub não foi concluído. Tente novamente quando estiver pronto.",
    );
  }
  const setup = await runCommand("gh", ["auth", "setup-git", "--hostname", "github.com"], repoRoot);
  if (setup.code !== 0) {
    throw new PublicationError("O GitHub foi conectado, mas o Git não recebeu a credencial.");
  }
  return (await runCommand("gh", ["api", "user", "--jq", ".login"], repoRoot)).output.trim();
}

export async function createSnapshotRepository({
  buildRoot,
  remote,
  message,
  authorName,
  authorEmail,
}) {
  const inspection = await inspectPublicBuild(buildRoot);
  const temporary = await mkdtemp(path.join(os.tmpdir(), "mpov-publication-"));
  try {
    await cp(buildRoot, temporary, { recursive: true });
    await writeFile(path.join(temporary, ".nojekyll"), "");
    const initialized = await runCommand(
      "git",
      ["init", `--initial-branch=${publicationBranch}`],
      temporary,
    );
    if (initialized.code !== 0)
      throw new PublicationError("Não foi possível preparar o snapshot Git.");
    const added = await runCommand("git", ["add", "--all"], temporary);
    if (added.code !== 0)
      throw new PublicationError("Não foi possível preparar os arquivos públicos.");
    const committed = await runCommand(
      "git",
      [
        "-c",
        `user.name=${authorName}`,
        "-c",
        `user.email=${authorEmail}`,
        "commit",
        "--no-gpg-sign",
        "-m",
        message,
      ],
      temporary,
    );
    if (committed.code !== 0) {
      throw new PublicationError("Não foi possível criar o snapshot público: " + committed.output);
    }
    const commitResult = await runCommand("git", ["rev-parse", "HEAD"], temporary);
    const commitSha = outputSha(commitResult);
    const parents = await runCommand(
      "git",
      ["rev-list", "--parents", "-n", "1", "HEAD"],
      temporary,
    );
    if (!commitSha || parents.output.trim().split(/\s+/).length !== 1) {
      throw new PublicationError("O snapshot público não foi criado como um commit raiz.");
    }
    if (remote) {
      const addedRemote = await runCommand("git", ["remote", "add", "origin", remote], temporary);
      if (addedRemote.code !== 0)
        throw new PublicationError("Não foi possível associar o remoto público.");
    }
    return { temporary, commitSha, inspection };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

export async function removeSnapshotRepository(temporary) {
  if (!temporary) return;
  const resolved = path.resolve(temporary);
  const allowedRoot = path.resolve(os.tmpdir());
  const relative = path.relative(allowedRoot, resolved);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    !path.basename(resolved).startsWith("mpov-publication-")
  ) {
    throw new Error("O diretório temporário de publicação não é seguro para remoção.");
  }
  await rm(resolved, { recursive: true, force: true });
}

async function configurePages(repoRoot, status) {
  const body = JSON.stringify({
    build_type: "legacy",
    source: { branch: publicationBranch, path: "/" },
  });
  const method = status.pages.configured ? "PUT" : "POST";
  const configured = await runCommand(
    "gh",
    ["api", "--method", method, `repos/${status.repository.fullName}/pages`, "--input", "-"],
    repoRoot,
    { input: body, timeoutMs: 60_000 },
  );
  if (configured.code !== 0) {
    throw new PublicationError(
      "O snapshot chegou ao GitHub, mas não foi possível configurar o Pages: " + configured.output,
    );
  }
}

export async function buildPublicationReview({ repoRoot, buildRoot, site, essays }) {
  const status = await publicationStatus(repoRoot);
  if (!status.github.available) throw new PublicationError("Instale o GitHub CLI para publicar.");
  if (!status.github.connected)
    throw new PublicationError("Conecte sua conta do GitHub antes de publicar.");
  if (!status.repository.valid)
    throw new PublicationError("O remoto origin não aponta para um repositório GitHub acessível.");
  if (!status.repository.sourceReady) {
    throw new PublicationError(
      "A base técnica precisa estar limpa e sincronizada com a main antes da publicação.",
    );
  }
  const build = await inspectPublicBuild(buildRoot);
  const manifest = createPublicationManifest(site, essays);
  const diff = diffPublicationManifests(status.published?.manifest ?? null, manifest);
  return {
    id: randomBytes(16).toString("hex"),
    createdAt: new Date().toISOString(),
    repository: {
      fullName: status.repository.fullName,
      url: status.repository.url,
      remote: status.repository.remote,
    },
    branch: publicationBranch,
    expectedRemoteSha: status.repository.publicationSha,
    build,
    manifest,
    diff,
  };
}

export async function publishReviewedSnapshot({ repoRoot, buildRoot, review }) {
  const status = await publicationStatus(repoRoot);
  if (!status.repository.sourceReady) {
    throw new PublicationError("A base técnica mudou. Revise a publicação novamente.");
  }
  if (status.repository.fullName !== review.repository.fullName) {
    throw new PublicationError("O repositório remoto mudou depois da revisão.");
  }
  if ((status.repository.publicationSha ?? null) !== (review.expectedRemoteSha ?? null)) {
    throw new PublicationError(
      "Outra publicação alterou a branch pública. Nada foi sobrescrito; revise novamente.",
    );
  }
  const currentBuild = await inspectPublicBuild(buildRoot);
  if (currentBuild.fingerprint !== review.build.fingerprint) {
    throw new PublicationError(
      "A build mudou depois da revisão. Gere e revise a prévia novamente.",
    );
  }

  const [nameResult, userIdResult] = await Promise.all([
    runCommand("git", ["config", "--get", "user.name"], repoRoot),
    runCommand("gh", ["api", "user", "--jq", ".id"], repoRoot),
  ]);
  const authorName =
    nameResult.code === 0 && nameResult.output ? nameResult.output : status.github.login;
  const authorEmail = githubNoreplyEmail(
    status.github.login,
    userIdResult.code === 0 ? userIdResult.output : null,
  );
  const snapshot = await createSnapshotRepository({
    buildRoot,
    remote: status.repository.remote,
    message: `Publicação atual · ${new Date().toISOString().slice(0, 10)}`,
    authorName,
    authorEmail,
  });

  try {
    const expected = review.expectedRemoteSha ?? "";
    const pushed = await runCommand(
      "git",
      [
        "push",
        `--force-with-lease=refs/heads/${publicationBranch}:${expected}`,
        "origin",
        `HEAD:refs/heads/${publicationBranch}`,
      ],
      snapshot.temporary,
      { timeoutMs: 2 * 60_000 },
    );
    if (pushed.code !== 0) {
      throw new PublicationError(
        "O GitHub recusou a publicação sem alterar a versão atual: " + pushed.output,
      );
    }
    const localState = {
      repository: review.repository.fullName,
      branch: publicationBranch,
      commitSha: snapshot.commitSha,
      publishedAt: new Date().toISOString(),
      manifest: review.manifest,
      lastDiff: review.diff,
      pagesConfigured: false,
    };
    await writeLocalState(repoRoot, localState);
    await configurePages(repoRoot, status);
    localState.pagesConfigured = true;
    await writeLocalState(repoRoot, localState);
    return {
      commitSha: snapshot.commitSha,
      url:
        status.pages.url ??
        `https://${review.repository.fullName.split("/")[0]}.github.io/${review.repository.fullName.split("/")[1]}/`,
      diff: review.diff,
    };
  } finally {
    await removeSnapshotRepository(snapshot.temporary);
  }
}

export async function verifyPublishedSite(repoRoot) {
  const status = await publicationStatus(repoRoot);
  const published = status.published;
  const url = status.pages.url ?? published?.url;
  if (!published || !url)
    throw new PublicationError("Ainda não há uma publicação local registrada.");
  const errors = [];
  let homeStatus = null;
  try {
    const response = await fetch(url, {
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(12_000),
    });
    homeStatus = response.status;
    const html = await response.text();
    if (!response.ok) errors.push(`A página inicial respondeu HTTP ${response.status}.`);
    if (!html.includes(published.manifest.site.title)) {
      errors.push("A página inicial ainda não mostra a identidade esperada.");
    }
  } catch (error) {
    errors.push(
      "Não foi possível abrir a página inicial: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  for (const slug of published.lastDiff?.removedSlugs ?? []) {
    try {
      const response = await fetch(new URL(`ensaios/${slug}/`, url), {
        headers: { "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(12_000),
      });
      if (response.status !== 404)
        errors.push(`O ensaio retirado ${slug} respondeu HTTP ${response.status}.`);
    } catch (error) {
      errors.push(
        `Não foi possível verificar a retirada de ${slug}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { success: errors.length === 0, url, homeStatus, errors };
}
