// Comment cache model (Next.js 16, no Cache Components).
//
// Visible comments render inside the ISR post page (/posts/[slug],
// revalidate = 300), read through the anonymous client, so they are part of
// the prerendered HTML and need no client fetch. Their Data Cache entries
// carry two tags:
//   - commentsCacheTag(postId): one post's comments. Creating, deleting,
//     hiding, restoring, or soft-deleting a comment expires only this tag
//     (updateTag, read-your-own-writes) and revalidates the post's literal
//     path, so a comment change regenerates one page instead of every post,
//     archive, and the sitemap (no listing shows comments or counts);
//   - publicCommentsCacheTag: every post's comments. Account deletion
//     anonymizes comments on any number of posts, so it expires this tag and
//     revalidates the /posts/[slug] pattern.
//
// The post itself still comes from publicPostsCacheTag; publication changes
// regenerate the page, comments included.

export const publicCommentsCacheTag = "public-comments";

export function commentsCacheTag(postId: string): string {
  return `post-comments:${postId}`;
}
