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
      {
        text: "API (JSDoc)",
        link: "/dev/api/index.html",
        rel: "external",
        target: "_blank",
      },
      {
        text: "GraphQL",
        link: "/dev/graphql/schema.graphql",
        rel: "external",
        target: "_blank",
      },
    ],
  },
});
