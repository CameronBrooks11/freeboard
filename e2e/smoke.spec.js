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

const graphqlRaw = async ({ request, token, query, variables = {}, headers = {} }) => {
  const response = await request.post("/graphql", {
    headers: {
      ...(token
        ? {
            authorization: `Bearer ${token}`,
          }
        : {}),
      ...headers,
    },
    data: {
      query,
      variables,
    },
  });

  expect(response.ok()).toBeTruthy();
  return response.json();
};

const loginViaUi = async (page) => {
  await page.goto("/login");
  await expect(page.locator(".login__dialog-box .login__footer-action")).toBeVisible();
  await expect(page.locator(".login__actions .login__footer-action")).toHaveCount(0);
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

test("small-layout dashboard renders stacked pane flow in authenticated and shared views", async ({
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
    title: "E2E Small Layout Dashboard",
    version: "1",
    columns: 3,
    width: "sm",
    settings: { theme: "auto" },
    datasources: [
      {
        id: "dse2esmall",
        title: "SmallSource",
        type: "static",
        enabled: true,
        settings: {
          value: '{"value":7}',
          refresh: 0,
        },
      },
    ],
    panes: [
      {
        title: "Small Pane A",
        layout: {
          x: 0,
          y: 0,
          w: 1,
          h: 2,
          i: "pane-small-a",
        },
        widgets: [
          {
            id: "widget-small-a",
            title: "Small Widget A",
            type: "text",
            enabled: true,
            settings: {
              headerText: "Small A",
              valuePath: "datasources.dse2esmall.value",
            },
          },
        ],
      },
      {
        title: "Small Pane B",
        layout: {
          x: 0,
          y: 2,
          w: 1,
          h: 2,
          i: "pane-small-b",
        },
        widgets: [
          {
            id: "widget-small-b",
            title: "Small Widget B",
            type: "text",
            enabled: true,
            settings: {
              headerText: "Small B",
              valuePath: "datasources.dse2esmall.value",
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
  await expect(page.locator(".board__stack")).toBeVisible();
  await expect(page.locator(".board__grid")).toHaveCount(0);
  await expect(page.locator(".board__stack-item")).toHaveCount(2);
  await expect(page.locator(".board__stack-item .pane__header h1")).toHaveText([
    "Small Pane A",
    "Small Pane B",
  ]);

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
  await expect(sharedPage.locator(".board__stack")).toBeVisible();
  await expect(sharedPage.locator(".board__grid")).toHaveCount(0);
  await expect(sharedPage.locator(".board__stack-item")).toHaveCount(2);
  await expect(sharedPage.getByText("Small A")).toBeVisible();
  await expect(sharedPage.getByText("Small B")).toBeVisible();
  await sharedContext.close();
});

test("login throttle is spoof-resistant through proxy path when X-Forwarded-For is manipulated", async ({
  request,
}) => {
  const authMutation = `
    mutation AuthUser($email: String!, $password: String!) {
      authUser(email: $email, password: $password) {
        token
      }
    }
  `;

  const trustedProxyIdentity = "203.0.113.77";
  let rateLimited = false;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const spoofedClient = `198.51.100.${20 + attempt}`;
    const body = await graphqlRaw({
      request,
      query: authMutation,
      variables: {
        email: ADMIN_EMAIL,
        password: "wrong-password",
      },
      headers: {
        "x-forwarded-for": `${spoofedClient}, ${trustedProxyIdentity}`,
      },
    });

    const message = String(body?.errors?.[0]?.message || "");
    if (/Too many login attempts/i.test(message)) {
      rateLimited = true;
      break;
    }

    expect(message).toMatch(/Invalid credentials/i);
  }

  expect(rateLimited).toBeTruthy();

  const bypassAttempt = await graphqlRaw({
    request,
    query: authMutation,
    variables: {
      email: ADMIN_EMAIL,
      password: "wrong-password",
    },
    headers: {
      "x-forwarded-for": `198.51.100.250, ${trustedProxyIdentity}`,
    },
  });

  const bypassMessage = String(bypassAttempt?.errors?.[0]?.message || "");
  expect(bypassMessage).toMatch(/Too many login attempts/i);
});
