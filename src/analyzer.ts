import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { FetchedPage, FetchedAsset } from "./fetcher.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Size and loading attributes of a linked script or stylesheet. */
export interface ResourceInfo {
  url: string;
  type: string;
  size: number | null;
  sizeFormatted: string;
  renderBlocking: boolean;
  attributes: Record<string, string>;
}

/** Attributes of an `<img>` element relevant to performance and CLS. */
export interface ImageInfo {
  src: string;
  hasWidth: boolean;
  hasHeight: boolean;
  hasLoading: boolean;
  loadingValue: string | null;
  hasFetchPriority: boolean;
  fetchPriorityValue: string | null;
  alt: string | null;
  format: string | null;
}

/** Font loading configuration derived from `<link>` and `@font-face` rules. */
export interface FontInfo {
  url: string;
  hasPreconnect: boolean;
  hasPreload: boolean;
  fontDisplay: string | null;
}

/** A script loaded from a third-party domain. */
export interface ThirdPartyScript {
  url: string;
  domain: string;
  size: number | null;
  isAsync: boolean;
  isDefer: boolean;
  position: "head" | "body";
}

/** Structure and ordering of elements in the document `<head>`. */
export interface HeadAnalysis {
  elements: Array<{
    tag: string;
    attributes: Record<string, string>;
    position: number;
  }>;
  hasCharsetEarly: boolean;
  hasViewport: boolean;
  titlePosition: number | null;
  issues: string[];
}

/** Aggregated performance-relevant data extracted from a fetched page. */
export interface PageAnalysis {
  url: string;
  timing: { totalMs: number; ttfbMs: number };
  headers: {
    cacheControl: string | null;
    contentEncoding: string | null;
    server: string | null;
    xPoweredBy: string | null;
    strictTransportSecurity: string | null;
    contentSecurityPolicy: string | null;
  };
  resources: {
    scripts: ResourceInfo[];
    stylesheets: ResourceInfo[];
    images: ImageInfo[];
    fonts: FontInfo[];
    totalScriptSize: number;
    totalStylesheetSize: number;
    totalImageCount: number;
    totalFontCount: number;
  };
  head: HeadAnalysis;
  thirdPartyScripts: ThirdPartyScript[];
  inlineStyles: { count: number; totalLength: number };
  inlineScripts: { count: number; totalLength: number };
  meta: {
    title: string | null;
    description: string | null;
    hasCanonical: boolean;
    hasOpenGraph: boolean;
  };
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

const IMAGE_FORMAT_MAP: Record<string, string> = {
  jpg: "JPEG",
  jpeg: "JPEG",
  png: "PNG",
  gif: "GIF",
  webp: "WebP",
  avif: "AVIF",
  svg: "SVG",
  ico: "ICO",
};

/** Format a byte count as a human-readable string (e.g. "42.1KB"). */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "unknown";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Resolve a potentially relative `href` against a base URL.
 *
 * Returns the raw href unchanged when the URL constructor fails. This is
 * intentional: broken hrefs are passed through so callers can still log them.
 */
export function resolveUrl(base: string, href: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

/**
 * Determine whether a resource URL belongs to a different root domain than the page.
 *
 * Returns false for unparseable URLs so they are treated as first-party by default.
 */
export function isThirdParty(pageUrl: string, resourceUrl: string): boolean {
  try {
    const pageRoot = extractRootDomain(new URL(pageUrl).hostname);
    const resourceRoot = extractRootDomain(new URL(resourceUrl).hostname);
    return pageRoot !== resourceRoot;
  } catch {
    return false;
  }
}

/** Extract the registrable domain from a hostname (e.g. "www.example.com" -> "example.com"). */
function extractRootDomain(hostname: string): string {
  return hostname.split(".").slice(-2).join(".");
}

/** Extract the hostname from a URL, returning the raw string on parse failure. */
function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Infer the image format from a URL's file extension. */
function getImageFormat(src: string): string | null {
  const ext = src.split("?")[0].split(".").pop()?.toLowerCase();
  if (!ext) return null;
  return IMAGE_FORMAT_MAP[ext] || null;
}

// ---------------------------------------------------------------------------
// Extraction: asset URLs for fetching
// ---------------------------------------------------------------------------

/**
 * Extract URLs of linked scripts, stylesheets, and preloaded fonts from HTML.
 *
 * Returned URLs are resolved against the page URL and deduplicated.
 */
export function extractAssetUrls(
  html: string,
  pageUrl: string
): Array<{ url: string; type: "script" | "stylesheet" | "image" | "font" }> {
  const $ = cheerio.load(html);
  const assets: Array<{
    url: string;
    type: "script" | "stylesheet" | "image" | "font";
  }> = [];
  const seen = new Set<string>();

  function add(url: string, type: "script" | "stylesheet" | "image" | "font"): void {
    const resolved = resolveUrl(pageUrl, url);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      assets.push({ url: resolved, type });
    }
  }

  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) add(src, "script");
  });

  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) add(href, "stylesheet");
  });

  $('link[rel="preload"][as="font"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) add(href, "font");
  });

  return assets;
}

