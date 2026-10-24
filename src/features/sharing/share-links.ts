// Provider share links (no social APIs, no tracking parameters). Each link
// carries only the canonical post URL and title, which are public anyway.

export type ShareProvider = "x" | "facebook" | "linkedin" | "whatsapp" | "email";

export type ShareLink = {
  provider: ShareProvider;
  label: string;
  href: string;
};

// Provider names are brands and stay as they are; only the e-mail link's
// label is interface copy, so the caller passes it translated.
export function buildShareLinks(input: {
  url: string;
  title: string;
  emailLabel: string;
}): ShareLink[] {
  const url = encodeURIComponent(input.url);
  const title = encodeURIComponent(input.title);
  const titleAndUrl = encodeURIComponent(`${input.title} ${input.url}`);

  return [
    { provider: "x", label: "X", href: `https://x.com/intent/post?url=${url}&text=${title}` },
    {
      provider: "facebook",
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    },
    {
      provider: "linkedin",
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    },
    { provider: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${titleAndUrl}` },
    { provider: "email", label: input.emailLabel, href: `mailto:?subject=${title}&body=${url}` },
  ];
}
