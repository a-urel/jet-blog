import type { Metadata } from "next";
import Image from "next/image";
import { CircleAlert, Trash2 } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { QueryStatus } from "@/components/status/query-status";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { deleteMediaAction } from "@/features/media/actions";
import { listMedia } from "@/features/media/data";
import { mediaPublicUrl } from "@/features/media/url";
import { getEditorialContext } from "@/lib/auth/editorial";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminMedia");
  return { title: t("title") };
}

// Query values set by src/features/media/actions.ts, mapped to catalog keys.
const successKeys = { deleted: "deleted" } as const;

const errorKeys = {
  invalid: "invalid",
  forbidden: "forbidden",
  "not-found": "missing",
  "in-use": "inUse",
  "object-remains": "objectRemains",
  "rate-limited": "rateLimited",
  failed: "failed",
} as const;

function knownKey<T extends Record<string, string>>(
  map: T,
  value: unknown,
): T[keyof T] | null {
  return typeof value === "string" && Object.hasOwn(map, value)
    ? map[value as keyof T]
    : null;
}

export default async function AdminMediaPage({
  searchParams,
}: PageProps<"/[locale]/admin/media">) {
  const { user, membership } = await getEditorialContext();

  if (!user || !membership) return null;

  const [{ status, error: errorParam }, t, tForm, format] = await Promise.all([
    searchParams,
    getTranslations("adminMedia"),
    getTranslations("admin.form"),
    getFormatter(),
  ]);
  const successKey = knownKey(successKeys, status);
  const errorKey = knownKey(errorKeys, errorParam);
  const successMessage = successKey ? t(`status.${successKey}`) : null;
  const errorMessage = errorKey ? t(`errors.${errorKey}`) : null;

  const formatSize = (bytes: number) => {
    const size = (value: number) => format.number(value, { maximumFractionDigits: 1 });
    if (bytes < 1024) return t("size.bytes", { size: size(bytes) });
    if (bytes < 1024 * 1024) return t("size.kilobytes", { size: size(bytes / 1024) });
    return t("size.megabytes", { size: size(bytes / 1024 / 1024) });
  };
  const canDeleteAny = membership.role === "admin" || membership.role === "editor";
  const { media, error } = await listMedia();

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>

      {successMessage ? (
        <QueryStatus>
          <p
            role="status"
            className="rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300"
          >
            {successMessage}
          </p>
        </QueryStatus>
      ) : null}

      {errorMessage || error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {errorMessage ?? t("loadError")}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!error && media.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : null}

          {media.length > 0 ? (
            <ul className="divide-y">
              {media.map((item) => {
                const src = mediaPublicUrl(item.id);
                const canDelete = canDeleteAny || item.uploadedBy === user.id;

                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-4 py-3"
                  >
                    {src ? (
                      <Image
                        src={src}
                        alt=""
                        width={item.width}
                        height={item.height}
                        sizes="6rem"
                        className="h-16 w-24 rounded-md border bg-muted object-cover"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1 space-y-1 text-sm">
                      <p className="truncate font-mono text-xs">{item.id}</p>
                      <p className="text-muted-foreground">
                        {item.mimeType} · {item.width}×{item.height} ·{" "}
                        {formatSize(item.sizeBytes)} ·{" "}
                        {format.dateTime(new Date(item.createdAt), "dateTimeShort")}
                      </p>
                    </div>
                    {canDelete ? (
                      <form action={deleteMediaAction}>
                        <input type="hidden" name="mediaId" value={item.id} />
                        <Button type="submit" variant="outline" size="sm">
                          <Trash2 aria-hidden="true" />
                          {tForm("delete")}
                        </Button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
