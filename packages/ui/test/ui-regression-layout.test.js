import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readProjectFile = (relativePath) =>
  fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("DialogBox exposes a dedicated footer slot for custom footer actions", () => {
  const dialogBoxSource = readProjectFile("../src/components/DialogBox.vue");

  assert.match(dialogBoxSource, /<slot name="footer"><\/slot>/);
});

test("Login keeps forgot-password action in the footer row, not content actions", () => {
  const loginSource = readProjectFile("../src/components/Login.vue");

  assert.match(
    loginSource,
    /<template #footer>[\s\S]*login__footer-action[\s\S]*buttonForgotPassword/,
  );
  assert.doesNotMatch(loginSource, /class="login__switch-mode"[\s\S]*buttonForgotPassword/);
});

test("Admin checkbox input style restores native checkbox control rendering", () => {
  const adminConsoleCss = readProjectFile("../src/assets/css/components/admin-console.css");

  assert.match(adminConsoleCss, /\.admin-console__checkbox-input\s*\{[\s\S]*all:\s*revert;/);
  assert.match(
    adminConsoleCss,
    /\.admin-console__checkbox-input\s*\{[\s\S]*accent-color:\s*var\(--color-primary\);/,
  );
});

test("Datasource dialog exposes MQTT broker-profile quick-create path", () => {
  const datasourceDialogSource = readProjectFile("../src/components/DatasourceDialogBox.vue");

  assert.match(
    datasourceDialogSource,
    /showBrokerProfileQuickCreate[\s\S]*typeRef\.value === "mqtt"[\s\S]*brokerProfiles\.value\.length === 0/,
  );
  assert.match(datasourceDialogSource, /datasourceDialogBox\.noBrokerProfilesHint/);
  assert.match(datasourceDialogSource, /datasourceDialogBox\.openAdminBrokerProfiles/);
});

test("Vite dev proxy enables websocket upgrades for /gateway realtime channel", () => {
  const viteConfigSource = readProjectFile("../vite.config.js");

  assert.match(
    viteConfigSource,
    /"\/gateway"[\s\S]*target:[\s\S]*changeOrigin:\s*true,[\s\S]*ws:\s*true/,
  );
});

test("Nginx gateway location forwards websocket upgrade headers", () => {
  const nginxConfigSource = readProjectFile("../nginx.conf");

  assert.match(
    nginxConfigSource,
    /location\s+\/gateway\s*\{[\s\S]*proxy_http_version\s+1\.1;[\s\S]*proxy_set_header\s+Upgrade\s+\$http_upgrade;[\s\S]*proxy_set_header\s+Connection\s+"upgrade";/,
  );
});
