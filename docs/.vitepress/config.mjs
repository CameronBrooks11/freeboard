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
      { text: "Demo", link: "/demo/" },
      { text: "Manual", link: "/manual/" },
      { text: "API (JSDoc)", link: "/dev/api/index.html" },
      { text: "GraphQL", link: "/dev/graphql/schema.graphql" },
      { text: "Components", link: "/dev/components/" },
    ],
  },
});
