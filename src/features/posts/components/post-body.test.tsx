import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { invalidBodyFixtures, validBodyFixtures } from "../content/fixtures";
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
    expect(html).toContain('<a href="/yazi/ornek">iç bağlantı</a>');
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
});
