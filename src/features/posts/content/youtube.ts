import { maxHrefLength, maxVideoStart, videoIdPattern } from "./schema";

// YouTube is the only allowlisted embed provider. Editors paste a URL; only the
// video id and an optional start offset are kept. The editor node view and the
// read-only renderer derive the same privacy-enhanced embed URL from them.

const embedOrigin = "https://www.youtube-nocookie.com";
const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const shortHost = "youtu.be";

// Shared iframe attributes. Playback needs scripts and the player's own
// origin; popups let "Watch on YouTube" open a normal tab. The player rejects
// requests without a referrer, so the origin (not the full URL) is sent.
export const youtubeIframeAllow = "encrypted-media; fullscreen; picture-in-picture";
export const youtubeIframeSandbox =
  "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";
export const youtubeIframeReferrerPolicy = "strict-origin-when-cross-origin";

export type ParsedYouTubeUrl = { videoId: string; start?: number };

const schemePattern = /^[a-z][a-z0-9+.-]*:/i;
const unsafeCharacterPattern = /[\u0000- \u007f"'<>\\`]/;
const idPathPattern = /^\/([A-Za-z0-9_-]{11})\/?$/;
const prefixedIdPathPattern = /^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})\/?$/;
const durationPattern = /^(?:(\d{1,5})h)?(?:(\d{1,5})m)?(?:(\d{1,6})s?)?$/;

// Accepts "90", "90s", "1m30s", and "1h2m3s". Anything else, zero, or an
// offset beyond the stored limit is ignored: the video still starts at 0.
function parseStart(value: string | null): number | undefined {
  if (!value) return undefined;

  const match = durationPattern.exec(value);
  if (!match) return undefined;

  const [, hours, minutes, seconds] = match;
  const total =
    Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);

  return total >= 1 && total <= maxVideoStart ? total : undefined;
}

// Strict parser for youtube.com/watch?v=, youtu.be/, youtube.com/shorts/, and
// youtube.com/embed/ URLs. Other hosts, schemes, credentials, ports, extra
// path segments, and malformed ids return null.
export function parseYouTubeUrl(input: string): ParsedYouTubeUrl | null {
  const value = input.trim();

  if (
    value.length === 0 ||
    value.length > maxHrefLength ||
    unsafeCharacterPattern.test(value)
  ) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(schemePattern.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== ""
  ) {
    return null;
  }

  let videoId: string | undefined;

  if (url.hostname === shortHost) {
    videoId = idPathPattern.exec(url.pathname)?.[1];
  } else if (youtubeHosts.has(url.hostname)) {
    if (url.pathname === "/watch" || url.pathname === "/watch/") {
      const ids = url.searchParams.getAll("v");
      videoId = ids.length === 1 && videoIdPattern.test(ids[0]) ? ids[0] : undefined;
    } else {
      videoId = prefixedIdPathPattern.exec(url.pathname)?.[1];
    }
  }

  if (!videoId) return null;

  const start = parseStart(url.searchParams.get("t") ?? url.searchParams.get("start"));

  return start === undefined ? { videoId } : { videoId, start };
}

export function youtubeEmbedUrl(videoId: string, start?: number | null): string | null {
  if (!videoIdPattern.test(videoId)) return null;

  const url = `${embedOrigin}/embed/${videoId}`;
  return start && Number.isInteger(start) && start > 0 && start <= maxVideoStart
    ? `${url}?start=${start}`
    : url;
}

// Canonical watch URL, used to prefill the editor form for a selected video.
export function youtubeWatchUrl(videoId: string, start?: number | null): string {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  return start ? `${url}&t=${start}s` : url;
}
