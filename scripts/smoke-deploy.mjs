const baseUrl = (process.argv[2] || "https://mafhper.github.io/mpov/").replace(/\/$/, "");
const routes = ["/", "/ensaios/", "/mosaico/", "/temas/", "/sobre/"];
const errors = [];

for (const route of routes) {
  const url = `${baseUrl}${route}`;
  try {
    const response = await fetch(url, { redirect: "follow" });
    const html = await response.text();
    if (!response.ok) errors.push(`${route}: HTTP ${response.status}`);
    if (!html.includes('name="robots"') || !html.includes("noimageindex"))
      errors.push(`${route}: diretiva de imagens ausente`);
  } catch (error) {
    errors.push(`${route}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

try {
  const robots = await fetch(`${baseUrl}/robots.txt`, { redirect: "follow" });
  const text = await robots.text();
  if (!robots.ok || !text.includes("Sitemap:"))
    errors.push(`/robots.txt: resposta inválida (${robots.status})`);
} catch (error) {
  errors.push(`/robots.txt: ${error instanceof Error ? error.message : String(error)}`);
}

if (errors.length) {
  for (const error of errors) console.error(`Erro: smoke Pages: ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Smoke Pages aprovado: ${baseUrl}`);
}
