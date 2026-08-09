import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { stringify } from "yaml";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const generatedContentRoot = path.join(projectRoot, "tests", ".generated-content");

const site = {
  title: "Meu ponto de vista",
  author: "Matheus Lima",
  description: "Uma publicação sintética usada somente pelos testes.",
  about:
    "Um lugar para desabafar o meu ponto de vista em fotografias. Elas ficam públicas até que não fiquem.",
  mosaicGrouping: "separated",
  profile: { github: "mafhper", alt: "Retrato de Matheus Lima" },
};

const essays = [
  {
    slug: "luz-de-teste",
    title: "Luz de teste",
    date: "2026-08-08",
    location: "Um lugar inventado",
    excerpt: "Claridade, sombra e espaço em uma sequência sintética.",
    layout: "margins",
    tags: ["por-do-sol", "natureza", "luz"],
    theme: {
      palette: "field",
      typography: "soft",
      header: "index",
      headerFont: "serif",
    },
    context:
      "Estas imagens não pertencem a uma exposição. Elas existem apenas para validar o ritmo, a leitura e a retirada do conteúdo pessoal.",
    photos: [
      ["luz-01", 900, 600, "#426a48", "top", "cover", "left"],
      ["luz-02", 600, 900, "#d5a45b", "center", "cover", "right"],
      ["luz-03", 1000, 560, "#6e8aa8", "right", "contain", "auto"],
      ["luz-04", 720, 720, "#34413a", "bottom", "cover", "left"],
    ],
  },
  {
    slug: "formas-de-teste",
    title: "Formas em pausa",
    date: "2026-08-07",
    location: "Entre cor e matéria",
    excerpt: "Quatro formas abstratas para testar páginas e recortes.",
    layout: "pages",
    tags: ["abstrato", "cor"],
    theme: {
      palette: "dusk",
      typography: "direct",
      header: "poster",
      headerAlignment: "center",
      headerScale: "display",
      headerFont: "sans",
    },
    context:
      "A sequência alterna proporções para provar que a composição continua estável sem depender das fotografias locais.",
    photos: [
      ["forma-01", 900, 600, "#76536d", "center", "contain", "left", "portrait"],
      ["forma-02", 600, 900, "#375d74", "top", "cover", "right", "portrait"],
      ["forma-03", 960, 540, "#b26f4f", "right", "cover", "auto", "wide"],
      ["forma-04", 720, 720, "#4b446d", "center", "contain", "auto", "full"],
    ],
  },
  {
    slug: "horizonte-de-teste",
    title: "Linha de horizonte",
    date: "2026-08-06",
    location: "Uma cidade possível",
    excerpt: "Uma sequência curta para testar a leitura linear.",
    layout: "sequence",
    tags: ["por-do-sol", "cidade"],
    theme: { palette: "night", typography: "editorial", header: "quiet" },
    context:
      "O horizonte serve somente como referência visual para os testes automatizados da publicação vazia e das rotas temáticas.",
    photos: [
      ["horizonte-01", 1000, 560, "#354b66", "center", "contain", "auto"],
      ["horizonte-02", 900, 600, "#8a5d4a", "bottom", "contain", "auto"],
      ["horizonte-03", 600, 900, "#27303d", "top", "contain", "auto"],
    ],
  },
];

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function syntheticPhoto(target, width, height, color, index) {
  const accent = index % 2 ? "#f0d49a" : "#d9ecdf";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="${color}"/>
    <circle cx="${Math.round(width * 0.68)}" cy="${Math.round(height * 0.34)}" r="${Math.round(Math.min(width, height) * 0.18)}" fill="${accent}" fill-opacity="0.72"/>
    <path d="M0 ${Math.round(height * 0.78)} C ${Math.round(width * 0.3)} ${Math.round(height * 0.52)}, ${Math.round(width * 0.62)} ${Math.round(height * 0.94)}, ${width} ${Math.round(height * 0.62)} L ${width} ${height} L 0 ${height} Z" fill="#111" fill-opacity="0.28"/>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 78, progressive: true }).toFile(target);
}

export async function createTestContent(root = generatedContentRoot) {
  const testsRoot = path.join(projectRoot, "tests");
  const target = path.resolve(root);
  if (!isWithin(testsRoot, target)) {
    throw new Error("O conteúdo sintético só pode ser criado dentro da pasta de testes.");
  }
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, "site.json"), JSON.stringify(site, null, 2) + "\n");

  for (const essay of essays) {
    const essayRoot = path.join(target, "ensaios", essay.slug);
    const photosRoot = path.join(essayRoot, "photos");
    await mkdir(photosRoot, { recursive: true });
    const photos = [];
    for (const [index, photo] of essay.photos.entries()) {
      const [id, width, height, color, focalPoint, crop, placement, display] = photo;
      const fileName = id + ".jpg";
      await syntheticPhoto(path.join(photosRoot, fileName), width, height, color, index);
      photos.push({
        id,
        src: `./photos/${fileName}`,
        alt: `Composição sintética ${index + 1} do ensaio ${essay.title}.`,
        caption: `Esta legenda sintética valida o espaço editorial da fotografia ${index + 1} sem usar conteúdo pessoal.`,
        focalPoint,
        crop,
        placement,
        display: display ?? (index === 2 ? "wide" : index === 1 ? "portrait" : "full"),
      });
    }
    const data = {
      slug: essay.slug,
      title: essay.title,
      date: essay.date,
      location: essay.location,
      excerpt: essay.excerpt,
      draft: false,
      layout: essay.layout,
      tags: essay.tags,
      theme: essay.theme,
      coverId: photos[0].id,
      photos,
    };
    await writeFile(
      path.join(essayRoot, "index.md"),
      `---\n${stringify(data).trimEnd()}\n---\n\n${essay.context}\n`,
    );
  }

  const draftRoot = path.join(target, "ensaios", "rascunho-de-teste");
  await mkdir(draftRoot, { recursive: true });
  await writeFile(
    path.join(draftRoot, "index.md"),
    `---\n${stringify({
      slug: "rascunho-de-teste",
      title: "Rascunho de teste",
      date: "2026-08-09",
      draft: true,
      layout: "sequence",
      coverId: "foto-01",
      photos: [],
    }).trimEnd()}\n---\n`,
  );
  return {
    contentRoot: path.join(target, "ensaios"),
    siteConfig: path.join(target, "site.json"),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await createTestContent();
  console.log("Conteúdo sintético de teste preparado em " + generatedContentRoot);
}
