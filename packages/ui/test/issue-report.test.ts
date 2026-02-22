import assert from "node:assert/strict";
import test from "node:test";

import {
  BUG_REPORT_ISSUE_TEMPLATE,
  buildBugReportContextBlock,
  buildBugReportEnvironmentText,
  buildBugReportIssueUrl,
  collectBugReportContext,
} from "../src/ui/issueReport.js";

const installDomStubs = ({
  pathname = "/",
  search = "",
  themeSelection = "auto",
  themeResolved = "light",
  width = 1280,
  userAgent = "test-browser/1.0",
  platform = "test-os",
  language = "en-US",
}: {
  pathname?: string;
  search?: string;
  themeSelection?: string;
  themeResolved?: string;
  width?: number;
  userAgent?: string;
  platform?: string;
  language?: string;
} = {}) => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousNavigator = globalThis.navigator;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      location: {
        pathname,
        search,
      },
      innerWidth: width,
    },
  });

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: {
      documentElement: {
        getAttribute(name: string) {
          if (name === "data-theme-selection") {
            return themeSelection;
          }
          if (name === "data-theme") {
            return themeResolved;
          }
          return null;
        },
      },
    },
  });

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: {
      userAgent,
      platform,
      language,
    },
  });

  return () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: previousWindow,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: previousDocument,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: previousNavigator,
    });
  };
};

test("collectBugReportContext captures safe, non-sensitive route context", () => {
  const restore = installDomStubs({
    pathname: "/s/secret-share-token-value",
    search: "?invite=abc123&reset=xyz987",
    themeSelection: "paper",
    themeResolved: "paper",
    width: 620,
  });

  try {
    const context = collectBugReportContext();
    assert.equal(context.route, "/s/:shareToken");
    assert.equal(context.queryKeys, "invite,reset");
    assert.equal(context.themeSelection, "paper");
    assert.equal(context.themeResolved, "paper");
    assert.equal(context.viewport.startsWith("sm"), true);
  } finally {
    restore();
  }
});

test("collectBugReportContext redacts dynamic route tokens and identifiers", () => {
  const inviteRestore = installDomStubs({
    pathname: "/invite/secret-invite-token",
  });
  try {
    const context = collectBugReportContext();
    assert.equal(context.route, "/invite/:token");
  } finally {
    inviteRestore();
  }

  const resetRestore = installDomStubs({
    pathname: "/reset-password/secret-reset-token",
  });
  try {
    const context = collectBugReportContext();
    assert.equal(context.route, "/reset-password/:token");
  } finally {
    resetRestore();
  }

  const publicRestore = installDomStubs({
    pathname: "/p/public-dashboard-id",
  });
  try {
    const context = collectBugReportContext();
    assert.equal(context.route, "/p/:id");
  } finally {
    publicRestore();
  }

  const dashboardRestore = installDomStubs({
    pathname: "/abc123",
  });
  try {
    const context = collectBugReportContext();
    assert.equal(context.route, "/:dashboardId");
  } finally {
    dashboardRestore();
  }
});

test("buildBugReportIssueUrl maps expected issue-form prefill fields", () => {
  const url = buildBugReportIssueUrl({
    newIssueUrl: "https://example.test/issues/new",
    context: {
      version: "2.0.0",
      runtimeMode: "server",
      route: "/admin",
      queryKeys: "none",
      themeSelection: "auto",
      themeResolved: "light",
      viewport: "lg (1440px)",
      browser: "Browser/1.0",
      platform: "OS",
      locale: "en-US",
    },
  });

  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/issues/new");
  assert.equal(parsed.searchParams.get("template"), BUG_REPORT_ISSUE_TEMPLATE);
  assert.equal(parsed.searchParams.get("version"), "2.0.0");
  assert.match(String(parsed.searchParams.get("environment")), /Runtime mode: server/);
  assert.match(String(parsed.searchParams.get("context")), /version=2.0.0/);
});

test("context and environment builders are stable and readable", () => {
  const context = {
    version: "2.0.0",
    runtimeMode: "static" as const,
    route: "/login",
    queryKeys: "none",
    themeSelection: "auto",
    themeResolved: "dark",
    viewport: "md (900px)",
    browser: "Browser/1.0",
    platform: "OS",
    locale: "en-US",
  };

  const environmentText = buildBugReportEnvironmentText(context);
  const contextBlock = buildBugReportContextBlock(context);

  assert.match(environmentText, /Route: \/login/);
  assert.match(environmentText, /Theme resolved: dark/);
  assert.match(contextBlock, /```text/);
  assert.match(contextBlock, /route=\/login/);
  assert.match(contextBlock, /theme_resolved=dark/);
});