// ---------------------------------------------------------------------------
// Analysis: individual concerns
// ---------------------------------------------------------------------------

function analyzeScripts(
  $: CheerioAPI,
  pageUrl: string,
  assetMap: Map<string, FetchedAsset>
): ResourceInfo[] {
  const scripts: ResourceInfo[] = [];

  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    const resolved = resolveUrl(pageUrl, src);
    const asset = assetMap.get(resolved);
    const isAsync = $(el).attr("async") !== undefined;
    const isDefer = $(el).attr("defer") !== undefined;

    scripts.push({
      url: resolved,
      type: "script",
      size: asset?.size ?? null,
      sizeFormatted: formatBytes(asset?.size ?? null),
      renderBlocking: !isAsync && !isDefer,
      attributes: {
        ...(isAsync ? { async: "true" } : {}),
        ...(isDefer ? { defer: "true" } : {}),
        ...($(el).attr("type") ? { type: $(el).attr("type")! } : {}),
      },
    });
  });

  return scripts;
}

function analyzeStylesheets(
  $: CheerioAPI,
  pageUrl: string,
  assetMap: Map<string, FetchedAsset>
): ResourceInfo[] {
  const stylesheets: ResourceInfo[] = [];

  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const resolved = resolveUrl(pageUrl, href);
    const asset = assetMap.get(resolved);
    const media = $(el).attr("media");

    stylesheets.push({
      url: resolved,
      type: "stylesheet",
      size: asset?.size ?? null,
      sizeFormatted: formatBytes(asset?.size ?? null),
      renderBlocking: !media || media === "all",
      attributes: media ? { media } : {},
    });
  });

  return stylesheets;
}

function analyzeImages($: CheerioAPI, pageUrl: string): ImageInfo[] {
  const images: ImageInfo[] = [];

  $("img").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src") || "";
    images.push({
      src: src ? resolveUrl(pageUrl, src) : "",
      hasWidth: $(el).attr("width") !== undefined,
      hasHeight: $(el).attr("height") !== undefined,
      hasLoading: $(el).attr("loading") !== undefined,
      loadingValue: $(el).attr("loading") || null,
      hasFetchPriority: $(el).attr("fetchpriority") !== undefined,
      fetchPriorityValue: $(el).attr("fetchpriority") || null,
      alt: $(el).attr("alt") ?? null,
      format: getImageFormat(src),
    });
  });

  return images;
}

function analyzeFonts($: CheerioAPI, pageUrl: string): FontInfo[] {
  const preconnectDomains = new Set<string>();
  $('link[rel="preconnect"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) preconnectDomains.add(getDomain(href));
  });

  const fonts: FontInfo[] = [];
  $('link[rel="preload"][as="font"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const resolved = resolveUrl(pageUrl, href);
    fonts.push({
      url: resolved,
      hasPreconnect: preconnectDomains.has(getDomain(resolved)),
      hasPreload: true,
      fontDisplay: null,
    });
  });

  // Attempt to read font-display values from inline @font-face rules.
  const inlineStyleContent = $("style")
    .map((_, el) => $(el).html())
    .get()
    .join("\n");
  const fontDisplayMatches = inlineStyleContent.match(/font-display\s*:\s*(\w+)/g);
  if (fontDisplayMatches && fonts.length > 0) {
    const values = fontDisplayMatches.map((m) => m.split(":")[1].trim());
    fonts.forEach((f, i) => {
      f.fontDisplay = values[i] || values[0] || null;
    });
  }

  return fonts;
}

function findThirdPartyScripts(
  $: CheerioAPI,
  pageUrl: string,
  assetMap: Map<string, FetchedAsset>
): ThirdPartyScript[] {
  const results: ThirdPartyScript[] = [];

  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    const resolved = resolveUrl(pageUrl, src);
    if (!isThirdParty(pageUrl, resolved)) return;

    const asset = assetMap.get(resolved);
    const inHead = $(el).parents("head").length > 0;

    results.push({
      url: resolved,
      domain: getDomain(resolved),
      size: asset?.size ?? null,
      isAsync: $(el).attr("async") !== undefined,
      isDefer: $(el).attr("defer") !== undefined,
      position: inHead ? "head" : "body",
    });
  });

  return results;
}

