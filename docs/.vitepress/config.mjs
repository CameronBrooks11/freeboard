import { defineConfig } from "vitepress";

const base = process.env.SITE_BASE || "/";
const generatedDocsPathPrefixes = ["dev/", "auto/", "_templates/"];

const isGeneratedDocsPage = (relativePath = "") =>
  generatedDocsPathPrefixes.some((prefix) => relativePath.startsWith(prefix));

export default defineConfig({
  title: "Freeboard",
  description: "Demo + Docs",
  base,
  lastUpdated: true,
  cleanUrls: true,
  ignoreDeadLinks: [
    /^\/demo\//, // copied post-build
    /^\/dev\/graphql\/schema\.graphql$/, // served from /public
  ],
  transformPageData(pageData) {
    if (!isGeneratedDocsPage(pageData.relativePath)) {
      return;
    }
    return {
      frontmatter: {
        ...pageData.frontmatter,
        editLink: false,
      },
    };
  },
  themeConfig: {
    editLink: {
      pattern: "https://github.com/CameronBrooks11/freeboard/edit/main/docs/:path",
      text: "Suggest a change to this page",
    },
    lastUpdated: {
      text: "Last updated",
    },
    search: {
      provider: "local",
      options: {
        detailedView: "auto",
      },
    },
    nav: [
      { text: "Home", link: "/" },
      { text: "Demo", link: "/demo/", rel: "external", target: "_blank" },
      { text: "Manual", link: "/manual/" },
      {
        text: "Languages",
        items: [
          { text: "French", link: "/manual/translations/fr/" },
          { text: "Spanish", link: "/manual/translations/es/" },
          { text: "German", link: "/manual/translations/de/" },
        ],
      },
      { text: "Components", link: "/dev/components/" },
      { text: "API (TypeDoc)", link: "/dev/api/" },
      { text: "GraphQL", link: "/dev/graphql/" },
    ],
    sidebar: {
      "/manual/": [
        {
          text: "Start Here",
          items: [
            { text: "Manual Home", link: "/manual/" },
            { text: "Installation", link: "/manual/installation" },
            { text: "Usage", link: "/manual/usage" },
            { text: "Deployment Profiles", link: "/manual/deployment-profiles" },
          ],
        },
        {
          text: "Dashboard Building",
          items: [
            { text: "Datasource Reference", link: "/manual/datasource-reference" },
            { text: "Widget Reference", link: "/manual/widget-reference" },
            { text: "Widget Examples", link: "/manual/widget-examples/" },
            { text: "Base Widget Guide", link: "/manual/widget-base-guide" },
            { text: "Widget Developer Guide", link: "/manual/widget-developer-guide" },
          ],
        },
        {
          text: "Translations",
          items: [
            { text: "Translation Overview", link: "/manual/translations" },
            { text: "French (Brouillon)", link: "/manual/translations/fr/" },
            { text: "Spanish (Borrador)", link: "/manual/translations/es/" },
            { text: "German (Entwurf)", link: "/manual/translations/de/" },
          ],
        },
        {
          text: "Developer Reference",
          items: [
            { text: "Architecture", link: "/manual/architecture" },
            { text: "Secrets Operations", link: "/manual/secrets-operations" },
            { text: "Service Accounts", link: "/manual/service-accounts" },
            { text: "Runtime Metrics", link: "/manual/runtime-metrics" },
            { text: "Widget Runtime", link: "/manual/widget-runtime" },
            { text: "API", link: "/manual/api" },
            { text: "UI", link: "/manual/ui" },
            { text: "Gateway", link: "/manual/gateway" },
            { text: "Realtime Operations", link: "/manual/realtime-operations" },
            { text: "Security Controls Rollout", link: "/manual/security-controls-rollout" },
            { text: "Credential Key Rotation", link: "/manual/credential-key-rotation" },
            { text: "Ansible", link: "/manual/ansible" },
            { text: "Raspberry Pi MongoDB", link: "/manual/raspberry-pi-mongodb" },
            { text: "Docs Site Setup", link: "/manual/docs-site-setup" },
            { text: "Development Misc", link: "/manual/dev-misc" },
            { text: "TypeScript Standards", link: "/manual/typescript-standards" },
          ],
        },
      ],
    },
  },
});
