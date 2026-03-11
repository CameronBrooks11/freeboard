import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitepress";

const base = process.env.SITE_BASE || "/";
const generatedDocsPathPrefixes = ["dev/", "auto/", "_templates/"];
const generatedReferenceRoutes = ["/dev/api/", "/dev/graphql/", "/dev/components/"];
const docsRoot = path.join(process.cwd(), "docs");

const isGeneratedDocsPage = (relativePath = "") =>
  generatedDocsPathPrefixes.some((prefix) => relativePath.startsWith(prefix));

const localePrefix = (locale) => (locale && locale !== "en" ? `/${locale}` : "");

const localeRoute = (locale, route) => {
  const prefix = localePrefix(locale);
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  return `${prefix}${normalizedRoute}`.replace(/\/{2,}/g, "/");
};

const manualRoute = (locale) => localeRoute(locale, "/manual/");

const withBase = (route) => {
  if (typeof route !== "string" || !route.startsWith("/")) {
    return null;
  }
  if (base === "/") {
    return route;
  }
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${normalizedBase}${route}`;
};

const canonicalRoute = (route) => {
  if (typeof route !== "string") {
    return null;
  }
  const normalized = route.trim().replace(/\/{2,}/g, "/");
  if (!normalized.startsWith("/")) {
    return null;
  }
  if (normalized === "/") {
    return "/";
  }
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
};

const routeFromRelativeMarkdownPath = (relativePath = "") => {
  if (!relativePath || !relativePath.endsWith(".md")) {
    return null;
  }

  const withoutExtension = relativePath.replace(/\.md$/i, "");
  if (withoutExtension === "index") {
    return "/";
  }
  if (withoutExtension.endsWith("/index")) {
    return `/${withoutExtension.replace(/\/index$/, "")}/`;
  }
  return `/${withoutExtension}`;
};

const normalizeAlternateLocaleEntries = (frontmatter = {}) => {
  const alternateLocales = frontmatter.alternateLocales;
  if (
    !alternateLocales ||
    typeof alternateLocales !== "object" ||
    Array.isArray(alternateLocales)
  ) {
    return [];
  }

  const entries = [];
  for (const [locale, route] of Object.entries(alternateLocales)) {
    const normalizedLocale = String(locale || "")
      .trim()
      .toLowerCase();
    if (!normalizedLocale) {
      continue;
    }
    if (typeof route !== "string") {
      continue;
    }
    const normalizedRoute = route.trim().replace(/\/{2,}/g, "/");
    if (!normalizedRoute.startsWith("/")) {
      continue;
    }
    entries.push({ locale: normalizedLocale, route: normalizedRoute });
  }

  return entries;
};

const walkMarkdownFiles = (rootDir) => {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const files = [];
  const walk = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(absolutePath);
      }
    }
  };

  walk(rootDir);
  return files;
};

const extractFrontmatter = (source) => {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? match[1] : null;
};

const extractAlternateLocalesFromFrontmatterBlock = (frontmatterBlock) => {
  if (typeof frontmatterBlock !== "string") {
    return null;
  }

  const blockMatch = frontmatterBlock.match(/^alternateLocales:\s*\r?\n((?: {2}.*\r?\n?)*)/m);
  if (!blockMatch) {
    return null;
  }

  const mappings = {};
  const lines = blockMatch[1].split(/\r?\n/).filter((line) => line.trim());
  for (const line of lines) {
    const trimmed = line.trim();
    const pairMatch = trimmed.match(/^([A-Za-z0-9-]+):\s*(.+)$/);
    if (!pairMatch) {
      continue;
    }
    const locale = pairMatch[1].toLowerCase();
    const route = String(pairMatch[2])
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (!route.startsWith("/")) {
      continue;
    }
    mappings[locale] = route;
  }

  return Object.keys(mappings).length ? mappings : null;
};

const buildAlternateLocaleIndex = () => {
  const index = new Map();
  const localeRoots = ["fr", "es", "de"].map((locale) => path.join(docsRoot, locale));

  for (const localeRoot of localeRoots) {
    for (const absolutePath of walkMarkdownFiles(localeRoot)) {
      const source = fs.readFileSync(absolutePath, "utf8");
      const frontmatterBlock = extractFrontmatter(source);
      const alternateLocales = extractAlternateLocalesFromFrontmatterBlock(frontmatterBlock);
      if (!alternateLocales) {
        continue;
      }

      for (const route of Object.values(alternateLocales)) {
        const normalizedRoute = canonicalRoute(route);
        if (!normalizedRoute || index.has(normalizedRoute)) {
          continue;
        }
        index.set(normalizedRoute, alternateLocales);
      }
    }
  }

  return index;
};

const alternateLocalesByRoute = buildAlternateLocaleIndex();

const createSearchTranslations = (
  buttonText,
  buttonAriaLabel,
  noResultsText,
  resetButtonTitle,
  selectText,
  navigateText,
  closeText,
) => ({
  translations: {
    button: {
      buttonText,
      buttonAriaLabel,
    },
    modal: {
      noResultsText,
      resetButtonTitle,
      footer: {
        selectText,
        navigateText,
        closeText,
      },
    },
  },
});

const createRootNav = () => [
  { text: "Home", link: "/" },
  { text: "Demo", link: "/demo/", rel: "external", target: "_blank" },
  { text: "Manual", link: "/manual/" },
  { text: "Components", link: "/dev/components/" },
  { text: "API (TypeDoc)", link: "/dev/api/" },
  { text: "GraphQL", link: "/dev/graphql/" },
];

const createLocaleNav = (locale, labels) => [
  { text: labels.home, link: localeRoute(locale, "/") },
  { text: labels.demo, link: "/demo/", rel: "external", target: "_blank" },
  { text: labels.manual, link: manualRoute(locale) },
  { text: labels.components, link: "/dev/components/" },
  { text: labels.api, link: "/dev/api/" },
  { text: labels.graphql, link: "/dev/graphql/" },
];

const rootManualSidebar = [
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
    text: "Localized Manuals",
    items: [
      { text: "French", link: "/fr/manual/" },
      { text: "Spanish", link: "/es/manual/" },
      { text: "German", link: "/de/manual/" },
      { text: "Translation Workflow", link: "/manual/translations" },
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
      { text: "Postgres Release Readiness", link: "/manual/release-readiness-postgres" },
      { text: "Credential Key Rotation", link: "/manual/credential-key-rotation" },
      { text: "Ansible", link: "/manual/ansible" },
      { text: "Legacy Datastore Architecture", link: "/manual/legacy-datastore-architecture" },
      { text: "Docs Site Setup", link: "/manual/docs-site-setup" },
      { text: "Development Misc", link: "/manual/dev-misc" },
      { text: "TypeScript Standards", link: "/manual/typescript-standards" },
      { text: "Translation Contributions", link: "/manual/translations" },
    ],
  },
];

const createLocaleManualSidebar = (locale, labels) => [
  {
    text: labels.startHere,
    items: [
      { text: labels.manualHome, link: manualRoute(locale) },
      { text: labels.quickstart, link: localeRoute(locale, "/manual/installation-quickstart") },
      { text: labels.references, link: localeRoute(locale, "/manual/references") },
    ],
  },
  {
    text: labels.fallback,
    items: [
      { text: labels.englishManual, link: "/manual/" },
      { text: labels.translationWorkflow, link: "/manual/translations" },
    ],
  },
  {
    text: labels.generated,
    items: generatedReferenceRoutes.map((route) => ({ text: route, link: route })),
  },
];

export default defineConfig({
  title: "Freeboard",
  description: "Demo + Docs",
  base,
  lang: "en-US",
  lastUpdated: true,
  cleanUrls: true,
  ignoreDeadLinks: [
    /^\/demo\//, // copied post-build
    /^\/dev\/graphql\/schema\.graphql$/, // served from /public
  ],
  locales: {
    root: {
      label: "English",
      lang: "en-US",
    },
    fr: {
      label: "Francais",
      lang: "fr-FR",
      link: "/fr/",
      description: "Demo + Documentation",
      themeConfig: {
        langMenuLabel: "Langue",
        returnToTopLabel: "Retour en haut",
        sidebarMenuLabel: "Menu",
        darkModeSwitchLabel: "Apparence",
        lightModeSwitchTitle: "Passer au theme clair",
        darkModeSwitchTitle: "Passer au theme sombre",
        nav: createLocaleNav("fr", {
          home: "Accueil",
          demo: "Demo",
          manual: "Manuel",
          components: "Composants",
          api: "API (TypeDoc)",
          graphql: "GraphQL",
        }),
        sidebar: {
          "/fr/manual/": createLocaleManualSidebar("fr", {
            startHere: "Demarrer",
            manualHome: "Accueil du manuel",
            quickstart: "Installation rapide",
            references: "References techniques",
            fallback: "Contenu canonique",
            englishManual: "Manuel anglais (canonique)",
            translationWorkflow: "Regles de traduction",
            generated: "References generees",
          }),
        },
      },
    },
    es: {
      label: "Espanol",
      lang: "es-ES",
      link: "/es/",
      description: "Demo + Documentacion",
      themeConfig: {
        langMenuLabel: "Idioma",
        returnToTopLabel: "Volver arriba",
        sidebarMenuLabel: "Menu",
        darkModeSwitchLabel: "Apariencia",
        lightModeSwitchTitle: "Cambiar a tema claro",
        darkModeSwitchTitle: "Cambiar a tema oscuro",
        nav: createLocaleNav("es", {
          home: "Inicio",
          demo: "Demo",
          manual: "Manual",
          components: "Componentes",
          api: "API (TypeDoc)",
          graphql: "GraphQL",
        }),
        sidebar: {
          "/es/manual/": createLocaleManualSidebar("es", {
            startHere: "Comenzar",
            manualHome: "Inicio del manual",
            quickstart: "Instalacion rapida",
            references: "Referencias tecnicas",
            fallback: "Contenido canonico",
            englishManual: "Manual en ingles (canonico)",
            translationWorkflow: "Reglas de traduccion",
            generated: "Referencias generadas",
          }),
        },
      },
    },
    de: {
      label: "Deutsch",
      lang: "de-DE",
      link: "/de/",
      description: "Demo + Dokumentation",
      themeConfig: {
        langMenuLabel: "Sprache",
        returnToTopLabel: "Nach oben",
        sidebarMenuLabel: "Menu",
        darkModeSwitchLabel: "Erscheinungsbild",
        lightModeSwitchTitle: "Zum hellen Theme wechseln",
        darkModeSwitchTitle: "Zum dunklen Theme wechseln",
        nav: createLocaleNav("de", {
          home: "Start",
          demo: "Demo",
          manual: "Handbuch",
          components: "Komponenten",
          api: "API (TypeDoc)",
          graphql: "GraphQL",
        }),
        sidebar: {
          "/de/manual/": createLocaleManualSidebar("de", {
            startHere: "Einstieg",
            manualHome: "Handbuch Start",
            quickstart: "Installation Schnellstart",
            references: "Technische Referenzen",
            fallback: "Kanonischer Inhalt",
            englishManual: "Englisches Handbuch (kanonisch)",
            translationWorkflow: "Ubersetzungsregeln",
            generated: "Generierte Referenzen",
          }),
        },
      },
    },
  },
  transformHead({ pageData }) {
    const explicitEntries = normalizeAlternateLocaleEntries(pageData.frontmatter);
    let alternateLocaleEntries = explicitEntries;

    if (!alternateLocaleEntries.length) {
      const pageRoute = canonicalRoute(routeFromRelativeMarkdownPath(pageData.relativePath));
      const indexedAlternateLocales = pageRoute ? alternateLocalesByRoute.get(pageRoute) : null;
      if (indexedAlternateLocales) {
        alternateLocaleEntries = normalizeAlternateLocaleEntries({
          alternateLocales: indexedAlternateLocales,
        });
      }
    }

    if (!alternateLocaleEntries.length) {
      return;
    }

    const seen = new Set();
    const head = [];
    let englishHref = null;

    for (const entry of alternateLocaleEntries) {
      const href = withBase(entry.route);
      if (!href) {
        continue;
      }
      const dedupeKey = `${entry.locale}::${href}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      head.push(["link", { rel: "alternate", hreflang: entry.locale, href }]);

      if (entry.locale === "en") {
        englishHref = href;
      }
    }

    const hasXDefault = alternateLocaleEntries.some((entry) => entry.locale === "x-default");
    if (englishHref && !hasXDefault) {
      head.push(["link", { rel: "alternate", hreflang: "x-default", href: englishHref }]);
    }

    return head;
  },
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
    i18nRouting: false,
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
        locales: {
          root: createSearchTranslations(
            "Search",
            "Search",
            "No results for",
            "Clear query",
            "to select",
            "to navigate",
            "to close",
          ),
          fr: createSearchTranslations(
            "Rechercher",
            "Rechercher",
            "Aucun resultat pour",
            "Effacer la recherche",
            "pour selectionner",
            "pour naviguer",
            "pour fermer",
          ),
          es: createSearchTranslations(
            "Buscar",
            "Buscar",
            "Sin resultados para",
            "Limpiar busqueda",
            "para seleccionar",
            "para navegar",
            "para cerrar",
          ),
          de: createSearchTranslations(
            "Suche",
            "Suche",
            "Keine Ergebnisse fur",
            "Suche loschen",
            "zum Auswahlen",
            "zum Navigieren",
            "zum Schliessen",
          ),
        },
      },
    },
    nav: createRootNav(),
    sidebar: {
      "/manual/": rootManualSidebar,
    },
    langMenuLabel: "Language",
    returnToTopLabel: "Return to top",
    sidebarMenuLabel: "Menu",
    darkModeSwitchLabel: "Appearance",
    lightModeSwitchTitle: "Switch to light theme",
    darkModeSwitchTitle: "Switch to dark theme",
  },
});
