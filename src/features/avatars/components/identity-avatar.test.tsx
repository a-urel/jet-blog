import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { IdentityAvatar } from "./identity-avatar";

describe("IdentityAvatar", () => {
  it("renders decorative initials next to a visible name", () => {
    const html = renderToStaticMarkup(
      <IdentityAvatar kind="profiles" avatarId={null} name="Ayşe Yılmaz" />,
    );

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain(">AY<");
    expect(html).not.toContain("<img");
  });

  it("labels a standalone fallback", () => {
    const html = renderToStaticMarkup(
      <IdentityAvatar
        kind="authors"
        avatarId={null}
        name="Konuk Yazar"
        size="xl"
        alt="Yazar fotoğrafı yok"
      />,
    );

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Yazar fotoğrafı yok"');
    expect(html).toContain("data-[size=lg]:size-20");
    expect(html).not.toContain("data-[size=lg]:size-10");
  });
});
