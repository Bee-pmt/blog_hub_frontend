import type { BlogInput } from "@/type/type";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Markdown as MarkdownExtension } from "@tiptap/markdown";
import Markdown, { safeMarkdownUrl } from "@/components/markdown";
import {
  ApiError,
  blogImageUrl,
  localReturnPath,
  queryString,
  apiRequest,
  saveBlog,
} from "@/lib/api";
import { needsSourceMode, validatePost } from "@/lib/editor";

const cookieStore = vi.hoisted(() => ({
  get: vi.fn(() => ({ value: "refresh-cookie" })),
  set: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers({ Origin: "http://localhost:3000" }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});
describe("API contract", () => {
  it("leaves multipart Content-Type to the browser", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    const input: BlogInput = {
      title: "A story", content: "Body", tagIds: ["tag-1"], status: "draft",
      categoryId: "category-1", coverImageUrl: null,
    };
    const image = new File(["image bytes"], "cover.png", { type: "image/png" });
    await saveBlog(input, undefined, image, apiRequest);
    const options = fetcher.mock.calls[0][1];
    expect(new Headers(options.headers).has("Content-Type")).toBe(false);
    const form = options.body as FormData;
    expect(form.get("image")).toBe(image);
    expect(form.get("tagIds")).toBe('["tag-1"]');
    expect(form.get("categoryId")).toBe("category-1");
    expect(form.has("coverImageUrl")).toBe(false);
  });
  it("preserves explicit image removal through the authenticated sender", async () => {
    const saved = { id: "story-1", coverImageUrl: null };
    const send = vi.fn().mockResolvedValue(saved);
    const input: BlogInput = {
      title: "A story", content: "Body", tagIds: [], status: "draft", coverImageUrl: null,
    };
    expect(await saveBlog(input, "story-1", null, send)).toBe(saved);
    expect(send).toHaveBeenCalledWith("/blogs/story-1", {
      method: "PATCH", body: JSON.stringify(input),
    });
  });
  it("rejects unreadable successful responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid JSON")));
    await expect(apiRequest("/blogs")).rejects.toMatchObject({
      status: 200, message: "The server returned an unreadable response.",
    });
  });
  it("resolves uploaded image paths against the backend origin", () => {
    const path = "/images/12345678-1234-1234-1234-123456789abc.png";
    expect(blogImageUrl(path)).toBe(`http://localhost:5300${path}`);
    for (const path of ["//evil.test/image.png", "/images/../secret.png", "/images/image.svg", "blob:untrusted"])
      expect(blogImageUrl(path)).toBe("");
  });
  it("encodes combined filters and omits blank parameters", () => {
    const query = new URLSearchParams(
      queryString({
        q: "  hello & world  ",
        category: "မြန်မာ",
        page: 2,
        tag: "",
      }),
    );
    expect(query.get("q")).toBe("hello & world");
    expect(query.get("category")).toBe("မြန်မာ");
    expect(query.get("page")).toBe("2");
    expect(query.has("tag")).toBe(false);
  });
  it("accepts a bodyless delete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    await expect(
      apiRequest("/blogs/id", { method: "DELETE" }),
    ).resolves.toBeUndefined();
  });
  it("shows backend validation arrays", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { message: ["Title required", "Category required"] },
            { status: 400 },
          ),
        ),
    );
    await expect(apiRequest("/blogs")).rejects.toMatchObject({
      status: 400,
      message: "Title required · Category required",
    });
  });
  it("distinguishes network failures from authentication", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(apiRequest("/blogs")).rejects.toBeInstanceOf(ApiError);
    await expect(apiRequest("/blogs")).rejects.toMatchObject({ status: 0 });
  });
  it("rejects external or malformed return destinations", () => {
    for (const path of [
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "/login",
      "/\nevil",
    ])
      expect(localReturnPath(path)).toBe("/dashboard");
    expect(localReturnPath("/dashboard/posts/123/edit?draft=1")).toBe(
      "/dashboard/posts/123/edit?draft=1",
    );
  });
});
describe("authentication Server Actions", () => {
  it("validates registration on the server before calling the backend", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { submitAuthAction } = await import("@/action/action");
    const form = new FormData();
    form.set("email", "writer@test.local");
    form.set("password", "🙂".repeat(19));
    form.set("displayName", "Writer");
    const result = await submitAuthAction("register", form);
    expect(result.status).toBe(400);
    expect(result.error).toContain("72 UTF-8 bytes");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sets a frontend HttpOnly cookie and preserves backend expiry", async () => {
    const expires = "Wed, 14 Oct 2026 12:00:00 GMT";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
      { accessToken: "access", expiresIn: 3600 },
      { headers: { "Set-Cookie": `bloghub_refresh=refresh; Path=/api/v1/auth; HttpOnly; Expires=${expires}` } },
    )));
    const { submitAuthAction } = await import("@/action/action");
    const form = new FormData();
    form.set("email", " WRITER@Test.local ");
    form.set("password", "password123");
    const result = await submitAuthAction("login", form);
    expect(result.data?.accessToken).toBe("access");
    expect(cookieStore.set).toHaveBeenCalledWith("bloghub_refresh", "refresh", expect.objectContaining({
      httpOnly: true, sameSite: "lax", path: "/", expires: new Date(expires),
    }));
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).email).toBe("writer@test.local");
  });
  it("returns backend errors without clearing the cookie after a failed login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "Invalid credentials" }, { status: 401 })));
    const { submitAuthAction } = await import("@/action/action");
    const form = new FormData();
    form.set("email", "writer@test.local");
    form.set("password", "incorrect");
    expect(await submitAuthAction("login", form)).toMatchObject({ error: "Invalid credentials", status: 401, data: null });
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });
  it("clears the frontend refresh cookie after a bodyless logout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const { logoutAction } = await import("@/action/action");
    expect(await logoutAction()).toEqual({ error: "", status: 200 });
    expect(cookieStore.delete).toHaveBeenCalledWith("bloghub_refresh");
  });
  it("forwards the refresh cookie and Origin, and clears an expired session", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ message: "Expired" }, { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    const { refreshSessionAction } = await import("@/action/action");
    expect(await refreshSessionAction()).toMatchObject({ status: 401, data: null });
    const sentHeaders = new Headers(fetcher.mock.calls[0][1].headers);
    expect(sentHeaders.get("Cookie")).toBe("bloghub_refresh=refresh-cookie");
    expect(sentHeaders.get("Origin")).toBe("http://localhost:3000");
    expect(cookieStore.delete).toHaveBeenCalledWith("bloghub_refresh");
  });
});
describe("session rotation", () => {
  it("shares one refresh and uses the returned expiry", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url.endsWith("/auth/refresh")
          ? Response.json({ accessToken: "fresh", expiresIn: 3600 }, { headers: { "Set-Cookie": "bloghub_refresh=rotated; HttpOnly; Path=/api/v1/auth" } })
          : Response.json({ ok: true }),
      );
    vi.stubGlobal("fetch", fetcher);
    const session = await import("@/lib/session");
    await Promise.all([
      session.refreshSession(),
      session.refreshSession(),
      session.refreshSession(),
    ]);
    await session.authenticatedRequest("/auth/me");
    expect(
      fetcher.mock.calls.filter((call) => call[0].endsWith("/auth/refresh")),
    ).toHaveLength(1);
    expect(
      new Headers(fetcher.mock.calls[1][1].headers).get("Authorization"),
    ).toBe("Bearer fresh");
  });
  it("refreshes once for simultaneous rejected access tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit) =>
        url.endsWith("/auth/refresh")
          ? Response.json({ accessToken: "new", expiresIn: 3600 }, { headers: { "Set-Cookie": "bloghub_refresh=rotated; HttpOnly; Path=/api/v1/auth" } })
          : new Headers(options.headers).get("Authorization") === "Bearer old"
            ? Response.json({ message: "Expired" }, { status: 401 })
            : Response.json({ ok: true }),
      ),
    );
    const session = await import("@/lib/session");
    session.setSession({ accessToken: "old", expiresIn: 3600 });
    await Promise.all([
      session.authenticatedRequest("/me/blogs"),
      session.authenticatedRequest("/auth/me"),
    ]);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter((call) => String(call[0]).endsWith("/auth/refresh")),
    ).toHaveLength(1);
  });
  it("does not retry a failed mutation on a network error", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Offline"));
    vi.stubGlobal("fetch", fetcher);
    const session = await import("@/lib/session");
    session.setSession({ accessToken: "valid", expiresIn: 3600 });
    await expect(
      session.authenticatedRequest("/blogs", { method: "POST", body: "{}" }),
    ).rejects.toMatchObject({ status: 0 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("serializes cookie requests with Web Locks", async () => {
    const lock = vi.fn(async (_name, callback) => callback());
    vi.stubGlobal("navigator", { locks: { request: lock } });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ accessToken: "fresh", expiresIn: 3600 }, { headers: { "Set-Cookie": "bloghub_refresh=rotated; HttpOnly; Path=/api/v1/auth" } }),
        ),
    );
    const session = await import("@/lib/session");
    await session.refreshSession();
    expect(lock).toHaveBeenCalledWith("bloghub-session", expect.any(Function));
  });
});
describe("safe articles and writing", () => {
  it("disables raw HTML and dangerous links and images", () => {
    const result = renderToStaticMarkup(
      <Markdown
        content={
          "<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n![bad](data:image/svg+xml;base64,AA)\n\n**Good text**"
        }
      />,
    );
    expect(result).not.toContain("<script");
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("data:image");
    expect(result).toContain("<strong>Good text</strong>");
    expect(safeMarkdownUrl("//evil.test")).toBe("");
    expect(safeMarkdownUrl("https://example.test")).toBe(
      "https://example.test",
    );
  });
  it("keeps unsupported formatting in source mode", () => {
    for (const text of [
      "| A | B |\n| --- | --- |",
      "- [x] task",
      "<iframe src='x'></iframe>",
      "[x]: https://example.test",
      "~~deleted~~",
    ])
      expect(needsSourceMode(text)).toBe(true);
    expect(
      needsSourceMode(
        "## Heading\n\n**Bold**\n\n```html\n<div>example</div>\n```",
      ),
    ).toBe(false);
  });
  it("round trips supported rich text", () => {
    const content =
      "## Heading\n\n**Bold** and *italic*, `code`, [link](https://example.test).\n\n- One\n- Two\n\n> A quote\n\n```js\nconst value = 1;\n```\n\n![A picture](https://example.test/image.png)\n\n---";
    const editor = new Editor({
      extensions: [StarterKit, MarkdownExtension, Image],
      content,
      contentType: "markdown",
    });
    const markdown = editor.getMarkdown();
    for (const fragment of [
      "## Heading",
      "**Bold**",
      "*italic*",
      "`code`",
      "https://example.test",
      "- One",
      "> A quote",
      "```js",
      "const value = 1;",
      "![A picture]",
      "---",
    ])
      expect(markdown).toContain(fragment);
    const before = editor.getJSON();
    editor.commands.setContent(markdown, { contentType: "markdown" });
    const after = editor.getJSON();
    // Tiptap's trailing paragraph gives the caret a place after a divider.
    if (
      after.content?.at(-1)?.type === "paragraph" &&
      !after.content.at(-1)?.content
    )
      after.content.pop();
    expect(after).toEqual(before);
    editor.destroy();
  });
  it("allows an existing Uncategorized post, but requires a new category", () => {
    const input = {
      title: "A story",
      content: "Words",
      tagIds: [],
      coverImageUrl: null,
      status: "draft" as const,
    };
    expect(validatePost(input, false)).toBe("");
    expect(validatePost({ ...input, coverImageUrl: "/images/12345678-1234-1234-1234-123456789abc.png" }, false)).toBe("");
    expect(validatePost(input, true)).toContain("category");
    expect(
      validatePost(
        { ...input, categoryId: "cat", coverImageUrl: "javascript:alert(1)" },
        true,
      ),
    ).toContain("HTTP");
  });
});
