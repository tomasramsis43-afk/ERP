export interface PageParams {
  page: number;
  pageSize: number;
  skip: number;
}

/** Parses ?page & ?pageSize query strings with safe bounds. */
export function parsePage(page?: string, pageSize?: string, defaultSize = 25, maxSize = 100): PageParams {
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(maxSize, Math.max(1, Number(pageSize) || defaultSize));
  return { page: p, pageSize: size, skip: (p - 1) * size };
}
