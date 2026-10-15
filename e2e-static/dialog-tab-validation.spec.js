import { expect, test } from "@playwright/test";

// A tabbed dialog keeps every tab mounted and hides the inactive ones, so a
// field error on a hidden tab used to block OK with nothing visible. A blocked
// OK must bring the first tab that holds an error into view.

const doc = {
  schemaVersion: 1,
  title: "Tab Validation",
  columns: 3,
  width: "md",
  settings: { theme: "auto" },
  datasources: [
    {
      id: "tabds",
      title: "TabSource",
      type: "static",
      enabled: true,
      settings: { value: '{"value":1}', refresh: 0 },
    },
  ],
  panes: [
    {
      title: "Pane",
      layout: { x: 0, y: 0, w: 1, h: 2, i: "tab-pane" },
      widgets: [
        {
          id: "tabw",
          title: "W",
          type: "text",
          enabled: true,
          settings: { headerText: "TabWidgetHeader", valuePath: "datasources.tabds.value" },
        },
      ],
    },
  ],
};

const openEditor = async (page) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator(".toggle-header-button")).toBeVisible();
  await page.evaluate(
    (d) => window.postMessage({ type: "freeboard:load-document", document: d }, "*"),
    doc,
  );
  await expect(page.getByText("TabWidgetHeader")).toBeVisible();

  const save = page.getByText("Save Freeboard");
  if (!(await save.isVisible())) {
    await page.locator(".toggle-header-button").click();
  }
  await expect(save).toBeVisible();
};

const tabbedDialog = (page) =>
  page.locator(".dialog-box__modal", { has: page.locator(".tab-navigator") });
const tabItems = (modal) => modal.locator(".tab-navigator__menu__board-toolbar__item");
const tabPanels = (modal) => modal.locator(".tab-navigator__tabs > div");

const openDatasourceEditor = async (page) => {
  await openEditor(page);
  await page.locator(".dashboard-control__board-toolbar__item", { hasText: "Datasources" }).click();
  await page.getByText("TabSource").click();
  const modal = tabbedDialog(page);
  await expect(modal).toBeVisible();
  return modal;
};

const expectBlockedOnTab = async (modal, index) => {
  await expect(modal).toBeVisible();
  await expect(tabItems(modal).nth(index)).toHaveAttribute("aria-pressed", "true");
  await expect(tabPanels(modal).nth(index)).toBeVisible();
  await expect(
    tabPanels(modal).nth(index).locator(".form__row__value__error").first(),
  ).toBeVisible();
};

test("datasource OK from another tab shows the tab holding the error", async ({ page }) => {
  const modal = await openDatasourceEditor(page);

  await tabPanels(modal).nth(0).locator("input.input-form-element").first().fill("");
  await tabItems(modal).nth(1).click();
  await expect(tabPanels(modal).nth(0)).toBeHidden();

  await modal.getByRole("button", { name: "Ok" }).click();

  await expectBlockedOnTab(modal, 0);
  await expect(tabItems(modal).nth(1)).toHaveAttribute("aria-pressed", "false");
});

test("datasource OK with the error on the showing tab stays on that tab", async ({ page }) => {
  const modal = await openDatasourceEditor(page);

  await tabPanels(modal).nth(0).locator("input.input-form-element").first().fill("");
  await modal.getByRole("button", { name: "Ok" }).click();

  await expectBlockedOnTab(modal, 0);
});

test("widget OK from another tab shows the tab holding the error", async ({ page }) => {
  await openEditor(page);
  await page.locator('[aria-label="Edit widget"]').click();
  const modal = tabbedDialog(page);
  await expect(modal).toBeVisible();

  const bindingsIndex = await tabItems(modal).evaluateAll((items) =>
    items.findIndex((item) => item.getAttribute("aria-label") === "bindings"),
  );
  expect(bindingsIndex).toBeGreaterThan(0);
  await tabItems(modal).nth(bindingsIndex).click();
  await tabPanels(modal).nth(bindingsIndex).locator("input.input-form-element").first().fill("");
  await tabItems(modal).nth(0).click();
  await expect(tabPanels(modal).nth(bindingsIndex)).toBeHidden();

  await modal.getByRole("button", { name: "Ok" }).click();

  await expectBlockedOnTab(modal, bindingsIndex);
});

test("settings Apply from another tab shows the tab holding the error", async ({ page }) => {
  await openEditor(page);
  await page.locator(".dashboard-control__board-toolbar__item", { hasText: "Settings" }).click();
  const modal = tabbedDialog(page);
  await expect(modal).toBeVisible();

  await tabPanels(modal).nth(0).locator("input.input-form-element").first().fill("");
  await tabItems(modal).nth(1).click();
  await expect(tabPanels(modal).nth(0)).toBeHidden();

  await modal.getByRole("button", { name: "Apply" }).click();

  await expectBlockedOnTab(modal, 0);
});
