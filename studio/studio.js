const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const dialog = document.querySelector("#dialog");
const token = window.MPOV_STUDIO_TOKEN;
const placeholderAlt = "Descreva esta fotografia.";
const defaultCustomTheme = {
  light: {
    background: "#f7f5f0",
    surface: "#fffdf9",
    text: "#1b1a18",
    muted: "#625f59",
    accent: "#005fcc",
  },
  dark: {
    background: "#141414",
    surface: "#1c1c1b",
    text: "#f3f1ec",
    muted: "#b8b3aa",
    accent: "#8ec8ff",
  },
};
let toastTimer;

const studio = {
  state: null,
  publication: null,
  detail: null,
  mode: "welcome",
  selectedSlug: null,
  selectedPhotoId: null,
  draggingPhotoId: null,
  dirty: false,
  busy: false,
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
  });
}

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return now.getFullYear() + "-" + month + "-" + day;
}

function essayTheme(essay) {
  const theme = essay?.theme || {};
  const custom = theme.custom || {};
  return {
    palette: theme.palette || "paper",
    typography: theme.typography || "editorial",
    header: theme.header || "quiet",
    headerAlignment: theme.headerAlignment || "start",
    headerScale: theme.headerScale || "standard",
    headerFont: theme.headerFont || "inherit",
    custom: {
      light: { ...defaultCustomTheme.light, ...(custom.light || {}) },
      dark: { ...defaultCustomTheme.dark, ...(custom.dark || {}) },
    },
  };
}

function formatDate(value) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(value + "T12:00:00Z"))
    .replaceAll(" de ", " ");
}

function isDescriptionPending(photo) {
  const alt = String(photo.alt ?? "").trim();
  return !alt || alt === placeholderAlt;
}

function photoReview(essay) {
  const photos = essay?.photos ?? [];
  return {
    total: photos.length,
    pending: photos.filter(isDescriptionPending).length,
  };
}

function publicationState() {
  const essays = studio.state?.essays ?? [];
  return {
    published: essays.filter((essay) => !essay.draft).length,
    drafts: essays.filter((essay) => essay.draft).length,
  };
}

function selectedPhoto() {
  return studio.detail?.photos.find((photo) => photo.id === studio.selectedPhotoId) ?? null;
}

function ensureSelectedPhoto() {
  if (!studio.detail?.photos.length) {
    studio.selectedPhotoId = null;
    return;
  }
  if (!studio.detail.photos.some((photo) => photo.id === studio.selectedPhotoId)) {
    studio.selectedPhotoId = studio.detail.photos[0].id;
  }
}

function icon(name) {
  const paths = {
    plus: '<path d="M12 5v14M5 12h14" />',
    settings:
      '<path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18 6l-1.4 1.4M7.4 16.6 6 18M18 18l-1.4-1.4M7.4 7.4 6 6" /><circle cx="12" cy="12" r="3.3" />',
    upload:
      '<path d="M12 15V3M7.5 7.5 12 3l4.5 4.5M4 15.5v3.2c0 .7.6 1.3 1.3 1.3h13.4c.7 0 1.3-.6 1.3-1.3v-3.2" />',
    preview:
      '<path d="M3.5 12s3.1-5 8.5-5 8.5 5 8.5 5-3.1 5-8.5 5-8.5-5-8.5-5Z" /><circle cx="12" cy="12" r="2.4" />',
    build: '<path d="M5 4h10l4 4v12H5z" /><path d="M15 4v5h5M8 14h8M8 17h5" />',
    folder:
      '<path d="M3.5 7.5h6l1.7 2h9.3v8.8c0 .9-.7 1.7-1.7 1.7H5.2c-.9 0-1.7-.7-1.7-1.7Z" /><path d="M3.5 9.5h17" />',
    check: '<path d="m5 12.5 4.2 4.2L19 7" />',
    warning: '<path d="M12 3.8 21 20H3Z" /><path d="M12 9v4.9M12 17.2v.1" />',
    grip: '<circle cx="8" cy="7" r=".8" fill="currentColor" stroke="none" /><circle cx="16" cy="7" r=".8" fill="currentColor" stroke="none" /><circle cx="8" cy="12" r=".8" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r=".8" fill="currentColor" stroke="none" /><circle cx="8" cy="17" r=".8" fill="currentColor" stroke="none" /><circle cx="16" cy="17" r=".8" fill="currentColor" stroke="none" />',
    up: '<path d="m7 14 5-5 5 5" />',
    down: '<path d="m7 10 5 5 5-5" />',
    trash: '<path d="M5 7h14M10 11v5M14 11v5M8 7l.8-2h6.4l.8 2M7 7l.7 12h8.6L17 7" />',
    close: '<path d="m7 7 10 10M17 7 7 17" />',
    shutdown: '<path d="M12 3v9" /><path d="M7.1 5.9a8 8 0 1 0 9.8 0" />',
    publish:
      '<path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4 15.5v3.2c0 .7.6 1.3 1.3 1.3h13.4c.7 0 1.3-.6 1.3-1.3v-3.2" />',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4.1l2-2a4.5 4.5 0 0 0-6.4-6.4l-1.1 1.1" /><path d="M14 10a4.5 4.5 0 0 0-6.4-.1l-2 2A4.5 4.5 0 0 0 12 18.3l1.1-1.1" />',
    refresh:
      '<path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M18.2 9A7 7 0 0 0 6.4 6.4L4 9M5.8 15A7 7 0 0 0 17.6 17.6L20 15" />',
  };
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.65" aria-hidden="true" focusable="false">' +
    paths[name] +
    "</svg>"
  );
}

async function request(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (options.method && options.method !== "GET") {
    headers.set("X-MPOV-Studio-Token", token);
  }
  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Não foi possível concluir esta ação.");
  return payload;
}

function showToast(message, kind = "success") {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 4600);
}

function setDirty(value) {
  studio.dirty = value;
  if (value) markBuildStale();
  const save = document.querySelector('[data-action="save-essay"], [data-action="save-site"]');
  if (save) save.dataset.dirty = value ? "true" : "false";
}

function markBuildStale() {
  if (studio.state?.build?.status !== "running") {
    studio.state.build = {
      ...studio.state.build,
      status: "stale",
      success: null,
      fingerprint: null,
    };
  }
  if (studio.publication) studio.publication.review = null;
}

function summaryFrom(essay) {
  return {
    slug: essay.slug,
    title: essay.title,
    date: essay.date,
    location: essay.location,
    excerpt: essay.excerpt,
    draft: essay.draft,
    coverId: essay.coverId,
    photoCount: essay.photos.length,
    revision: essay.revision,
  };
}

function replaceSummary(essay) {
  const index = studio.state.essays.findIndex((item) => item.slug === essay.slug);
  if (index === -1) studio.state.essays.push(summaryFrom(essay));
  else studio.state.essays[index] = summaryFrom(essay);
  studio.state.essays.sort(
    (left, right) =>
      right.date.localeCompare(left.date) || left.title.localeCompare(right.title, "pt-BR"),
  );
}

function removeSummary(slug) {
  studio.state.essays = studio.state.essays.filter((essay) => essay.slug !== slug);
}

async function loadState() {
  const [payload, publication] = await Promise.all([
    request("/api/state"),
    request("/api/publication"),
  ]);
  studio.state = payload;
  studio.publication = publication;
  if (studio.selectedSlug && !payload.essays.some((essay) => essay.slug === studio.selectedSlug)) {
    studio.selectedSlug = null;
    studio.detail = null;
    studio.selectedPhotoId = null;
    studio.mode = "welcome";
  }
}

async function refreshPublication() {
  studio.publication = await request("/api/publication");
  return studio.publication;
}

async function selectEssay(slug) {
  if (
    studio.dirty &&
    !window.confirm("Há alterações ainda não salvas. Abrir outro ensaio mesmo assim?")
  )
    return;
  const payload = await request("/api/essays/" + encodeURIComponent(slug));
  studio.detail = payload.essay;
  studio.selectedSlug = slug;
  studio.selectedPhotoId = studio.detail.photos[0]?.id ?? null;
  studio.mode = "essay";
  studio.dirty = false;
  render();
}

function navItem(essay) {
  const status = essay.draft ? "Rascunho" : "Publicado";
  const current =
    studio.selectedSlug === essay.slug && studio.mode === "essay" ? ' aria-current="page"' : "";
  return (
    '<li><button class="essay-nav-button" type="button" data-action="select-essay" data-slug="' +
    escapeHtml(essay.slug) +
    '"' +
    current +
    ">" +
    '<span class="essay-nav-button__title">' +
    escapeHtml(essay.title) +
    "</span>" +
    '<span class="essay-nav-button__meta">' +
    escapeHtml(formatDate(essay.date)) +
    " · " +
    status +
    " · " +
    essay.photoCount +
    " foto" +
    (essay.photoCount === 1 ? "" : "s") +
    "</span></button></li>"
  );
}

