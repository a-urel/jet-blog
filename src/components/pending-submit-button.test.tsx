import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PendingSubmitButton } from "./pending-submit-button";

describe("PendingSubmitButton", () => {
  // The pending state needs a running form submission (browser-verified);
  // the server render is the idle state.
  it("renders an enabled submit button with the idle label", () => {
    const html = renderToStaticMarkup(
      <form>
        <PendingSubmitButton pendingChildren="Siliniyor…">Sil</PendingSubmitButton>
      </form>,
    );

    expect(html).toContain('type="submit"');
    expect(html).toContain(">Sil<");
    expect(html).not.toContain("Siliniyor");
    expect(html).not.toContain(` disabled=""`);
    expect(html).not.toContain("aria-busy");
  });

  it("keeps an explicit disabled state", () => {
    const html = renderToStaticMarkup(
      <PendingSubmitButton disabled pendingChildren="Siliniyor…">
        Sil
      </PendingSubmitButton>,
    );

    expect(html).toContain(` disabled=""`);
  });
});
