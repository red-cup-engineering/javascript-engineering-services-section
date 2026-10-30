// hai-rui's theme — the inference/advice layer's surface, on web-theming. Palette
// derived from seeds by web-theming-computer (light + dark), mono-forward to suit
// a conformance/advice console.

import type { Theme, ThemePalette } from "@red-cup-engineering/organizing-with-the-web/theming";
import { assembleCss } from "@red-cup-engineering/organizing-with-the-web/theming";
import { themePalette } from "@red-cup-engineering/organizing-with-the-web/theming-computer";

const palette: ThemePalette = themePalette(
  { ink: "#16181d", surface: "#f7f8fa", accent: "#2f7d57" },
  {
    sans: `system-ui, -apple-system, "Segoe UI", sans-serif`,
    serif: `system-ui, sans-serif`,
    mono: `ui-monospace, Menlo, "Cascadia Code", monospace`,
    measure: "80ch",
    radius: "6px",
  },
);

const CHROME_CSS = `body { max-width: 80ch; margin: 2rem auto; padding: 0 1.25rem; font-family: var(--mono); }`;

export const haiRuiTheme: Theme = {
  name: "hai-rui",
  css: assembleCss(palette, CHROME_CSS),
  head: () => "",
  header: () => "",
  footer: () => "",
  wrap: (articleHtml: string) => articleHtml,
};
