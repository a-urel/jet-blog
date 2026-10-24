import { listPublishedPostPage } from "@/features/posts/data";
import { HomeListing, homeListingMetadata } from "./home-listing";

// Prerendered from published rows and regenerated on demand: publication
// Server Actions call revalidatePath("/") and revalidatePath("/page/[page]").
// The interval is only a fallback for changes made outside the application
// (for example service-role scripts).
export const revalidate = 300;

export const metadata = homeListingMetadata(1);

export default async function Home() {
  // Page 1 always exists; an empty listing renders its empty state.
  const posts = await listPublishedPostPage(1);
  return posts ? <HomeListing posts={posts} /> : null;
}
