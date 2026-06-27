import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Accessibility (WCAG 2.1 AA) automated gate over the Lite static profile, which
// renders the real app with no backend. axe-core catches DOM-level issues the
// static theme-contrast guard cannot (labels, roles, alt text, landmarks). We
// gate on serious/critical impact — the AA-meaningful failures — and surface the
// full violation list in the failure message for triage.

const liteDocument = {
  schemaVersion: 1,
  title: "A11y E2E Dashboard",
  columns: 3,
  width: "md",
  settings: { theme: "auto" },
  datasources: [
    {
      id: "dsa11y",
      title: "A11ySource",
      type: "static",
      enabled: true,
      settings: { value: '{"value":42}', refresh: 0 },
    },
  ],
  panes: [
    {
      title: "A11y Pane",
      layout: { x: 0, y: 0, w: 1, h: 2, i: "pane-a11y-1" },
      widgets: [
        {
          id: "widget-a11y-text",
          title: "A11y Widget",
          type: "text",
          enabled: true,
          settings: { headerText: "A11y Value", valuePath: "datasources.dsa11y.value" },
        },
      ],
    },
  ],
};

const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

/** Scan the current page against the WCAG 2.0/2.1 A + AA rule sets. */
const scanForBlockingViolations = async (page) => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = violations.filter((v) => BLOCKING_IMPACTS.has(v.impact));
  const report = blocking
    .map((v) => `[${v.impact}] ${v.id} (${v.nodes.length}) — ${v.help}`)
    .join("\n");
  return { blocking, report };
};

test("a11y: empty editable board has no serious/critical WCAG violations", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator(".toggle-header-button")).toBeVisible();
  const { blocking, report } = await scanForBlockingViolations(page);
  expect(blocking, report).toEqual([]);
});

test("a11y: a rendered dashboard has no serious/critical WCAG violations", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator(".toggle-header-button")).toBeVisible();
  await page.evaluate((doc) => {
    window.postMessage({ type: "freeboard:load-document", document: doc }, "*");
  }, liteDocument);
  await expect(page.getByText("A11y Value")).toBeVisible();
  const { blocking, report } = await scanForBlockingViolations(page);
  expect(blocking, report).toEqual([]);
});

test("a11y: edit mode (toolbars open) has no serious/critical WCAG violations", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator(".toggle-header-button").click();
  await expect(page.getByText("Save Freeboard")).toBeVisible();
  const { blocking, report } = await scanForBlockingViolations(page);
  expect(blocking, report).toEqual([]);
});
