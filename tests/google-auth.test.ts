// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { NextAuthConfig } from "next-auth";
import { encode } from "next-auth/jwt";

const state = vi.hoisted(() => ({
  config: {} as NextAuthConfig,
  values: new Map<string, string>(),
  signIn: vi.fn(),
  connection: vi.fn<() => Promise<void>>(),
}));
vi.mock("next/server", () => ({ connection: state.connection }));
vi.mock("next-auth", () => ({
  default: (config: NextAuthConfig) => {
    state.config = config;
    return { handlers: {}, signIn: state.signIn };
  },
}));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      origin: "http://localhost:3000",
      cookie: [...state.values]
        .map(([key, value]) => `${key}=${value}`)
        .join("; "),
    }),
  cookies: async () => ({
    get: (name: string) =>
      state.values.has(name) ? { value: state.values.get(name) } : undefined,
    getAll: () => [...state.values].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => state.values.set(name, value),
    delete: (name: string) => state.values.delete(name),
  }),
}));
import { readGoogleHandoff } from "@/modules/auth/google";
import {
  completeGoogleAction,
  prepareGoogleAction,
  startGoogleAction,
} from "@/modules/auth/google-actions";

const secret = "test-only-google-oauth-secret-at-least-32-bytes";
async function proof(expires = Date.now() + 600_000) {
  state.values.set(
    "bloghub_google",
    await encode({
      secret,
      salt: "bloghub_google",
      maxAge: 600,
      token: { googleIdToken: "verified-id-token", googleExpiresAt: expires },
    }),
  );
}
function form(password?: string, confirmation?: string) {
  const value = new FormData();
  if (password) value.set("password", password);
  if (confirmation) value.set("confirmPassword", confirmation);
  return value;
}
function backend(step = "register", fail = false) {
  const fetcher = vi.fn<
    (url: string, options?: RequestInit) => Promise<Response>
  >(async (url) => {
    if (url.endsWith("/google/prepare"))
      return Response.json({
        step,
        email: "writer@example.com",
        displayName: "Writer",
      });
    if (fail)
      return Response.json(
        { message: "Invalid email or password" },
        { status: 401 },
      );
    if (url.endsWith("/google/link"))
      return Response.json({ message: "Linked" });
    return Response.json(
      { accessToken: "nest-access", expiresIn: 3600 },
      {
        headers: {
          "Set-Cookie":
            "bloghub_refresh=nest-refresh; Path=/api/v1/auth; HttpOnly; SameSite=Lax",
        },
      },
    );
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
beforeEach(() => {
  state.values.clear();
  vi.stubEnv("AUTH_SECRET", secret);
  vi.stubEnv("AUTH_URL", "http://localhost:3000");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Google OAuth handoff", () => {
  it("reads only an authentic encrypted, unexpired handoff cookie", async () => {
    let connected = false;
    state.connection.mockImplementation(async () => { connected = true; });
    await proof();
    expect(await readGoogleHandoff()).toBe("verified-id-token");
    expect(connected).toBe(true);
    expect(state.connection).toHaveBeenCalledOnce();
    await proof(Date.now() - 1);
    await expect(readGoogleHandoff()).rejects.toMatchObject({ status: 401 });
    state.values.set("bloghub_google", "forged-cookie");
    await expect(readGoogleHandoff()).rejects.toMatchObject({ status: 401 });
  });
  it("returns the form step without exposing the Google token", async () => {
    await proof();
    backend();
    const pending = await prepareGoogleAction();
    expect(pending).toEqual({
      step: "register",
      email: "writer@example.com",
      displayName: "Writer",
      mode: "login",
      returnTo: "/dashboard",
    });
    expect(JSON.stringify(pending)).not.toContain("verified-id-token");
  });
  it("requires matching passwords before creating a new account", async () => {
    await proof();
    const fetcher = backend();
    expect(
      (await completeGoogleAction(form("Password123!", "different"))).error,
    ).toBe("Passwords do not match.");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(state.values.has("bloghub_refresh")).toBe(false);
  });
  it("copies Nest's refresh cookie and consumes the handoff after completion", async () => {
    await proof();
    const fetcher = backend();
    const result = await completeGoogleAction(
      form("Password123!", "Password123!"),
    );
    expect(result.data).toEqual({
      accessToken: "nest-access",
      expiresIn: 3600,
    });
    expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toEqual({
      idToken: "verified-id-token",
      password: "Password123!",
    });
    expect(state.values.get("bloghub_refresh")).toBe("nest-refresh");
    expect(state.values.has("bloghub_google")).toBe(false);
    expect((await completeGoogleAction(form())).status).toBe(401);
  });
  it("keeps a failed password confirmation retryable without replacing the session", async () => {
    await proof();
    backend("link", true);
    state.values.set("bloghub_refresh", "old-session");
    const result = await completeGoogleAction(form("wrong"));
    expect(result.status).toBe(401);
    expect(state.values.get("bloghub_refresh")).toBe("old-session");
    expect(state.values.has("bloghub_google")).toBe(true);
  });
  it("allows an already linked account to log in without a password", async () => {
    await proof();
    const fetcher = backend("login");
    expect((await completeGoogleAction(form())).data?.accessToken).toBe(
      "nest-access",
    );
    expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toEqual({
      idToken: "verified-id-token",
    });
  });
  it("links from settings using the current application's Bearer token", async () => {
    await proof();
    const fetcher = backend("link");
    state.values.set(
      "bloghub_oauth_intent",
      JSON.stringify({ mode: "link", returnTo: "/settings" }),
    );
    expect((await completeGoogleAction(form("Password123!"))).status).toBe(401);
    const result = await completeGoogleAction(
      form("Password123!"),
      "current-app-access",
    );
    expect(result.error).toBe("");
    expect(result).toMatchObject({
      linked: true,
      data: null,
      returnTo: "/settings",
    });
    const request = fetcher.mock.calls.find(([url]) =>
      url.endsWith("/google/link"),
    )!;
    expect(new Headers(request[1]!.headers).get("Authorization")).toBe(
      "Bearer current-app-access",
    );
    expect(state.values.has("bloghub_refresh")).toBe(false);
  });
  it("does not expose tokens through Auth.js session JSON", async () => {
    const session = { expires: "later", user: { email: "writer@example.com" } };
    const result = await state.config.callbacks!.session!({
      session,
      token: { googleIdToken: "secret" },
    } as never);
    expect(result).toEqual({ expires: "later", user: undefined });
  });
  it("reports missing configuration without affecting password authentication", async () => {
    vi.stubEnv("AUTH_GOOGLE_ID", "");
    expect((await startGoogleAction(form())).error).toContain("not configured");
    expect(state.signIn).not.toHaveBeenCalled();
  });
});
