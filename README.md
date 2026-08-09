# Meu ponto de vista

Uma publicação fotográfica temporária. O site mostra apenas o que faz sentido tornar público agora; não funciona como portfólio, arquivo ou promessa de permanência.

## O que fica público — e o que não fica

O projeto separa três coisas:

| Lugar               | Conteúdo                                    | Histórico                                       |
| ------------------- | ------------------------------------------- | ----------------------------------------------- |
| Computador do autor | Studio, configurações, textos e fotografias | Permanece local e ignorado pelo Git             |
| `main`              | Código reutilizável da plataforma           | Histórico técnico normal, sem conteúdo pessoal  |
| `gh-pages`          | Somente a build estática atual              | Um novo commit raiz substitui a versão anterior |

`src/data/site.json`, `src/content/ensaios/` e `.mpov-local/` são locais. O repositório traz apenas `src/data/site.example.json` e conteúdo sintético criado durante os testes. Assim, um clone público pode ser personalizado sem herdar a exposição de outra pessoa.

## Fluxo cotidiano no Studio

1. Dê duplo clique em [Abrir Estúdio.cmd](<Abrir Estúdio.cmd>). O atalho inicia o serviço local, espera que ele responda e abre `http://127.0.0.1:4322/`.
2. Crie ou edite ensaios pela interface. É possível alterar texto, ordem, capa, descrições, legendas, disposição, recorte, ponto de interesse, paleta, tipografia, cabeçalho e hashtags.
3. Use **Gerar build**. A build é produzida localmente e pode representar uma exposição com vários ensaios, apenas um ensaio ou nenhum.
4. Use **Abrir prévia** e revise exatamente o que será servido em `/mpov/`.
5. Na área **Publicação**, conecte o GitHub. O Studio abre o login oficial do GitHub CLI no navegador; o token fica no gerenciador de credenciais do sistema e nunca é lido ou salvo pelo projeto.
6. Use **Revisar publicação**. Antes de liberar o botão final, o Studio valida o código, a build, o conteúdo, o repositório e mostra quantos ensaios e fotografias serão adicionados, alterados ou retirados.
7. Confirme em **Publicar versão atual**. O Studio cria um snapshot temporário contendo somente a build e substitui `gh-pages` com proteção contra sobrescrever uma publicação remota inesperada.
8. Use **Verificar site** depois que o Pages terminar de atualizar.

Alterar arquivos depois de gerar a build a torna obsoleta. Nesse caso, o Studio exige uma nova build e uma nova revisão. Nenhuma ação remota acontece ao salvar conteúdo, gerar build ou abrir a prévia.

## Primeira preparação da plataforma

Antes da primeira publicação fotográfica, o código da plataforma precisa existir em `main`. É uma etapa técnica única:

1. instalar as dependências com `npm ci`;
2. executar os gates descritos abaixo;
3. revisar o diff para confirmar que nenhum conteúdo local ou arquivo privado foi incluído;
4. criar e enviar o primeiro commit de `main`.

Enquanto isso não estiver concluído, a área **Publicação** explica que a base técnica ainda precisa ser preparada e mantém o botão remoto desabilitado. Após o primeiro envio de `main`, o fluxo editorial normal não exige terminal nem GitHub Desktop.

Na primeira publicação confirmada, o Studio também aponta o GitHub Pages para a raiz de `gh-pages`. O antigo workflow de deploy não é usado, porque ele colocaria o conteúdo pessoal no histórico de `main`.

## Retirar fotografias ou toda a exposição

Para retirar uma fotografia ou ensaio:

1. use **Retirar fotografia** ou **Retirar do site**;
2. gere a build novamente;
3. confira a prévia;
4. revise a publicação — as retiradas aparecem explicitamente no resumo;
5. publique a versão atual e verifique o site.

Para retirar tudo, deixe de haver ensaios publicados e siga o mesmo fluxo. O endereço passa a mostrar “Por enquanto, nada por aqui.”, e o sitemap deixa de conter rotas de ensaios.

