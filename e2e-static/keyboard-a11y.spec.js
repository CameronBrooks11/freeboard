import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Keyboard operability, the <main> landmark, and reduced-motion. Renders a
// dashboard WITH a pane/widget so the pane and widget edit toolbars (whose
// clickable items are made keyboard-operable by v-a11y-button) are exercised.

const doc = {
  schemaVersion: 1,
  title: "Keyboard A11y",
  columns: 3,
  width: "md",
  settings: { theme: "auto" },
  datasources: [
    {
      id: "kbds",
      title: "Src",
      type: "static",
      enabled: true,
      settings: { value: '{"value":7}', refresh: 0 },
    },
  ],
  panes: [
    {
      title: "Pane",
      layout: { x: 0, y: 0, w: 1, h: 2, i: "kb-pane" },
      widgets: [
        {
          id: "kbw",
          title: "Widget",
          type: "text",
          enabled: true,
          settings: { headerText: "KbHeader", valuePath: "datasources.kbds.value" },
        },
      ],
    },
  ],
};

const renderEditing = async (page) => {
  await expect(page.locator(".freeboard")).toBeVisible();
  await expect(async () => {
    await page.evaluate(
      (d) => window.postMessage({ type: "freeboard:load-document", document: d }, "*"),
      doc,
    );
    await expect(page.getByText("KbHeader")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
  // Loading a document enters edit mode in the static profile; the Save toolbar
  // (and the pane/widget edit toolbars) are then present.
  await expect(page.getByText("Save Freeboard")).toBeVisible();
};

test("a rendered, editing board (pane + widget toolbars) has no serious/critical WCAG violations", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await renderEditing(page);

  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = blocking
    .map((v) => `[${v.impact}] ${v.id} (${v.nodes.length}) — ${v.help}`)
    .join("\n");
  expect(blocking, report).toEqual([]);
});

test("toolbar buttons are keyboard-operable (focus + Enter activates)", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await renderEditing(page);

  // The Datasources control is a v-a11y-button: focusable and Enter-activatable.
  const datasources = page.locator(".dashboard-control__board-toolbar__item", {
    hasText: "Datasources",
  });
  await expect(datasources).toHaveAttribute("role", "button");
  await expect(datasources).toHaveAttribute("tabindex", "0");

  await datasources.focus();
  await expect(datasources).toBeFocused();
  await page.keyboard.press("Enter");

  // Enter synthesized a click, opening the dialog — no pointer used.
  await expect(page.locator(".dialog-box__modal")).toBeVisible();
});

test("icon-only controls have accessible names", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await renderEditing(page);

  // The edit toggle and the pane "add widget" control are icon-only; aria-label
  // gives them an accessible name (via getByRole name matching).
  await expect(page.locator(".toggle-header-button")).toHaveAttribute("aria-label", /.+/);
  await expect(page.getByRole("button", { name: "Add widget" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Delete widget" })).toHaveCount(1);
});

test("exposes a main landmark", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await renderEditing(page);
  await expect(page.getByRole("main")).toHaveCount(1);
});

test("respects prefers-reduced-motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  await renderEditing(page);

  await page.locator(".dashboard-control__board-toolbar__item", { hasText: "Datasources" }).click();
  await expect(page.locator(".dialog-box__modal")).toBeVisible();

  // The .action-button has an unconditional `transition: all 250ms`; under
  // reduced-motion the global rule collapses it to near-zero.
  const durationMs = await page.evaluate(() => {
    const el = document.querySelector(".action-button");
    if (!el) return null;
    return parseFloat(getComputedStyle(el).transitionDuration) * 1000;
  });
  expect(durationMs, "expected an .action-button in the dialog").not.toBeNull();
  expect(durationMs).toBeLessThan(50);
});
