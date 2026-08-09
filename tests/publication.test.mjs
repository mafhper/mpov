import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PublicationError,
  createPublicationManifest,
  createSnapshotRepository,
  diffPublicationManifests,
  githubNoreplyEmail,
  inspectPublicBuild,
  parseGitHubRemote,
  removeSnapshotRepository,
  runCommand,
} from "../scripts/publication-service.mjs";

test("mantém o endereço pessoal fora dos commits públicos", () => {
  assert.equal(githubNoreplyEmail("mafhper", 123456), "123456+mafhper@users.noreply.github.com");
  assert.equal(githubNoreplyEmail("mafhper", null), "mafhper@users.noreply.github.com");
});

test("reconhece somente remotos GitHub explícitos", () => {
  assert.equal(parseGitHubRemote("https://github.com/mafhper/mpov.git")?.fullName, "mafhper/mpov");
  assert.equal(parseGitHubRemote("git@github.com:mafhper/mpov.git")?.fullName, "mafhper/mpov");
  assert.equal(
    parseGitHubRemote("ssh://git@github.com/mafhper/mpov.git")?.fullName,
    "mafhper/mpov",
  );
  assert.equal(parseGitHubRemote("https://example.com/mafhper/mpov.git"), null);
  assert.equal(parseGitHubRemote("https://github.com/mafhper/mpov/extra.git"), null);
});

test("resume adições e retiradas sem guardar o conteúdo das fotografias", () => {
  const previous = createPublicationManifest({ title: "Meu ponto de vista", author: "Matheus" }, [
    { slug: "primeiro", title: "Primeiro", draft: false, photos: [{ id: "a" }, { id: "b" }] },
    { slug: "retirado", title: "Retirado", draft: false, photos: [{ id: "c" }] },
    { slug: "rascunho", title: "Rascunho", draft: true, photos: [{ id: "d" }] },
  ]);
  const current = createPublicationManifest({ title: "Meu ponto de vista", author: "Matheus" }, [
    {
      slug: "primeiro",
      title: "Primeiro revisto",
      draft: false,
      photos: [{ id: "b" }, { id: "e" }],
    },
    { slug: "novo", title: "Novo", draft: false, photos: [{ id: "f" }] },
  ]);
  assert.deepEqual(diffPublicationManifests(previous, current), {
    knownPrevious: true,
    addedEssays: 1,
    changedEssays: 1,
    removedEssays: 1,
    addedPhotos: 2,
    removedPhotos: 2,
    removedSlugs: ["retirado"],
  });
});

test("prepara somente a build atual em um commit raiz", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "mpov-build-test-"));
  const buildRoot = path.join(fixture, "dist");
  let snapshot;
  try {
    await mkdir(path.join(buildRoot, "assets"), { recursive: true });
    await writeFile(path.join(buildRoot, "index.html"), "<main>Atual</main>");
    await writeFile(path.join(buildRoot, "404.html"), "<main>Ausente</main>");
    await writeFile(path.join(buildRoot, "assets", "site.css"), "body{margin:0}");
    snapshot = await createSnapshotRepository({
      buildRoot,
      remote: null,
      message: "Publicação de teste",
      authorName: "Teste",
      authorEmail: "teste@example.com",
    });
    const tree = await runCommand(
      "git",
      ["ls-tree", "-r", "--name-only", "HEAD"],
      snapshot.temporary,
    );
    assert.equal(tree.code, 0);
    assert.deepEqual(tree.output.split(/\r?\n/).sort(), [
      ".nojekyll",
      "404.html",
      "assets/site.css",
      "index.html",
    ]);
    const parents = await runCommand(
      "git",
      ["rev-list", "--parents", "-n", "1", "HEAD"],
      snapshot.temporary,
    );
    assert.equal(parents.output.trim().split(/\s+/).length, 1);
  } finally {
    if (snapshot) await removeSnapshotRepository(snapshot.temporary);
    await rm(fixture, { recursive: true, force: true });
  }
});

test("recusa arquivos privados dentro da build", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "mpov-private-build-"));
  try {
    await writeFile(path.join(fixture, "index.html"), "<main>Atual</main>");
    await writeFile(path.join(fixture, "404.html"), "<main>Ausente</main>");
    await mkdir(path.join(fixture, "studio"));
    await writeFile(path.join(fixture, "studio", "index.html"), "privado");
    await assert.rejects(() => inspectPublicBuild(fixture), PublicationError);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
