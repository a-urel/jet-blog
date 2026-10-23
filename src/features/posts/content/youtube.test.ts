import { describe, expect, it } from "vitest";

import { invalidYouTubeUrlFixtures, validYouTubeUrlFixtures } from "./fixtures";
import { validateBodyDocument } from "./schema";
import { parseYouTubeUrl, youtubeEmbedUrl, youtubeWatchUrl } from "./youtube";

describe("parseYouTubeUrl", () => {
  it.each(validYouTubeUrlFixtures)("parses $input", ({ input, videoId, start }) => {
    expect(parseYouTubeUrl(input)).toEqual(
      start === undefined ? { videoId } : { videoId, start },
    );
  });

  it.each(invalidYouTubeUrlFixtures)("rejects $name", ({ input }) => {
    expect(parseYouTubeUrl(input)).toBeNull();
  });

  it.each(validYouTubeUrlFixtures)(
    "produces a storable node for $input",
    ({ input }) => {
      const parsed = parseYouTubeUrl(input)!;
      const result = validateBodyDocument({
        type: "doc",
        content: [{ type: "youtube", attrs: { ...parsed, title: "Başlık" } }],
      });

      expect(result.ok).toBe(true);
    },
  );
});

describe("youtubeEmbedUrl", () => {
  it("uses the privacy-enhanced domain", () => {
    expect(youtubeEmbedUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(youtubeEmbedUrl("dQw4w9WgXcQ", 90)).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90",
    );
  });

  it.each(["javascript:alert(1)", "../x/dQw4w9WgXcQ", "dQw4w9WgXc"])(
    "refuses the id %j",
    (videoId) => {
      expect(youtubeEmbedUrl(videoId)).toBeNull();
    },
  );

  it("ignores an invalid start", () => {
    expect(youtubeEmbedUrl("dQw4w9WgXcQ", 0)).not.toContain("start");
    expect(youtubeEmbedUrl("dQw4w9WgXcQ", 1.5)).not.toContain("start");
  });
});

describe("youtubeWatchUrl", () => {
  it("round-trips through the parser", () => {
    expect(parseYouTubeUrl(youtubeWatchUrl("a-B_c1D2e3F", 75))).toEqual({
      videoId: "a-B_c1D2e3F",
      start: 75,
    });
  });
});
