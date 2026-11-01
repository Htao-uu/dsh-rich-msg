import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.beforeEach(async ({ page }) => {
  await page.route("https://image.tmdb.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 560"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#233443"/><stop offset="1" stop-color="#8c9c9a"/></linearGradient></defs><rect width="400" height="560" fill="url(#g)"/><circle cx="200" cy="210" r="90" fill="#d7d3bd" opacity=".4"/><path d="M0 420 L150 320 250 430 400 290V560H0" fill="#172c39"/></svg>',
    }),
  );
  await page.route("https://thumb.wikimedia.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><rect width="500" height="500" fill="#dfe3e8"/><rect x="40" y="60" width="420" height="300" rx="24" fill="#c3cad3"/></svg>',
    }),
  );
});
test("film detail panel opens, navigates related entity, and restores focus", async ({
  page,
}) => {
  await page.goto("/?demo=films");
  const card = page.locator(
    ".ru-entity-card[aria-label='Details: Interstellar']",
  );
  await card.click();
  const dialog = page.locator(".ru-detail");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Interstellar", exact: true }),
  ).toBeVisible();
  // Two portrait photos share the panel width, as in the reference.
  const photos = dialog.locator(".ru-detail-page .ru-detail-photo");
  await expect(photos).toHaveCount(2);
  const boxes = await photos.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().top),
  );
  expect(new Set(boxes.map((top) => Math.round(top))).size).toBe(1);
  await dialog.getByRole("button", { name: "Arrival", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "Arrival", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(card).toBeFocused();
});
test("calculator computes immediately and reset restores defaults", async ({
  page,
}) => {
  await page.goto("/?demo=calculator");
  await expect(page.locator(".ru-computed output")).toHaveText(/70,246/);
  const rate = page.getByRole("slider", { name: "Annual return, %" });
  await rate.fill("0");
  await expect(page.locator(".ru-computed output")).toHaveText(/50,000/);
  await page.getByRole("button", { name: "Reset parameters" }).click();
  await expect(rate).toHaveValue("12");
  await expect(page.locator(".ru-computed output")).toHaveText(/70,246/);
});
test("configurator updates text, conditional chart, tabs and notification locally", async ({
  page,
}) => {
  await page.goto("/?demo=configurator");
  await page.getByRole("textbox", { name: "Project name" }).fill("New system");
  await expect(page.locator(".ru-title")).toHaveText("New system");
  await expect(page.getByRole("img", { name: "Line chart" })).toBeVisible();
  await page.getByRole("switch", { name: "Enable analytics" }).uncheck();
  await expect(page.getByRole("img", { name: "Line chart" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Table" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("switch", { name: "Show notifications" }).check();
  await expect(
    page.getByText("Notifications are on in the preview."),
  ).toBeVisible();
});
test("all scenarios have no horizontal overflow or runtime errors in both themes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // A viewport shorter than the answer clips an element screenshot under the
  // sticky lab header, so give every scenario the same tall frame.
  await page.setViewportSize({
    width: page.viewportSize()!.width,
    height: 1900,
  });
  for (const demo of [
    "dashboard",
    "technical",
    "films",
    "listing",
    "calculator",
    "configurator",
    "pool",
    "diagnostic",
  ]) {
    for (const theme of ["light", "dark"]) {
      await page.goto(`/?demo=${demo}&theme=${theme}`);
      await expect(page.locator(".rich-ui").first()).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await page.evaluate(() => window.scrollTo(0, 0));
      const answer = await page.locator(".lab-answer").boundingBox();
      expect(answer).not.toBeNull();
      await expect(page).toHaveScreenshot(`${demo}-${theme}.png`, {
        clip: answer!,
        animations: "disabled",
        maxDiffPixelRatio: 0.01,
      });
    }
  }
  expect(errors).toEqual([]);
});
test("detail respects mobile modal and desktop nonmodal semantics", async ({
  page,
  isMobile,
}) => {
  await page.goto("/?demo=films");
  await page
    .locator(".ru-entity-card[aria-label='Details: Interstellar']")
    .click();
  if (isMobile) {
    await expect(
      page.getByRole("button", { name: "Close details" }),
    ).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveAttribute(
      "aria-modal",
      "true",
    );
    await page.keyboard.press("Shift+Tab");
    expect(
      await page.evaluate(
        () => !!document.activeElement?.closest("[role=dialog]"),
      ),
    ).toBeTruthy();
  } else {
    await expect(page.locator(".ru-detail")).not.toHaveAttribute(
      "aria-modal",
      "true",
    );
    await expect(
      page.getByRole("button", { name: "Toggle theme" }),
    ).toBeEnabled();
  }
  await page.getByRole("button", { name: "Close details" }).click();
  await expect(page.locator(".ru-detail")).toHaveCount(0);
});
test("renderer passes automated accessibility checks", async ({ page }) => {
  for (const demo of [
    "dashboard",
    "technical",
    "films",
    "listing",
    "apps",
    "calculator",
    "configurator",
    "pool",
    "diagnostic",
  ]) {
    await page.goto(`/?demo=${demo}`);
    const results = await new AxeBuilder({ page })
      .include(".lab-answer")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
});
test("icons carry semantic colour, not one grey tone", async ({ page }) => {
  await page.goto("/?demo=technical&theme=light");
  const colors = await page.$$eval(".ru-icon", (els) =>
    els.map((el) => getComputedStyle(el).color),
  );
  expect(new Set(colors).size).toBeGreaterThanOrEqual(3);
  const danger = await page
    .locator(".ru-icon[data-tone=danger]")
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  const muted = await page
    .locator(".ru-icon[data-tone=muted]")
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  expect(danger).not.toBe(muted);
});
test("dark secondary copy keeps readable contrast in cards and the drawer", async ({
  page,
}) => {
  const contrast = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((element) => {
        const parse = (value: string) => {
          const match = value.match(/rgba?\(([^)]+)\)/);
          return match
            ? match[1]!.split(",").map((part) => Number(part.trim()))
            : [0, 0, 0, 0];
        };
        const luminance = ([r, g, b]: number[]) => {
          const channel = (value: number) => {
            const c = value / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          };
          return (
            0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!)
          );
        };
        let node: HTMLElement | null = element as HTMLElement;
        let background = [255, 255, 255];
        while (node) {
          const candidate = parse(getComputedStyle(node).backgroundColor);
          if ((candidate[3] ?? 1) > 0) {
            background = candidate;
            break;
          }
          node = node.parentElement;
        }
        const foreground = parse(getComputedStyle(element).color);
        const a = luminance(foreground);
        const b = luminance(background);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });

  await page.goto("/?demo=films&theme=dark");
  expect(await contrast(".ru-entity-description")).toBeGreaterThanOrEqual(4.5);
  await page
    .locator(".ru-entity-card[aria-label='Details: Interstellar']")
    .click();
  await expect(page.locator(".ru-detail")).toBeVisible();
  expect(await contrast(".ru-detail-body > p")).toBeGreaterThanOrEqual(4.5);
  expect(await contrast(".ru-detail-subtitle")).toBeGreaterThanOrEqual(4.5);
});

test("entity rows open the same detail panel and keep focus contract", async ({
  page,
}) => {
  await page.goto("/?demo=films");
  const row = page.locator(".ru-entity-row[aria-label='Details: Arrival']");
  await row.click();
  await expect(page.locator(".ru-detail")).toBeVisible();
  await expect(
    page
      .locator(".ru-detail")
      .getByRole("heading", { name: "Arrival", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".ru-detail")).toHaveCount(0);
  await expect(row).toBeFocused();
});

test("sortable table reorders rows without a model call", async ({ page }) => {
  await page.goto("/?demo=dashboard");
  const firstTask = page.locator(".ru-table-wrap tbody tr td").first();
  await expect(firstTask).toHaveText("Design");
  await page.locator("th", { hasText: "Progress" }).locator("button").click();
  await expect(firstTask).toHaveText("Testing");
  await expect(page.locator("th", { hasText: "Progress" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
});

test("chart exposes axes, series legend and a hover readout", async ({
  page,
}) => {
  await page.goto("/?demo=dashboard");
  await expect(page.locator(".ru-chart .ru-chart-unit")).toHaveText("$k");
  await expect(page.locator(".ru-chart figcaption")).toContainText("Revenue");
  await page.locator(".ru-chart-hit").nth(3).hover();
  await expect(page.locator(".ru-chart-tip")).toContainText("Apr");
  await expect(page.locator(".ru-chart-tip")).toContainText("91");
});

test("diagram steps keep their order and connector labels", async ({
  page,
}) => {
  await page.goto("/?demo=dashboard");
  const steps = page.locator(".ru-diagram-card strong");
  await expect(steps).toHaveCount(4);
  await expect(steps.first()).toHaveText("Request");
  await expect(page.locator(".ru-diagram-edge").first()).toContainText(
    "interface description",
  );
});

test("table filters rows locally and renders semantic status tones", async ({
  page,
}) => {
  await page.goto("/?demo=dashboard");
  const filter = page.getByRole("searchbox", { name: "Filter the table" });
  await filter.fill("Development");
  await expect(page.locator(".ru-table-wrap tbody tr")).toHaveCount(1);
  await expect(page.locator(".ru-table-wrap tbody tr")).toContainText("Mark");
  await expect(page.locator(".ru-table-count")).toHaveText("1 of 4");
  await filter.fill("no such task");
  await expect(page.locator(".ru-table-none")).toHaveText("Nothing found");
  await filter.fill("");
  await expect(page.locator(".ru-table-wrap tbody tr")).toHaveCount(4);
  await expect(
    page.locator('.ru-status-pill[data-tone="success"]').first(),
  ).toHaveText("Done");
});

test("rejected block explains the error and reveals its source", async ({
  page,
}) => {
  await page.goto("/?demo=diagnostic");
  await expect(page.locator(".ru-diagnostic")).toBeVisible();
  await expect(page.locator(".ru-diagnostic-summary")).toHaveText(
    'Missing required field "value".',
  );
  await expect(page.locator(".ru-diagnostic-error")).toContainText(
    "Missing value",
  );
  await page.getByText("Show the source JSON").click();
  await expect(page.locator(".ru-diagnostic pre")).toContainText('"stat"');
  await expect(page.getByRole("button", { name: "Copy error" })).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Ask the model to fix" }),
  ).toHaveCount(0);
});

test("spacious app rows keep their preview, full text and sources", async ({
  page,
  isMobile,
}) => {
  const shot = (ratio: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ratio}"><rect width="100%" height="100%" fill="#dfe3e8"/><rect x="12" y="12" width="70%" height="10%" fill="#b6bdc6"/><rect x="12" y="30%" width="88%" height="56%" fill="#c8ced6"/></svg>`;
  await page.route("https://thumb.wikimedia.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: shot("960 720"),
    }),
  );
  await page.goto("/?demo=apps");
  const rows = page.locator(".ru-entity-feature");
  await expect(rows).toHaveCount(3);

  // On desktop the preview is a real column, not a 52px strip; the narrow
  // container stacks it above the text and is covered separately below.
  if (!isMobile) {
    const mediaBox = (await rows
      .first()
      .locator(".ru-feature-media")
      .boundingBox())!;
    expect(Math.round(mediaBox.width)).toBe(208);
    expect(Math.round(mediaBox.height)).toBe(156);
  }

  // Sources are links, and they do not live inside the detail button.
  const source = rows.first().locator(".ru-entity-sources a").first();
  await expect(source).toHaveAttribute("href", "https://krita.org/");
  expect(await source.evaluate((node) => node.closest("button"))).toBeNull();

  // The full description is present; the compact list clamps to two lines.
  const description = rows.first().locator(".ru-feature-description");
  expect(
    await description.evaluate(
      (node) => node.scrollHeight <= node.clientHeight + 1,
    ),
  ).toBeTruthy();

  // The inline gallery in the answer changes its caption with the frame.
  const inline = page.locator(".ru-response-body .ru-gallery");
  await expect(inline.locator(".ru-gallery-caption")).toHaveText(
    "The default workspace: canvas, tool options and dockers.",
  );
  await inline.getByRole("button", { name: "Next image" }).click();
  await expect(inline.locator(".ru-gallery-caption")).toHaveText(
    "Brush presets stay visible while painting.",
  );

  // Opening the title shows one captioned screenshot at a time in the panel.
  await rows.first().locator(".ru-feature-title button").click();
  const dialog = page.locator(".ru-detail");
  await expect(dialog.getByRole("heading", { name: "Krita" })).toBeVisible();
  await expect(dialog.locator(".ru-gallery-caption")).toHaveText(
    "Workspace with the canvas, tool options and dockers.",
  );
  await dialog.getByRole("button", { name: "Next image" }).click();
  await expect(dialog.locator(".ru-gallery-caption")).toHaveText(
    "Brush presets docked next to the canvas.",
  );
  await expect(dialog.locator(".ru-gallery-controls output")).toHaveText(
    "2 / 3",
  );
});

test("spacious rows stack the preview above the text in a narrow container", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route("https://thumb.wikimedia.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 720"><rect width="960" height="720" fill="#dfe3e8"/></svg>',
    }),
  );
  await page.goto("/?demo=apps");
  const row = page.locator(".ru-entity-feature").first();
  const media = await row.locator(".ru-feature-media").boundingBox();
  const body = await row.locator(".ru-feature-body").boundingBox();
  expect(media!.width).toBeGreaterThan(300);
  expect(body!.y).toBeGreaterThan(media!.y + media!.height - 1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("progress columns expose values and product rows use square thumbnails", async ({
  page,
}) => {
  await page.goto("/?demo=dashboard");
  const bars = page.locator('.ru-table-wrap [role="progressbar"]');
  await expect(bars).toHaveCount(4);
  await expect(bars.first()).toHaveAttribute("aria-valuenow", "100");
  await expect(bars.nth(1)).toHaveAttribute("aria-valuenow", "65");
  await page.goto("/?demo=listing");
  const square = page.locator(".ru-poster-square").first();
  await expect(square).toBeVisible();
  const box = await square.boundingBox();
  expect(Math.round(box!.width)).toBe(56);
  expect(Math.round(box!.height)).toBe(56);
});

test("inline entity chips open the shared detail surface", async ({ page }) => {
  await page.goto("/?demo=films");
  const chip = page.getByRole("button", { name: "Open: Interstellar" });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page.locator(".ru-detail h2")).toHaveText("Interstellar");
});

test("popover controls follow the page theme, not the OS", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/?demo=primitives&theme=light");
  await page.getByRole("button", { name: "Open settings" }).click();
  const panel = page.locator(".ru-primitive-popover-panel");
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((el) => getComputedStyle(el).colorScheme)).toBe(
    "light",
  );
  const input = panel.locator("input");
  expect(
    await input.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(246, 246, 247)");
  expect(await input.evaluate((el) => getComputedStyle(el).color)).toBe(
    "rgb(32, 32, 32)",
  );

  await page.goto("/?demo=primitives&theme=dark");
  await page.getByRole("button", { name: "Open settings" }).click();
  expect(
    await page
      .locator(".ru-primitive-popover-panel")
      .evaluate((el) => getComputedStyle(el).colorScheme),
  ).toBe("dark");
});