function analyzeHead($: CheerioAPI): HeadAnalysis {
  const elements: HeadAnalysis["elements"] = [];
  let position = 0;

  $("head")
    .children()
    .each((_, el) => {
      const node = el as unknown as { tagName: string; attribs?: Record<string, string> };
      const attrs: Record<string, string> = {};
      for (const [key, value] of Object.entries(node.attribs || {})) {
        attrs[key] = String(value);
      }
      elements.push({ tag: node.tagName, attributes: attrs, position: position++ });
    });

  const charsetEl = elements.find(
    (e) => e.tag === "meta" && (e.attributes.charset || e.attributes.Charset)
  );
  const titleEl = elements.find((e) => e.tag === "title");
  const viewportEl = elements.find(
    (e) => e.tag === "meta" && e.attributes.name?.toLowerCase() === "viewport"
  );

  const issues: string[] = [];
  if (!charsetEl) {
    issues.push("No charset meta tag found in <head>");
  } else if (charsetEl.position > 0) {
    issues.push("charset declaration is not the first element in <head>");
  }
  if (!viewportEl) {
    issues.push("No viewport meta tag found");
  }

  return {
    elements,
    hasCharsetEarly: charsetEl ? charsetEl.position <= 1 : false,
    hasViewport: !!viewportEl,
    titlePosition: titleEl ? titleEl.position : null,
    issues,
  };
}

function countInlineResources($: CheerioAPI): {
  styles: { count: number; totalLength: number };
  scripts: { count: number; totalLength: number };
} {
  let styleCount = 0;
  let styleLength = 0;
  $("style").each((_, el) => {
    styleCount++;
    styleLength += ($(el).html() || "").length;
  });

  let scriptCount = 0;
  let scriptLength = 0;
  $("script:not([src])").each((_, el) => {
    scriptCount++;
    scriptLength += ($(el).html() || "").length;
  });

  return {
    styles: { count: styleCount, totalLength: styleLength },
    scripts: { count: scriptCount, totalLength: scriptLength },
  };
}

function extractMeta($: CheerioAPI): PageAnalysis["meta"] {
  return {
    title: $("title").text() || null,
    description: $('meta[name="description"]').attr("content") || null,
    hasCanonical: $('link[rel="canonical"]').length > 0,
    hasOpenGraph: $('meta[property^="og:"]').length > 0,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Perform static analysis on a fetched page and its assets.
 *
 * Extracts performance-relevant signals from the HTML structure, linked
 * resources, and response headers. Does not execute JavaScript or measure
 * runtime metrics.
 */
export function analyzePage(
  page: FetchedPage,
  fetchedAssets: FetchedAsset[]
): PageAnalysis {
  const $ = cheerio.load(page.html);
  const assetMap = new Map(fetchedAssets.map((a) => [a.url, a]));

  const scripts = analyzeScripts($, page.url, assetMap);
  const stylesheets = analyzeStylesheets($, page.url, assetMap);
  const images = analyzeImages($, page.url);
  const fonts = analyzeFonts($, page.url);
  const thirdPartyScripts = findThirdPartyScripts($, page.url, assetMap);
  const head = analyzeHead($);
  const inline = countInlineResources($);
  const meta = extractMeta($);

  return {
    url: page.url,
    timing: page.timing,
    headers: {
      cacheControl: page.headers["cache-control"] || null,
      contentEncoding: page.headers["content-encoding"] || null,
      server: page.headers["server"] || null,
      xPoweredBy: page.headers["x-powered-by"] || null,
      strictTransportSecurity: page.headers["strict-transport-security"] || null,
      contentSecurityPolicy: page.headers["content-security-policy"] || null,
    },
    resources: {
      scripts,
      stylesheets,
      images,
      fonts,
      totalScriptSize: scripts.reduce((sum, s) => sum + (s.size || 0), 0),
      totalStylesheetSize: stylesheets.reduce((sum, s) => sum + (s.size || 0), 0),
      totalImageCount: images.length,
      totalFontCount: fonts.length,
    },
    head,
    thirdPartyScripts,
    inlineStyles: inline.styles,
    inlineScripts: inline.scripts,
    meta,
  };
}
