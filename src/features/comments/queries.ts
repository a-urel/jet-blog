import type { SupabaseClient } from "@supabase/supabase-js";

import { parsePageParam } from "@/features/posts/pagination";
import { isUuid, type CommentStatus } from "./model";

// Shared by the server data boundaries and the RLS tests. Column lists are
// explicit: user_id is not granted to clients, so "*" would fail.

export type PublicComment = {
  id: string;
  displayName: string;
  // The commenter's current profile avatar, copied by set_own_avatar(); null
  // without one and after anonymization.
  avatarId: string | null;
  body: string;
  createdAt: string;
};

export const publicCommentColumns = "id, display_name, avatar_id, body, created_at";

// RLS returns only visible comments of published posts to anonymous readers;
// the status filter keeps the same result for signed-in editors, who can read
// every status, and matches the partial (post_id, created_at) index.
export function selectVisibleComments(client: SupabaseClient, postId: string) {
  return client
    .from("comments")
    .select(publicCommentColumns)
    .eq("post_id", postId)
    .eq("status", "visible")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
}

type RawPublicComment = {
  id: string;
  display_name: string;
  avatar_id: string | null;
  body: string;
  created_at: string;
};

export function mapPublicComments(rows: unknown[] | null): PublicComment[] {
  return ((rows ?? []) as RawPublicComment[]).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    avatarId: isUuid(row.avatar_id) ? row.avatar_id : null,
    body: row.body,
    createdAt: row.created_at,
  }));
}

export type ModerationFilter = "reported" | CommentStatus;

export const moderationFilters: readonly ModerationFilter[] = [
  "reported",
  "visible",
  "hidden",
  "deleted",
];

export function isModerationFilter(value: unknown): value is ModerationFilter {
  return (
    typeof value === "string" &&
    (moderationFilters as readonly string[]).includes(value)
  );
}

export type ModerationComment = {
  id: string;
  displayName: string;
  body: string;
  status: CommentStatus;
  createdAt: string;
  post: { id: string; title: string; slug: string; status: string } | null;
  reports: { reason: string; createdAt: string }[];
};

// The queue is dynamic (session read), so pages use ?page= like /search
// rather than the path segments of the ISR listings.
export const moderationPageSize = 20;

export const moderationQueuePath = "/admin/comments";

// Missing or malformed means page 1; a page past the end is clamped by the
// page once the total is known.
export function parseModerationPage(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return (typeof raw === "string" && parsePageParam(raw)) || 1;
}

export function moderationPageCount(total: number) {
  return Math.max(1, Math.ceil(total / moderationPageSize));
}

export function moderationQueueUrl(
  filter: ModerationFilter,
  options: { page?: number; status?: string } = {},
) {
  const params = new URLSearchParams({ filter });
  if (options.page && options.page > 1) params.set("page", String(options.page));
  if (options.status) params.set("status", options.status);
  return `${moderationQueuePath}?${params.toString()}`;
}

// The moderation queue for editors and admins (RLS: comments_select_editor,
// comment_reports_select_editor). "reported" lists visible comments with at
// least one report (inner join, which the exact count respects); the other
// filters list one status. Reporter identity is not selectable. Ordered by
// id after created_at so pages do not overlap when timestamps tie.
export function selectModerationQueue(
  client: SupabaseClient,
  filter: ModerationFilter,
  page = 1,
) {
  const reports = filter === "reported" ? "comment_reports!inner" : "comment_reports";
  const status: CommentStatus = filter === "reported" ? "visible" : filter;
  const from = (page - 1) * moderationPageSize;

  return client
    .from("comments")
    .select(
      `id, display_name, body, status, created_at,
       post:posts(id, title, slug, status),
       reports:${reports}(reason, created_at)`,
      { count: "exact" },
    )
    .eq("status", status)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + moderationPageSize - 1);
}

type RawModerationComment = {
  id: string;
  display_name: string;
  body: string;
  status: CommentStatus;
  created_at: string;
  post: ModerationComment["post"] | ModerationComment["post"][];
  reports: { reason: string; created_at: string }[] | null;
};

export function mapModerationQueue(rows: unknown[] | null): ModerationComment[] {
  return ((rows ?? []) as RawModerationComment[]).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    post: (Array.isArray(row.post) ? row.post[0] : row.post) ?? null,
    reports: (row.reports ?? []).map((report) => ({
      reason: report.reason,
      createdAt: report.created_at,
    })),
  }));
}