function sidebar() {
  const essays = studio.state.essays;
  return (
    '<aside class="studio-sidebar">' +
    '<div class="studio-brand"><p class="studio-brand__name">' +
    escapeHtml(studio.state.site.title) +
    '</p><p class="studio-brand__subtle">por ' +
    escapeHtml(studio.state.site.author) +
    "</p></div>" +
    '<button class="button button--primary sidebar-action" type="button" data-action="new-essay">' +
    icon("plus") +
    "Novo ensaio</button>" +
    '<nav class="studio-navigation" aria-label="Ensaios locais">' +
    '<p class="studio-navigation__heading"><span>Ensaios</span><span>' +
    essays.length +
    "</span></p>" +
    '<ul class="essay-nav-list">' +
    (essays.length
      ? essays.map(navItem).join("")
      : '<li class="essay-nav-button__meta">Nenhum ensaio criado ainda.</li>') +
    "</ul></nav>" +
    '<div class="studio-sidebar__footer">' +
    '<button class="button button--quiet" type="button" data-action="edit-site">' +
    icon("settings") +
    "Editar publicação</button>" +
    "<p>Ensaios e fotografias permanecem somente neste computador.</p>" +
    '<button class="button button--quiet studio-shutdown" type="button" data-action="shutdown">' +
    icon("shutdown") +
    "Encerrar estúdio</button>" +
    "</div></aside>"
  );
}

function buildPanel() {
  const build = studio.state.build;
  const publication = publicationState();
  const labels = {
    idle: "Ainda não há uma prévia gerada nesta sessão.",
    stale: "Há alterações locais que ainda não entraram na prévia.",
    running: "Gerando a build local…",
    ready: "Prévia pronta para leitura e revisão.",
    failed: "A build encontrou algo para corrigir.",
  };
  const publicationMessage =
    publication.published === 0
      ? publication.drafts
        ? "A versão pública ficará vazia. " +
          publication.drafts +
          " rascunho" +
          (publication.drafts === 1 ? " permanece" : "s permanecem") +
          " somente no Studio."
        : "A versão pública ficará vazia e mostrará “Por enquanto, nada por aqui”."
      : publication.published +
        " ensaio" +
        (publication.published === 1 ? " entrará" : "s entrarão") +
        " na próxima prévia" +
        (publication.drafts
          ? "; " +
            publication.drafts +
            " rascunho" +
            (publication.drafts === 1 ? " ficará" : "s ficarão") +
            " de fora."
          : ".");
  return (
    '<section class="build-panel" aria-labelledby="build-title">' +
    '<div class="editor-section__heading"><div><h2 id="build-title">Prévia</h2><p>Gere exatamente a versão que deseja ler antes de torná-la pública.</p></div></div>' +
    '<p class="build-guidance" data-state="' +
    (publication.published === 0 ? "empty" : "ready") +
    '">' +
    icon("check") +
    escapeHtml(publicationMessage) +
    "</p>" +
    '<p class="build-status" data-state="' +
    escapeHtml(build.status) +
    '">' +
    escapeHtml(labels[build.status] || labels.idle) +
    "</p>" +
    '<div class="build-actions">' +
    '<button class="button button--primary" type="button" data-action="build" ' +
    (build.status === "running" ? "disabled" : "") +
    ">" +
    icon("build") +
    "Gerar build</button>" +
    (build.status === "ready"
      ? '<a class="button" href="/mpov/" target="mpov-preview" rel="noopener">' +
        icon("preview") +
        "Abrir prévia</a>"
      : '<span class="button" aria-disabled="true">' + icon("preview") + "Abrir prévia</span>") +
    "</div>" +
    (build.output
      ? '<details class="build-details"><summary>Ver detalhes técnicos da última build</summary><pre class="build-log" aria-label="Resultado da última build">' +
        escapeHtml(build.output) +
        "</pre></details>"
      : "") +
    "</section>"
  );
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KiB";
  return (bytes / 1024 / 1024).toFixed(1).replace(".", ",") + " MiB";
}

function sourceReadinessMessage(repository) {
  const messages = {
    ready: "A plataforma está sincronizada. Somente a build atual será enviada.",
    "no-local-main": "A plataforma ainda precisa do primeiro commit técnico na main.",
    "no-remote-main": "A plataforma ainda precisa ser enviada uma vez para a main do GitHub.",
    "source-not-synchronized":
      "A main local e a do GitHub não são iguais. Sincronize o código antes de publicar.",
    "source-changed":
      "Há alterações técnicas fora da exposição. Revise e salve o código antes de publicar.",
    "wrong-source-branch": "Volte para a branch main antes de publicar uma exposição.",
    "invalid-origin": "O remoto origin não aponta para um repositório GitHub reconhecido.",
    "git-unavailable": "O Git não foi encontrado neste computador.",
    "write-permission-required": "A conta conectada não pode publicar neste repositório.",
  };
  return (
    messages[repository?.sourceReason] || "A base técnica ainda não está pronta para publicação."
  );
}

function publicationActivityMessage(activity) {
  const labels = {
    reviewing: "Revisando a versão local…",
    reviewed: "Revisão concluída. Nada foi enviado ainda.",
    publishing: "Enviando somente a versão pública atual…",
    published: "O GitHub recebeu a nova versão.",
    verifying: "Conferindo o site publicado…",
    verified: "Site publicado e rotas retiradas verificadas.",
    "verification-failed": "O GitHub ainda não apresenta toda a versão esperada.",
    failed: "A operação foi interrompida sem sobrescrever a publicação atual.",
  };
  return labels[activity?.status] || "";
}

function publicationPanel() {
  const integration = studio.publication;
  if (!integration) {
    return '<section class="publication-panel"><p class="build-status">Verificando a publicação…</p></section>';
  }
  const github = integration.github || {};
  const repository = integration.repository || {};
  const pages = integration.pages || {};
  const activity = integration.activity || {};
  const connection = integration.connection || {};
  const published = integration.published;
  const connectedLabel =
    connection.status === "connecting"
      ? "Aguardando o acesso no navegador"
      : github.connected
        ? "Conectado como " + github.login
        : github.available
          ? "Conta ainda não conectada"
          : "GitHub CLI não encontrado";
  const canReview =
    github.connected && repository.sourceReady && studio.state.build.status === "ready";
  const activityMessage = publicationActivityMessage(activity);
  const publishedLabel = published?.publishedAt
    ? "Último envio em " +
      new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(published.publishedAt),
      )
    : "Nenhuma versão enviada por este Studio";
  return (
    '<section class="publication-panel" aria-labelledby="publication-title">' +
    '<div class="editor-section__heading"><div><h2 id="publication-title">Publicação</h2><p>Substitua a exposição pública somente depois de revisar a prévia.</p></div></div>' +
    '<dl class="publication-status-list"><div><dt>GitHub</dt><dd>' +
    escapeHtml(connectedLabel) +
    '</dd></div><div><dt>Plataforma</dt><dd id="publication-readiness">' +
    escapeHtml(sourceReadinessMessage(repository)) +
    "</dd></div><div><dt>Versão pública</dt><dd>" +
    escapeHtml(publishedLabel) +
    "</dd></div></dl>" +
    (activityMessage
      ? '<p class="publication-activity" data-state="' +
        escapeHtml(activity.status) +
        '" aria-live="polite">' +
        escapeHtml(activityMessage) +
        "</p>"
      : "") +
    '<div class="build-actions">' +
    (!github.connected && github.available
      ? '<button class="button" type="button" data-action="connect-github">' +
        icon("link") +
        (connection.status === "connecting" ? "Aguardando o GitHub…" : "Conectar ao GitHub") +
        "</button>"
      : "") +
    (canReview
      ? '<button class="button button--primary" type="button" data-action="review-publication">' +
        icon("publish") +
        "Revisar publicação</button>"
      : '<button class="button button--primary" type="button" disabled aria-describedby="publication-readiness">' +
        icon("publish") +
        "Revisar publicação</button>") +
    (published
      ? '<button class="button" type="button" data-action="verify-publication">' +
        icon("refresh") +
        "Verificar site</button>"
      : "") +
    (pages.url
      ? '<a class="button button--quiet" href="' +
        escapeHtml(pages.url) +
        '" target="mpov-public" rel="noopener">Abrir site</a>'
      : "") +
    "</div>" +
    (repository.fullName
      ? '<details class="publication-details"><summary>Detalhes técnicos</summary><dl><div><dt>Repositório</dt><dd>' +
        escapeHtml(repository.fullName) +
        "</dd></div><div><dt>Branch pública</dt><dd>" +
        escapeHtml(integration.branch) +
        "</dd></div><div><dt>Origem do Pages</dt><dd>" +
        escapeHtml(
          pages.usesPublicationBranch ? "Versão isolada" : "Será ajustada no primeiro envio",
        ) +
        "</dd></div><div><dt>Build local</dt><dd>" +
        escapeHtml(
          studio.state.build.status === "ready"
            ? `${studio.state.build.fileCount || 0} arquivos · ${formatBytes(studio.state.build.bytes)}`
            : "Ainda não está atual",
        ) +
        "</dd></div></dl></details>"
      : "") +
    "</section>"
  );
}

