import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleAlert, UserPlus } from "lucide-react";

import { QueryStatus } from "@/components/status/query-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { EditorialAccessDenied } from "@/features/auth/components/editorial-access-denied";
import {
  setMemberActiveAction,
  updateMemberRoleAction,
} from "@/features/members/actions";
import { InviteMemberForm } from "@/features/members/components/invite-member-form";
import {
  getEditorialContext,
  isEditorialRole,
  type EditorialRole,
} from "@/lib/auth/editorial";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  isSupabaseAdminConfigured,
  isSupabaseConfigured,
} from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Üyeler",
};

type MemberRow = {
  profile_id: string;
  role: EditorialRole;
  deactivated_at: string | null;
  created_at: string;
};

const roleLabels: Record<EditorialRole, string> = {
  admin: "Admin",
  editor: "Editör",
  author: "Yazar",
};

const successMessages: Record<string, string> = {
  "role-updated": "Rol güncellendi.",
  "membership-updated": "Üyelik durumu güncellendi.",
};

const errorMessages: Record<string, string> = {
  invalid: "Geçersiz istek.",
  session: "Oturumunuz sona ermiş. Yeniden giriş yapın.",
  forbidden: "Bu işlem için admin yetkisi gerekir.",
  self: "Kendi rolünüzü veya aktiflik durumunuzu değiştiremezsiniz.",
  "not-found": "Üye bulunamadı.",
  "last-admin": "Son aktif admin düşürülemez veya deaktive edilemez.",
  "already-member": "Bu kullanıcı zaten aktif bir üye.",
  unknown: "İşlem tamamlanamadı. Tekrar deneyin.",
};

