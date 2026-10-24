import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleAlert, UserPlus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { QueryStatusToast } from "@/components/status/query-status";
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
import { signInPathFor } from "@/features/auth/return-path";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminMembers");
  return { title: t("title") };
}

type MemberRow = {
  profile_id: string;
  role: EditorialRole;
  deactivated_at: string | null;
  created_at: string;
};

const roleOptions: EditorialRole[] = ["author", "editor", "admin"];

// Query values set by src/features/members/actions.ts, mapped to catalog keys.
const successKeys = {
  "role-updated": "roleUpdated",
  "membership-updated": "membershipUpdated",
} as const;

const errorKeys = {
  invalid: "invalid",
  session: "session",
  forbidden: "forbidden",
  self: "self",
  "not-found": "missing",
  "last-admin": "lastAdmin",
  "already-member": "alreadyMember",
  unknown: "unknown",
} as const;

function knownKey<T extends Record<string, string>>(
  map: T,
  value: unknown,
): T[keyof T] | null {
  return typeof value === "string" && Object.hasOwn(map, value)
    ? map[value as keyof T]
    : null;
}

export default async function AdminMembersPage({
  searchParams,
}: PageProps<"/[locale]/admin/members">) {
  const [{ user, membership }, t, tAdmin] = await Promise.all([
    getEditorialContext(),
    getTranslations("adminMembers"),
    getTranslations("admin"),
  ]);

  if (!user) redirect(signInPathFor("/admin/members"));

  if (membership?.role !== "admin") {
    return (
      <EditorialAccessDenied
        title={t("denied.title")}
        description={t("denied.description")}
        email={user.email}
      />
    );
  }

  const { status, error } = await searchParams;
  const successKey = knownKey(successKeys, status);
  const errorKey = knownKey(errorKeys, error);
  const successMessage = successKey ? t(`status.${successKey}`) : null;
  const errorMessage = errorKey ? t(`errors.${errorKey}`) : null;

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
      memberError = t("list.loadError");
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
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>

      {successMessage ? <QueryStatusToast message={successMessage} /> : null}

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
              {t("invite.title")}
            </CardTitle>
            <CardDescription>{t("invite.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <InviteMemberForm />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("invite.secretTitle")}</CardTitle>
            <CardDescription>
              {t.rich("invite.secretDescription", {
                code: (chunks) => <code>{chunks}</code>,
              })}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("list.title")}</CardTitle>
          <CardDescription>{t("list.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {memberError ? (
            <p role="alert" className="text-sm text-destructive">
              {memberError}
            </p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("list.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">{t("list.columns.user")}</th>
                    <th className="py-2 pr-4 font-medium">{t("list.columns.role")}</th>
                    <th className="py-2 pr-4 font-medium">{t("list.columns.status")}</th>
                    <th className="py-2 font-medium">{t("list.columns.action")}</th>
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
                              <Badge variant="outline">{t("list.you")}</Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3 pr-4 align-top">
                          {isSelf ? (
                            <Badge variant="secondary">
                              {tAdmin(`roles.${member.role}`)}
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
                                {t("list.roleLabel")}
                              </label>
                              <NativeSelect
                                size="sm"
                                id={`role-${member.profile_id}`}
                                name="role"
                                defaultValue={member.role}
                              >
                                {roleOptions.map((role) => (
                                  <NativeSelectOption key={role} value={role}>
                                    {tAdmin(`roles.${role}`)}
                                  </NativeSelectOption>
                                ))}
                              </NativeSelect>
                              <Button type="submit" size="sm" variant="outline">
                                {tAdmin("form.save")}
                              </Button>
                            </form>
                          )}
                        </td>
                        <td className="py-3 pr-4 align-top">
                          {isDeactivated ? (
                            <Badge variant="destructive">{t("list.state.deactivated")}</Badge>
                          ) : isAwaitingInvite ? (
                            <Badge variant="secondary">{t("list.state.awaiting")}</Badge>
                          ) : (
                            <Badge variant="secondary">{t("list.state.active")}</Badge>
                          )}
                        </td>
                        <td className="py-3 align-top">
                          {isSelf ? (
                            <span className="text-muted-foreground">
                              {t("list.selfRow")}
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
                                {isDeactivated ? t("list.activate") : t("list.deactivate")}
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
