import { expect, test } from "@playwright/test";

// Immutable-display (Lite read-only) sub-profile: `?readonly` makes the static
// build render an injected document with NO edit surface, enforced — the edit
// Header, edit toggle, and Save are not rendered at all, and the grid is not
// draggable. The editable Lite profile (no ?readonly) is unaffected.

const doc = {
  schemaVersion: 1,
  title: "Readonly E2E",
  columns: 3,
  width: "md",
  settings: { theme: "auto" },
  datasources: [
    {
      id: "rods",
      title: "ReadonlySource",
      type: "static",
      enabled: true,
      settings: { value: '{"value":42}', refresh: 0 },
    },
  ],
  panes: [
    {
      title: "Pane",
      layout: { x: 0, y: 0, w: 1, h: 2, i: "ro-pane" },
      widgets: [
        {
          id: "row",
          title: "W",
          type: "text",
          enabled: true,
          settings: { headerText: "ReadonlyValue", valuePath: "datasources.rods.value" },
        },
      ],
    },
  ],
};

// Post the embed document, retrying until it renders. postMessage is not queued,
// so this absorbs any race with the mount-time listener registration (there is
// no edit toggle to wait on in read-only mode).
const injectUntilRendered = async (page, settleText) => {
  await expect(page.locator(".freeboard")).toBeVisible();
  await expect(async () => {
    await page.evaluate(
      (d) => window.postMessage({ type: "freeboard:load-document", document: d }, "*"),
      doc,
    );
    await expect(page.getByText(settleText)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
};

test("read-only renders an injected document with no edit surface", async ({ page }) => {
  await page.goto("/?readonly=1", { waitUntil: "networkidle" });
  await injectUntilRendered(page, "ReadonlyValue");

  // The board is live (datasource runs), so the value renders...
  await expect(page.getByText("42")).toBeVisible();

  // ...but the entire edit surface is absent (not hidden): no edit header, no
  // edit toggle, no Save.
  await expect(page.locator("header.header")).toHaveCount(0);
  await expect(page.locator(".toggle-header-button")).toHaveCount(0);
  await expect(page.getByText("Save Freeboard")).toHaveCount(0);

  // The grid is rendered but not interactive: read-only grid items lack the
  // `vue-resizable` class that editable (draggable/resizable) items carry.
  await expect(page.locator(".vue-grid-item")).not.toHaveCount(0);
  await expect(page.locator(".vue-grid-item.vue-resizable")).toHaveCount(0);
});

test("read-only renders a localStorage-seeded document with no edit surface", async ({ page }) => {
  // Seed the dashboard before load (the same-origin / kiosk seeding path), then
  // open the read-only URL: loadLocalDashboard hydrates it on mount.
  await page.addInitScript((d) => {
    window.localStorage.setItem("freeboard:dashboard", JSON.stringify(d));
  }, doc);
  await page.goto("/?readonly=1", { waitUntil: "networkidle" });

  await expect(page.getByText("ReadonlyValue")).toBeVisible();
  await expect(page.getByText("42")).toBeVisible();
  await expect(page.locator("header.header")).toHaveCount(0);
  await expect(page.locator(".toggle-header-button")).toHaveCount(0);
  await expect(page.locator(".vue-grid-item.vue-resizable")).toHaveCount(0);
});

test("editable Lite is unaffected without ?readonly", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await injectUntilRendered(page, "ReadonlyValue");
  // The edit toggle is present in the editable static profile...
  await expect(page.locator(".toggle-header-button")).toBeVisible();
  // ...and grid items are draggable/resizable (positive control: this is exactly
  // the class the read-only test asserts is absent).
  await expect(page.locator(".vue-grid-item.vue-resizable")).not.toHaveCount(0);
});
