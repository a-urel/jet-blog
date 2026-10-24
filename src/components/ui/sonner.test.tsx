import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Toaster } from "./sonner";

describe("Toaster", () => {
  // The root layout prerenders the Toaster; screen readers hear toasts through
  // this polite live region, which exists before the first toast.
  it("prerenders a labelled polite live region", () => {
    const html = renderToStaticMarkup(<Toaster containerAriaLabel="Bildirimler" />);

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="Bildirimler');
  });
});
