import { API_BASE, ApiError, apiWrapper, unwrapApiResult, type ApiWrapperOptions } from "@/lib/api-client";

export type FaqSuggestion = { id: string; question: string; category: string };
export type FaqCategory = { id: string; name: string; slug: string; createdAt: string };
export type FaqAnswer = {
  found: boolean;
  answer: string;
  matchedQuestion: string | null;
  category: string | null;
  suggestions: FaqSuggestion[];
};
export type FaqDetail = FaqSuggestion & { answer: string };

export function retryAfterTime(value: string | null, now = Date.now()) {
  if (value && /^\d+$/.test(value.trim())) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return now + seconds * 1000;
  }
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date) && date > now ? date : now + 60_000;
}

export class FaqRateLimitError extends ApiError {
  constructor(public retryAt: number) {
    super(`Too many requests. Please wait ${Math.max(1, Math.ceil((retryAt - Date.now()) / 1000))} seconds before trying again.`, 429);
  }
}

// FAQ requests are public and never pass through the authentication retry flow.
export async function faqRequest<T>(route: string, options: Pick<ApiWrapperOptions, "method" | "body" | "signal"> = {}) {
  let retryAt = 0;
  const result = await apiWrapper<T>({
    ...options,
    endpoint: `${API_BASE}/faq${route}`,
    credentials: "omit",
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)])
      : undefined,
    onResponse: (response) => {
      if (response.status === 429) retryAt = retryAfterTime(response.headers.get("Retry-After"));
    },
  });
  if (!result.ok && result.status === 429) throw new FaqRateLimitError(retryAt);
  return unwrapApiResult(result);
}
