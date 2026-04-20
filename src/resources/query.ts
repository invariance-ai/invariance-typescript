export interface PageOptions {
  cursor?: string;
  limit?: number;
}

export function withQuery(
  path: string,
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

export function pagePath(path: string, opts: PageOptions = {}): string {
  return withQuery(path, { cursor: opts.cursor, limit: opts.limit });
}
