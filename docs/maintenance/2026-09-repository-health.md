# PR — Manutenção e saúde do repositório

**Data da análise:** 2026-09-08  
**Base analisada:** `main` @ `2a4555b68b5157cb16c691fdadf3046cb4914317`  
**Escopo:** dependências, segurança, CI/CD, automação do Dependabot, higiene de PRs e validação funcional.

## 1. Objetivo

Deixar o repositório `mafhper/mpov` em um estado previsível, atualizado e seguro, com CI/CD reproduzível e sem pendências de manutenção que possam ser resolvidas com baixo risco.

Esta proposta é deliberadamente conservadora: primeiro reconcilia as atualizações já abertas pelo Dependabot; depois corrige a infraestrutura de CI/CD; somente então considera upgrades adicionais. Nenhuma refatoração funcional ou alteração editorial faz parte deste PR.

## 2. Diagnóstico inicial baseado em evidências

### 2.1 Estado do repositório

- Repositório público, não arquivado.
- Branch padrão: `main`.
- O commit atual de `main` é `2a4555b`, `fix: validar links da publicação vazia`, de 2026-08-09.
- Não há Issues abertas retornadas pela consulta atual.
- Há sete branches de Dependabot além de `main`, indicando trabalho de atualização ainda pendente.

### 2.2 Dependências npm

`package.json` declara as dependências e devDependencies como `latest`, enquanto `package-lock.json` fixa as versões efetivamente instaladas. O projeto exige Node `>=24.0.0`.

**Risco identificado:** usar `latest` no manifesto torna a intenção de compatibilidade pouco explícita e permite que uma reinstalação que altere o lockfile introduza uma versão major sem uma mudança explícita no `package.json`. Entretanto, alterar todos os ranges neste PR seria uma mudança de política com impacto maior que o necessário. Portanto, a proposta é tratar isso em uma etapa separada, após estabilizar o conjunto atual.

### 2.3 Dependabot

O `.github/dependabot.yml` já possui:

- atualização semanal de npm;
- atualização semanal de GitHub Actions;
- cooldown para reduzir churn;
- agrupamento de atualizações minor/patch do npm;
- limite de cinco PRs npm simultâneos.

O repositório possui atualmente PRs Dependabot abertos para:

