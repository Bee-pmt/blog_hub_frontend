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
