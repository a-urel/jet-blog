"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  currentContentVersion,
  parseSubmittedBody,
} from "@/features/posts/content/schema";
import { getEditorialContext } from "@/lib/auth/editorial";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { invalidatePublicContent } from "../invalidate";
import { canPublishPosts } from "./permissions";
import { publicationErrorKey } from "./publication";
import {
  getCreditFieldValues,
  getStringField,
  getTagFieldValues,
  isUuid,
  validatePostMetadata,
  type PostFieldErrors,
} from "./validation";

// Submitted values of the uncontrolled fields. React resets a form after its
// action settles, so a rejected save hands them back as the new default values
// instead of silently reverting the user's input. Tags, credits, and the body
// editor are client state and survive on their own.
export type SubmittedPostValues = {
  title: string;
  slug: string;
  excerpt: string;
  categoryId: string;
  language: string;
};

export type PostFormState = {
  status: "idle" | "error" | "conflict";
  message: string | null;
  fieldErrors: PostFieldErrors;
  values?: SubmittedPostValues;
};

type PostMutationRow = {
  post_id: string;
  revision: number;
};

function errorState(
  message: string,
  fieldErrors: PostFieldErrors = {},
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
    tagIds: getTagFieldValues(formData),
    creditAuthorIds,
    creditSortOrders,
  };
}

// Validate metadata and the editor document together so one submission reports
// every field problem at once.
function readPostInput(formData: FormData) {
  const metadata = validatePostMetadata(readRawMetadata(formData));
  const body = parseSubmittedBody(getStringField(formData, "body"));
  const fieldErrors: PostFieldErrors = metadata.ok ? {} : { ...metadata.fieldErrors };

  if (!body.ok) {
    fieldErrors.body =
      "Yazı gövdesi desteklenmeyen içerik veya güvenli olmayan bir bağlantı içeriyor.";
  }

  if (!metadata.ok || !body.ok) {
    return { ok: false as const, fieldErrors };
  }

  return { ok: true as const, data: metadata.data, body: body.doc };
}

function mapRpcError(error: {
  code?: string;
  message?: string;
} | null): PostFormState {
  const message = error?.message ?? "";

  switch (error?.code) {
    case "42501":
      return errorState("Bu yazıyı düzenleme yetkiniz yok.");
    case "PT429":
      return errorState(
        "Kısa sürede çok fazla kayıt yapıldı. Formdaki değişiklikleriniz korundu; birkaç dakika sonra tekrar kaydedin.",
      );
    case "40001":
      return conflictState(
        "Bu yazı siz formu açtıktan sonra değişti. Formdaki değişiklikleriniz korundu; güncel sürümü açıp yeniden uygulayın.",
      );
    case "23505":
      return errorState("Bu slug zaten kullanılıyor.", {
        slug: "Bu slug zaten kullanılıyor.",
      });
    case "P0002":
      return errorState("Yazı bulunamadı veya erişim yetkiniz yok.");
    case "22023":
    case "23514":
      if (
        message.includes("post body") ||
        message.includes("content version")
      ) {
        return errorState("Yazı gövdesi geçersiz.", {
          body: "Yazı gövdesi desteklenmeyen içerik içeriyor.",
        });
      }

      if (message.includes("Invalid category")) {
        return errorState("Geçerli bir kategori seçin.", {
          categoryId: "Geçerli bir kategori seçin.",
        });
      }

      if (message.includes("Invalid tag") || message.includes("Duplicate tag")) {
        return errorState("Geçersiz etiket seçimi.", {
          tagIds: "Geçersiz etiket seçimi.",
        });
      }

      if (
        message.includes("author credit") ||
        message.includes("Author credit")
      ) {
        return errorState("Yazar sırası geçersiz.", {
          credits: "Yazar sırası geçersiz.",
        });
      }

      if (message.includes("Invalid language")) {
        return errorState("Desteklenen bir dil seçin.", {
          language: "Desteklenen bir dil seçin.",
        });
      }

      if (message.includes("Title")) {
        return errorState("Başlık geçersiz.", {
          title: "Başlık 1-200 karakter arasında olmalı.",
        });
      }

      if (message.includes("slug") || message.includes("Slug")) {
        return errorState("Slug geçersiz.", {
          slug: "Slug yalnızca küçük harf, rakam ve tek tire içerebilir.",
        });
      }

      if (message.includes("Excerpt")) {
        return errorState("Özet geçersiz.", {
          excerpt: "Özet 500 karakteri aşamaz.",
        });
      }

      if (message.includes("category")) {
        return errorState("Geçerli bir kategori seçin.", {
          categoryId: "Geçerli bir kategori seçin.",
        });
      }

      return errorState("Gönderilen bilgiler geçersiz.");
    default:
      return errorState("İşlem tamamlanamadı. Tekrar deneyin.");
  }
}

