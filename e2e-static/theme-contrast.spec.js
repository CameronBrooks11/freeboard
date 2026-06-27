import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Per-theme WCAG AA color-contrast regression. Each theme is exercised on the
// board AND an open dialog (where the most text-on-surface token pairs render),
// so a token regression in any theme fails CI. Complements the static
// check:ui:theme-contrast guard (which checks token pairs without rendering).

const THEMES = ["light", "paper", "dark", "slate", "high-contrast", "colorblind", "amber-night"];

const docFor = (theme) => ({
  schemaVersion: 1,
  title: "Theme Contrast",
  columns: 3,
  width: "md",
  settings: { theme },
  datasources: [
    {
      id: "tcds",
      title: "Src",
      type: "static",
      enabled: true,
      settings: { value: '{"value":1}', refresh: 0 },
    },
  ],
  panes: [
    {
      title: "P",
      layout: { x: 0, y: 0, w: 1, h: 2, i: "tc-pane" },
      widgets: [
        {
          id: "tcw",
          title: "W",
          type: "text",
          enabled: true,
          settings: { headerText: "ThemeHeader", valuePath: "datasources.tcds.value" },
        },
      ],
    },
  ],
});

const inject = async (page, doc) => {
  await expect(page.locator(".freeboard")).toBeVisible();
  await expect(async () => {
    await page.evaluate(
      (d) => window.postMessage({ type: "freeboard:load-document", document: d }, "*"),
      doc,
    );
    await expect(page.getByText("ThemeHeader")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
};

const contrastViolations = async (page) => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return violations
    .filter((v) => v.id === "color-contrast")
    .flatMap((v) => v.nodes.map((n) => `${JSON.stringify(n.target)} ${n.any?.[0]?.message ?? ""}`));
};

for (const theme of THEMES) {
  test(`theme "${theme}" meets AA color-contrast on board and dialog`, async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await inject(page, docFor(theme));

    const board = await contrastViolations(page);
    expect(board, `board contrast failures (${theme}):\n${board.join("\n")}`).toEqual([]);

    // Open the Datasources dialog (most text-on-surface tokens) and let the
    // fade-in transition settle so axe does not composite mid-animation colors.
    const save = page.getByText("Save Freeboard");
    if (!(await save.isVisible())) {
      await page.locator(".toggle-header-button").click();
    }
    await expect(save).toBeVisible();
    await page
      .locator(".dashboard-control__board-toolbar__item", { hasText: "Datasources" })
      .click();
    await expect(page.locator(".dialog-box__modal")).toBeVisible();
    await page.waitForFunction(() => {
      const el = document.querySelector(".dialog-box");
      return el && getComputedStyle(el).opacity === "1";
    });

    const dialog = await contrastViolations(page);
    expect(dialog, `dialog contrast failures (${theme}):\n${dialog.join("\n")}`).toEqual([]);
  });
}
