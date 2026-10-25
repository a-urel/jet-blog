"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  currentContentVersion,
  parseSubmittedBody,
} from "@/features/posts/content/schema";
import { getEditorialContext } from "@/lib/auth/editorial";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PublicContentChange } from "../cache";
import { invalidatePublicContent } from "../invalidate";
import { canPublishPosts } from "./permissions";
import { publicationErrorKey } from "./publication";
import {
  getCreditFieldValues,
  getStringField,
  getTagFieldValues,
  isUuid,
  maxCoverAltLength,
  validatePostMetadata,
  type PostField,
  type PostFieldErrors,
  type PostValidationError,
} from "./validation";
import { revalidateLocalizedPath } from "@/lib/revalidate";

// Submitted values of the uncontrolled fields. React resets a form after its
// action settles, so a rejected save hands them back as the new default values
// instead of silently reverting the user's input. Tags, credits, the cover,
// and the body editor are client state and survive on their own.
export type SubmittedPostValues = {
  title: string;
  slug: string;
  excerpt: string;
  categoryId: string;
  language: string;
};

// Field messages already translated into the interface language.
export type PostFormFieldErrors = Partial<Record<PostField, string>>;

export type PostFormState = {
  status: "idle" | "error" | "conflict";
  message: string | null;
  fieldErrors: PostFormFieldErrors;
  values?: SubmittedPostValues;
};

type Translator = Awaited<ReturnType<typeof getTranslations<"adminPosts">>>;

type PostMutationRow = {
  post_id: string;
  revision: number;
};

function errorState(
  message: string,
  fieldErrors: PostFormFieldErrors = {},
): PostFormState {
  return { status: "error", message, fieldErrors };
}

function conflictState(message: string): PostFormState {
  return { status: "conflict", message, fieldErrors: {} };
}

function readRawMetadata(formData: FormData) {
  const { creditAuthorIds, creditSortOrders } = getCreditFieldValues(formData);

  return {
    title: getStringField(formData, "title"),
    slug: getStringField(formData, "slug"),
    excerpt: getStringField(formData, "excerpt"),
    categoryId: getStringField(formData, "categoryId"),
    language: getStringField(formData, "language"),
    coverMediaId: getStringField(formData, "coverMediaId"),
    coverAlt: getStringField(formData, "coverAlt"),
    tagIds: getTagFieldValues(formData),
    creditAuthorIds,
    creditSortOrders,
  };
}

function validationMessage(t: Translator, key: PostValidationError): string {
  return key === "coverAltTooLong"
    ? t("validation.coverAltTooLong", { max: maxCoverAltLength })
    : t(`validation.${key}`);
}

function translateFieldErrors(
  t: Translator,
  fieldErrors: PostFieldErrors,
): PostFormFieldErrors {
  const translated: PostFormFieldErrors = {};

  for (const [field, key] of Object.entries(fieldErrors) as [
    PostField,
    PostValidationError,
  ][]) {
    translated[field] = validationMessage(t, key);
  }

  return translated;
}

// Validate metadata and the editor document together so one submission reports
// every field problem at once.
function readPostInput(t: Translator, formData: FormData) {
  const metadata = validatePostMetadata(readRawMetadata(formData));
  const body = parseSubmittedBody(getStringField(formData, "body"));
  const fieldErrors = metadata.ok ? {} : translateFieldErrors(t, metadata.fieldErrors);

  if (!body.ok) {
    fieldErrors.body = t("actionErrors.bodyUnsupported");
  }

  if (!metadata.ok || !body.ok) {
    return { ok: false as const, fieldErrors };
  }

  return { ok: true as const, data: metadata.data, body: body.doc };
}

