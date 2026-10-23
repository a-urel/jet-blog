// Core of `npm run admin:bootstrap`, kept separate from argument parsing so it
// can be unit tested with a fake Supabase client. The database function
// `bootstrap_first_admin` repeats every authorization-relevant check; the
// checks here only produce clear messages before anything is sent.

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class BootstrapError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BootstrapError";
    this.code = code;
  }
}

export function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();

  if (!emailPattern.test(email) || email.length > 320) {
    throw new BootstrapError("invalid_email", "Pass a valid email address with --email.");
  }

  return email;
}

export function normalizeSiteUrl(value) {
  let url;

  try {
    url = new URL(String(value ?? ""));
  } catch {
    throw new BootstrapError(
      "invalid_site_url",
      "Set NEXT_PUBLIC_SITE_URL (or pass --site-url) to the public site origin used in the invite link.",
    );
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BootstrapError("invalid_site_url", "The site URL must use http or https.");
  }

  return url.origin;
}

async function findUserByEmail(supabase, email) {
  const perPage = 200;

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }

  throw new BootstrapError(
    "lookup_failed",
    "Too many users to search; grant the first admin in SQL instead (see README).",
  );
}

async function assertNoActiveAdmin(supabase) {
  const { count, error } = await supabase
    .from("editorial_members")
    .select("profile_id", { count: "exact", head: true })
    .eq("role", "admin")
    .is("deactivated_at", null);

  if (error) throw error;

  if ((count ?? 0) > 0) {
    throw new BootstrapError(
      "admin_exists",
      "An active admin already exists. Invite further admins at /admin/members.",
    );
  }
}

// Grants admin to `email` when the project has no active admin. A missing user
// receives a Supabase invite email and sets a password through /auth/confirm;
// an existing user must have a confirmed (or invited) email address.
export async function bootstrapFirstAdmin({ supabase, email: rawEmail, siteUrl: rawSiteUrl }) {
  const email = normalizeEmail(rawEmail);

  await assertNoActiveAdmin(supabase);

  let user = await findUserByEmail(supabase, email);
  let invited = false;

  if (!user) {
    const siteUrl = normalizeSiteUrl(rawSiteUrl);
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/auth/confirm`,
    });

    if (error) throw error;

    user = data.user;
    invited = true;
  } else if (!user.email_confirmed_at && !user.invited_at) {
    throw new BootstrapError(
      "unconfirmed_account",
      "This email belongs to an unconfirmed account. Confirm the address first, then run the command again.",
    );
  }

  const { error } = await supabase.rpc("bootstrap_first_admin", {
    p_profile_id: user.id,
    p_invited: invited,
  });

  if (error) {
    if (error.code === "42710") {
      throw new BootstrapError(
        "admin_exists",
        "An active admin was created in the meantime. Invite further admins at /admin/members.",
      );
    }

    if (error.code === "55000") {
      throw new BootstrapError(
        "unconfirmed_account",
        "This email belongs to an unconfirmed account. Confirm the address first, then run the command again.",
      );
    }

    throw error;
  }

  return { userId: user.id, email, invited };
}
