import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@example.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "LocalDevAdmin123!";
const E2E_BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:5173";

const graphql = async ({ request, token, query, variables = {} }) => {
  const response = await request.post("/graphql", {
    headers: token
      ? {
          authorization: `Bearer ${token}`,
        }
      : undefined,
    data: {
      query,
      variables,
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.errors || [], JSON.stringify(body.errors || [])).toEqual([]);
  return body.data;
};

const loginViaUi = async (page) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
};

const readSessionToken = async (page) =>
  page.evaluate(() => {
    const raw = window.sessionStorage.getItem("freeboard");
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw).token || null;
    } catch {
      return null;
    }
  });

test("smoke flow covers login, datasource render, share view, and policy save", async ({
  page,
  browser,
}) => {
  await loginViaUi(page);
  const authToken = await readSessionToken(page);
  expect(authToken).toBeTruthy();

  const createMutation = `
    mutation CreateDashboard($dashboard: CreateDashboardInput!) {
      createDashboard(dashboard: $dashboard) {
        _id
      }
    }
  `;

  const dashboardPayload = {
    title: "E2E Smoke Dashboard",
    version: "1",
    columns: 3,
    width: "md",
    settings: { theme: "auto" },
    datasources: [
      {
        id: "dse2e",
        title: "SmokeSource",
        type: "static",
        enabled: true,
        settings: {
          value: '{"value":42}',
          refresh: 0,
        },
      },
    ],
    panes: [
      {
        title: "Smoke Pane",
        layout: {
          x: 0,
          y: 0,
          w: 1,
          h: 2,
          i: "pane-e2e-1",
        },
        widgets: [
          {
            id: "widget-e2e-text",
            title: "Smoke Widget",
            type: "text",
            enabled: true,
            settings: {
              headerText: "Smoke Value",
              valuePath: "datasources.dse2e.value",
            },
          },
        ],
      },
    ],
  };

  const created = await graphql({
    request: page.request,
    token: authToken,
    query: createMutation,
    variables: {
      dashboard: dashboardPayload,
    },
  });

  const dashboardId = created?.createDashboard?._id;
  expect(dashboardId).toBeTruthy();

  await page.goto(`/${dashboardId}`);
  await expect(page.getByText("Smoke Value")).toBeVisible();
  await expect(page.getByText("42")).toBeVisible();

  await page.locator(".dashboard-control__board-toolbar__item", { hasText: "Datasources" }).click();
  await expect(page.getByText("SmokeSource")).toBeVisible();
  await expect(page.getByText("connected")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  const visibilityMutation = `
    mutation SetVisibility($id: ID!, $visibility: DashboardVisibility!) {
      setDashboardVisibility(_id: $id, visibility: $visibility) {
        visibility
        shareToken
      }
    }
  `;

  const visibilityResult = await graphql({
    request: page.request,
    token: authToken,
    query: visibilityMutation,
    variables: {
      id: dashboardId,
      visibility: "LINK",
    },
  });
  const shareToken = visibilityResult?.setDashboardVisibility?.shareToken;
  expect(shareToken).toBeTruthy();

  const sharedContext = await browser.newContext({
    baseURL: E2E_BASE_URL,
  });
  const sharedPage = await sharedContext.newPage();
  await sharedPage.goto(`/s/${shareToken}`);
  await expect(sharedPage).toHaveURL(new RegExp(`/s/${shareToken}$`));
  await expect(sharedPage.getByText("Smoke Value")).toBeVisible();
  await expect(sharedPage.getByText("42")).toBeVisible();
  await sharedContext.close();

  await page.goto("/admin");
  await page.getByRole("button", { name: "Save Policy" }).click();
  await expect(page.getByText("Policy updated.")).toBeVisible();
});