function mapRpcError(
  t: Translator,
  error: {
    code?: string;
    message?: string;
  } | null,
): PostFormState {
  const message = error?.message ?? "";

  switch (error?.code) {
    case "42501":
      return errorState(t("actionErrors.forbidden"));
    case "PT429":
      return errorState(t("actionErrors.rateLimited"));
    case "40001":
      return conflictState(t("actionErrors.conflict"));
    case "23505":
      return errorState(t("actionErrors.slugTaken"), {
        slug: t("actionErrors.slugTaken"),
      });
    case "P0002":
      return errorState(t("actionErrors.missing"));
    case "22023":
    case "23514":
      if (
        message.includes("post body") ||
        message.includes("content version")
      ) {
        return errorState(t("actionErrors.bodyInvalid"), {
          body: t("actionErrors.bodyInvalidField"),
        });
      }

      if (message.includes("Cover alt text is required")) {
        return errorState(t("actionErrors.coverAltRequired"), {
          coverAlt: t("actionErrors.coverAltRequiredField"),
        });
      }

      if (message.includes("cover alt")) {
        return errorState(t("actionErrors.coverAltInvalid"), {
          coverAlt: validationMessage(t, "coverAltTooLong"),
        });
      }

      if (message.includes("Cover") || message.includes("cover")) {
        return errorState(t("actionErrors.coverMissing"), {
          coverMediaId: t("actionErrors.coverMissingField"),
        });
      }

      if (message.includes("Invalid category")) {
        return errorState(t("validation.categoryInvalid"), {
          categoryId: t("validation.categoryInvalid"),
        });
      }

      if (message.includes("Invalid tag") || message.includes("Duplicate tag")) {
        return errorState(t("validation.tagInvalid"), {
          tagIds: t("validation.tagInvalid"),
        });
      }

      if (
        message.includes("author credit") ||
        message.includes("Author credit")
      ) {
        return errorState(t("validation.creditOrderInvalid"), {
          credits: t("validation.creditOrderInvalid"),
        });
      }

      if (message.includes("Invalid language")) {
        return errorState(t("validation.languageInvalid"), {
          language: t("validation.languageInvalid"),
        });
      }

      if (message.includes("Title")) {
        return errorState(t("actionErrors.titleInvalid"), {
          title: t("actionErrors.titleInvalidField"),
        });
      }

      if (message.includes("slug") || message.includes("Slug")) {
        return errorState(t("actionErrors.slugInvalid"), {
          slug: t("validation.slugInvalid"),
        });
      }

      if (message.includes("Excerpt")) {
        return errorState(t("actionErrors.excerptInvalid"), {
          excerpt: t("validation.excerptTooLong"),
        });
      }

      if (message.includes("category")) {
        return errorState(t("validation.categoryInvalid"), {
          categoryId: t("validation.categoryInvalid"),
        });
      }

      return errorState(t("actionErrors.invalidInput"));
    default:
      return errorState(t("actionErrors.failed"));
  }
}

function revalidatePostPaths(postId: string) {
  revalidateLocalizedPath("/admin/posts");
  revalidateLocalizedPath(`/admin/posts/${postId}`);
  revalidateLocalizedPath(`/admin/posts/${postId}/preview`);
}

function keepSubmittedValues(
  formData: FormData,
  state: PostFormState,
): PostFormState {
  return {
    ...state,
    values: {
      title: getStringField(formData, "title"),
      slug: getStringField(formData, "slug"),
      excerpt: getStringField(formData, "excerpt"),
      categoryId: getStringField(formData, "categoryId"),
      language: getStringField(formData, "language"),
    },
  };
}

// Success redirects (redirect() throws), so only rejected saves return state.
export async function createDraftPostAction(
  _previousState: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  return keepSubmittedValues(formData, await createDraftPost(formData));
}

export async function updatePostMetadataAction(
  _previousState: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  return keepSubmittedValues(formData, await updatePostMetadata(formData));
}

async function createDraftPost(formData: FormData): Promise<PostFormState> {
  const t = await getTranslations("adminPosts");
  const context = await getEditorialContext();

  if (!context.user) {
    return errorState(t("actionErrors.noSession"));
  }

  if (!context.membership) {
    return errorState(t("actionErrors.noMembership"));
  }

  const validation = readPostInput(t, formData);

  if (!validation.ok) {
    return errorState(t("actionErrors.formInvalid"), validation.fieldErrors);
  }

  const { data, error } = await (await createServerSupabaseClient()).rpc(
    "create_draft_post",
    {
      p_title: validation.data.title,
      p_slug: validation.data.slug,
      p_excerpt: validation.data.excerpt,
      p_category_id: validation.data.categoryId,
      p_tag_ids: validation.data.tagIds,
      p_credits: validation.data.credits.map((credit) => ({
        author_id: credit.authorId,
        sort_order: credit.sortOrder,
      })),
      p_body: validation.body,
      p_content_version: currentContentVersion,
      p_language: validation.data.language,
      p_cover_media_id: validation.data.coverMediaId,
      p_cover_alt: validation.data.coverAlt,
    },
  );

  if (error) {
    return mapRpcError(t, error);
  }

  const row = (data as PostMutationRow[] | null)?.[0];

  if (!row?.post_id) {
    return errorState(t("actionErrors.createFailed"));
  }

  revalidatePostPaths(row.post_id);
  redirect(`/admin/posts/${row.post_id}?status=created`);
}

