import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("publicação local", () => {
  test("mantém toda a leitura essencial sem JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("./", { waitUntil: "domcontentloaded" });

    await expect(page.locator("main h1")).toHaveText("Publicação atual");
    await expect(page.locator(".feature-copy h2")).toHaveText("Luz de teste");
    await expect(page.locator("main")).toContainText("Linha de horizonte");
    await expect(page.locator("main")).not.toContainText("Rascunho de teste");
    await expect(page.locator(".home-view")).toHaveCount(2);
    expect(
      await page
        .locator(".home-view")
        .evaluateAll((panels) => panels.every((panel) => !panel.hasAttribute("hidden"))),
    ).toBe(true);
    await expect(page.locator(".mosaic-item")).toHaveCount(11);
    expect(await page.locator("main img[alt]").count()).toBeGreaterThan(11);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "index, follow, noimageindex",
    );
    await expect(page.locator(".site-header")).toContainText("Meu ponto de vista");
    await expect(page.locator(".site-header nav a")).toHaveCount(1);
    await expect(page.locator(".site-header nav")).not.toContainText(/Ensaios|Mosaico|Temas/);

    await page.locator('.site-header a[href$="/sobre/"]').click();
    await expect(page).toHaveURL(/\/mpov\/sobre\/$/);
    await expect(page.locator("main")).toContainText("Elas ficam públicas até que não fiquem.");
    await context.close();
  });

  test("alterna ensaios e mosaico dentro da página inicial e preserva o histórico", async ({
    page,
  }) => {
    await page.goto("./", { waitUntil: "networkidle" });
    const essaysControl = page.locator('[data-view-control="ensaios"]');
    const mosaicControl = page.locator('[data-view-control="mosaico"]');

    await expect(essaysControl).toHaveAttribute("aria-current", "true");
    await expect(page.locator('[data-home-panel="ensaios"]')).toBeVisible();
    await expect(page.locator('[data-home-panel="mosaico"]')).toBeHidden();

    await mosaicControl.click();
    await expect(page).toHaveURL(/\/mpov\/#mosaico$/);
    await expect(mosaicControl).toHaveAttribute("aria-current", "true");
    await expect(essaysControl).not.toHaveAttribute("aria-current", "true");
    await expect(page.locator('[data-home-panel="mosaico"]')).toBeVisible();
    await expect(page.locator('[data-home-panel="ensaios"]')).toBeHidden();

    await page.goBack();
    await expect(page).toHaveURL(/\/mpov\/$/);
    await expect(essaysControl).toHaveAttribute("aria-current", "true");

    await page.goto("./ensaios/");
    await expect(page).toHaveURL(/\/mpov\/#ensaios$/);
    await page.goto("./mosaico/");
    await expect(page).toHaveURL(/\/mpov\/#mosaico$/);
    await page.goto("./temas/");
    await expect(page).toHaveURL(/\/mpov\/#ensaios$/);
  });

  test("encerra a lista de ensaios sem uma faixa vazia antes do rodapé", async ({ page }) => {
    await page.goto("./", { waitUntil: "networkidle" });
    const closing = await page.evaluate(() => {
      const lastEssay = document.querySelector<HTMLElement>(".essay-row:last-child");
      const footer = document.querySelector<HTMLElement>(".site-footer");
      if (!lastEssay || !footer) return null;
      const essayRect = lastEssay.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      const essayStyle = getComputedStyle(lastEssay);
      return {
        gap: footerRect.top - essayRect.bottom,
        border: Number.parseFloat(essayStyle.borderBottomWidth),
        padding: Number.parseFloat(essayStyle.paddingBottom),
      };
    });

    expect(closing).not.toBeNull();
    expect(closing?.border).toBe(0);
    expect(closing?.padding).toBe(0);
    expect(closing?.gap).toBeGreaterThanOrEqual(47);
    expect(closing?.gap).toBeLessThanOrEqual(73);
  });

  test("adapta a paleta editorial ao modo global sem separar a navegação da publicação", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("mpov-theme", "light"));
    await page.goto("./ensaios/luz-de-teste/", { waitUntil: "networkidle" });
    const chrome = () =>
      page.locator("body").evaluate((body) => {
        const footer = document.querySelector<HTMLElement>(".site-footer");
        return {
          background: getComputedStyle(body).backgroundColor,
          text: getComputedStyle(body).color,
          footerBackground: footer ? getComputedStyle(footer).backgroundColor : "",
        };
      });

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await chrome()).toEqual({
      background: "rgb(238, 242, 230)",
      text: "rgb(38, 48, 40)",
      footerBackground: "rgb(238, 242, 230)",
    });

    await page.locator("footer [data-theme-toggle]").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await chrome()).toEqual({
      background: "rgb(23, 35, 27)",
      text: "rgb(238, 245, 233)",
      footerBackground: "rgb(23, 35, 27)",
    });
  });

  test("organiza a leitura editorial sem molduras artificiais e com recortes conscientes", async ({
    page,
  }) => {
    await page.goto("./ensaios/luz-de-teste/", { waitUntil: "networkidle" });
    await expect(page.locator("main h1")).toHaveText("Luz de teste");
    await expect(page.locator(".essay-gallery--margins")).toHaveCount(1);
    await expect(page.locator(".photo-figure")).toHaveCount(4);
    await expect(page.locator(".photo-figure img[alt]")).toHaveCount(4);
    const firstPhoto = page.locator(".essay-gallery--margins .photo-link").first();
    const geometry = await firstPhoto.evaluate((element) => {
      const picture = element.querySelector("picture") as HTMLElement;
      const image = element.querySelector("img") as HTMLImageElement;
      return {
        frameRatio: element.clientWidth / element.clientHeight,
        pictureRatio: picture.clientWidth / picture.clientHeight,
        imageRatio: image.clientWidth / image.clientHeight,
        objectFit: getComputedStyle(image).objectFit,
        objectPosition: getComputedStyle(image).objectPosition,
      };
    });
    expect(geometry.frameRatio).toBeCloseTo(1.5, 1);
    expect(geometry.pictureRatio).toBeCloseTo(geometry.frameRatio, 2);
    expect(geometry.imageRatio).toBeCloseTo(geometry.frameRatio, 2);
    expect(geometry.objectFit).toBe("cover");
    expect(geometry.objectPosition).toBe("50% 0%");

    const marginMetrics = await page
      .locator(".essay-gallery--margins .photo-figure")
      .evaluateAll((figures) =>
        figures.slice(0, 2).map((figure) => {
          const image = figure.querySelector(".photo-link")?.getBoundingClientRect();
          const caption = figure.querySelector("figcaption")?.getBoundingClientRect();
          return {
            display: getComputedStyle(figure).display,
            imageLeft: image?.left ?? 0,
            imageRight: image?.right ?? 0,
            captionLeft: caption?.left ?? 0,
            captionRight: caption?.right ?? 0,
          };
        }),
      );
    const isTabletOrWider = (page.viewportSize()?.width ?? 0) >= 700;
    if (isTabletOrWider) {
      expect(marginMetrics[0].display).toBe("grid");
      expect(marginMetrics[0].captionLeft).toBeGreaterThan(marginMetrics[0].imageRight);
      expect(marginMetrics[1].captionRight).toBeLessThan(marginMetrics[1].imageLeft);
    } else {
      expect(marginMetrics[0].display).toBe("block");
    }

    await page.goto("./ensaios/formas-de-teste/", { waitUntil: "networkidle" });
    await expect(page.locator(".essay-gallery--pages")).toHaveCount(1);
    const headingMetrics = await page.locator(".essay-intro").evaluate((intro) => {
      const title = intro.querySelector("h1")?.getBoundingClientRect();
      const context = intro.querySelector(".essay-intro__context")?.getBoundingClientRect();
      return {
        title: title
          ? { top: title.top, right: title.right, bottom: title.bottom, left: title.left }
          : null,
        context: context
          ? { top: context.top, right: context.right, bottom: context.bottom, left: context.left }
          : null,
      };
    });
    if ((page.viewportSize()?.width ?? 0) >= 760) {
      expect(headingMetrics.title).not.toBeNull();
      expect(headingMetrics.context).not.toBeNull();
      const title = headingMetrics.title!;
      const context = headingMetrics.context!;
      const overlaps =
        title.left < context.right &&
        title.right > context.left &&
        title.top < context.bottom &&
        title.bottom > context.top;
      expect(overlaps).toBe(false);
    }

    const naturalImage = page
      .locator(".essay-gallery--pages .photo-figure--crop-contain .photo-link")
      .first();
    const naturalGeometry = await naturalImage.evaluate((element) => {
      const picture = element.querySelector("picture") as HTMLElement;
      const image = element.querySelector("img") as HTMLImageElement;
      return {
        background: getComputedStyle(element).backgroundColor,
        frameHeight: element.clientHeight,
        pictureHeight: picture.clientHeight,
        imageHeight: image.clientHeight,
      };
    });
    expect(naturalGeometry.background).toBe("rgba(0, 0, 0, 0)");
    expect(naturalGeometry.pictureHeight).toBe(naturalGeometry.frameHeight);
    expect(naturalGeometry.imageHeight).toBe(naturalGeometry.frameHeight);

    const pageMetrics = await page.locator(".essay-gallery--pages").evaluate((gallery) => {
      const figures = Array.from(gallery.querySelectorAll(".photo-figure")).slice(0, 2);
      return {
        display: getComputedStyle(gallery).display,
        figures: figures.map((figure) => {
          const rect = figure.getBoundingClientRect();
          return { top: rect.top, left: rect.left };
        }),
      };
    });
    if (isTabletOrWider) {
      expect(pageMetrics.display).toBe("grid");
      expect(pageMetrics.figures[0].top).toBeCloseTo(pageMetrics.figures[1].top, 0);
      expect(pageMetrics.figures[0].left).not.toBeCloseTo(pageMetrics.figures[1].left, 0);
    } else {
      expect(pageMetrics.display).toBe("block");
      expect(pageMetrics.figures[1].top).toBeGreaterThan(pageMetrics.figures[0].top);
    }
  });

  test("mantém íntegras as composições sem depender do conteúdo pessoal", async ({ page }) => {
    await page.goto("./ensaios/luz-de-teste/", { waitUntil: "networkidle" });
    await expect(page.locator("main h1")).toHaveText("Luz de teste");
    await expect(page.locator("body")).toHaveAttribute("data-editorial-palette", "field");
    await expect(page.locator(".essay-gallery--margins")).toHaveCount(1);
    await expect(page.locator(".photo-figure")).toHaveCount(4);
    await expect(page.locator(".photo-figure figcaption")).toHaveCount(4);
    await expect(page.locator(".photo-figure img").first()).toHaveAttribute(
      "alt",
      "Composição sintética 1 do ensaio Luz de teste.",
    );
    expect(
      await page
        .locator(".photo-figure img")
        .evaluateAll((images) => new Set(images.map((image) => image.currentSrc)).size),
    ).toBe(4);
    await expect(page.getByRole("link", { name: "#natureza" })).toHaveAttribute(
      "href",
      "/mpov/temas/natureza/",
    );

    await page.goto("./ensaios/formas-de-teste/", { waitUntil: "networkidle" });
    await expect(page.locator("main h1")).toHaveText("Formas em pausa");
    await expect(page.locator("body")).toHaveAttribute("data-editorial-palette", "dusk");
    await expect(page.locator(".essay-gallery--pages")).toHaveCount(1);
    await expect(page.locator(".photo-figure")).toHaveCount(4);
    await expect(page.locator(".photo-figure figcaption")).toHaveCount(4);
    await expect(page.getByRole("link", { name: "#abstrato" })).toHaveAttribute(
      "href",
      "/mpov/temas/abstrato/",
    );
  });

  test("mantém o mosaico regular sem misturar os ensaios", async ({ page }) => {
    await page.goto("./#mosaico", { waitUntil: "networkidle" });
    await expect(page.locator('[data-view-control="mosaico"]')).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(page.locator(".mosaic-item")).toHaveCount(11);
    await expect(page.locator(".mosaic-essay")).toHaveCount(3);
    await expect(page.locator(".mosaic-essay__heading")).toHaveCount(3);
    await expect(page.locator('.mosaic-item[href*="/ensaios/sample/"]')).toHaveCount(0);
    const tileMetrics = await page
      .locator(".mosaic-item")
      .evaluateAll((tiles) =>
        tiles.map((tile) => ({ width: tile.clientWidth, height: tile.clientHeight })),
      );
    expect(tileMetrics).toHaveLength(11);
    expect(tileMetrics.every((tile) => Math.abs(tile.width - tile.height) <= 1)).toBe(true);
  });

  test("filtra por hashtag e permite navegar pelas fotografias relacionadas", async ({ page }) => {
    await page.goto("./ensaios/luz-de-teste/", { waitUntil: "networkidle" });
    await expect(page.locator("header nav")).not.toContainText("Temas");
    await page.getByRole("link", { name: "#por-do-sol" }).click();
    await expect(page).toHaveURL(/\/mpov\/temas\/por-do-sol\/$/);
    await expect(page.locator("main h1")).toHaveText("#por-do-sol");
    await expect(page.locator(".tag-publication")).toHaveCount(2);
    await expect(page.locator(".tag-photo")).toHaveCount(7);
    await expect(page.locator("main")).not.toContainText("Todos os temas");

    const firstPhoto = page.locator(".tag-photo").first();
    const lightbox = page.locator("[data-lightbox-root]");
    await expect(lightbox).toHaveAttribute("data-lightbox-ready", "true", { timeout: 15_000 });
    await firstPhoto.click();
    await expect(lightbox).toBeVisible();
    await expect(page.locator("[data-lightbox-count]")).toHaveText("1 / 7");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("[data-lightbox-count]")).toHaveText("2 / 7");
    await page.keyboard.press("Escape");
    await expect(lightbox).toBeHidden();
    await expect(firstPhoto).toBeFocused();

    await page.goto("./sobre/", { waitUntil: "networkidle" });
    await expect(page.locator(".about-page__portrait img")).toHaveAttribute(
      "src",
      "https://github.com/mafhper.png?size=512",
    );
    const portraitRatio = await page
      .locator(".about-page__portrait img")
      .evaluate((image) => image.clientWidth / image.clientHeight);
    expect(portraitRatio).toBeCloseTo(0.8, 2);
    await expect(page.locator(".about-page__credit")).toContainText("Matheus Lima");
  });

  test("mantém títulos e superfícies dentro do viewport", async ({ page }) => {
    for (const route of [
      "./",
      "./#mosaico",
      "./ensaios/luz-de-teste/",
      "./ensaios/formas-de-teste/",
      "./ensaios/horizonte-de-teste/",
      "./temas/por-do-sol/",
      "./sobre/",
    ]) {
      await page.goto(route, { waitUntil: "networkidle" });
      const containment = await page.evaluate(() => {
        const title = document.querySelector("main h1");
        const rect = title?.getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          titleInside: !rect || (rect.left >= -1 && rect.right <= window.innerWidth + 1),
        };
      });
      expect(containment.overflow, route).toBe(false);
      expect(containment.titleInside, route).toBe(true);
    }
  });

  test("oferece tema manual persistente somente no rodapé", async ({ page }) => {
    await page.goto("./");
    await page.evaluate(() => localStorage.setItem("mpov-theme", "light"));
    await page.reload();
    const toggle = page.locator("footer [data-theme-toggle]");
    await expect(page.locator("header [data-theme-toggle]")).toHaveCount(0);
    await expect(toggle).toHaveAttribute("aria-label", /Usar tema escuro/);
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page).toHaveTitle(/Meu ponto de vista/);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("usa 404 curto para URLs removidas", async ({ page }) => {
    const response = await page.goto("./ensaios/nao-existe/");
    expect(response?.status()).toBe(404);
    await expect(page.locator("main h1")).toHaveText("Isso não está mais aqui.");
  });

  test("mantém as superfícies publicadas sem violações de acessibilidade", async ({ page }) => {
    test.setTimeout(180_000);
    const routes = [
      "./",
      "./#mosaico",
      "./ensaios/luz-de-teste/",
      "./ensaios/formas-de-teste/",
      "./ensaios/horizonte-de-teste/",
      "./temas/natureza/",
      "./temas/abstrato/",
      "./temas/por-do-sol/",
      "./sobre/",
    ];

    await page.goto("./");
    for (const theme of ["light", "dark"]) {
      await page.evaluate((selectedTheme) => {
        localStorage.setItem("mpov-theme", selectedTheme);
      }, theme);
      for (const route of routes) {
        await page.goto(route, { waitUntil: "networkidle" });
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations, `${theme}: ${route}`).toEqual([]);
      }
    }
  });
});
