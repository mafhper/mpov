import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(projectRoot, "scripts", "studio-server.mjs");

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor(url, child) {
  const deadline = Date.now() + 10_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (error) {
      lastError = error;
    }
    if (child.exitCode !== null) throw new Error("O estúdio encerrou antes de iniciar.");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError ?? new Error("O estúdio não iniciou a tempo.");
}

function tokenFrom(html) {
  const match = html.match(/MPOV_STUDIO_TOKEN\s*=\s*"([^"]+)"/);
  assert.ok(match, "o token local deve estar presente no HTML do estúdio");
  return match[1];
}

async function localApi(origin, token, route, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Origin", origin);
  headers.set("X-MPOV-Studio-Token", token);
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    options.body = JSON.stringify(options.json);
  }
  const response = await fetch(origin + route, { ...options, headers });
  return { response, payload: await response.json() };
}

test("o estúdio local faz CRUD de identidade, ensaio e fotografia sem tocar no projeto", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "mpov-studio-"));
  const port = await freePort();
  const origin = "http://127.0.0.1:" + port;
  const contentPath = path.join(fixture, "src", "content", "ensaios");
  const dataPath = path.join(fixture, "src", "data");
  const buildPath = path.join(fixture, "dist");
  await mkdir(contentPath, { recursive: true });
  await mkdir(dataPath, { recursive: true });
  await mkdir(buildPath, { recursive: true });
  await writeFile(path.join(buildPath, "index.html"), "<main>Prévia local</main>");
  await writeFile(
    path.join(dataPath, "site.json"),
    JSON.stringify({
      title: "Meu ponto de vista",
      author: "Matheus Lima",
      description: "Descrição local.",
      about: "Texto local.",
    }),
  );

  const child = spawn(
    process.execPath,
    [serverPath, "--root", fixture, "--port", String(port), "--no-open"],
    {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let serverOutput = "";
  child.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  let token;

  try {
    const html = await (await waitFor(origin + "/", child)).text();
    token = tokenFrom(html);

    const initial = await (await fetch(origin + "/api/state")).json();
    assert.equal(initial.essays.length, 0);
    assert.equal(initial.build.status, "stale");
    assert.equal(initial.build.success, null);

    const siteUpdate = await localApi(origin, token, "/api/site", {
      method: "PUT",
      json: {
        revision: initial.site.revision,
        title: "Outro ponto de vista",
        author: "Matheus Lima",
        description: "Descrição atualizada.",
        about: "Texto atualizado.",
        mosaicGrouping: "continuous",
        profile: { github: "mafhper", alt: "Retrato de teste" },
      },
    });
    assert.equal(siteUpdate.response.status, 200);
    assert.equal(siteUpdate.payload.site.title, "Outro ponto de vista");
    assert.equal(siteUpdate.payload.site.mosaicGrouping, "continuous");
    assert.equal(siteUpdate.payload.site.profile.github, "mafhper");

    const created = await localApi(origin, token, "/api/essays", {
      method: "POST",
      json: { title: "Luz de teste", date: "2026-08-08" },
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.payload.essay.slug, "luz-de-teste");
    assert.equal(created.payload.essay.draft, true);
    assert.equal(created.payload.essay.layout, "sequence");

    const image = await sharp({
      create: { width: 36, height: 24, channels: 3, background: { r: 48, g: 74, b: 92 } },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.append("revision", created.payload.essay.revision);
    form.append("files", new Blob([image], { type: "image/png" }), "luz.png");
    const uploaded = await localApi(origin, token, "/api/essays/luz-de-teste/photos", {
      method: "POST",
      body: form,
    });
    assert.equal(uploaded.response.status, 201);
    assert.equal(uploaded.payload.essay.photos.length, 1);
    assert.match(uploaded.payload.essay.photos[0].fileName, /\.jpg$/);

    const photo = uploaded.payload.essay.photos[0];
    const saved = await localApi(origin, token, "/api/essays/luz-de-teste", {
      method: "PUT",
      json: {
        revision: uploaded.payload.essay.revision,
        title: "Luz de teste",
        date: "2026-08-08",
        location: "",
        excerpt: "Uma sequência local.",
        context: "Contexto de teste.",
        draft: false,
        layout: "margins",
        tags: ["#por-do-sol", "natureza"],
        theme: {
          palette: "custom",
          typography: "soft",
          header: "poster",
          headerAlignment: "center",
          headerScale: "compact",
          headerFont: "sans",
          custom: {
            light: {
              background: "#fbf2f8",
              surface: "#fff9fc",
              text: "#382536",
              muted: "#6e5368",
              accent: "#9b4e2e",
            },
            dark: {
              background: "#211923",
              surface: "#302537",
              text: "#fff0fb",
              muted: "#e5c8df",
              accent: "#ffc284",
            },
          },
        },
        coverId: photo.id,
        photos: [
          {
            id: photo.id,
            fileName: photo.fileName,
            alt: "Um retângulo azul criado para testar o estúdio.",
            caption: "",
            focalPoint: "top",
            crop: "cover",
            placement: "left",
            display: "full",
          },
        ],
      },
    });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.payload.essay.draft, false);
    assert.equal(saved.payload.essay.layout, "margins");
    assert.deepEqual(saved.payload.essay.tags, ["por-do-sol", "natureza"]);
    assert.equal(saved.payload.essay.theme.palette, "custom");
    assert.equal(saved.payload.essay.theme.headerAlignment, "center");
    assert.equal(saved.payload.essay.theme.headerScale, "compact");
    assert.equal(saved.payload.essay.theme.headerFont, "sans");
    assert.equal(saved.payload.essay.theme.custom.light.background, "#fbf2f8");
    assert.equal(saved.payload.essay.theme.custom.dark.background, "#211923");
    assert.equal(saved.payload.essay.photos[0].crop, "cover");
    assert.equal(saved.payload.essay.photos[0].placement, "left");
    assert.equal(saved.payload.essay.photos[0].focalPoint, "top");

    const metadata = await sharp(
      path.join(fixture, "src", "content", "ensaios", "luz-de-teste", "photos", photo.fileName),
    ).metadata();
    assert.ok(metadata.width <= 3000 && metadata.height <= 3000);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.xmp, undefined);

    const singlePhotoDelete = await localApi(
      origin,
      token,
      "/api/essays/luz-de-teste/photos/" + encodeURIComponent(photo.id),
      { method: "DELETE", json: { revision: saved.payload.essay.revision } },
    );
    assert.equal(singlePhotoDelete.response.status, 409);

    const removed = await localApi(origin, token, "/api/essays/luz-de-teste", {
      method: "DELETE",
      json: { revision: saved.payload.essay.revision, confirm: true },
    });
    assert.equal(removed.response.status, 200);
    const finalState = await (await fetch(origin + "/api/state")).json();
    assert.equal(finalState.essays.length, 0);
  } catch (error) {
    error.message += "\nSaída do estúdio:\n" + serverOutput;
    throw error;
  } finally {
    if (token && child.exitCode === null) {
      await localApi(origin, token, "/api/shutdown", { method: "POST", json: {} }).catch(
        () => undefined,
      );
    }
    if (child.exitCode === null) {
      await Promise.race([
        once(child, "exit"),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    }
    await rm(fixture, { recursive: true, force: true });
  }
});