function workflowPanels() {
  return buildPanel() + publicationPanel();
}

function welcome() {
  const publication = publicationState();
  const photos = studio.state.essays.reduce((total, essay) => total + essay.photoCount, 0);
  const hasEssays = studio.state.essays.length > 0;
  return (
    '<div class="editor-form"><section class="welcome">' +
    '<p class="welcome__eyebrow">Estúdio local</p>' +
    "<h1>Sua publicação, antes de ir ao ar.</h1>" +
    "<p>Escreva, ordene e componha com calma. Nada sai deste computador até que você gere a prévia e decida enviar ao GitHub.</p>" +
    '<dl class="welcome__summary"><div><dt>Publicados</dt><dd>' +
    publication.published +
    "</dd></div><div><dt>Rascunhos</dt><dd>" +
    publication.drafts +
    "</dd></div><div><dt>Fotografias</dt><dd>" +
    photos +
    "</dd></div></dl>" +
    '<button class="button button--primary" type="button" data-action="new-essay">' +
    icon("plus") +
    (hasEssays ? "Novo ensaio" : "Criar primeiro ensaio") +
    "</button>" +
    "</section>" +
    workflowPanels() +
    "</div>"
  );
}

function siteEditor() {
  const site = studio.state.site;
  return (
    '<div class="studio-topbar"><div class="studio-location"><div><p>Publicação</p><h1>Editar identidade</h1></div></div>' +
    '<div class="studio-topbar__actions"><button class="button" type="button" data-action="return-welcome">Fechar</button><button class="button button--primary" type="button" data-action="save-site">Salvar</button></div></div>' +
    '<form class="editor-form" data-editor-form="site" novalidate>' +
    '<section class="editor-section"><div class="editor-section__heading"><div><h2>O que aparece no site</h2><p>Sem slogans: apenas a publicação e a autoria.</p></div></div>' +
    '<div class="form-grid">' +
    field("Nome da publicação", "site-title", site.title, "text", "field--wide") +
    field("Autoria", "site-author", site.author, "text") +
    field(
      "Descrição para buscas e compartilhamentos",
      "site-description",
      site.description,
      "text",
    ) +
    textareaField(
      "Texto da página Sobre",
      "site-about",
      site.about,
      "field--wide",
      "Aparece integralmente na página Sobre.",
    ) +
    '<div class="studio-subsection field--wide"><h3>Presença pessoal</h3><p>O retrato é carregado do perfil público informado no GitHub; ele pode ser trocado ou removido quando quiser.</p></div>' +
    field(
      "Usuário do GitHub",
      "site-github",
      site.profile?.github || "",
      "text",
      "",
      "Use apenas o nome de usuário, sem @. Deixe vazio para ocultar o retrato e o link.",
    ) +
    field("Texto alternativo do retrato", "site-profile-alt", site.profile?.alt || "", "text") +
    selectField(
      "Mosaico",
      "site-mosaic-grouping",
      site.mosaicGrouping || "separated",
      [
        { value: "separated", label: "Separar cada ensaio" },
        { value: "continuous", label: "Fluxo contínuo" },
      ],
      "field--wide",
      "A separação dá contexto a cada conjunto de imagens; o fluxo contínuo deixa o mosaico mais compacto.",
    ) +
    "</div></section>" +
    workflowPanels() +
    "</form>"
  );
}

function field(label, id, value, type, modifier = "", note = "") {
  return (
    '<div class="field ' +
    modifier +
    '"><label for="' +
    id +
    '">' +
    escapeHtml(label) +
    '</label><input id="' +
    id +
    '" type="' +
    type +
    '" value="' +
    escapeHtml(value) +
    '" />' +
    (note ? '<p class="field-note">' + escapeHtml(note) + "</p>" : "") +
    "</div>"
  );
}

function selectField(label, id, value, options, modifier = "", note = "") {
  return (
    '<div class="field ' +
    modifier +
    '"><label for="' +
    id +
    '">' +
    escapeHtml(label) +
    '</label><select id="' +
    id +
    '">' +
    options
      .map(
        (option) =>
          '<option value="' +
          escapeHtml(option.value) +
          '"' +
          (option.value === value ? " selected" : "") +
          ">" +
          escapeHtml(option.label) +
          "</option>",
      )
      .join("") +
    "</select>" +
    (note ? '<p class="field-note">' + escapeHtml(note) + "</p>" : "") +
    "</div>"
  );
}

function textareaField(label, id, value, modifier = "", note = "") {
  return (
    '<div class="field ' +
    modifier +
    '"><label for="' +
    id +
    '">' +
    escapeHtml(label) +
    '</label><textarea id="' +
    id +
    '">' +
    escapeHtml(value) +
    "</textarea>" +
    (note ? '<p class="field-note">' + escapeHtml(note) + "</p>" : "") +
    "</div>"
  );
}

function editorDisclosure(step, title, description, content, open = false) {
  return (
    '<details class="editor-section editor-disclosure"' +
    (open ? " open" : "") +
    '><summary><span class="editor-disclosure__step" aria-hidden="true">' +
    escapeHtml(step) +
    '</span><span class="editor-disclosure__copy"><strong>' +
    escapeHtml(title) +
    "</strong><small>" +
    escapeHtml(description) +
    '</small></span><span class="editor-disclosure__toggle" aria-hidden="true">' +
    icon("down") +
    '</span></summary><div class="editor-disclosure__body">' +
    content +
    "</div></details>"
  );
}

function layoutChoice(value, title, description, selected) {
  return (
    '<label class="layout-choice"><input type="radio" name="essay-layout" value="' +
    value +
    '"' +
    (selected ? " checked" : "") +
    ' /><span class="layout-choice__content"><span class="layout-choice__preview" data-layout-preview="' +
    value +
    '" aria-hidden="true"><i></i><i></i><i></i></span><strong>' +
    title +
    "</strong><small>" +
    description +
    "</small></span></label>"
  );
}

function layoutPicker(essay) {
  return (
    '<fieldset class="field field--wide layout-picker"><legend>Disposição das imagens</legend><p class="field-note">A escolha organiza a leitura no site. Em Páginas e Margens, “Imagem inteira” preserva a proporção sem faixas; “Preencher e recortar” usa o ritmo escolhido e o ponto de interesse.</p><div class="layout-picker__options">' +
    layoutChoice(
      "sequence",
      "Sequência",
      "Uma fotografia por vez, na ordem escolhida.",
      essay.layout === "sequence",
    ) +
    layoutChoice(
      "pages",
      "Páginas",
      "Fotos em coluna formam pares; as amplas ocupam uma linha.",
      essay.layout === "pages",
    ) +
    layoutChoice(
      "margins",
      "Margens",
      "A legenda ou nota acompanha a foto e alterna de lado.",
      essay.layout === "margins",
    ) +
    "</div></fieldset>"
  );
}

