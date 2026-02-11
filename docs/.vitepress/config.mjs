import { defineConfig } from "vitepress";

const base = process.env.SITE_BASE || "/";

export default defineConfig({
  title: "Freeboard",
  description: "Demo + Docs",
  base,
  cleanUrls: true,
  ignoreDeadLinks: [
    /^\/demo\//, // copied post-build
    /^\/dev\/graphql\/schema\.graphql$/, // served from /public
  ],
  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Demo", link: "/demo/", rel: "external", target: "_blank" },
      { text: "Manual", link: "/manual/" },
      { text: "Components", link: "/dev/components/" },
      { text: "API (JSDoc)", link: "/dev/api/index.html" },
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
          ],
        },
        {
          text: "Dashboard Building",
          items: [
            { text: "Datasource Reference", link: "/manual/datasource-reference" },
            { text: "Widget Reference", link: "/manual/widget-reference" },
            { text: "Widget Examples", link: "/manual/widget-examples/" },
            { text: "Base Widget Guide", link: "/manual/widget-base-guide" },
          ],
        },
        {
          text: "Developer Reference",
          items: [
            { text: "Architecture", link: "/manual/architecture" },
            { text: "Widget Runtime", link: "/manual/widget-runtime" },
            { text: "API", link: "/manual/api" },
            { text: "UI", link: "/manual/ui" },
            { text: "Proxy", link: "/manual/proxy" },
            { text: "Ansible", link: "/manual/ansible" },
            { text: "Docs Site Setup", link: "/manual/docs-site-setup" },
            { text: "Development Misc", link: "/manual/dev-misc" },
          ],
        },
      ],
    },
  },
});