test("dark host tokens beat the light bridge inside a rich root", async ({
  page,
}) => {
  await page.goto("/?demo=dashboard&theme=light");
  const tone = await page.evaluate(() => {
    document.body.setAttribute("data-ds-dark-theme", "");
    const root = document.createElement("div");
    root.setAttribute("data-rich-ui-root", "");
    const ui = document.createElement("div");
    ui.className = "rich-ui";
    const callout = document.createElement("div");
    callout.className = "ru-callout ru-info";
    callout.textContent = "Info";
    ui.append(callout);
    root.append(ui);
    document.body.append(root);
    const style = getComputedStyle(callout);
    return {
      info: style.getPropertyValue("--ru-info").trim(),
      color: style.color,
      background: style.backgroundColor,
    };
  });
  expect(tone.info).toBe("#85b6ee");
  expect(tone.color).toBe("rgb(133, 182, 238)");
  expect(tone.background).not.toBe("rgba(0, 0, 0, 0)");
});

test("success states use the host success token, not its blue business accent", async ({
  page,
}) => {
  await page.goto("/?demo=dashboard&theme=light");
  const color = await page.evaluate(() => {
    document.body.style.setProperty(
      "--dsw-alias-state-business-primary",
      "#4176e6",
    );
    document.body.style.setProperty(
      "--dsw-alias-state-success-primary",
      "#22c55e",
    );
    const root = document.createElement("div");
    root.setAttribute("data-rich-ui-root", "");
    const ui = document.createElement("div");
    ui.className = "rich-ui";
    const stat = document.createElement("div");
    stat.className = "ru-stat";
    stat.dataset.tone = "success";
    const value = document.createElement("div");
    value.className = "ru-stat-value";
    value.textContent = "98.7%";
    stat.append(value);
    ui.append(stat);
    root.append(ui);
    document.body.append(root);
    return getComputedStyle(value).color;
  });
  expect(color).toBe("rgb(34, 197, 94)");
});