function themePicker(essay) {
  const theme = essayTheme(essay);
  return (
    '<section class="theme-picker field--wide" aria-labelledby="theme-picker-title"><div class="studio-subsection"><h3 id="theme-picker-title">Identidade visual</h3><p>Paleta, tipografia e cabeçalho pertencem somente a este ensaio. A prévia abaixo reage às escolhas sem alterar fotografias.</p></div>' +
    compositionPreview(essay, theme) +
    '<div class="form-grid">' +
    selectField(
      "Paleta",
      "essay-theme-palette",
      theme.palette,
      [
        { value: "paper", label: "Papel" },
        { value: "dusk", label: "Crepúsculo" },
        { value: "field", label: "Campo" },
        { value: "night", label: "Noite" },
        { value: "custom", label: "Personalizada" },
      ],
      "",
      "A paleta não aplica filtros às fotografias.",
    ) +
    selectField("Tipografia", "essay-theme-typography", theme.typography, [
      { value: "editorial", label: "Editorial" },
      { value: "direct", label: "Direta" },
      { value: "soft", label: "Suave" },
    ]) +
    selectField(
      "Cabeçalho",
      "essay-theme-header",
      theme.header,
      [
        { value: "quiet", label: "Silencioso" },
        { value: "poster", label: "Cartaz tipográfico" },
        { value: "index", label: "Caderno dividido" },
      ],
      "field--wide",
      "O cabeçalho dá ritmo ao texto; nenhuma opção cobre a fotografia com texto.",
    ) +
    selectField(
      "Alinhamento do título",
      "essay-theme-header-alignment",
      theme.headerAlignment,
      [
        { value: "start", label: "À esquerda" },
        { value: "center", label: "Centralizado" },
        { value: "end", label: "À direita" },
      ],
      "",
      "Move o título dentro da sua coluna, sem invadir o texto de contexto.",
    ) +
    selectField(
      "Escala do título",
      "essay-theme-header-scale",
      theme.headerScale,
      [
        { value: "compact", label: "Contida" },
        { value: "standard", label: "Equilibrada" },
        { value: "display", label: "Ampla" },
      ],
      "",
      "A escala equilibrada é o padrão seguro para títulos longos.",
    ) +
    selectField(
      "Fonte do título",
      "essay-theme-header-font",
      theme.headerFont,
      [
        { value: "inherit", label: "Seguir a tipografia" },
        { value: "serif", label: "Serif editorial" },
        { value: "sans", label: "Sem serifa" },
      ],
      "",
      "Usa apenas as fontes nativas da publicação.",
    ) +
    '<div class="theme-custom-colors field--wide" data-custom-colors' +
    (theme.palette === "custom" ? "" : " hidden") +
    '><p class="field-note">A paleta personalizada precisa de uma versão clara e outra escura. As duas são verificadas antes de salvar.</p><div class="theme-custom-colors__variants">' +
    '<section class="theme-custom-colors__variant" aria-labelledby="theme-light-title"><h4 id="theme-light-title">Tema claro</h4><div class="theme-custom-colors__grid">' +
    field("Fundo", "theme-light-background", theme.custom.light.background, "color") +
    field("Superfície", "theme-light-surface", theme.custom.light.surface, "color") +
    field("Texto", "theme-light-text", theme.custom.light.text, "color") +
    field("Texto secundário", "theme-light-muted", theme.custom.light.muted, "color") +
    field("Destaque", "theme-light-accent", theme.custom.light.accent, "color") +
    "</div></section>" +
    '<section class="theme-custom-colors__variant" aria-labelledby="theme-dark-title"><h4 id="theme-dark-title">Tema escuro</h4><div class="theme-custom-colors__grid">' +
    field("Fundo", "theme-dark-background", theme.custom.dark.background, "color") +
    field("Superfície", "theme-dark-surface", theme.custom.dark.surface, "color") +
    field("Texto", "theme-dark-text", theme.custom.dark.text, "color") +
    field("Texto secundário", "theme-dark-muted", theme.custom.dark.muted, "color") +
    field("Destaque", "theme-dark-accent", theme.custom.dark.accent, "color") +
    "</div></section></div></div></div></section>"
  );
}

function compositionPreview(essay, theme) {
  const custom = theme.custom;
  const style = [
    `--preview-custom-light-background:${custom.light.background}`,
    `--preview-custom-light-surface:${custom.light.surface}`,
    `--preview-custom-light-text:${custom.light.text}`,
    `--preview-custom-light-muted:${custom.light.muted}`,
    `--preview-custom-light-accent:${custom.light.accent}`,
    `--preview-custom-dark-background:${custom.dark.background}`,
    `--preview-custom-dark-surface:${custom.dark.surface}`,
    `--preview-custom-dark-text:${custom.dark.text}`,
    `--preview-custom-dark-muted:${custom.dark.muted}`,
    `--preview-custom-dark-accent:${custom.dark.accent}`,
  ].join(";");
  return (
    '<div class="composition-preview" data-composition-preview data-preview-palette="' +
    escapeHtml(theme.palette) +
    '" data-preview-typography="' +
    escapeHtml(theme.typography) +
    '" data-preview-header="' +
    escapeHtml(theme.header) +
    '" data-preview-align="' +
    escapeHtml(theme.headerAlignment) +
    '" data-preview-scale="' +
    escapeHtml(theme.headerScale) +
    '" data-preview-font="' +
    escapeHtml(theme.headerFont) +
    '" style="' +
    escapeHtml(style) +
    '" aria-label="Prévia simplificada do cabeçalho"><div class="composition-preview__chrome"><span>' +
    escapeHtml(studio.state.site.title) +
    '</span><span>Sobre</span></div><div class="composition-preview__page"><p>' +
    escapeHtml(formatDate(essay.date)) +
    "</p><strong data-preview-title>" +
    escapeHtml(essay.title || "Título do ensaio") +
    "</strong><span data-preview-context>" +
    escapeHtml(essay.excerpt || "O contexto acompanha as imagens sem disputar atenção com elas.") +
    "</span></div></div>"
  );
}

function focalPointPicker(photo) {
  const selected = photo.focalPoint || "center";
  const points = [
    ["top-left", "Canto superior esquerdo"],
    ["top", "Parte superior"],
    ["top-right", "Canto superior direito"],
    ["left", "Lado esquerdo"],
    ["center", "Centro"],
    ["right", "Lado direito"],
    ["bottom-left", "Canto inferior esquerdo"],
    ["bottom", "Parte inferior"],
    ["bottom-right", "Canto inferior direito"],
  ];
  return (
    '<fieldset class="focal-picker"><legend>Ponto de interesse</legend><div class="focal-picker__grid">' +
    points
      .map(
        ([value, label]) =>
          '<label title="' +
          escapeHtml(label) +
          '"><input type="radio" name="selected-focal" value="' +
          value +
          '"' +
          (value === selected ? " checked" : "") +
          ' /><span><i></i></span><span class="sr-only">' +
          escapeHtml(label) +
          "</span></label>",
      )
      .join("") +
    '</div><p class="field-note">Usado somente quando a imagem preenche e recorta o quadro.</p></fieldset>'
  );
}

function photoTile(photo, index, total) {
  const selected = photo.id === studio.selectedPhotoId;
  const isCover = photo.id === studio.detail.coverId;
  const pending = isDescriptionPending(photo);
  const state = isCover ? "Capa" : pending ? "Descrição pendente" : "Pronta";
  const label =
    "Fotografia " +
    (index + 1) +
    " de " +
    total +
    (isCover ? ", capa da publicação" : "") +
    (pending ? ", descrição pendente" : ", revisada");
  return (
    '<button class="photo-tile" type="button" data-action="select-photo" data-photo-tile data-photo-id="' +
    escapeHtml(photo.id) +
    '" draggable="true" aria-pressed="' +
    selected +
    '" aria-label="' +
    escapeHtml(label) +
    '"><span class="photo-tile__media"><img src="' +
    escapeHtml(photo.url) +
    '" alt="" /></span><span class="photo-tile__meta"><span>' +
    String(index + 1).padStart(2, "0") +
    '</span><span class="photo-tile__state" data-state="' +
    (pending ? "pending" : "ready") +
    '">' +
    escapeHtml(state) +
    "</span></span></button>"
  );
}

