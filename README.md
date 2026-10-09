# Meu ponto de vista

Site de uma publicação fotográfica. Este repositório guarda apenas o código: as fotografias e os textos não entram no Git e ficam na máquina do autor. É a build gerada a partir deles que é publicada — por isso a página pública tem as imagens, e o histórico do repositório não.

## Stack

Astro estático · TypeScript estrito · CSS nativo · Node 24 · GitHub CLI

Sem framework de interface, sem banco de dados e sem servidor: o resultado é um site estático.

## Uso

```bash
npm ci
npm run dev      # site local
npm run studio   # estúdio local, em http://127.0.0.1:4322/
npm run build    # build estática em dist/
```

O estúdio é o caminho normal do dia a dia: ele cria e edita ensaios, prepara as fotografias, gera a build, mostra a prévia e publica. No Windows, [Abrir Estúdio.cmd](<Abrir Estúdio.cmd>) faz isso num duplo clique.

A publicação envia apenas a build para `gh-pages`, em um commit raiz. `main` nunca recebe conteúdo pessoal.

## Comandos

| Comando                          | O que faz                                    |
| -------------------------------- | -------------------------------------------- |
| `npm run dev`                    | site local                                   |
| `npm run studio`                 | estúdio local                                |
| `npm run build`                  | build estática em `dist/`                    |
| `npm run preview`                | serve a build já gerada                      |
| `npm run publish:check`          | verificações rápidas antes de publicar       |
| `npm run check:content-boundary` | confere que conteúdo local não entrou no Git |

## Fronteira local

`src/data/site.json`, `src/content/ensaios/` e `.mpov-local/` são ignorados pelo Git. O repositório traz apenas `src/data/site.example.json` e conteúdo sintético de teste, então um clone público não herda o material de outra pessoa.

Fotografias publicadas são JPEG, com o maior lado limitado a 3000 px e sem metadados de EXIF, XMP, IPTC ou GPS.

## Verificações

```bash
npm run format:check   # formatação
npm run check          # tipos, conteúdo e fronteira local
npm run lint           # lint
npm test               # testes
npm run test:empty     # build sem nenhum ensaio
npm run build          # build + links + fronteira do estúdio
npm run test:e2e       # navegador
```

O CI roda os mesmos passos, com `npm ci` e Actions fixadas por SHA.

## Mais

As decisões de arquitetura, com as opções descartadas, estão em [docs/decisions](docs/decisions).

Site público: <https://mafhper.github.io/mpov/>.