function revalidatePostPaths(postId: string) {
  revalidatePath("/admin/posts");
  revalidatePath(`/admin/posts/${postId}`);
  revalidatePath(`/admin/posts/${postId}/preview`);
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
  const context = await getEditorialContext();

  if (!context.user) {
    return errorState("Oturum bulunamadı. Yeniden giriş yapın.");
  }

  if (!context.membership) {
    return errorState("Bu işlem için editöryal üyelik gerekir.");
  }

  const validation = readPostInput(formData);

  if (!validation.ok) {
    return errorState("Formda düzeltilmesi gereken alanlar var.", validation.fieldErrors);
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
    },
  );

  if (error) {
    return mapRpcError(error);
  }

  const row = (data as PostMutationRow[] | null)?.[0];

  if (!row?.post_id) {
    return errorState("Taslak oluşturulamadı. Tekrar deneyin.");
  }

  revalidatePostPaths(row.post_id);
  redirect(`/admin/posts/${row.post_id}?status=created`);
}

async function updatePostMetadata(formData: FormData): Promise<PostFormState> {
  const context = await getEditorialContext();

  if (!context.user) {
    return errorState("Oturum bulunamadı. Yeniden giriş yapın.");
  }

  if (!context.membership) {
    return errorState("Bu işlem için editöryal üyelik gerekir.");
  }

  const postId = getStringField(formData, "postId").trim();
  const expectedRevision = Number.parseInt(
    getStringField(formData, "revision").trim(),
    10,
  );

  if (!isUuid(postId)) {
    return errorState("Geçersiz yazı kimliği.");
  }

  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    return errorState("Form sürüm bilgisi eksik. Sayfayı yenileyin.");
  }

  const validation = readPostInput(formData);

  if (!validation.ok) {
    return errorState("Formda düzeltilmesi gereken alanlar var.", validation.fieldErrors);
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
    },
  );

  if (error) {
    return mapRpcError(error);
  }

  // An editor may edit a published post directly (D3), so a save can change
  // public output. A draft save cannot. If the status cannot be read, assume
  // the post is public: an extra regeneration is cheaper than a stale page.
  const { data: saved } = await supabase
    .from("posts")
    .select("status")
    .eq("id", postId)
    .maybeSingle();

  revalidatePostPaths(postId);
  invalidatePublicContent(
    saved?.status === "draft" ? "draft-saved" : "published-post-updated",
  );
  redirect(`/admin/posts/${postId}?status=updated`);
}

async function changePublication(
  formData: FormData,
  rpc: "publish_post" | "unpublish_post",
  successStatus: "published" | "unpublished",
): Promise<never> {
  const postId = getStringField(formData, "postId").trim();
  const expectedRevision = Number.parseInt(
    getStringField(formData, "revision").trim(),
    10,
  );

  if (!isUuid(postId)) redirect("/admin/posts");

  const postPath = `/admin/posts/${postId}`;
  const context = await getEditorialContext();

  if (!context.user) redirect("/login");

  // The RPC repeats this check; the early return only avoids a round trip.
  if (!canPublishPosts(context.membership)) {
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
  invalidatePublicContent(
    rpc === "publish_post" ? "post-published" : "post-unpublished",
  );
  redirect(`${postPath}?status=${successStatus}`);
}

export async function publishPostAction(formData: FormData): Promise<void> {
  await changePublication(formData, "publish_post", "published");
}

export async function unpublishPostAction(formData: FormData): Promise<void> {
  await changePublication(formData, "unpublish_post", "unpublished");
}
