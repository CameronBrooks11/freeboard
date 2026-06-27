import { expect, test } from "@playwright/test";

// Local-first (Lite) E2E — the serverless static profile. These assertions cover
// what unit tests cannot: a real browser booting the FREEBOARD_STATIC build with
// NO backend, rendering, and round-tripping a document through localStorage.

const LOCAL_DASHBOARD_KEY = "freeboard:dashboard";

// A minimal valid v1 DashboardDocument: a Static datasource (pure client-side, no
// network) feeding a text widget, so a value renders with zero server traffic.
const liteDocument = {
  schemaVersion: 1,
  title: "Lite E2E Dashboard",
  columns: 3,
  width: "md",
  settings: { theme: "auto" },
  datasources: [
    {
      id: "dslite",
      title: "LiteSource",
      type: "static",
      enabled: true,
      settings: { value: '{"value":42}', refresh: 0 },
    },
  ],
  panes: [
    {
      title: "Lite Pane",
      layout: { x: 0, y: 0, w: 1, h: 2, i: "pane-lite-1" },
      widgets: [
        {
          id: "widget-lite-text",
          title: "Lite Widget",
          type: "text",
          enabled: true,
          settings: { headerText: "Lite Value", valuePath: "datasources.dslite.value" },
        },
      ],
    },
  ],
};

/** Record every `/graphql` request the page issues, to prove the serverless boot. */
const trackGraphql = (page) => {
  const calls = [];
  page.on("request", (request) => {
    if (request.url().includes("/graphql")) {
      calls.push(request.url());
    }
  });
  return calls;
};

/** Inject a document via the embed postMessage channel, once the app has mounted. */
const injectViaPostMessage = async (page, document) => {
  // The Header (hence Freeboard.vue's onMounted message listener) is mounted by
  // the time the toggle button is visible, so the postMessage is not dropped.
  await expect(page.locator(".toggle-header-button")).toBeVisible();
  await page.evaluate((doc) => {
    window.postMessage({ type: "freeboard:load-document", document: doc }, "*");
  }, document);
};

// Ensure the edit toolbar (with Save) is shown and settled. Loading a document
// runs syncEditingPermissions, so edit mode may already be on; toggle only if
// needed, then wait for the slide-fade enter transition to finish so a click
// doesn't race the animation.
const ensureEditToolbar = async (page) => {
  const saveButton = page.getByText("Save Freeboard");
  if (!(await saveButton.isVisible())) {
    await page.locator(".toggle-header-button").click();
  }
  await expect(saveButton).toBeVisible();
  return saveButton;
};

test("boots serverless and renders a postMessage-injected document with zero /graphql", async ({
  page,
}) => {
  const graphqlCalls = trackGraphql(page);

  await page.goto("/", { waitUntil: "networkidle" });
  await injectViaPostMessage(page, liteDocument);

  // The injected Static datasource feeds the text widget — value renders, no network.
  await expect(page.getByText("Lite Value")).toBeVisible();
  await expect(page.getByText("42")).toBeVisible();

  // Server-only affordances are absent in the static profile (enter edit mode first).
  await ensureEditToolbar(page);
  await expect(page.getByText("Open Saved", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Share", { exact: true })).toHaveCount(0);

  expect(graphqlCalls, `unexpected /graphql traffic: ${graphqlCalls.join(", ")}`).toEqual([]);
});

test("local Save persists to localStorage and survives reload with zero /graphql", async ({
  page,
}) => {
  const graphqlCalls = trackGraphql(page);

  await page.goto("/", { waitUntil: "networkidle" });
  await injectViaPostMessage(page, liteDocument);
  await expect(page.getByText("Lite Value")).toBeVisible();

  // Save writes the portable document to the single localStorage key.
  const saveButton = await ensureEditToolbar(page);
  await saveButton.click();

  const stored = await page.evaluate((key) => localStorage.getItem(key), LOCAL_DASHBOARD_KEY);
  expect(stored, "expected the dashboard saved to localStorage").toBeTruthy();
  expect(JSON.parse(stored).title).toBe("Lite E2E Dashboard");

  // Reload with no re-injection: the static profile hydrates from localStorage.
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("Lite Value")).toBeVisible();
  await expect(page.getByText("42")).toBeVisible();

  expect(graphqlCalls, `unexpected /graphql traffic: ${graphqlCalls.join(", ")}`).toEqual([]);
});
