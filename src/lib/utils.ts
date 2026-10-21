export function queryString(
  values: Record<string, string | number | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && String(value).trim())
      query.set(key, String(value).trim());
  const result = query.toString();
  return result ? `?${result}` : "";
}

export function httpUrl(value: string) {
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function relativeTime(value: string, now: number) {
  const seconds = Math.max(
    0,
    Math.floor((now - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return "Just now";
  const units = [
    [31536000, "year"],
    [2592000, "month"],
    [604800, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ] as const;
  const [duration, unit] = units.find(([duration]) => seconds >= duration)!;
  return new Intl.RelativeTimeFormat("en").format(
    -Math.floor(seconds / duration),
    unit,
  );
}
