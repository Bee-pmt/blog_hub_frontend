import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Markdown as MarkdownExtension } from "@tiptap/markdown";
import Markdown, { safeMarkdownUrl } from "@/components/markdown";
import { ApiError, localReturnPath, queryString, request } from "@/lib/api";
import { needsSourceMode, validatePost } from "@/lib/editor";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe("API contract", () => {
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
      request("/blogs/id", { method: "DELETE" }),
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
    await expect(request("/blogs")).rejects.toMatchObject({
      status: 400,
      message: "Title required · Category required",
    });
  });
  it("distinguishes network failures from authentication", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(request("/blogs")).rejects.toBeInstanceOf(ApiError);
    await expect(request("/blogs")).rejects.toMatchObject({ status: 0 });
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
describe("session rotation", () => {
  it("shares one refresh and uses the returned expiry", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url.endsWith("/auth/refresh")
          ? Response.json({ accessToken: "fresh", expiresIn: 3600 })
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
          ? Response.json({ accessToken: "new", expiresIn: 3600 })
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
          Response.json({ accessToken: "fresh", expiresIn: 3600 }),
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
    expect(validatePost(input, true)).toContain("category");
    expect(
      validatePost(
        { ...input, categoryId: "cat", coverImageUrl: "javascript:alert(1)" },
        true,
      ),
    ).toContain("HTTP");
  });
});
