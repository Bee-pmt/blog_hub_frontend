import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE, ApiError } from "@/lib/api-client";
import { faqRequest, FaqRateLimitError, retryAfterTime } from "@/modules/base/faq-api";

afterEach(() => vi.unstubAllGlobals());

describe("FAQ requests", () => {
  it("sends one public POST and treats found:false as a normal answer", async () => {
    const answer = { found: false, answer: "Try a related question.", matchedQuestion: null, category: null, suggestions: [] };
    const fetch = vi.fn().mockResolvedValue(Response.json(answer));
    vi.stubGlobal("fetch", fetch);
    expect(await faqRequest("/ask", { method: "POST", body: { question: "Something new" } })).toEqual(answer);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(`${API_BASE}/faq/ask`);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "omit", body: '{"question":"Something new"}', cache: "no-store" });
    expect(fetch.mock.calls[0][1].headers.has("Authorization")).toBe(false);
  });

  it.each([400, 404, 429])("does not retry a %s error", async status => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ message: "Unavailable" }, { status, headers: { "Retry-After": "12" } }));
    vi.stubGlobal("fetch", fetch);
    const before = Date.now();
    try {
      await faqRequest("/ask", { method: "POST", body: { question: "Question" } });
      expect.fail("Expected request failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(status);
      if (status === 429) {
        expect(error).toBeInstanceOf(FaqRateLimitError);
        expect((error as FaqRateLimitError).retryAt).toBeGreaterThanOrEqual(before + 12_000);
      }
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("handles network failure without retrying", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Network error"));
    vi.stubGlobal("fetch", fetch);
    await expect(faqRequest("/categories")).rejects.toMatchObject({ status: 0 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("honors Retry-After seconds and dates and uses a safe fallback", () => {
    const now = Date.parse("2026-11-03T12:00:00Z");
    expect(retryAfterTime("30", now)).toBe(now + 30_000);
    expect(retryAfterTime("Tue, 03 Nov 2026 12:02:00 GMT", now)).toBe(now + 120_000);
    expect(retryAfterTime("0", now)).toBe(now);
    for (const value of [null, "invalid", "-1", "Tue, 03 Nov 2026 11:59:00 GMT"])
      expect(retryAfterTime(value, now)).toBe(now + 60_000);
  });
});