function photoInspector(essay) {
  const photo = selectedPhoto();
  if (!photo) return "";
  const index = essay.photos.findIndex((item) => item.id === photo.id);
  const isCover = photo.id === essay.coverId;
  const pending = isDescriptionPending(photo);
  return (
    '<section class="photo-inspector" data-photo-details aria-labelledby="photo-details-title"><div class="photo-inspector__heading"><div><p>Fotografia ' +
    (index + 1) +
    " de " +
    essay.photos.length +
    '</p><h3 id="photo-details-title">' +
    (isCover ? "Capa da publicação" : pending ? "Descrição pendente" : "Fotografia revisada") +
    "</h3></div>" +
    '<span class="photo-inspector__grip" title="Arraste as miniaturas para reorganizar" aria-hidden="true">' +
    icon("grip") +
    "</span></div>" +
    '<img class="photo-inspector__image" src="' +
    escapeHtml(photo.url) +
    '" alt="" />' +
    '<div class="photo-inspector__fields">' +
    textareaField(
      "Descrição da fotografia",
      "selected-alt",
      photo.alt,
      "",
      "Descreva o que se vê. Ela é necessária antes de publicar.",
    ) +
    textareaField(
      "Legenda ou nota",
      "selected-caption",
      photo.caption || "",
      "",
      "Na disposição Margens, este texto aparece junto da fotografia.",
    ) +
    '<details class="photo-composition"><summary><span><strong>Composição na página</strong><small>' +
    (photo.crop === "cover" ? "Com recorte" : "Imagem inteira") +
    " · " +
    (photo.display === "portrait"
      ? "Coluna"
      : photo.display === "wide"
        ? "Panorâmica"
        : "Linha de leitura") +
    '</small></span><span aria-hidden="true">' +
    icon("down") +
    '</span></summary><div class="photo-composition__body"><div class="photo-inspector__options">' +
    selectField(
      "Ritmo no layout",
      "selected-display",
      photo.display || "full",
      [
        { value: "full", label: "Linha de leitura (3:2)" },
        { value: "wide", label: "Linha panorâmica (16:10)" },
        { value: "portrait", label: "Coluna (4:5)" },
      ],
      "",
      "Define largura e, quando houver recorte, a proporção do quadro.",
    ) +
    selectField(
      "Posição",
      "selected-placement",
      photo.placement || "auto",
      [
        { value: "auto", label: "Automática" },
        { value: "left", label: "Esquerda" },
        { value: "right", label: "Direita" },
      ],
      "",
      "Em Páginas, escolhe a coluna. Em Margens, escolhe o lado da imagem.",
    ) +
    selectField(
      "Exibição",
      "selected-crop",
      photo.crop || "contain",
      [
        { value: "contain", label: "Imagem inteira" },
        { value: "cover", label: "Preencher e recortar" },
      ],
      "",
      "Imagem inteira mantém a proporção original, sem faixas. Preencher e recortar ocupa o ritmo escolhido; a ampliação continua inteira.",
    ) +
    "</div>" +
    focalPointPicker(photo) +
    "</div></details></div>" +
    '<div class="photo-inspector__actions">' +
    '<button class="button" type="button" data-action="set-cover"' +
    (isCover ? " disabled" : "") +
    ">" +
    icon("check") +
    (isCover ? "Capa escolhida" : "Usar como capa") +
    "</button>" +
    '<button class="button" type="button" data-action="move-selected-up"' +
    (index === 0 ? " disabled" : "") +
    ">" +
    icon("up") +
    "Mover antes</button>" +
    '<button class="button" type="button" data-action="move-selected-down"' +
    (index === essay.photos.length - 1 ? " disabled" : "") +
    ">" +
    icon("down") +
    "Mover depois</button>" +
    '<button class="button button--danger" type="button" data-action="delete-selected-photo">' +
    icon("trash") +
    "Retirar fotografia</button></div></section>"
  );
}

function publicationControl(essay) {
  const review = photoReview(essay);
  const status = essay.draft
    ? "Este ensaio está no estúdio, mas fica fora da prévia pública."
    : review.total === 0
      ? "Adicione ao menos uma fotografia antes de gerar a prévia."
      : review.pending
        ? review.pending +
          " descrição" +
          (review.pending === 1 ? " precisa" : " precisam") +
          " ser revisada" +
          (review.pending === 1 ? "" : "s") +
          " antes de publicar."
        : "Este ensaio entrará na próxima prévia pública.";
  return (
    '<section class="publication-control" aria-labelledby="publication-title"><div><p>Visibilidade</p><h2 id="publication-title">' +
    (essay.draft ? "Rascunho" : "Publicar na próxima build") +
    '</h2><p class="publication-control__note" data-state="' +
    (essay.draft ? "draft" : review.pending || !review.total ? "pending" : "ready") +
    '">' +
    (essay.draft || review.pending || !review.total ? icon("warning") : icon("check")) +
    escapeHtml(status) +
    "</p></div>" +
    '<div class="publication-options" role="group" aria-label="Visibilidade do ensaio">' +
    '<button class="publication-option" type="button" data-action="set-draft" data-draft="true" aria-pressed="' +
    essay.draft +
    '"><span>Rascunho</span><small>Fica somente aqui</small></button>' +
    '<button class="publication-option" type="button" data-action="set-draft" data-draft="false" aria-pressed="' +
    !essay.draft +
    '"><span>Publicar</span><small>Entra na próxima build</small></button></div></section>'
  );
}

function photoImport() {
  const busy = studio.busy;
  return (
    '<div class="photo-import" data-upload-area aria-busy="' +
    busy +
    '"><label class="upload-area" for="photo-upload" aria-disabled="' +
    busy +
    '">' +
    '<input id="photo-upload" data-photo-input type="file" accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,image/jpeg,image/png,image/webp,image/tiff" multiple' +
    (busy ? " disabled" : "") +
    " />" +
    icon("upload") +
    '<span data-upload-title aria-live="polite">' +
    (busy ? "Preparando fotografias…" : "Adicionar fotografias") +
    "</span><small data-upload-hint>" +
    (busy
      ? "A orientação, as cores e os metadados estão sendo tratados. Aguarde esta etapa terminar."
      : "Arraste arquivos aqui ou escolha-os no computador.") +
    '</small></label><label class="button photo-import__folder" for="photo-folder-upload" aria-disabled="' +
    busy +
    '"><input id="photo-folder-upload" data-photo-input type="file" accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,image/jpeg,image/png,image/webp,image/tiff" webkitdirectory directory multiple' +
    (busy ? " disabled" : "") +
    " />" +
    icon("folder") +
    (busy ? "Preparando…" : "Importar uma pasta") +
    "</label></div>"
  );
}

function photoOrganizer(essay) {
  const photos = essay.photos;
  if (!photos.length) {
    return '<p class="helper">Adicione fotografias para montar a sequência. O ensaio permanece em rascunho até que você escolha publicar.</p>';
  }
  return (
    '<div class="photo-workspace">' +
    photoInspector(essay) +
    '<section class="photo-sequence" aria-labelledby="photo-sequence-title"><div class="photo-sequence__heading"><div><h3 id="photo-sequence-title">Sequência</h3><p>Escolha uma foto para escrever; arraste uma miniatura para mudar a ordem.</p></div><p>' +
    photos.length +
    " fotografia" +
    (photos.length === 1 ? "" : "s") +
    "</p></div>" +
    '<div class="photo-grid" aria-label="Sequência de fotografias">' +
    photos.map((photo, index) => photoTile(photo, index, photos.length)).join("") +
    "</div></section></div>"
  );
}

function essayEditor() {
  const essay = studio.detail;
  ensureSelectedPhoto();
  const deleteLabel = essay.draft ? "Excluir rascunho" : "Retirar do site";
  const previewHref = "/mpov/ensaios/" + encodeURIComponent(essay.slug) + "/";
  const textSection =
    '<div class="form-grid">' +
    field("Título", "essay-title", essay.title, "text", "field--wide") +
    field("Data", "essay-date", essay.date, "date") +
    field("Local opcional", "essay-location", essay.location || "", "text") +
    field(
      "Resumo opcional",
      "essay-excerpt",
      essay.excerpt || "",
      "text",
      "field--wide",
      "Usado na página inicial.",
    ) +
    field(
      "Hashtags",
      "essay-tags",
      (essay.tags || []).map((tag) => "#" + tag).join(", "),
      "text",
      "field--wide",
      "Separe por vírgulas. Ex.: #por-do-sol, #filhos, #natureza.",
    ) +
    textareaField(
      "Contexto",
      "essay-context",
      essay.context || "",
      "field--wide",
      "Quebre linhas para criar parágrafos. Markdown simples também é aceito.",
    ) +
    "</div>";
  const compositionSection =
    '<div class="form-grid">' + layoutPicker(essay) + themePicker(essay) + "</div>";
  const photoSection = photoImport() + photoOrganizer(essay);
  return (
    '<div class="studio-topbar"><div class="studio-location"><div><p>' +
    (essay.draft ? "Rascunho" : "Na próxima prévia") +
    "</p><h1>" +
    escapeHtml(essay.title) +
    "</h1></div></div>" +
    '<div class="studio-topbar__actions">' +
    (studio.state.build.status === "ready" && !essay.draft
      ? '<a class="button" href="' +
        previewHref +
        '" target="mpov-preview" rel="noopener">' +
        icon("preview") +
        "Ver prévia</a>"
      : "") +
    '<button class="button button--primary" type="button" data-action="save-essay">' +
    (essay.draft ? "Salvar rascunho" : "Salvar publicação") +
    '</button><details class="topbar-menu"><summary class="button">Mais</summary><div><button class="button button--danger" type="button" data-action="delete-essay">' +
    icon("trash") +
    escapeHtml(deleteLabel) +
    "</button></div></details></div></div>" +
    '<form class="editor-form" data-editor-form="essay" novalidate>' +
    editorDisclosure(
      "01",
      "Texto e contexto",
      "Título, data, resumo, hashtags e as palavras que acompanham o ensaio.",
      textSection,
      true,
    ) +
    editorDisclosure(
      "02",
      "Composição",
      "Ritmo das imagens, paleta, tipografia e abertura do ensaio.",
      compositionSection,
      false,
    ) +
    publicationControl(essay) +
    editorDisclosure(
      "03",
      "Fotografias",
      "Importe, ordene, descreva e componha cada imagem.",
      photoSection,
      true,
    ) +
    workflowPanels() +
    "</form>"
  );
}

