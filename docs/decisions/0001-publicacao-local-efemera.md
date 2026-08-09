# Decisão 0001 — Conteúdo local e publicação efêmera

## Problema

O site deve publicar somente a exposição atual. Fotografias e textos retirados não devem permanecer no histórico normal do repositório da plataforma, e a autoria cotidiana precisa acontecer pela interface local do Studio.

## Restrições e premissas

- GitHub Pages estático, sem CMS ou credenciais no site público.
- Código e Studio podem ser públicos e reutilizáveis.
- Fotografias preparadas, ensaios e identidade editorial pertencem ao computador do autor.
- Uma publicação precisa poder ficar completamente vazia.
- Downloads, screenshots, forks e caches externos não podem ser revogados.
- Nenhuma operação deve sobrescrever uma publicação feita por outro computador sem detectar a divergência.

## Opções consideradas

1. **Versionar ensaios na `main` e reescrever o histórico ao retirar conteúdo.** É simples para publicar, mas transforma toda retirada em uma operação arriscada com `git-filter-repo` e force push.
2. **Criar um OAuth próprio ou um CMS remoto.** Facilita a autenticação aparente, mas introduz tokens, callbacks, manutenção de aplicação e uma superfície pública incompatível com a autoria local.
3. **Manter conteúdo local e substituir uma branch estática de publicação.** A `main` guarda somente a plataforma; o Studio gera e envia a build atual para `gh-pages` em um commit sem ancestral.

## Escolha e racional

Adotar a opção 3.

- `src/content/ensaios/` e `src/data/site.json` são locais e ignorados pelo Git.
- `site.example.json` permite iniciar um clone sem incorporar a identidade de outra pessoa.
- A `main` contém código, testes, documentação e workflows, nunca a exposição pessoal.
- O Studio publica somente `dist/` em `gh-pages`, adiciona `.nojekyll` e substitui a referência anterior com `--force-with-lease`.
- A autenticação é delegada ao GitHub CLI e ao cofre de credenciais do sistema. O Studio não lê nem armazena tokens.
- O Studio não commita código. A primeira publicação técnica da `main` continua sendo um passo auditado e separado.

## Custo de operação e manutenção

- Git e GitHub CLI precisam estar instalados no computador autoral.
- A branch `gh-pages` precisa aceitar a substituição controlada feita pelo proprietário.
- O conteúdo editorial não recebe backup remoto pelo projeto; os originais permanecem no sistema pessoal do autor.
- Testes não podem depender da exposição local e, por isso, geram conteúdo fotográfico sintético isolado.
- Commits já dereferenciados ainda podem sobreviver temporariamente em caches ou por SHA; a solução reduz referências controladas, não promete revogação absoluta.

## Caminho de rollback

Remover a fronteira local do `.gitignore`, voltar a versionar conteúdo e restaurar um workflow de Pages que construa a partir da `main`. Nenhum formato editorial precisa mudar: os ensaios continuam Markdown e JPEG.

## Validação mínima

- Git não lista `site.json`, ensaios ou `.mpov-local/` como candidatos a commit.
- CI, Astro e testes funcionam sem conteúdo pessoal.
- A suíte usa fixtures sintéticas fora de `dist/` e da exposição local.
- A revisão de publicação recusa build desatualizada, código não sincronizado, remoto inesperado e mudança concorrente na branch pública.
- A preparação do snapshot contém somente a build e `.nojekyll`, com um commit raiz.
- A retirada completa produz a página vazia e a verificação pós-publicação confirma 404 nas rotas removidas.
