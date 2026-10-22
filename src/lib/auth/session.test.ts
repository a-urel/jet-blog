import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";

import { getSessionUser } from "./session";

type CookiePair = { name: string; value: string };

function createCookieStore(initial: CookiePair[] = []) {
  const values = new Map(initial.map(({ name, value }) => [name, value]));

  return {
    getAll: vi.fn(() => [...values].map(([name, value]) => ({ name, value }))),
    set: vi.fn((name: string, value: string) => {
      values.set(name, value);
    }),
  };
}

function readCookieOptions() {
  const call = mocks.createServerClient.mock.calls.at(-1);
  if (!call) throw new Error("The server client was not created.");

  return call[2] as {
    cookies: {
      getAll: () => CookiePair[];
      setAll: (
        cookiesToSet: {
          name: string;
          value: string;
          options: Record<string, unknown>;
        }[],
        headers: Record<string, string>,
      ) => void;
    };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  mocks.cookies.mockResolvedValue(createCookieStore());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createServerSupabaseClient", () => {
  it("reads cookies from the current request", async () => {
    const store = createCookieStore([
      { name: "sb-test-auth-token", value: "signed-in-token" },
    ]);
    mocks.cookies.mockResolvedValue(store);
    mocks.createServerClient.mockReturnValue({ auth: {} });

    await createServerSupabaseClient();

    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "http://127.0.0.1:54321",
      "publishable-key",
      expect.objectContaining({ cookies: expect.any(Object) }),
    );

    const options = readCookieOptions();
    expect(options.cookies.getAll()).toEqual([
      { name: "sb-test-auth-token", value: "signed-in-token" },
    ]);
  });

  it("writes refreshed cookies when the request allows it", async () => {
    const store = createCookieStore();
    mocks.cookies.mockResolvedValue(store);
    mocks.createServerClient.mockReturnValue({ auth: {} });

    await createServerSupabaseClient();

    const options = readCookieOptions();
    options.cookies.setAll(
      [{ name: "sb-test-auth-token", value: "refreshed", options: { path: "/" } }],
      { "cache-control": "private, no-store" },
    );

    expect(store.set).toHaveBeenCalledWith("sb-test-auth-token", "refreshed", {
      path: "/",
    });
  });

  it("ignores cookie writes during Server Component rendering", async () => {
    const store = createCookieStore();
    store.set.mockImplementation(() => {
      throw new Error("Cookies can only be modified in a Server Action");
    });
    mocks.cookies.mockResolvedValue(store);
    mocks.createServerClient.mockReturnValue({ auth: {} });

    await createServerSupabaseClient();
    const options = readCookieOptions();

    expect(() =>
      options.cookies.setAll(
        [{ name: "sb-test-auth-token", value: "refreshed", options: {} }],
        {},
      ),
    ).not.toThrow();
  });
});

describe("getSessionUser", () => {
  it("returns the verified claims instead of the raw session", async () => {
    const getClaims = vi.fn().mockResolvedValue({
      data: {
        claims: { sub: "user-1", email: "editor@example.com" },
        header: {},
        signature: new Uint8Array(),
      },
      error: null,
    });
    mocks.createServerClient.mockReturnValue({ auth: { getClaims } });

    await expect(getSessionUser()).resolves.toEqual({
      id: "user-1",
      email: "editor@example.com",
    });
    expect(getClaims).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing claims", { data: null, error: null }],
    [
      "an auth error",
      { data: null, error: new Error("invalid token") },
    ],
  ])("returns null for %s", async (_label, result) => {
    mocks.createServerClient.mockReturnValue({
      auth: { getClaims: vi.fn().mockResolvedValue(result) },
    });

    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("returns null when the token has no subject", async () => {
    mocks.createServerClient.mockReturnValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { email: "editor@example.com" } },
          error: null,
        }),
      },
    });

    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("does not create a client when Supabase is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    await expect(getSessionUser()).resolves.toBeNull();
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });
});