function view() {
  if (studio.mode === "site") return siteEditor();
  if (studio.mode === "essay" && studio.detail) return essayEditor();
  return welcome();
}

function render() {
  if (!studio.state) {
    app.innerHTML = '<p class="loading">Abrindo o estúdio local…</p>';
    return;
  }
  app.innerHTML =
    '<div class="studio-shell">' +
    sidebar() +
    '<section class="studio-main"><div class="studio-main__inner">' +
    view() +
    "</div></section></div>";
  bindUploadArea();
  bindPhotoOrganizer();
}

function updateCompositionPreview() {
  const preview = document.querySelector("[data-composition-preview]");
  if (!preview) return;
  const value = (selector, fallback = "") => document.querySelector(selector)?.value || fallback;
  preview.dataset.previewPalette = value("#essay-theme-palette", "paper");
  preview.dataset.previewTypography = value("#essay-theme-typography", "editorial");
  preview.dataset.previewHeader = value("#essay-theme-header", "quiet");
  preview.dataset.previewAlign = value("#essay-theme-header-alignment", "start");
  preview.dataset.previewScale = value("#essay-theme-header-scale", "standard");
  preview.dataset.previewFont = value("#essay-theme-header-font", "inherit");
  preview.querySelector("[data-preview-title]").textContent = value(
    "#essay-title",
    "Título do ensaio",
  );
  preview.querySelector("[data-preview-context]").textContent = value(
    "#essay-excerpt",
    "O contexto acompanha as imagens sem disputar atenção com elas.",
  );
  for (const mode of ["light", "dark"]) {
    for (const tokenName of ["background", "surface", "text", "muted", "accent"]) {
      const tokenValue = value(`#theme-${mode}-${tokenName}`);
      if (tokenValue)
        preview.style.setProperty(`--preview-custom-${mode}-${tokenName}`, tokenValue);
    }
  }
  const customColors = document.querySelector("[data-custom-colors]");
  if (customColors) customColors.hidden = preview.dataset.previewPalette !== "custom";
}

function syncSelectedPhoto() {
  const photo = selectedPhoto();
  const details = document.querySelector("[data-photo-details]");
  if (!photo || !details || !studio.detail) return;
  const next = {
    ...photo,
    alt: document.querySelector("#selected-alt").value,
    caption: document.querySelector("#selected-caption").value,
    focalPoint: document.querySelector('input[name="selected-focal"]:checked')?.value || "center",
    crop: document.querySelector("#selected-crop").value,
    placement: document.querySelector("#selected-placement").value,
    display: document.querySelector("#selected-display").value,
  };
  studio.detail = {
    ...studio.detail,
    photos: studio.detail.photos.map((item) => (item.id === next.id ? next : item)),
  };
}

function captureEssay() {
  const root = document.querySelector('[data-editor-form="essay"]');
  if (!root || !studio.detail) return null;
  syncSelectedPhoto();
  return {
    revision: studio.detail.revision,
    title: document.querySelector("#essay-title").value,
    date: document.querySelector("#essay-date").value,
    location: document.querySelector("#essay-location").value,
    excerpt: document.querySelector("#essay-excerpt").value,
    tags: document
      .querySelector("#essay-tags")
      .value.split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    context: document.querySelector("#essay-context").value,
    draft: studio.detail.draft,
    layout: document.querySelector('input[name="essay-layout"]:checked')?.value ?? "sequence",
    theme: {
      palette: document.querySelector("#essay-theme-palette").value,
      typography: document.querySelector("#essay-theme-typography").value,
      header: document.querySelector("#essay-theme-header").value,
      headerAlignment: document.querySelector("#essay-theme-header-alignment").value,
      headerScale: document.querySelector("#essay-theme-header-scale").value,
      headerFont: document.querySelector("#essay-theme-header-font").value,
      custom: {
        light: {
          background: document.querySelector("#theme-light-background").value,
          surface: document.querySelector("#theme-light-surface").value,
          text: document.querySelector("#theme-light-text").value,
          muted: document.querySelector("#theme-light-muted").value,
          accent: document.querySelector("#theme-light-accent").value,
        },
        dark: {
          background: document.querySelector("#theme-dark-background").value,
          surface: document.querySelector("#theme-dark-surface").value,
          text: document.querySelector("#theme-dark-text").value,
          muted: document.querySelector("#theme-dark-muted").value,
          accent: document.querySelector("#theme-dark-accent").value,
        },
      },
    },
    coverId: studio.detail.coverId,
    photos: studio.detail.photos.map((photo) => ({
      id: photo.id,
      fileName: photo.fileName,
      alt: photo.alt,
      caption: photo.caption,
      focalPoint: photo.focalPoint,
      crop: photo.crop,
      placement: photo.placement,
      display: photo.display,
    })),
  };
}