test("mobile tables keep the last column readable and covers fill their card", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/?demo=dashboard&theme=dark");
  const tracks = await page
    .locator(".ru-grid")
    .first()
    .evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
    );
  expect(tracks).toBe(2);
  const table = page.locator(".ru-table-wrap").first();
  expect(await table.evaluate((el) => getComputedStyle(el).maskImage)).toBe(
    "none",
  );
  expect(await table.evaluate((el) => getComputedStyle(el).maxHeight)).toBe(
    "none",
  );
  expect(
    await table
      .locator("th")
      .first()
      .evaluate((el) => getComputedStyle(el).position),
  ).toBe("static");

  await page.goto("/?demo=films&theme=dark");
  const frame = page.locator(".ru-poster-frame").first();
  await expect(frame).toBeVisible();
  const ratio = await frame.evaluate((el) => {
    const image = el.querySelector("img");
    if (!image) return 0;
    return (
      image.getBoundingClientRect().width / el.getBoundingClientRect().width
    );
  });
  expect(ratio).toBeGreaterThan(0.95);
});

test("carousel arrows respect reduced motion and move one card at a time", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?demo=films&theme=dark");
  await page.evaluate(() => {
    type Scrollable = { scrollBy(options?: ScrollToOptions): void };
    const proto = Element.prototype as unknown as Scrollable;
    const original = proto.scrollBy;
    (window as unknown as { __scrollCalls: ScrollToOptions[] }).__scrollCalls =
      [];
    proto.scrollBy = function (options?: ScrollToOptions) {
      (
        window as unknown as { __scrollCalls: ScrollToOptions[] }
      ).__scrollCalls.push(options ?? {});
      original.call(this, options);
    };
  });
  await page.getByRole("button", { name: "Next cards" }).click();
  await page.waitForTimeout(120);
  const result = await page.evaluate(() => {
    const track = document.querySelector(".ru-carousel-track")!;
    const card = track.firstElementChild!.getBoundingClientRect().width;
    return {
      calls: (window as unknown as { __scrollCalls: ScrollToOptions[] })
        .__scrollCalls,
      left: track.scrollLeft,
      card,
    };
  });
  expect(result.calls.at(-1)?.behavior).toBe("auto");
  expect(result.left).toBeGreaterThan(result.card * 0.8);
  expect(result.left).toBeLessThan(result.card * 1.4);
});

test("a table that continues right shows a hint until it reaches the end", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/?demo=dashboard");
  const frame = page.locator(".ru-table-frame").first();
  const scroller = frame.locator(".ru-table-wrap");
  expect(
    await scroller.evaluate(
      (el) => el.scrollWidth > el.clientWidth && el.tabIndex === 0,
    ),
  ).toBe(true);
  await expect(frame.locator(".ru-table-more")).toHaveText("Scroll →");
  await scroller.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await expect(frame.locator(".ru-table-more")).toHaveCount(0);
});