async function updatePostMetadata(formData: FormData): Promise<PostFormState> {
  const t = await getTranslations("adminPosts");
  const context = await getEditorialContext();

  if (!context.user) {
    return errorState(t("actionErrors.noSession"));
  }

  if (!context.membership) {
    return errorState(t("actionErrors.noMembership"));
  }

  const postId = getStringField(formData, "postId").trim();
  const expectedRevision = Number.parseInt(
    getStringField(formData, "revision").trim(),
    10,
  );

  if (!isUuid(postId)) {
    return errorState(t("actionErrors.invalidPostId"));
  }

  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    return errorState(t("actionErrors.revisionMissing"));
  }

  const validation = readPostInput(t, formData);

  if (!validation.ok) {
    return errorState(t("actionErrors.formInvalid"), validation.fieldErrors);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc(
    "update_post_metadata",
    {
      p_post_id: postId,
      p_expected_revision: expectedRevision,
      p_title: validation.data.title,
      p_slug: validation.data.slug,
      p_excerpt: validation.data.excerpt,
      p_category_id: validation.data.categoryId,
      p_tag_ids: validation.data.tagIds,
      p_credits: validation.data.credits.map((credit) => ({
        author_id: credit.authorId,
        sort_order: credit.sortOrder,
      })),
      p_body: validation.body,
      p_content_version: currentContentVersion,
      p_language: validation.data.language,
      p_cover_media_id: validation.data.coverMediaId,
      p_cover_alt: validation.data.coverAlt,
    },
  );

  if (error) {
    return mapRpcError(t, error);
  }

  // A save changes only the working copy, also for a published post: the
  // public page keeps its snapshot until an editor republishes (Phase 26).
  revalidatePostPaths(postId);
  invalidatePublicContent("working-copy-saved");
  redirect(`/admin/posts/${postId}?status=updated`);
}

type PublicationRpc =
  | "publish_post"
  | "unpublish_post"
  | "republish_post"
  | "discard_post_changes";

const publicationOutcomes: Record<
  PublicationRpc,
  {
    change: PublicContentChange;
    status: "published" | "unpublished" | "republished" | "discarded";
    // Editors and admins only (D1). Discarding is an edit, so the RPC checks
    // the post's edit rule instead.
    editorsOnly: boolean;
  }
> = {
  publish_post: { change: "post-published", status: "published", editorsOnly: true },
  unpublish_post: { change: "post-unpublished", status: "unpublished", editorsOnly: true },
  republish_post: { change: "post-republished", status: "republished", editorsOnly: true },
  discard_post_changes: {
    change: "post-changes-discarded",
    status: "discarded",
    editorsOnly: false,
  },
};

async function changePublication(
  formData: FormData,
  rpc: PublicationRpc,
): Promise<never> {
  const postId = getStringField(formData, "postId").trim();
  const expectedRevision = Number.parseInt(
    getStringField(formData, "revision").trim(),
    10,
  );

  if (!isUuid(postId)) redirect("/admin/posts");

  const postPath = `/admin/posts/${postId}`;
  const outcome = publicationOutcomes[rpc];
  const context = await getEditorialContext();

  if (!context.user) redirect("/login");

  // The RPC repeats this check; the early return only avoids a round trip.
  if (outcome.editorsOnly ? !canPublishPosts(context.membership) : !context.membership) {
    redirect(`${postPath}?error=forbidden`);
  }

  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    redirect(`${postPath}?error=conflict`);
  }

  const { error } = await (await createServerSupabaseClient()).rpc(rpc, {
    p_post_id: postId,
    p_expected_revision: expectedRevision,
  });

  if (error) redirect(`${postPath}?error=${publicationErrorKey(error)}`);

  revalidatePostPaths(postId);
  invalidatePublicContent(outcome.change);
  redirect(`${postPath}?status=${outcome.status}`);
}

export async function publishPostAction(formData: FormData): Promise<void> {
  await changePublication(formData, "publish_post");
}

export async function unpublishPostAction(formData: FormData): Promise<void> {
  await changePublication(formData, "unpublish_post");
}

// Copies the saved working copy of a published post to the public snapshot.
export async function republishPostAction(formData: FormData): Promise<void> {
  await changePublication(formData, "republish_post");
}

// Resets the working copy of a published post to the public snapshot.
export async function discardPostChangesAction(formData: FormData): Promise<void> {
  await changePublication(formData, "discard_post_changes");
}