async function saveEssay(silent = false) {
  const payload = captureEssay();
  if (!payload) return false;
  const result = await request("/api/essays/" + encodeURIComponent(studio.detail.slug), {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  studio.detail = result.essay;
  replaceSummary(result.essay);
  studio.dirty = false;
  if (!silent) {
    render();
    showToast("Ensaio salvo localmente.");
  }
  return true;
}

async function saveSite() {
  const payload = {
    revision: studio.state.site.revision,
    title: document.querySelector("#site-title").value,
    author: document.querySelector("#site-author").value,
    description: document.querySelector("#site-description").value,
    about: document.querySelector("#site-about").value,
    mosaicGrouping: document.querySelector("#site-mosaic-grouping").value,
    profile: {
      github: document.querySelector("#site-github").value,
      alt: document.querySelector("#site-profile-alt").value,
    },
  };
  const result = await request("/api/site", { method: "PUT", body: JSON.stringify(payload) });
  studio.state.site = result.site;
  studio.dirty = false;
  render();
  showToast("Identidade salva localmente.");
}

async function uploadFiles(files) {
  if (!files.length || !studio.detail) return;
  if (studio.busy) {
    showToast("Aguarde a importação atual terminar.");
    return;
  }

  studio.busy = true;
  const area = document.querySelector("[data-upload-area]");
  if (area) {
    area.setAttribute("aria-busy", "true");
    area.querySelectorAll("label").forEach((label) => label.setAttribute("aria-disabled", "true"));
    area.querySelectorAll("[data-photo-input]").forEach((input) => {
      input.disabled = true;
    });
    const title = area.querySelector("[data-upload-title]");
    const hint = area.querySelector("[data-upload-hint]");
    if (title) title.textContent = "Preparando fotografias…";
    if (hint) {
      hint.textContent =
        "A orientação, as cores e os metadados estão sendo tratados. Aguarde esta etapa terminar.";
    }
  }

  try {
    if (studio.dirty) await saveEssay(true);
    const form = new FormData();
    form.append("revision", studio.detail.revision);
    files.forEach((file) => form.append("files", file));
    const result = await request(
      "/api/essays/" + encodeURIComponent(studio.detail.slug) + "/photos",
      {
        method: "POST",
        body: form,
      },
    );
    studio.detail = result.essay;
    markBuildStale();
    ensureSelectedPhoto();
    replaceSummary(result.essay);
    studio.dirty = false;
    showToast(
      files.length + " fotografia" + (files.length === 1 ? " preparada." : "s preparadas."),
    );
  } finally {
    studio.busy = false;
    render();
  }
}

function selectPhoto(photoId) {
  syncSelectedPhoto();
  studio.selectedPhotoId = photoId;
  render();
}

function setDraft(draft) {
  const current = captureEssay();
  if (!current || !studio.detail) return;
  studio.detail = { ...studio.detail, ...current, draft };
  replaceSummary(studio.detail);
  studio.dirty = true;
  markBuildStale();
  render();
  showToast(
    draft ? "Ensaio mantido como rascunho." : "Ensaio entrará na próxima build depois de salvo.",
  );
}

function setCover() {
  syncSelectedPhoto();
  if (!studio.detail || !studio.selectedPhotoId) return;
  studio.detail = { ...studio.detail, coverId: studio.selectedPhotoId };
  replaceSummary(studio.detail);
  studio.dirty = true;
  markBuildStale();
  render();
  showToast("Capa escolhida.");
}

function movePhoto(photoId, direction) {
  const current = captureEssay();
  if (!current || !studio.detail) return;
  const index = current.photos.findIndex((photo) => photo.id === photoId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= current.photos.length) return;
  const ordered = [...current.photos];
  const [item] = ordered.splice(index, 1);
  ordered.splice(target, 0, item);
  studio.detail = { ...studio.detail, ...current, photos: ordered };
  studio.dirty = true;
  markBuildStale();
  render();
}

function movePhotoBefore(photoId, targetId) {
  const current = captureEssay();
  if (!current || !studio.detail || photoId === targetId) return;
  const ordered = [...current.photos];
  const sourceIndex = ordered.findIndex((photo) => photo.id === photoId);
  const targetIndex = ordered.findIndex((photo) => photo.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [item] = ordered.splice(sourceIndex, 1);
  const nextTarget = ordered.findIndex((photo) => photo.id === targetId);
  ordered.splice(nextTarget, 0, item);
  studio.detail = { ...studio.detail, ...current, photos: ordered };
  studio.selectedPhotoId = photoId;
  studio.dirty = true;
  markBuildStale();
  render();
}

async function deletePhoto(photoId) {
  if (!studio.detail) return;
  if (studio.dirty) await saveEssay(true);
  const result = await request(
    "/api/essays/" +
      encodeURIComponent(studio.detail.slug) +
      "/photos/" +
      encodeURIComponent(photoId),
    { method: "DELETE", body: JSON.stringify({ revision: studio.detail.revision }) },
  );
  studio.detail = result.essay;
  markBuildStale();
  replaceSummary(result.essay);
  studio.selectedPhotoId = result.essay.photos[0]?.id ?? null;
  studio.dirty = false;
  render();
  showToast("Fotografia retirada da edição atual.");
}

function openDeletePhotoDialog(photoId) {
  if (!studio.detail || !photoId) return;
  const photo = studio.detail.photos.find((item) => item.id === photoId);
  if (!photo) return;
  const isCover = studio.detail.coverId === photoId;
  dialog.innerHTML =
    '<form method="dialog" class="dialog__inner" data-delete-photo-form><h2>Retirar esta fotografia?</h2><p>' +
    escapeHtml(photo.alt === placeholderAlt ? "A fotografia selecionada" : photo.alt) +
    " sairá da edição atual." +
    (isCover
      ? " A primeira imagem restante passará a ser a capa deste ensaio."
      : " As demais fotografias conservarão a ordem atual.") +
    '</p><div class="dialog__actions"><button class="button" value="cancel">Cancelar</button><button class="button button--danger" value="remove">' +
    icon("trash") +
    "Retirar fotografia</button></div></form>";
  dialog.showModal();
  const form = dialog.querySelector("[data-delete-photo-form]");
  form.addEventListener("submit", async (event) => {
    const submitter = event.submitter;
    if (!submitter || submitter.value !== "remove") return;
    event.preventDefault();
    if (studio.busy) return;
    studio.busy = true;
    form.setAttribute("aria-busy", "true");
    form.querySelectorAll("button").forEach((button) => {
      button.disabled = true;
    });
    submitter.textContent = "Retirando…";
    try {
      await deletePhoto(photoId);
      dialog.close();
    } catch (error) {
      showToast(error.message, "error");
      form.removeAttribute("aria-busy");
      form.querySelectorAll("button").forEach((button) => {
        button.disabled = false;
      });
      submitter.innerHTML = icon("trash") + "Retirar fotografia";
    } finally {
      studio.busy = false;
    }
  });
}

async function buildPreview() {
  if (studio.dirty) {
    const shouldSave = window.confirm("Salvar as alterações antes de gerar a build?");
    if (!shouldSave) return;
    if (studio.mode === "site") await saveSite();
    else await saveEssay(true);
  }
  const publication = publicationState();
  if (studio.detail && !studio.detail.draft) {
    const review = photoReview(studio.detail);
    if (!review.total || review.pending) {
      showToast(
        !review.total
          ? "Adicione ao menos uma fotografia antes de gerar a prévia."
          : "Revise as " + review.pending + " descrições pendentes antes de gerar a prévia.",
        "error",
      );
      return;
    }
  }
  studio.state.build = { ...studio.state.build, status: "running", output: "" };
  render();
  const result = await request("/api/build", { method: "POST", body: JSON.stringify({}) });
  studio.state.build = result.build;
  await loadState();
  render();
  showToast(
    result.build.success
      ? publication.published === 0
        ? "Prévia vazia gerada. Você pode retirar toda a exposição."
        : "Prévia gerada."
      : "A build precisa de correção.",
    result.build.success ? "success" : "error",
  );
}

function reviewChanges(review) {
  const diff = review.diff;
  const rows = [];
  if (!diff.knownPrevious) rows.push("Primeira versão reconhecida por este Studio");
  if (diff.addedEssays)
    rows.push(
      diff.addedEssays + " ensaio" + (diff.addedEssays === 1 ? " adicionado" : "s adicionados"),
    );
  if (diff.changedEssays)
    rows.push(
      diff.changedEssays + " ensaio" + (diff.changedEssays === 1 ? " alterado" : "s alterados"),
    );
  if (diff.removedEssays)
    rows.push(
      diff.removedEssays + " ensaio" + (diff.removedEssays === 1 ? " retirado" : "s retirados"),
    );
  if (diff.addedPhotos)
    rows.push(
      diff.addedPhotos + " fotografia" + (diff.addedPhotos === 1 ? " adicionada" : "s adicionadas"),
    );
  if (diff.removedPhotos)
    rows.push(
      diff.removedPhotos + " fotografia" + (diff.removedPhotos === 1 ? " retirada" : "s retiradas"),
    );
  if (!rows.length)
    rows.push("Nenhuma diferença editorial detectada; a build atual será republicada");
  return rows;
}

function openPublicationReviewDialog(review) {
  const rows = reviewChanges(review);
  const empty = review.manifest.essayCount === 0;
  dialog.innerHTML =
    '<form method="dialog" class="dialog__inner publication-review" data-publication-form>' +
    '<p class="dialog__eyebrow">Revisão concluída</p><h2>' +
    (empty ? "Publicar o site vazio?" : "Publicar esta versão?") +
    "</h2><p>" +
    (empty
      ? "A exposição atual será retirada e o site mostrará somente “Por enquanto, nada por aqui”."
      : review.manifest.essayCount +
        " ensaio" +
        (review.manifest.essayCount === 1 ? " e " : "s e ") +
        review.manifest.photoCount +
        " fotografia" +
        (review.manifest.photoCount === 1 ? " compõem" : "s compõem") +
        " esta versão.") +
    '</p><ul class="publication-review__changes">' +
    rows.map((row) => "<li>" + escapeHtml(row) + "</li>").join("") +
    '</ul><dl class="publication-review__meta"><div><dt>Destino</dt><dd>' +
    escapeHtml(review.repository.fullName) +
    "</dd></div><div><dt>Build</dt><dd>" +
    escapeHtml(review.build.fileCount + " arquivos · " + formatBytes(review.build.bytes)) +
    '</dd></div></dl><label class="confirmation-field"><input type="checkbox" required /> <span>Entendo que a versão pública atual será substituída.</span></label>' +
    '<div class="dialog__actions"><button class="button" value="cancel">Voltar</button><button class="button button--primary" value="publish">' +
    icon("publish") +
    "Publicar versão atual</button></div></form>";
  dialog.showModal();
  const form = dialog.querySelector("[data-publication-form]");
  form.addEventListener("submit", async (event) => {
    const submitter = event.submitter;
    if (!submitter || submitter.value !== "publish") return;
    event.preventDefault();
    if (!form.reportValidity() || studio.busy) return;
    studio.busy = true;
    form.setAttribute("aria-busy", "true");
    form.querySelectorAll("button, input").forEach((control) => {
      control.disabled = true;
    });
    submitter.textContent = "Publicando…";
    try {
      const response = await request("/api/publication/publish", {
        method: "POST",
        body: JSON.stringify({ reviewId: review.id, confirm: true }),
      });
      dialog.close();
      await refreshPublication();
      render();
      showToast("Versão enviada ao GitHub. Aguarde alguns instantes antes de verificar o site.");
      return response;
    } catch (error) {
      await refreshPublication().catch(() => undefined);
      render();
      showToast(error.message, "error");
      form.removeAttribute("aria-busy");
      form.querySelectorAll("button, input").forEach((control) => {
        control.disabled = false;
      });
      submitter.innerHTML = icon("publish") + "Publicar versão atual";
    } finally {
      studio.busy = false;
    }
  });
}

async function reviewPublication() {
  if (studio.dirty) {
    showToast("Salve as alterações e gere uma nova prévia antes de publicar.", "error");
    return;
  }
  studio.busy = true;
  if (studio.publication) {
    studio.publication.activity = { status: "reviewing", output: "", result: null };
  }
  render();
  try {
    const response = await request("/api/publication/review", {
      method: "POST",
      body: JSON.stringify({}),
    });
    await refreshPublication();
    render();
    openPublicationReviewDialog(response.review);
  } catch (error) {
    await refreshPublication().catch(() => undefined);
    render();
    throw error;
  } finally {
    studio.busy = false;
  }
}

async function connectGithubAccount() {
  const response = await request("/api/github/connect", {
    method: "POST",
    body: JSON.stringify({}),
  });
  studio.publication.connection = response.connection;
  render();
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
    const state = await refreshPublication();
    render();
    if (state.github.connected) {
      showToast("GitHub conectado como " + state.github.login + ".");
      return;
    }
    if (state.connection.status === "failed") {
      throw new Error(state.connection.message || "O acesso ao GitHub não foi concluído.");
    }
  }
  throw new Error("O acesso ao GitHub não foi concluído dentro do tempo esperado.");
}

async function verifyPublication() {
  if (studio.publication) {
    studio.publication.activity = { status: "verifying", output: "", result: null };
  }
  render();
  try {
    const response = await request("/api/publication/verify", {
      method: "POST",
      body: JSON.stringify({}),
    });
    await refreshPublication();
    render();
    if (response.verification.success) showToast("A versão pública está íntegra.");
    else
      showToast(
        "O Pages ainda não apresenta toda a versão esperada. Tente novamente em instantes.",
        "error",
      );
  } catch (error) {
    await refreshPublication().catch(() => undefined);
    render();
    throw error;
  }
}

async function shutdownStudio() {
  if (
    !window.confirm("Encerrar o estúdio local? Você poderá reabri-lo pelo atalho quando quiser.")
  ) {
    return;
  }
  await request("/api/shutdown", { method: "POST", body: JSON.stringify({}) });
  app.innerHTML =
    '<section class="studio-ended" aria-labelledby="studio-ended-title"><p>Estúdio local</p><h1 id="studio-ended-title">Encerrado.</h1><p>Esta aba já pode ser fechada. Para voltar, dê duplo clique em Abrir Estúdio.cmd.</p></section>';
}

function openCreateDialog() {
  dialog.innerHTML =
    '<form method="dialog" class="dialog__inner" data-create-form><h2>Novo ensaio</h2><p>Ele nasce como rascunho e só entra no site quando você tirar esse estado.</p>' +
    field("Título", "new-title", "", "text") +
    field("Data", "new-date", today(), "date") +
    '<div class="dialog__actions"><button class="button" value="cancel">Cancelar</button><button class="button button--primary" value="create">Criar</button></div></form>';
  dialog.showModal();
  const form = dialog.querySelector("[data-create-form]");
  form.addEventListener("submit", async (event) => {
    const submitter = event.submitter;
    if (!submitter || submitter.value !== "create") return;
    event.preventDefault();
    try {
      const result = await request("/api/essays", {
        method: "POST",
        body: JSON.stringify({
          title: document.querySelector("#new-title").value,
          date: document.querySelector("#new-date").value,
        }),
      });
      dialog.close();
      studio.detail = result.essay;
      studio.selectedSlug = result.essay.slug;
      studio.selectedPhotoId = null;
      studio.mode = "essay";
      studio.dirty = false;
      markBuildStale();
      replaceSummary(result.essay);
      render();
      showToast("Rascunho criado.");
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

function openDeleteDialog() {
  if (!studio.detail) return;
  dialog.innerHTML =
    '<form method="dialog" class="dialog__inner" data-delete-form><h2>Retirar este ensaio?</h2><p>Ele será removido do conteúdo local e não aparecerá na próxima versão pública. A exposição no GitHub só muda quando você gerar, revisar e publicar uma nova build. Downloads e cópias externas não podem ser revogados.</p><div class="dialog__actions"><button class="button" value="cancel">Cancelar</button><button class="button button--danger" value="remove">Retirar do site</button></div></form>';
  dialog.showModal();
  const form = dialog.querySelector("[data-delete-form]");
  form.addEventListener("submit", async (event) => {
    const submitter = event.submitter;
    if (!submitter || submitter.value !== "remove") return;
    event.preventDefault();
    try {
      const slug = studio.detail.slug;
      await request("/api/essays/" + encodeURIComponent(slug), {
        method: "DELETE",
        body: JSON.stringify({ revision: studio.detail.revision, confirm: true }),
      });
      dialog.close();
      removeSummary(slug);
      markBuildStale();
      studio.detail = null;
      studio.selectedSlug = null;
      studio.selectedPhotoId = null;
      studio.mode = "welcome";
      studio.dirty = false;
      render();
      showToast("Ensaio retirado da edição atual.");
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

function bindUploadArea() {
  const area = document.querySelector("[data-upload-area]");
  if (!area) return;
  area.querySelectorAll("[data-photo-input]").forEach((input) => {
    input.addEventListener("change", () => {
      if (studio.busy) {
        showToast("Aguarde a importação atual terminar.");
        input.value = "";
        return;
      }
      uploadFiles(Array.from(input.files || [])).catch((error) =>
        showToast(error.message, "error"),
      );
      input.value = "";
    });
  });
  area.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (studio.busy) return;
    area.dataset.dragging = "true";
  });
  area.addEventListener("dragleave", () => {
    delete area.dataset.dragging;
  });
  area.addEventListener("drop", (event) => {
    event.preventDefault();
    delete area.dataset.dragging;
    if (studio.busy) {
      showToast("Aguarde a importação atual terminar.");
      return;
    }
    uploadFiles(Array.from(event.dataTransfer?.files || [])).catch((error) =>
      showToast(error.message, "error"),
    );
  });
}

function bindPhotoOrganizer() {
  const tiles = document.querySelectorAll("[data-photo-tile]");
  tiles.forEach((tile) => {
    tile.addEventListener("dragstart", (event) => {
      studio.draggingPhotoId = tile.dataset.photoId;
      tile.dataset.dragging = "true";
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", studio.draggingPhotoId);
    });
    tile.addEventListener("dragend", () => {
      studio.draggingPhotoId = null;
      delete tile.dataset.dragging;
      tiles.forEach((item) => delete item.dataset.dropTarget);
    });
    tile.addEventListener("dragover", (event) => {
      if (!studio.draggingPhotoId || studio.draggingPhotoId === tile.dataset.photoId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      tiles.forEach((item) => delete item.dataset.dropTarget);
      tile.dataset.dropTarget = "true";
    });
    tile.addEventListener("dragleave", () => delete tile.dataset.dropTarget);
    tile.addEventListener("drop", (event) => {
      event.preventDefault();
      const sourceId = studio.draggingPhotoId || event.dataTransfer.getData("text/plain");
      movePhotoBefore(sourceId, tile.dataset.photoId);
    });
  });
}

async function act(action, source) {
  if (studio.busy) return;
  try {
    if (action === "new-essay") return openCreateDialog();
    if (action === "select-essay") return selectEssay(source.dataset.slug);
    if (action === "select-photo") return selectPhoto(source.dataset.photoId);
    if (action === "set-draft") return setDraft(source.dataset.draft === "true");
    if (action === "set-cover") return setCover();
    if (action === "shutdown") return shutdownStudio();
    if (action === "edit-site") {
      if (
        studio.dirty &&
        !window.confirm("Há alterações ainda não salvas. Abrir outra seção mesmo assim?")
      )
        return;
      studio.mode = "site";
      studio.detail = null;
      studio.selectedSlug = null;
      studio.selectedPhotoId = null;
      studio.dirty = false;
      render();
      return;
    }
    if (action === "return-welcome") {
      studio.mode = "welcome";
      studio.detail = null;
      studio.selectedSlug = null;
      studio.selectedPhotoId = null;
      studio.dirty = false;
      render();
      return;
    }
    if (action === "save-essay") return saveEssay();
    if (action === "save-site") return saveSite();
    if (action === "move-selected-up") return movePhoto(studio.selectedPhotoId, -1);
    if (action === "move-selected-down") return movePhoto(studio.selectedPhotoId, 1);
    if (action === "delete-selected-photo") return openDeletePhotoDialog(studio.selectedPhotoId);
    if (action === "delete-essay") return openDeleteDialog();
    if (action === "build") return buildPreview();
    if (action === "connect-github") return connectGithubAccount();
    if (action === "review-publication") return reviewPublication();
    if (action === "verify-publication") return verifyPublication();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    studio.busy = false;
  }
}

app.addEventListener("click", (event) => {
  const source = event.target.closest("[data-action]");
  if (!source) return;
  event.preventDefault();
  act(source.dataset.action, source);
});

app.addEventListener("input", (event) => {
  if (event.target.closest("[data-editor-form]")) {
    setDirty(true);
    updateCompositionPreview();
  }
});

app.addEventListener("change", (event) => {
  if (event.target.closest("[data-editor-form]")) {
    setDirty(true);
    updateCompositionPreview();
  }
});

try {
  await loadState();
  render();
} catch (error) {
  app.innerHTML =
    '<p class="loading">Não foi possível abrir o estúdio: ' + escapeHtml(error.message) + "</p>";
}
