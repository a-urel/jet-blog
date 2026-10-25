// Accent color handling. The admin picks one #rrggbb color; it feeds the
// --primary, --ring, and --sidebar-primary tokens in both system themes.
// Those tokens color buttons and link-styled text (text-primary), so each
// theme needs at least 4.5:1 (WCAG 2.2 AA, normal text) against its page
// and card backgrounds. One color cannot reach that against both white and
// near-black (the best case is about 4.4:1), so the color is kept where it
// passes and otherwise mixed toward black (light theme) or white (dark
// theme) just far enough to pass. The settings form shows both results and
// a warning when a theme uses an adjusted color.

export const accentColorPattern = /^#[0-9a-f]{6}$/;

export const minimumTextContrast = 4.5;

type Rgb = readonly [number, number, number];

// Relative luminance of the semantic backgrounds in src/app/globals.css.
// They are achromatic oklch values, whose luminance is L³.
const lightBackgrounds = [1] as const; // --background and --card: oklch(1 0 0)
const darkBackgrounds = [0.145 ** 3, 0.205 ** 3] as const; // --background, --card

export type ThemeName = "light" | "dark";

export type ThemeAccent = {
  // The color used for --primary in this theme.
  color: string;
  // Text color on top of it (--primary-foreground).
  foreground: string;
  // Lowest contrast of `color` against the theme's backgrounds.
  contrast: number;
  // True when `color` differs from the chosen accent.
  adjusted: boolean;
};

export type AccentPalette = Record<ThemeName, ThemeAccent> & { accent: string };

export function normalizeAccentColor(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  const expanded = /^#[0-9a-f]{3}$/.test(trimmed)
    ? `#${[...trimmed.slice(1)].map((digit) => digit + digit).join("")}`
    : trimmed;
  return accentColorPattern.test(expanded) ? expanded : null;
}

function parseHex(hex: string): Rgb {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)) as unknown as Rgb;
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function linearChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [red, green, blue] = parseHex(hex).map(linearChannel);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first: number, second: number): number {
  const [lighter, darker] = first > second ? [first, second] : [second, first];
  return (lighter + 0.05) / (darker + 0.05);
}

function lowestContrast(hex: string, backgrounds: readonly number[]): number {
  const luminance = relativeLuminance(hex);
  return Math.min(...backgrounds.map((background) => contrastRatio(luminance, background)));
}

function mix(hex: string, target: Rgb, amount: number): string {
  const source = parseHex(hex);
  return toHex(source.map((channel, index) => channel + (target[index] - channel) * amount) as unknown as Rgb);
}

// Black or white, whichever reads better on the color. Against any color one
// of them reaches at least 4.58:1.
export function foregroundFor(hex: string): string {
  const luminance = relativeLuminance(hex);
  return contrastRatio(luminance, 1) >= contrastRatio(luminance, 0) ? "#ffffff" : "#000000";
}

function themeAccent(accent: string, theme: ThemeName): ThemeAccent {
  const backgrounds = theme === "light" ? lightBackgrounds : darkBackgrounds;
  const target: Rgb = theme === "light" ? [0, 0, 0] : [255, 255, 255];

  let color = accent;
  // 100 steps reach pure black or white, which pass in either theme.
  for (let step = 1; step <= 100 && lowestContrast(color, backgrounds) < minimumTextContrast; step += 1) {
    color = mix(accent, target, step / 100);
  }

  return {
    color,
    foreground: foregroundFor(color),
    contrast: lowestContrast(color, backgrounds),
    adjusted: color !== accent,
  };
}

export function accentPalette(accent: string): AccentPalette {
  return { accent, light: themeAccent(accent, "light"), dark: themeAccent(accent, "dark") };
}

// CSS for the root layout. `:root:root` outranks both :root rules in
// globals.css, so the light values apply without a media query and the dark
// values only under prefers-color-scheme: dark. The input is re-validated
// here, so nothing but #rrggbb values ever reaches the style element.
export function accentCss(accent: string | null): string | null {
  const normalized = accent ? normalizeAccentColor(accent) : null;
  if (!normalized) return null;

  const palette = accentPalette(normalized);
  const tokens = ({ color, foreground }: ThemeAccent) =>
    [
      `--primary:${color}`,
      `--primary-foreground:${foreground}`,
      `--ring:${color}`,
      `--sidebar-primary:${color}`,
      `--sidebar-primary-foreground:${foreground}`,
    ].join(";");

  return [
    `:root:root{${tokens(palette.light)}}`,
    `@media (prefers-color-scheme: dark){:root:root{${tokens(palette.dark)}}}`,
  ].join("");
}