Cada publicação de `gh-pages` nasce sem pais e substitui a referência remota anterior usando `--force-with-lease`. Portanto, fotografias retiradas não continuam no histórico referenciado da branch pública. Nenhuma branch ou tag criada por este fluxo aponta para versões anteriores.

Isso deixa de servir e referenciar o material nos sistemas controlados pelo projeto. Não é possível revogar downloads, capturas de tela, caches de terceiros ou cópias feitas enquanto as fotografias estavam públicas. Se conteúdo pessoal for acidentalmente commitado em `main`, a limpeza deixa de ser uma retirada cotidiana e exige a operação emergencial documentada pelo script `npm run ensaio:remover` e uma revisão técnica do histórico.

## Autoria e apresentação

As fotografias importadas pelo Studio são preparadas localmente: orientação corrigida, conversão para sRGB, JPEG progressivo com qualidade aproximada de 85, maior lado limitado a 3000 px e remoção de EXIF, XMP, IPTC, GPS e identificadores.

Na página do ensaio, **Imagem inteira** preserva a proporção do arquivo. **Preencher e recortar** só é aplicado quando escolhido pelo autor; o ponto de interesse orienta o recorte e a ampliação continua mostrando a imagem inteira.

Cada ensaio oferece três ritmos:

- **Sequência**: uma fotografia por vez;
- **Páginas**: pares e linhas inteiras escolhidos por fotografia;
- **Margens**: texto e fotografia dialogam em lados alternados.

Em telas pequenas, as composições voltam a uma coluna para preservar leitura e toque. O mosaico da página inicial pode separar os ensaios ou formar um fluxo contínuo. Hashtags abrem apenas as publicações relacionadas; não existe uma página-catálogo de assuntos.

A preferência global clara ou escura pertence ao visitante. A paleta editorial de cada ensaio tem versões próprias para os dois modos e não altera pixels, brilho ou contraste das fotografias. Paletas personalizadas só são aceitas quando texto, texto secundário e destaque atendem ao contraste mínimo nos dois modos.

## Segurança do fluxo local

- o Studio escuta apenas em `127.0.0.1`;
- requisições de escrita exigem a sessão local e a origem esperada;
- comandos externos usam argumentos separados, sem shell;
- o Studio não recebe nem armazena token do GitHub;
- a build é recusada se contiver links simbólicos, arquivos privados ou mais de 900 MiB;
- a revisão registra a impressão digital da build e recusa publicar se ela mudar;
- o push usa o SHA remoto observado na revisão como `--force-with-lease`;
- `check:content-boundary` bloqueia conteúdo pessoal rastreado pelo Git;
- o CI usa conteúdo fotográfico sintético, nunca os arquivos do autor.

O estado local da última publicação fica em `.mpov-local/publication.json`, também ignorado pelo Git. Ele contém somente títulos, slugs e IDs necessários para apresentar o resumo de inclusões e retiradas; não arquiva fotografias.

## Desenvolvimento técnico

Requisitos: Node 24, npm, Git e [GitHub CLI](https://cli.github.com/). O site usa Astro estático, TypeScript estrito e CSS nativo.

Gates locais:

```powershell
npm run format:check
npm run check
npm run lint
npm test
npm run test:empty
npm run build
npm run test:e2e
```

`npm run publish:check` reúne as verificações rápidas executadas novamente pelo Studio antes de uma revisão remota. O CI usa `npm ci`, permissões explícitas, Actions fixadas por SHA e Dependabot; não possui credenciais de publicação nem acesso ao conteúdo local.

A decisão arquitetural, incluindo opções descartadas, custos, rollback e validação, está registrada em [docs/decisions/0001-publicacao-local-efemera.md](docs/decisions/0001-publicacao-local-efemera.md).

Endereço público previsto: <https://mafhper.github.io/mpov/>.
