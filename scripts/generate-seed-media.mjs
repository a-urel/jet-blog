// Generates the synthetic brand images in the development seed media
// library: a wordmark for light and for dark backgrounds, a square icon, and
// a default share image. They are neutral placeholders for the seed site name
// ("Örnek Blog"), not a product brand; each deployment replaces them in the
// site settings.
//
// The PNGs are committed. Text is rendered by sharp (librsvg) with the fonts
// installed on the machine, so a run elsewhere can differ slightly; re-run
// only to change the designs (macOS: Charter and Avenir Next ship with the OS).
//
// Files are named by their media id: the media table requires
// object_path = id, and `supabase db reset` uploads supabase/seeds/media/
// to the media bucket under the file names (config.toml,
// [storage.buckets.media]). supabase/seeds/seed.sql inserts the matching
// rows; update their size_bytes, width, and height after a re-run.
//
// Usage: node scripts/generate-seed-media.mjs [output directory]

import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const outDir = path.resolve(process.argv[2] ?? "supabase/seeds/media");

const ink = "#1c1917";
const paper = "#f5f2ea";
const muted = "#57534e";
const accent = "#b45309";

const serif = "Charter, 'Bitstream Charter', Georgia, serif";
const sans = "'Avenir Next', Avenir, 'Helvetica Neue', Arial, sans-serif";

function escapeXml(value) {
  return value.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function wordmark(color) {
  // 4:1 transparent canvas; the header shows it at 32 px tall.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200" viewBox="0 0 800 200">
  <text x="400" y="136" text-anchor="middle" font-family="${serif}" font-weight="700"
    font-size="120" letter-spacing="-2" fill="${color}">${escapeXml("Örnek Blog")}</text>
</svg>`;
}

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${ink}"/>
  <text x="256" y="380" text-anchor="middle" font-family="${serif}" font-weight="700"
    font-size="340" fill="${paper}">${escapeXml("Ö")}</text>
</svg>`;

const shareImage = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${paper}"/>
  <text x="96" y="120" font-family="${sans}" font-weight="600" font-size="24"
    letter-spacing="5" fill="${ink}">${escapeXml("ÖRNEK BLOG")}</text>
  <text font-family="${serif}" font-size="76" fill="${ink}" letter-spacing="-1">
    <tspan x="96" y="300">${escapeXml("Birlikte düşünmek,")}</tspan>
    <tspan x="96" y="392">${escapeXml("birlikte yazmak.")}</tspan>
  </text>
  <rect x="96" y="500" width="72" height="4" fill="${accent}"/>
  <text x="1104" y="510" text-anchor="end" font-family="${sans}" font-size="24"
    fill="${muted}">${escapeXml("Fikirler, notlar ve yazılar")}</text>
</svg>`;

// Wordmarks are trimmed to the glyphs plus a small margin, so the header
// does not reserve empty space around them.
const files = [
  ["logo-light", "57b580eb-d906-4868-8eb0-dd7d26a6a787", wordmark(ink), true],
  ["logo-dark", "2bf836d5-1c0e-4dcf-9bee-27bd057cf5b6", wordmark(paper), true],
  ["icon", "a4730606-98ed-466d-8cbc-ebe59e7d6526", icon, false],
  ["share-image", "59ee69ca-f91a-45b5-ac1c-01d69bfe1001", shareImage, false],
];

await mkdir(outDir, { recursive: true });

for (const [name, id, svg, trim] of files) {
  const target = path.join(outDir, id);
  let image = sharp(Buffer.from(svg));
  if (trim) {
    const trimmed = await image.trim().png().toBuffer();
    const margin = 12;
    image = sharp(trimmed).extend({
      top: margin,
      bottom: margin,
      left: margin,
      right: margin,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }
  const info = await image.png({ compressionLevel: 9, palette: true }).toFile(target);
  console.log(`${name} ${id} ${info.width}x${info.height} ${info.size} bytes`);
}
