import { mkdir, access, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const essaysRoot = path.join(repoRoot, "src", "content", "ensaios");

function readArgument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function fail(message) {
  console.error(`Erro: ${message}`);
  process.exitCode = 1;
}

const title = readArgument("titulo");
const date = readArgument("data");
const requestedSlug = readArgument("slug");

if (!title || !date) {
  fail('uso: npm run new:essay -- --titulo "Título" --data YYYY-MM-DD [--slug slug]');
} else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  fail("a data precisa estar no formato YYYY-MM-DD");
} else {
  const parsedDate = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== date) {
    fail("a data não é válida");
  } else {
    const slug = slugify(requestedSlug || title);
    if (!slug) {
      fail("não foi possível criar um slug a partir do título");
    } else {
      const essayDir = path.join(essaysRoot, slug);
      const markdownPath = path.join(essayDir, "index.md");
      try {
        await access(essayDir);
        fail(`o ensaio “${slug}” já existe`);
      } catch {
        await mkdir(essayDir, { recursive: true });
        const content = `---
slug: ${slug}
title: ${JSON.stringify(title)}
date: ${date}
draft: true
coverId: foto-01
photos: []
---
`;
        await writeFile(markdownPath, content, "utf8");
        console.log(`Ensaio criado em src/content/ensaios/${slug}/index.md`);
        console.log(
          "Ele começa como rascunho. Prepare as fotos, preencha alt/legendas e só então troque draft para false.",
        );
      }
    }
  }
}
