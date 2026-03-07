/** The result of fetching a page, including its HTML, headers, and timing. */
export interface FetchedPage {
  url: string;
  finalUrl: string;
  statusCode: number;
  html: string;
  headers: Record<string, string>;
  timing: {
    totalMs: number;
    ttfbMs: number;
  };
}

/** Metadata collected from a HEAD request against a single asset. */
export interface FetchedAsset {
  url: string;
  type: "script" | "stylesheet" | "image" | "font" | "other";
  size: number | null;
  contentType: string | null;
  headers: Record<string, string>;
  status: number;
  error?: string;
}

const USER_AGENT =
  "Mozilla/5.0 (compatible; Performo/1.0; +https://github.com/azeemhassni/performo)";

const ASSET_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_CONCURRENCY = 10;

/** Convert a `Headers` instance to a plain key-value record. */
function convertHeadersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

/**
 * Fetch a page by URL, following redirects, and return the full HTML with
 * response metadata and timing information.
 *
 * Throws on network errors or if the request cannot be completed.
 */
export async function fetchPage(url: string): Promise<FetchedPage> {
  const start = performance.now();

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });

  const ttfbMs = performance.now() - start;
  const html = await response.text();
  const totalMs = performance.now() - start;

  return {
    url,
    finalUrl: response.url || url,
    statusCode: response.status,
    html,
    headers: convertHeadersToRecord(response.headers),
    timing: {
      totalMs: Math.round(totalMs),
      ttfbMs: Math.round(ttfbMs),
    },
  };
}

/**
 * Send a HEAD request to a single asset URL and return its metadata.
 *
 * Errors are captured in the returned object rather than thrown, so callers
 * can process partial results without needing try/catch per asset.
 */
async function fetchAsset(
  assetUrl: string,
  type: FetchedAsset["type"]
): Promise<FetchedAsset> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ASSET_FETCH_TIMEOUT_MS);

    const response = await fetch(assetUrl, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const contentLength = response.headers.get("content-length");
    const parsedSize = contentLength ? parseInt(contentLength, 10) : NaN;

    return {
      url: assetUrl,
      type,
      size: Number.isFinite(parsedSize) ? parsedSize : null,
      contentType: response.headers.get("content-type"),
      headers: convertHeadersToRecord(response.headers),
      status: response.status,
    };
  } catch (err: unknown) {
    return {
      url: assetUrl,
      type,
      size: null,
      contentType: null,
      headers: {},
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Fetch metadata for multiple assets in parallel.
 *
 * Uses a worker pool with the given concurrency limit to avoid overwhelming
 * the target server. Individual asset failures are captured in the returned
 * `FetchedAsset.error` field rather than thrown.
 */
export async function fetchAssets(
  assets: Array<{ url: string; type: FetchedAsset["type"] }>,
  concurrency: number = DEFAULT_CONCURRENCY
): Promise<FetchedAsset[]> {
  const results: FetchedAsset[] = [];
  const queue = [...assets];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      results.push(await fetchAsset(item.url, item.type));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, assets.length) }, () => worker())
  );

  return results;
}
