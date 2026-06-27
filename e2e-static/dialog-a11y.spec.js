import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Accessibility of the modal dialog pattern. Every dialog in the app routes
// through the single DialogBox.vue, so the Datasources dialog (reachable in the
// static profile) exercises the shared focus-management + ARIA semantics.

const doc = {
  schemaVersion: 1,
  title: "Dialog A11y",
  columns: 3,
  width: "md",
  settings: { theme: "auto" },
  datasources: [
    {
      id: "dlgds",
      title: "DialogSource",
      type: "static",
      enabled: true,
      settings: { value: '{"value":1}', refresh: 0 },
    },
  ],
  panes: [
    {
      title: "Pane",
      layout: { x: 0, y: 0, w: 1, h: 2, i: "dlg-pane" },
      widgets: [
        {
          id: "dlgw",
          title: "W",
          type: "text",
          enabled: true,
          settings: { headerText: "DialogWidgetHeader", valuePath: "datasources.dlgds.value" },
        },
      ],
    },
  ],
};

const openDatasourcesDialog = async (page) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator(".toggle-header-button")).toBeVisible();
  await page.evaluate(
    (d) => window.postMessage({ type: "freeboard:load-document", document: d }, "*"),
    doc,
  );
  await expect(page.getByText("DialogWidgetHeader")).toBeVisible();

  const save = page.getByText("Save Freeboard");
  if (!(await save.isVisible())) {
    await page.locator(".toggle-header-button").click();
  }
  await expect(save).toBeVisible();

  await page.locator(".dashboard-control__board-toolbar__item", { hasText: "Datasources" }).click();
  const modal = page.locator(".dialog-box__modal");
  await expect(modal).toBeVisible();
  // Let the fade-in transition settle before asserting.
  await page.waitForFunction(() => {
    const el = document.querySelector(".dialog-box");
    return el && getComputedStyle(el).opacity === "1";
  });
  return modal;
};

test("dialog exposes modal semantics and moves focus inside on open", async ({ page }) => {
  const modal = await openDatasourcesDialog(page);

  await expect(modal).toHaveAttribute("role", "dialog");
  await expect(modal).toHaveAttribute("aria-modal", "true");
  const labelledby = await modal.getAttribute("aria-labelledby");
  expect(labelledby).toBeTruthy();
  // aria-labelledby points at the dialog's title element (attribute selector is
  // robust to whatever id format useId() produces).
  await expect(page.locator(`[id="${labelledby}"]`)).toBeVisible();

  const focusInside = await page.evaluate(() => {
    const m = document.querySelector(".dialog-box__modal");
    return m ? m.contains(document.activeElement) : null;
  });
  expect(focusInside).toBe(true);
});

test("Tab is trapped within the dialog", async ({ page }) => {
  await openDatasourcesDialog(page);

  // Tab through the dialog many times; focus must never leave the modal.
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const m = document.querySelector(".dialog-box__modal");
      return m ? m.contains(document.activeElement) : null;
    });
    expect(inside, `focus left the modal after ${i + 1} Tab(s)`).toBe(true);
  }

  // Shift+Tab as well.
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Shift+Tab");
    const inside = await page.evaluate(() => {
      const m = document.querySelector(".dialog-box__modal");
      return m ? m.contains(document.activeElement) : null;
    });
    expect(inside, `focus left the modal after ${i + 1} Shift+Tab(s)`).toBe(true);
  }
});

test("focus is recaptured into the dialog if it escapes (e.g. backdrop blur)", async ({ page }) => {
  await openDatasourcesDialog(page);

  // Simulate focus escaping to <body> (clicking the dimmed backdrop blurs the
  // focused control). A trap bound to the overlay would never see the next Tab.
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  });
  const escaped = await page.evaluate(() => {
    const m = document.querySelector(".dialog-box__modal");
    return m ? m.contains(document.activeElement) : null;
  });
  expect(escaped, "precondition: focus should be outside the modal after blur").toBe(false);

  await page.keyboard.press("Tab");
  const recaptured = await page.evaluate(() => {
    const m = document.querySelector(".dialog-box__modal");
    return m ? m.contains(document.activeElement) : null;
  });
  expect(recaptured, "Tab should pull focus back into the modal").toBe(true);
});

test("Escape closes the dialog", async ({ page }) => {
  const modal = await openDatasourcesDialog(page);
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
});

test("an open dialog has no serious/critical WCAG violations", async ({ page }) => {
  // openDatasourcesDialog already waits for the fade-in transition to settle, so
  // axe sees final colors (not mid-animation composites).
  await openDatasourcesDialog(page);

  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = blocking
    .map((v) => `[${v.impact}] ${v.id} (${v.nodes.length}) — ${v.help}`)
    .join("\n");
  expect(blocking, report).toEqual([]);
});

test("datasource edit dialog (tabs) is axe-clean with keyboard-operable tabs", async ({ page }) => {
  await openDatasourcesDialog(page);

  // Click the datasource title to open the edit dialog, which renders the
  // TabNavigator (its tabs are made keyboard-operable by v-a11y-button).
  await page.getByText("DialogSource").click();
  await expect(page.locator(".tab-navigator")).toBeVisible();
  await page.waitForFunction(() => {
    const els = document.querySelectorAll(".dialog-box");
    const last = els[els.length - 1];
    return last && getComputedStyle(last).opacity === "1";
  });

  const tab = page.locator(".tab-navigator__menu__board-toolbar__item").first();
  await expect(tab).toHaveAttribute("role", "button");
  await expect(tab).toHaveAttribute("tabindex", "0");

  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = blocking
    .map((v) => `[${v.impact}] ${v.id} (${v.nodes.length}) — ${v.help}`)
    .join("\n");
  expect(blocking, report).toEqual([]);
});
