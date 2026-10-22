import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fixtureMediaIds,
  invalidBodyFixtures,
  validBodyFixtures,
} from "../content/fixtures";
import { PostBody } from "./post-body";

function render(body: unknown, contentVersion = 1) {
  return renderToStaticMarkup(
    <PostBody body={body} contentVersion={contentVersion} />,
  );
}

const fallbackText = "Bu yazının içeriği şu anda görüntülenemiyor.";

describe("PostBody", () => {
  it("renders formatted text and links", () => {
    const html = render(validBodyFixtures[1].doc);

    expect(html).toContain("<h2><span>Başlık</span></h2>");
    expect(html).toContain("<strong>Kalın</strong>");
    expect(html).toContain(
      '<a href="https://example.com/a?b=1" rel="noopener noreferrer nofollow"><em>eğik bağlantı</em></a>',
    );
    expect(html).toContain('<a href="/posts/ornek">iç bağlantı</a>');
    expect(html).toContain("<br/>");
    expect(html).toContain("<code>kod</code>");
    expect(html).toContain("<s>çizik</s>");
  });

  it("renders lists, quotes, code blocks, and rules", () => {
    const html = render(validBodyFixtures[2].doc);

    expect(html).toContain("<ul><li><p><span>Bir</span></p>");
    expect(html).toContain('<ol start="3">');
    expect(html).toContain("<blockquote><p><span>Alıntı</span></p></blockquote>");
    expect(html).toContain(
      '<pre><code data-language="ts">const a = 1;\nconsole.log(a);</code></pre>',
    );
    expect(html).toContain("<hr/>");
    expect(html).toContain("<h4><span>Son</span></h4>");
  });

  it("escapes text instead of interpreting it as HTML", () => {
    const html = render({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "<script>alert(1)</script>" }],
        },
      ],
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it.each(invalidBodyFixtures)("falls back safely for $name", ({ doc }) => {
    const html = render(doc);

    expect(html).toContain(fallbackText);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script");
  });

  it("falls back for an unsupported content version", () => {
    const html = render(validBodyFixtures[1].doc, 2);

    expect(html).toContain(fallbackText);
    expect(html).not.toContain("Kalın");
  });

  describe("images", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("renders a figure with derived URL, dimensions, alt text, and escaped caption", () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
      const html = render(validBodyFixtures[3].doc);
      const source = encodeURIComponent(
        `https://project.supabase.co/storage/v1/object/public/media/${fixtureMediaIds[0]}`,
      );

      expect(html).toContain("<figure>");
      expect(html).toContain('alt="Deniz kıyısında gün batımı"');
      expect(html).toContain('width="1200"');
      expect(html).toContain('height="800"');
      expect(html).toContain(`/_next/image?url=${source}`);
      expect(html).toContain("sizes=");
      expect(html).toContain(
        "<figcaption>Fotoğraf: örnek &lt;b&gt;kaynak&lt;/b&gt;</figcaption>",
      );
    });

    it("renders decorative images with empty alt text", () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
      const html = render(validBodyFixtures[4].doc);

      expect(html).toContain('alt=""');
      expect(html).toContain(fixtureMediaIds[1]);
      expect(html).toContain("<blockquote><figure>");
    });

    it("shows a placeholder when the media URL cannot be derived", () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
      const html = render(validBodyFixtures[3].doc);

      expect(html).not.toContain("<img");
      expect(html).toContain('role="img"');
      expect(html).toContain('aria-label="Deniz kıyısında gün batımı"');
      expect(html).toContain("Görsel şu anda yüklenemiyor.");
    });
  });
});
