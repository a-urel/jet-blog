import { notFound } from "next/navigation";

// Every URL without a page of its own reaches the [locale] root layout through
// src/proxy.ts, so its 404 renders inside that layout in the reader's
// interface language (src/app/[locale]/not-found.tsx).
export default function UnknownPage() {
  notFound();
}
