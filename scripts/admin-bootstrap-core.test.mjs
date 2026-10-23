import { describe, expect, it } from "vitest";

import {
  BootstrapError,
  bootstrapFirstAdmin,
  normalizeEmail,
  normalizeSiteUrl,
} from "./admin-bootstrap-core.mjs";

// Minimal stand-in for the supabase-js calls the bootstrap makes. It records
// every side effect so tests can assert that nothing was sent on refusal.
function fakeSupabase({
  activeAdmins = 0,
  users = [],
  rpcError = null,
  inviteError = null,
} = {}) {
  const calls = { invites: [], rpc: [] };

  return {
    calls,
    from(table) {
      expect(table).toBe("editorial_members");
      const query = {
        select: () => query,
        eq: () => query,
        is: () => Promise.resolve({ count: activeAdmins, error: null }),
      };
      return query;
    },
    auth: {
      admin: {
        async listUsers({ page }) {
          return { data: { users: page === 1 ? users : [] }, error: null };
        },
        async inviteUserByEmail(email, options) {
          calls.invites.push({ email, options });
          if (inviteError) return { data: null, error: inviteError };
          return { data: { user: { id: "invited-user", email } }, error: null };
        },
      },
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      return { data: null, error: rpcError };
    },
  };
}

async function expectBootstrapError(promise, code) {
  const error = await promise.catch((caught) => caught);
  expect(error).toBeInstanceOf(BootstrapError);
  expect(error.code).toBe(code);
}

describe("normalizeEmail", () => {
  it("trims and lower-cases", () => {
    expect(normalizeEmail("  Admin@Example.COM ")).toBe("admin@example.com");
  });

  it.each([undefined, "", "admin", "admin@", "a b@example.com"])("rejects %j", (value) => {
    expect(() => normalizeEmail(value)).toThrow(BootstrapError);
  });
});

describe("normalizeSiteUrl", () => {
  it("keeps only the origin", () => {
    expect(normalizeSiteUrl("https://blog.example.com/admin?x=1")).toBe(
      "https://blog.example.com",
    );
  });

  it.each([undefined, "blog.example.com", "javascript:alert(1)", "ftp://example.com"])(
    "rejects %j",
    (value) => {
      expect(() => normalizeSiteUrl(value)).toThrow(BootstrapError);
    },
  );
});

describe("bootstrapFirstAdmin", () => {
  it("invites a new email and grants admin", async () => {
    const supabase = fakeSupabase();

    const result = await bootstrapFirstAdmin({
      supabase,
      email: "Owner@Example.com",
      siteUrl: "https://blog.example.com/",
    });

    expect(result).toEqual({ userId: "invited-user", email: "owner@example.com", invited: true });
    expect(supabase.calls.invites).toEqual([
      {
        email: "owner@example.com",
        options: { redirectTo: "https://blog.example.com/auth/confirm" },
      },
    ]);
    expect(supabase.calls.rpc).toEqual([
      {
        name: "bootstrap_first_admin",
        args: { p_profile_id: "invited-user", p_invited: true },
      },
    ]);
  });

  it("grants admin to an existing confirmed account without inviting", async () => {
    const supabase = fakeSupabase({
      users: [{ id: "existing", email: "owner@example.com", email_confirmed_at: "2026-10-24" }],
    });

    const result = await bootstrapFirstAdmin({ supabase, email: "owner@example.com" });

    expect(result).toEqual({ userId: "existing", email: "owner@example.com", invited: false });
    expect(supabase.calls.invites).toEqual([]);
    expect(supabase.calls.rpc[0].args).toEqual({ p_profile_id: "existing", p_invited: false });
  });

  it("refuses before sending anything when an active admin exists", async () => {
    const supabase = fakeSupabase({ activeAdmins: 1 });

    await expectBootstrapError(
      bootstrapFirstAdmin({ supabase, email: "owner@example.com", siteUrl: "http://localhost:3000" }),
      "admin_exists",
    );
    expect(supabase.calls.invites).toEqual([]);
    expect(supabase.calls.rpc).toEqual([]);
  });

  it("refuses an unconfirmed self-registered account", async () => {
    const supabase = fakeSupabase({
      users: [{ id: "squatter", email: "owner@example.com", email_confirmed_at: null }],
    });

    await expectBootstrapError(
      bootstrapFirstAdmin({ supabase, email: "owner@example.com" }),
      "unconfirmed_account",
    );
    expect(supabase.calls.rpc).toEqual([]);
  });

  it("requires a valid site URL only when an invite is needed", async () => {
    const supabase = fakeSupabase();

    await expectBootstrapError(
      bootstrapFirstAdmin({ supabase, email: "owner@example.com", siteUrl: undefined }),
      "invalid_site_url",
    );
    expect(supabase.calls.invites).toEqual([]);
  });

  it("maps a concurrent admin creation in the database", async () => {
    const supabase = fakeSupabase({ rpcError: { code: "42710", message: "exists" } });

    await expectBootstrapError(
      bootstrapFirstAdmin({ supabase, email: "owner@example.com", siteUrl: "http://localhost:3000" }),
      "admin_exists",
    );
  });

  it("maps the database confirmed-account guard", async () => {
    const supabase = fakeSupabase({
      users: [{ id: "invited", email: "owner@example.com", invited_at: "2026-10-24" }],
      rpcError: { code: "55000", message: "unconfirmed" },
    });

    await expectBootstrapError(
      bootstrapFirstAdmin({ supabase, email: "owner@example.com" }),
      "unconfirmed_account",
    );
  });

  it("surfaces unexpected invite errors", async () => {
    const supabase = fakeSupabase({ inviteError: new Error("smtp down") });

    await expect(
      bootstrapFirstAdmin({ supabase, email: "owner@example.com", siteUrl: "http://localhost:3000" }),
    ).rejects.toThrow("smtp down");
    expect(supabase.calls.rpc).toEqual([]);
  });
});
