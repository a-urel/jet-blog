import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, FilePlus2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listMedia } from "@/features/media/data";
import { PostForm } from "@/features/posts/admin/components/post-form";
import { listTaxonomyOptions } from "@/features/posts/admin/data";
import { emptyBodyDocument } from "@/features/posts/content/schema";
import { defaultPostLanguage } from "@/features/posts/language";
import { getEditorialContext } from "@/lib/auth/editorial";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminPosts");

  return { title: t("newPage.title") };
}

export default async function NewPostPage() {
  const { membership } = await getEditorialContext();

  if (!membership) return null;

  const [taxonomy, mediaLibrary, t] = await Promise.all([
    listTaxonomyOptions(),
    listMedia(),
    getTranslations("adminPosts"),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/posts" className="underline-offset-4 hover:underline">
            {t("shared.posts")}
          </Link>{" "}
          / {t("newPage.title")}
        </p>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <FilePlus2 aria-hidden="true" className="size-7" />
          {t("newPage.title")}
        </h1>
        <p className="text-muted-foreground">
          {t("newPage.description")}
        </p>
      </div>

      {taxonomy.error ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleAlert aria-hidden="true" className="size-5" />
              {t("shared.optionsErrorTitle")}
            </CardTitle>
            <CardDescription>
              {t("shared.optionsErrorDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/admin/posts">{t("shared.backToPosts")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("newPage.cardTitle")}</CardTitle>
            <CardDescription>
              {t("newPage.cardDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PostForm
              mode="create"
              categories={taxonomy.categories}
              tags={taxonomy.tags}
              authors={taxonomy.authors}
              media={mediaLibrary.media}
              mediaError={mediaLibrary.error}
              initialValues={{
                title: "",
                slug: "",
                excerpt: "",
                categoryId: "",
                language: defaultPostLanguage,
                coverMediaId: "",
                coverAlt: "",
                tagIds: [],
                credits: [],
                body: emptyBodyDocument,
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
