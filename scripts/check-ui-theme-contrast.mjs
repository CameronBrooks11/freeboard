#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const themesDir = path.join(process.cwd(), "packages", "ui", "src", "assets", "css", "themes");

const criticalPairs = [
  {
    id: "surface-primary-text",
    backgroundToken: "--bg-surface-1",
    foregroundToken: "--text-primary",
    minContrast: 4.5,
  },
  {
    id: "primary-button",
    backgroundToken: "--color-primary",
    foregroundToken: "--text-on-primary",
    minContrast: 4.5,
  },
  {
    id: "accent-button",
    backgroundToken: "--color-accent",
    foregroundToken: "--text-on-accent",
    minContrast: 4.5,
  },
  {
    id: "widget-error-state",
    backgroundToken: "--status-error-surface",
    foregroundToken: "--status-on-error",
    backdropToken: "--bg-surface-2",
    minContrast: 4.5,
  },
  // Semantic text tokens must stay AA-legible as text. They are checked against
  // the worst-case surface (surface-3 is the darkest light-surface / lightest
  // dark-surface, i.e. lowest text contrast in either polarity), so passing here
  // implies passing on surface-1/2. These back the dialog/table/toolbar text that
  // previously used non-AA ramp/brand tokens (#186).
  {
    id: "surface-muted-text",
    backgroundToken: "--bg-surface-3",
    foregroundToken: "--text-muted",
    minContrast: 4.5,
  },
  {
    id: "surface-secondary-text",
    backgroundToken: "--bg-surface-3",
    foregroundToken: "--text-secondary",
    minContrast: 4.5,
  },
  {
    id: "surface-link-text",
    backgroundToken: "--bg-surface-3",
    foregroundToken: "--text-link",
    minContrast: 4.5,
  },
];

const parseTokens = (content) => {
  const tokens = new Map();
  const tokenRegex = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let match = tokenRegex.exec(content);
  while (match) {
    const tokenName = `--${match[1]}`;
    const tokenValue = String(match[2] || "").trim();
    tokens.set(tokenName, tokenValue);
    match = tokenRegex.exec(content);
  }
  return tokens;
};

const resolveTokenValue = (tokenName, tokens, stack = []) => {
  if (stack.includes(tokenName)) {
    throw new Error(`Token reference cycle detected: ${[...stack, tokenName].join(" -> ")}`);
  }

  const raw = tokens.get(tokenName);
  if (!raw) {
    throw new Error(`Missing token '${tokenName}'`);
  }

  const nextStack = [...stack, tokenName];
  return raw.replace(
    /var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)/gi,
    (_match, varName, fallback) => {
      if (tokens.has(varName)) {
        return resolveTokenValue(varName, tokens, nextStack);
      }
      if (fallback) {
        return String(fallback).trim();
      }
      throw new Error(`Missing referenced token '${varName}' in '${tokenName}'`);
    },
  );
};

const parseHexColor = (value) => {
  const raw = value.replace("#", "").trim();
  if (![3, 4, 6, 8].includes(raw.length)) {
    throw new Error(`Invalid hex color '${value}'`);
  }

  const normalizeChannel = (channel) => {
    const expanded = channel.length === 1 ? `${channel}${channel}` : channel;
    return Number.parseInt(expanded, 16);
  };

  if (raw.length <= 4) {
    const [r, g, b, a = "f"] = raw.split("");
    return {
      r: normalizeChannel(r),
      g: normalizeChannel(g),
      b: normalizeChannel(b),
      a: normalizeChannel(a) / 255,
    };
  }

  const r = raw.slice(0, 2);
  const g = raw.slice(2, 4);
  const b = raw.slice(4, 6);
  const a = raw.length === 8 ? raw.slice(6, 8) : "ff";
  return {
    r: normalizeChannel(r),
    g: normalizeChannel(g),
    b: normalizeChannel(b),
    a: normalizeChannel(a) / 255,
  };
};

const parseRgbColor = (value) => {
  const match = value.match(/^rgba?\((.+)\)$/i);
  if (!match) {
    throw new Error(`Invalid rgb/rgba color '${value}'`);
  }

  const parts = match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (parts.length < 3 || parts.length > 4) {
    throw new Error(`Invalid rgb/rgba color '${value}'`);
  }

  const r = Number(parts[0]);
  const g = Number(parts[1]);
  const b = Number(parts[2]);
  const a = parts.length === 4 ? Number(parts[3]) : 1;
  if (![r, g, b, a].every(Number.isFinite)) {
    throw new Error(`Invalid rgb/rgba numeric value in '${value}'`);
  }

  return {
    r: Math.max(0, Math.min(255, r)),
    g: Math.max(0, Math.min(255, g)),
    b: Math.max(0, Math.min(255, b)),
    a: Math.max(0, Math.min(1, a)),
  };
};

const hslToRgb = (h, s, l) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let [r1, g1, b1] = [0, 0, 0];

  if (hp >= 0 && hp < 1) {
    [r1, g1, b1] = [c, x, 0];
  } else if (hp >= 1 && hp < 2) {
    [r1, g1, b1] = [x, c, 0];
  } else if (hp >= 2 && hp < 3) {
    [r1, g1, b1] = [0, c, x];
  } else if (hp >= 3 && hp < 4) {
    [r1, g1, b1] = [0, x, c];
  } else if (hp >= 4 && hp < 5) {
    [r1, g1, b1] = [x, 0, c];
  } else if (hp >= 5 && hp <= 6) {
    [r1, g1, b1] = [c, 0, x];
  }

  const m = l - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
};

