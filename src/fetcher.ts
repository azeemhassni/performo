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
  "Mozilla/5.0 (compatible; Performo/1.0; +https://github.com/performo)";

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

// TODO: asset fetching with concurrency pool