- `actions/setup-node` 4.4.0 → 7.0.0 (#1);
- `actions/checkout` 4.4.0 → 7.0.1 (#2);
- `actions/dependency-review-action` 4.9.0 → 5.0.0 (#3);
- `typescript` 6.0.3 → 7.0.2 (#4);
- grupo npm minor/patch (#8), incluindo `@astrojs/sitemap`, `sharp`, `@axe-core/playwright` e `globals`;
- `fast-uri` 3.1.5 → 3.1.7 (#7), atualização explicitamente descrita pelo Dependabot como correção de vulnerabilidades de alta severidade;
- grupo npm minor/patch anterior (#6) e grupo devDependencies anterior (#5), ambos ainda presentes na lista de PRs abertas.

Os PRs #1 e #3 foram criados sobre uma versão anterior de `main` e estão marcados como `mergeable=false`; portanto, não devem ser tratados como mudanças prontas para merge sem primeiro verificar sua atualidade. O mesmo princípio deve ser aplicado aos demais PRs antes de qualquer merge.

### 2.4 CI

O workflow `CI` possui boa cobertura de gates: formatação, type-check, validação de conteúdo, lint, testes unitários, build vazia, testes Playwright/responsividade/acessibilidade e build final.

Também há `permissions: contents: read`, `persist-credentials: false` no checkout e concorrência com cancelamento de execuções obsoletas.

**Pendência objetiva:** as Actions do CI estão fixadas por SHA, mas os comentários de versão ainda apontam para versões antigas:

- `actions/checkout` → SHA de `v4`;
- `actions/setup-node` → SHA de `v4`.

Isso conflita com as atualizações Dependabot já abertas e deve ser reconciliado por atualização de SHA verificada, sem substituir os pinos por tags móveis.

### 2.5 Dependency Guard

O workflow `dependency-guard.yml` executa:

- `npm ci --ignore-scripts`;
- `npm audit signatures`;
- `npm audit --audit-level=high`;
- `actions/dependency-review-action` com `fail-on-severity: high`.

A estrutura é adequada para o objetivo de segurança. Porém, o checkout, setup-node e dependency-review-action também estão fixados nos SHAs antigos correspondentes às versões que os PRs Dependabot pretendem atualizar.

### 2.6 CI/CD atual

A consulta das execuções recentes mostra uma execução de CI do PR #8 concluída com `success` em 2026-09-08, e uma execução automática do Dependabot concluída com `success` no mesmo período. Portanto, não há evidência de uma falha geral do pipeline que justifique uma refatoração do CI.

Não há status combinados adicionais registrados para o SHA atual de `main`; portanto, o estado final de CI deste PR deverá ser validado após sua abertura.

### 2.7 Comentários automáticos / Codex

Não foram encontrados comentários, reviews ou threads de revisão no PR #8. Não há evidência de comentários automáticos do Codex pendentes nesse PR.

## 3. Estratégia proposta

### Fase A — reconciliar os PRs Dependabot existentes

1. Não duplicar PRs de dependência que já existem.
2. Determinar quais PRs continuam relevantes contra o `main` atual.
3. Para PRs antigos ou não mergeáveis, preferir recriação/rebase pelo Dependabot em vez de transportar manualmente commits antigos.
4. Priorizar primeiro as atualizações de segurança, especialmente `fast-uri` 3.1.7.
5. Validar cada atualização com o `dependency-guard` e o CI completo.
6. Só considerar um PR concluído quando a versão efetivamente instalada no lockfile e os checks correspondentes estiverem consistentes.

### Fase B — atualizar os GitHub Actions com SHA verificado

Atualizar os três workflows relevantes para SHAs correspondentes às versões aprovadas:

- `actions/checkout` → versão atual aprovada pelo Dependabot;
- `actions/setup-node` → versão atual aprovada pelo Dependabot;
- `actions/dependency-review-action` → v5, desde que o runner utilizado pelo GitHub Actions satisfaça o requisito mínimo informado pelo projeto da Action.

Manter `persist-credentials: false` e as permissões mínimas atuais.

**Não fazer:** trocar SHA por `@v7`, `@v5` ou outra tag móvel apenas para simplificar manutenção.

### Fase C — revisar a política de dependências npm

Após estabilizar os PRs atuais, abrir uma decisão separada sobre substituir `latest` por ranges explícitos ou versões fixadas no `package.json`.

A mudança deve considerar:

- compatibilidade Astro/TypeScript;
- Node 24;
- dependências nativas como `sharp`;
- Playwright e seus browsers;
- comportamento do Dependabot com ranges explícitos.

Essa etapa não deve ser misturada às correções de segurança imediatas.

### Fase D — hardening opcional de CI

Depois de todos os gates verdes, avaliar separadamente:

- adicionar `timeout-minutes` aos jobs;
- revisar se todos os actions de terceiros estão pinados por SHA;
- avaliar execução periódica de `npm audit` fora de PRs de dependência;
- documentar formalmente o requisito Node 24 no ambiente de CI;
- considerar CodeQL apenas se houver benefício proporcional ao projeto estático/scripts locais.

Nenhum desses itens deve bloquear a correção das vulnerabilidades confirmadas.

## 4. Critérios de aceitação

O trabalho será considerado concluído quando:

- [ ] PRs Dependabot obsoletos forem reconciliados, fechados ou atualizados com justificativa;
- [ ] `fast-uri` estiver em versão corrigida, sem o alerta correspondente no grafo de dependências;
- [ ] `actions/checkout`, `actions/setup-node` e `actions/dependency-review-action` estiverem em versões atuais e SHA-pinned;
- [ ] `npm audit signatures` passar;
- [ ] `npm audit --audit-level=high` passar;
- [ ] Dependency Review passar sem severidade alta ou crítica;
- [ ] format check passar;
- [ ] type/content checks passarem;
- [ ] lint passar;
- [ ] testes unitários passarem;
- [ ] teste de build vazia passar;
- [ ] testes E2E/responsividade/acessibilidade passarem;
- [ ] build final e verificação de links passarem;
- [ ] não houver conteúdo pessoal em `main`;
- [ ] não houver alteração funcional/editorial não justificada;
- [ ] comentários automáticos do Codex, caso apareçam após a abertura dos PRs, forem revisados antes do merge;
- [ ] qualquer sugestão incorporada pelo Codex for seguida de nova rodada completa de CI.

## 5. Validação local recomendada

Antes de qualquer merge de dependência:

```text
npm ci
npm run format:check
npm run check
npm run lint
npm test
npm run test:empty
npm run build
npm run test:e2e
```

Para mudanças exclusivamente em workflows, ainda é necessário executar os gates completos quando a alteração puder afetar a instalação, o ambiente Node ou o comportamento do CI.

## 6. Segurança e rollback

As mudanças devem ser pequenas e isoladas. Cada atualização de dependência deve permanecer atribuível a um PR/commit específico.

Em caso de regressão:

1. identificar o primeiro gate que falhou;
2. preservar os logs e a versão problemática;
3. reverter apenas a alteração causadora;
4. repetir o CI completo;
5. registrar a incompatibilidade como pendência em vez de aplicar workaround especulativo.

Para ações GitHub, rollback significa restaurar o SHA anterior conhecido, não apontar para uma tag móvel.

## 7. Fora do escopo

Não fazem parte desta manutenção inicial:

- refatoração de Astro ou TypeScript;
- alterações de UX/UI;
- alteração do modelo de publicação efêmera;
- alteração do conteúdo fotográfico;
- migração de npm para outro gerenciador;
- atualização major de toda a árvore de dependências sem evidência de necessidade;
- alteração de permissões GitHub sem necessidade comprovada.

## 8. Resultado esperado

O resultado final deve ser um repositório tecnicamente previsível: dependências de segurança corrigidas, automações atualizadas e imutáveis, CI verde, validações de conteúdo preservadas e nenhuma alteração de produto escondida em um PR de manutenção.

A principal decisão de processo é **não tentar resolver todos os upgrades em uma única alteração indiscriminada**. O estado atual já possui vários PRs Dependabot; o trabalho correto é reconciliar essas propostas contra `main`, validar as que continuam necessárias e só depois identificar novas lacunas.

## Evidências consultadas

- `package.json`
- `package-lock.json`
- `.github/dependabot.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/dependency-guard.yml`
- `README.md`
- lista de branches do repositório
- PRs Dependabot #1–#8
- execuções recentes do GitHub Actions
- comentários e reviews do PR #8
