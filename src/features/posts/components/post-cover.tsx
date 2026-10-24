import Image from "next/image";

import { mediaPublicUrl } from "@/features/media/url";
import { cn } from "@/lib/utils";

// Cover image shared by the post page, listing cards, and the member preview.
// The 16:9 box reserves the space before the image loads, so there is no
// layout shift and no media dimensions are needed (readers cannot read media
// rows). Without a configured Supabase URL nothing renders.
export function PostCover({
  mediaId,
  alt,
  sizes,
  preload = false,
  className,
}: {
  mediaId: string;
  alt: string;
  sizes: string;
  preload?: boolean;
  className?: string;
}) {
  const src = mediaPublicUrl(mediaId);
  if (!src) return null;

  return (
    <div className={cn("relative aspect-video overflow-hidden bg-muted", className)}>
      <Image src={src} alt={alt} fill sizes={sizes} preload={preload} className="object-cover" />
    </div>
  );
}
