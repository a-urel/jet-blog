import { describe, expect, it } from "vitest";

import { commentsCacheTag, publicCommentsCacheTag } from "./cache";
import {
  commentBodyMaxLength,
  commentInsertErrorResult,
  isCommentReportReason,
  isCommentStatus,
  isUuid,
  moderationErrorResult,
  normalizeCommentBody,
  reportInsertErrorResult,
} from "./model";
import { isModerationFilter, mapModerationQueue, mapPublicComments } from "./queries";

describe("normalizeCommentBody", () => {
  it("trims and normalizes line endings", () => {
    expect(normalizeCommentBody("  Merhaba\r\ndünya \r ")).toEqual({
      ok: true,
      value: "Merhaba\ndünya",
    });
  });

  it("removes control characters but keeps newlines and tabs", () => {
    expect(normalizeCommentBody("a\u0000b\u0007c\td\ne\u007f")).toEqual({
      ok: true,
      value: "abc\td\ne",
    });
  });

  it("collapses runs of blank lines", () => {
    expect(normalizeCommentBody("bir\n\n\n\n\niki")).toEqual({ ok: true, value: "bir\n\niki" });
  });

  it("keeps markup as plain text", () => {
    const result = normalizeCommentBody("<script>alert(1)</script>");
    expect(result).toEqual({ ok: true, value: "<script>alert(1)</script>" });
  });

  it("refuses empty and whitespace-only bodies", () => {
    expect(normalizeCommentBody("").ok).toBe(false);
    expect(normalizeCommentBody(" \n\t \u0000").ok).toBe(false);
  });

  it("counts code points like Postgres char_length", () => {
    const emoji = "😀".repeat(commentBodyMaxLength);
    expect(emoji.length).toBe(commentBodyMaxLength * 2);
    expect(normalizeCommentBody(emoji).ok).toBe(true);
    expect(normalizeCommentBody(`${emoji}a`).ok).toBe(false);
  });
});

describe("input guards", () => {
  it("accepts UUIDs only", () => {
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(1)).toBe(false);
  });

  it("accepts known report reasons and statuses only", () => {
    expect(isCommentReportReason("spam")).toBe(true);
    expect(isCommentReportReason("dislike")).toBe(false);
    expect(isCommentStatus("hidden")).toBe(true);
    expect(isCommentStatus("published")).toBe(false);
    expect(isModerationFilter("reported")).toBe(true);
    expect(isModerationFilter("all")).toBe(false);
  });
});

describe("error mapping", () => {
  it("maps comment insert errors", () => {
    expect(commentInsertErrorResult({ code: "23502" })).toEqual({ status: "display-name-required" });
    expect(commentInsertErrorResult({ code: "42501" })).toEqual({ status: "unavailable" });
    expect(commentInsertErrorResult({ code: "23503" })).toEqual({ status: "unavailable" });
    expect(commentInsertErrorResult({ code: "PT409" })).toEqual({ status: "duplicate" });
    expect(commentInsertErrorResult({ code: "PT429" })).toEqual({ status: "rate-limited" });
    expect(commentInsertErrorResult({})).toEqual({ status: "error" });
  });

  it("treats a repeated report as the requested state", () => {
    expect(reportInsertErrorResult({ code: "23505" })).toEqual({ status: "ok" });
    expect(reportInsertErrorResult({ code: "42501" })).toEqual({ status: "unavailable" });
    expect(reportInsertErrorResult({ code: "PT429" })).toEqual({ status: "rate-limited" });
  });

  it("maps moderation errors", () => {
    expect(moderationErrorResult({ code: "42501" })).toEqual({ status: "forbidden" });
    expect(moderationErrorResult({ code: "23514" })).toEqual({ status: "unavailable" });
    expect(moderationErrorResult({ code: "P0002" })).toEqual({ status: "unavailable" });
    expect(moderationErrorResult({ code: "XX000" })).toEqual({ status: "error" });
  });
});

describe("mapping", () => {
  it("maps public comments", () => {
    const avatarId = "33333333-3333-4333-8333-333333333333";

    expect(
      mapPublicComments([
        { id: "c1", display_name: "Ayşe", avatar_id: avatarId, body: "Merhaba", created_at: "2026-10-23T10:00:00Z" },
        { id: "c2", display_name: "Silinmiş kullanıcı", avatar_id: null, body: "Selam", created_at: "2026-10-23T10:01:00Z" },
        { id: "c3", display_name: "Can", avatar_id: "../secret", body: "Hey", created_at: "2026-10-23T10:02:00Z" },
      ]),
    ).toEqual([
      { id: "c1", displayName: "Ayşe", avatarId, body: "Merhaba", createdAt: "2026-10-23T10:00:00Z" },
      { id: "c2", displayName: "Silinmiş kullanıcı", avatarId: null, body: "Selam", createdAt: "2026-10-23T10:01:00Z" },
      { id: "c3", displayName: "Can", avatarId: null, body: "Hey", createdAt: "2026-10-23T10:02:00Z" },
    ]);
    expect(mapPublicComments(null)).toEqual([]);
  });

  it("maps the moderation queue with array or object embeds", () => {
    const [comment] = mapModerationQueue([
      {
        id: "c1",
        display_name: "Ayşe",
        body: "Merhaba",
        status: "visible",
        created_at: "2026-10-23T10:00:00Z",
        post: [{ id: "p1", title: "Yazı", slug: "yazi", status: "published" }],
        reports: [{ reason: "spam", created_at: "2026-10-23T11:00:00Z" }],
      },
    ]);

    expect(comment.post?.slug).toBe("yazi");
    expect(comment.reports).toEqual([{ reason: "spam", createdAt: "2026-10-23T11:00:00Z" }]);
  });
});

describe("cache tags", () => {
  it("separates one post's comments from every post's comments", () => {
    expect(commentsCacheTag("p1")).toBe("post-comments:p1");
    expect(commentsCacheTag("p1")).not.toBe(publicCommentsCacheTag);
  });
});
