import { getImageProps } from "next/image";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { avatarPublicUrl, type AvatarKind } from "../url";
import { avatarInitials } from "../validation";

const sizes = {
  sm: { pixels: 24, avatar: "sm", className: undefined },
  default: { pixels: 32, avatar: "default", className: undefined },
  lg: { pixels: 40, avatar: "lg", className: undefined },
  // Overrides the lg variant's own data-[size=lg] size rule.
  xl: { pixels: 80, avatar: "lg", className: "data-[size=lg]:size-20" },
} as const;

type IdentityAvatarProps = {
  kind: AvatarKind;
  avatarId: string | null;
  // The person or author the avatar stands for; the initials come from it.
  name: string;
  size?: keyof typeof sizes;
  // Empty (default) when a visible name sits next to the avatar, so screen
  // readers do not hear the name twice. Give a description when the avatar
  // stands alone.
  alt?: string;
  className?: string;
};

// A round avatar with an initials fallback. next/image computes a square,
// optimized source at the rendered size (object-cover crops non-square
// uploads); the Radix image swaps in once it has loaded, and a missing or
// deleted object keeps the initials instead of a broken image. Colors come
// from the muted and border tokens, so both system themes apply.
export function IdentityAvatar({
  kind,
  avatarId,
  name,
  size = "default",
  alt = "",
  className,
}: IdentityAvatarProps) {
  const config = sizes[size];
  const url = avatarId ? avatarPublicUrl(kind, avatarId) : null;
  const image = url
    ? getImageProps({ src: url, alt, width: config.pixels, height: config.pixels }).props
    : null;
  const labelled = alt.length > 0;

  return (
    <Avatar size={config.avatar} className={cn(config.className, className)}>
      {image ? <AvatarImage {...image} alt={alt} /> : null}
      <AvatarFallback
        // Wait briefly for a cached image so the initials do not flash.
        delayMs={image ? 400 : undefined}
        className={size === "xl" ? "text-2xl" : undefined}
        {...(labelled ? { role: "img", "aria-label": alt } : { "aria-hidden": true })}
      >
        {avatarInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