export default async function AdminMembersPage({
  searchParams,
}: PageProps<"/admin/members">) {
  const { user, membership } = await getEditorialContext();

  if (!user) redirect("/login");

  if (membership?.role !== "admin") {
    return (
      <EditorialAccessDenied
        title="Üye yönetimi kapalı"
        description="Bu sayfa yalnızca admin rolüne açıktır."
        email={user.email}
      />
    );
  }

  const { status, error } = await searchParams;
  const successMessage =
    typeof status === "string" ? (successMessages[status] ?? null) : null;
  const errorMessage =
    typeof error === "string" ? (errorMessages[error] ?? null) : null;

  let members: MemberRow[] = [];
  let memberError: string | null = null;
  const displayNames = new Map<string, string | null>();
  const emails = new Map<string, string | null>();
  const invitedAt = new Map<string, string | null>();
  const lastSignInAt = new Map<string, string | null>();

  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("editorial_members")
      .select("profile_id, role, deactivated_at, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      memberError = "Üye listesi yüklenemedi.";
    } else {
      members = (data ?? []).flatMap((row) =>
        isEditorialRole(row.role)
          ? [
              {
                profile_id: row.profile_id,
                role: row.role,
                deactivated_at: row.deactivated_at,
                created_at: row.created_at,
              },
            ]
          : [],
      );

      const profileIds = members.map((member) => member.profile_id);

      if (profileIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", profileIds);

        profiles?.forEach((profile) => {
          displayNames.set(profile.id, profile.display_name);
        });
      }
    }
  }

  if (isSupabaseAdminConfigured()) {
    try {
      const admin = createAdminSupabaseClient();
      const { data: usersData } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      usersData?.users.forEach((authUser) => {
        emails.set(authUser.id, authUser.email ?? null);
        invitedAt.set(authUser.id, authUser.invited_at ?? null);
        lastSignInAt.set(authUser.id, authUser.last_sign_in_at ?? null);
      });
    } catch {
      // The list still renders without emails when the admin lookup fails.
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Üyeler</h1>
        <p className="text-muted-foreground">
          Editöryal üyeleri davet edin, rollerini değiştirin veya deaktive edin.
        </p>
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

      {errorMessage ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {errorMessage}
        </p>
      ) : null}

      {isSupabaseAdminConfigured() ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus aria-hidden="true" className="size-5" />
              Yeni davet
            </CardTitle>
            <CardDescription>
              Yeni bir e-posta davet edin veya mevcut bir kullanıcıya rol verin.
              Editörler üye davet edemez.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteMemberForm />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Sunucu anahtarı gerekli</CardTitle>
            <CardDescription>
              Davet göndermek için <code>.env.local</code> dosyasına yalnızca
              sunucuda kullanılan <code>SUPABASE_SECRET_KEY</code> değerini
              ekleyin.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Üye listesi</CardTitle>
          <CardDescription>
            Deaktivasyon bir sonraki istekte geçerli olur.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {memberError ? (
            <p role="alert" className="text-sm text-destructive">
              {memberError}
            </p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Henüz editöryal üye yok.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Kullanıcı</th>
                    <th className="py-2 pr-4 font-medium">Rol</th>
                    <th className="py-2 pr-4 font-medium">Durum</th>
                    <th className="py-2 font-medium">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const isSelf = member.profile_id === user.id;
                    const displayName = displayNames.get(member.profile_id);
                    const email = emails.get(member.profile_id);
                    const firstName = displayName?.trim();
                    const invited = invitedAt.get(member.profile_id);
                    const lastSignIn = lastSignInAt.get(member.profile_id);
                    const isDeactivated = Boolean(member.deactivated_at);
                    const isAwaitingInvite =
                      !isDeactivated && Boolean(invited) && !lastSignIn;

                    return (
                      <tr
                        key={member.profile_id}
                        className="border-b last:border-b-0"
                      >
                        <td className="py-3 pr-4 align-top">
                          <div className="space-y-1">
                            <p className="font-medium">
                              {firstName ?? email ?? member.profile_id}
                            </p>
                            {email && firstName ? (
                              <p className="text-muted-foreground">{email}</p>
                            ) : null}
                            {isSelf ? (
                              <Badge variant="outline">Siz</Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3 pr-4 align-top">
                          {isSelf ? (
                            <Badge variant="secondary">
                              {roleLabels[member.role]}
                            </Badge>
                          ) : (
                            <form
                              action={updateMemberRoleAction}
                              className="flex items-center gap-2"
                            >
                              <input
                                type="hidden"
                                name="profileId"
                                value={member.profile_id}
                              />
                              <label
                                className="sr-only"
                                htmlFor={`role-${member.profile_id}`}
                              >
                                Rol
                              </label>
                              <NativeSelect
                                size="sm"
                                id={`role-${member.profile_id}`}
                                name="role"
                                defaultValue={member.role}
                              >
                                <NativeSelectOption value="author">Yazar</NativeSelectOption>
                                <NativeSelectOption value="editor">Editör</NativeSelectOption>
                                <NativeSelectOption value="admin">Admin</NativeSelectOption>
                              </NativeSelect>
                              <Button type="submit" size="sm" variant="outline">
                                Kaydet
                              </Button>
                            </form>
                          )}
                        </td>
                        <td className="py-3 pr-4 align-top">
                          {isDeactivated ? (
                            <Badge variant="destructive">Pasif</Badge>
                          ) : isAwaitingInvite ? (
                            <Badge variant="secondary">Davet bekliyor</Badge>
                          ) : (
                            <Badge variant="secondary">Aktif</Badge>
                          )}
                        </td>
                        <td className="py-3 align-top">
                          {isSelf ? (
                            <span className="text-muted-foreground">
                              Kendi kaydınız
                            </span>
                          ) : (
                            <form action={setMemberActiveAction}>
                              <input
                                type="hidden"
                                name="profileId"
                                value={member.profile_id}
                              />
                              <input
                                type="hidden"
                                name="active"
                                value={isDeactivated ? "true" : "false"}
                              />
                              <Button
                                type="submit"
                                size="sm"
                                variant={isDeactivated ? "outline" : "destructive"}
                              >
                                {isDeactivated ? "Aktifleştir" : "Deaktive et"}
                              </Button>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
