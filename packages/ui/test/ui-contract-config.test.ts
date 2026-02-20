import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readProjectFile = (relativePath: string) =>
  fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("Vite dev proxy contract keeps websocket upgrades enabled for /gateway", () => {
  const viteConfigSource = readProjectFile("../vite.config.mjs");
  assert.equal(viteConfigSource.includes('"/gateway"'), true);
  assert.equal(viteConfigSource.includes("ws: true"), true);
});

test("Nginx gateway contract forwards websocket upgrade headers", () => {
  const nginxConfigSource = readProjectFile("../nginx.conf");
  assert.equal(nginxConfigSource.includes("location /gateway"), true);
  assert.equal(nginxConfigSource.includes("proxy_http_version 1.1;"), true);
  assert.equal(nginxConfigSource.includes("proxy_set_header Upgrade $http_upgrade;"), true);
  assert.equal(nginxConfigSource.includes('proxy_set_header Connection "upgrade";'), true);
});

test("UI entrypoint contract keeps viewport-fit meta for mobile safe areas", () => {
  const indexHtmlSource = readProjectFile("../index.html");
  assert.equal(
    indexHtmlSource.includes(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />',
    ),
    true,
  );
});

test("admin console checkbox contract keeps native checkbox rendering override", () => {
  const adminConsoleCss = readProjectFile("../src/assets/css/components/admin-console.css");
  assert.equal(adminConsoleCss.includes(".admin-console__checkbox-input"), true);
  assert.equal(adminConsoleCss.includes("all: revert;"), true);
  assert.equal(adminConsoleCss.includes("accent-color: var(--color-primary);"), true);
});