const parseHslColor = (value) => {
  const match = value.match(/^hsla?\((.+)\)$/i);
  if (!match) {
    throw new Error(`Invalid hsl/hsla color '${value}'`);
  }

  const parts = match[1]
    .split(/[\s,/]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (parts.length < 3 || parts.length > 4) {
    throw new Error(`Invalid hsl/hsla color '${value}'`);
  }

  const hue = Number(parts[0]);
  const saturation = Number(parts[1].replace("%", "")) / 100;
  const lightness = Number(parts[2].replace("%", "")) / 100;
  const alpha = parts[3] ? Number(parts[3]) : 1;

  if (![hue, saturation, lightness, alpha].every(Number.isFinite)) {
    throw new Error(`Invalid hsl/hsla numeric value in '${value}'`);
  }

  const rgb = hslToRgb(((hue % 360) + 360) % 360, saturation, lightness);
  return {
    ...rgb,
    a: Math.max(0, Math.min(1, alpha)),
  };
};

const parseColor = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    throw new Error("Color value is empty");
  }
  if (normalized.startsWith("#")) {
    return parseHexColor(normalized);
  }
  if (normalized.startsWith("rgb")) {
    return parseRgbColor(normalized);
  }
  if (normalized.startsWith("hsl")) {
    return parseHslColor(normalized);
  }
  throw new Error(`Unsupported color format '${value}'`);
};

const blendOver = (foreground, background) => {
  const alpha = foreground.a;
  return {
    r: Math.round(foreground.r * alpha + background.r * (1 - alpha)),
    g: Math.round(foreground.g * alpha + background.g * (1 - alpha)),
    b: Math.round(foreground.b * alpha + background.b * (1 - alpha)),
    a: 1,
  };
};

const toLinear = (channel) => {
  const normalized = channel / 255;
  if (normalized <= 0.04045) {
    return normalized / 12.92;
  }
  return ((normalized + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = (color) =>
  0.2126 * toLinear(color.r) + 0.7152 * toLinear(color.g) + 0.0722 * toLinear(color.b);

const contrastRatio = (foreground, background) => {
  const fg = foreground.a < 1 ? blendOver(foreground, background) : foreground;
  const bg =
    background.a < 1 ? blendOver(background, { r: 255, g: 255, b: 255, a: 1 }) : background;
  const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg));
  const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
};

const formatRatio = (value) => Number(value).toFixed(2);

const run = () => {
  if (!fs.existsSync(themesDir)) {
    console.error(`[check-ui-theme-contrast] theme directory not found: ${themesDir}`);
    process.exit(1);
  }

  const themeNames = fs
    .readdirSync(themesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
    .map((entry) => entry.name.replace(/\.css$/i, ""))
    .sort((a, b) => a.localeCompare(b));
  if (!themeNames.length) {
    console.error("[check-ui-theme-contrast] no theme CSS files found.");
    process.exit(1);
  }

  const failures = [];
  const checks = [];

  for (const themeName of themeNames) {
    const filePath = path.join(themesDir, `${themeName}.css`);
    const tokens = parseTokens(fs.readFileSync(filePath, "utf8"));

    for (const pair of criticalPairs) {
      try {
        const backgroundRaw = resolveTokenValue(pair.backgroundToken, tokens);
        const foregroundRaw = resolveTokenValue(pair.foregroundToken, tokens);
        let background = parseColor(backgroundRaw);
        const foreground = parseColor(foregroundRaw);

        if (background.a < 1) {
          const backdropRaw = resolveTokenValue(pair.backdropToken || "--bg-surface-1", tokens);
          const backdrop = parseColor(backdropRaw);
          const opaqueBackdrop =
            backdrop.a < 1 ? blendOver(backdrop, { r: 255, g: 255, b: 255, a: 1 }) : backdrop;
          background = blendOver(background, opaqueBackdrop);
        }

        const ratio = contrastRatio(foreground, background);
        checks.push({
          theme: themeName,
          pairId: pair.id,
          ratio,
          minContrast: pair.minContrast,
        });

        if (ratio < pair.minContrast) {
          failures.push({
            theme: themeName,
            pairId: pair.id,
            error: `contrast ${formatRatio(ratio)} < ${pair.minContrast}`,
          });
        }
      } catch (error) {
        failures.push({
          theme: themeName,
          pairId: pair.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  console.log("[check-ui-theme-contrast] evaluated pairs:");
  for (const check of checks) {
    console.log(
      `  - ${check.theme} :: ${check.pairId} => ${formatRatio(check.ratio)} (min ${check.minContrast})`,
    );
  }

  if (!failures.length) {
    console.log("[check-ui-theme-contrast] all critical token pairs pass.");
    return;
  }

  console.error("[check-ui-theme-contrast] failures:");
  for (const failure of failures) {
    console.error(`  - ${failure.theme} :: ${failure.pairId} -> ${failure.error}`);
  }
  process.exit(1);
};

run();
