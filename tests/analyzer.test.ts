import { describe, it, expect } from "vitest";
import {
  formatBytes,
  resolveUrl,
  isThirdParty,
  extractAssetUrls,
  analyzePage,
} from "../src/analyzer.js";
import type { FetchedPage, FetchedAsset } from "../src/fetcher.js";

// ---------------------------------------------------------------------------
// formatBytes
// ---------------------------------------------------------------------------

describe("formatBytes", () => {
  it("should return 'unknown' for null", () => {
    expect(formatBytes(null)).toBe("unknown");
  });

  it("should format bytes below 1KB", () => {
    expect(formatBytes(512)).toBe("512B");
    expect(formatBytes(0)).toBe("0B");
  });

  it("should format kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0KB");
    expect(formatBytes(42 * 1024)).toBe("42.0KB");
  });

  it("should format megabytes", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0MB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5MB");
  });
});

// ---------------------------------------------------------------------------
// resolveUrl
// ---------------------------------------------------------------------------

describe("resolveUrl", () => {
  it("should resolve a relative path against a base URL", () => {
    expect(resolveUrl("https://example.com/page", "/style.css")).toBe(
      "https://example.com/style.css"
    );
  });

  it("should return absolute URLs unchanged", () => {
    expect(resolveUrl("https://example.com", "https://cdn.example.com/app.js")).toBe(
      "https://cdn.example.com/app.js"
    );
  });

  it("should return the raw href when URL construction fails", () => {
    expect(resolveUrl("not-a-url", "also-not-a-url")).toBe("also-not-a-url");
  });
});

// ---------------------------------------------------------------------------
// isThirdParty
// ---------------------------------------------------------------------------

describe("isThirdParty", () => {
  it("should return false for same-domain resources", () => {
    expect(isThirdParty("https://example.com", "https://example.com/app.js")).toBe(false);
  });

  it("should return false for subdomains of the same root", () => {
    expect(isThirdParty("https://www.example.com", "https://cdn.example.com/app.js")).toBe(false);
  });

  it("should return true for different root domains", () => {
    expect(isThirdParty("https://example.com", "https://cdn.other.com/tracker.js")).toBe(true);
  });

  it("should return false for unparseable URLs", () => {
    expect(isThirdParty("not-a-url", "also-not-a-url")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractAssetUrls
// ---------------------------------------------------------------------------

describe("extractAssetUrls", () => {
  it("should extract script src attributes", () => {
    const html = '<html><head><script src="/app.js"></script></head><body></body></html>';
    const assets = extractAssetUrls(html, "https://example.com");

    expect(assets).toEqual([
      { url: "https://example.com/app.js", type: "script" },
    ]);
  });

  it("should extract stylesheet hrefs", () => {
    const html = '<html><head><link rel="stylesheet" href="/style.css"></head><body></body></html>';
    const assets = extractAssetUrls(html, "https://example.com");

    expect(assets).toEqual([
      { url: "https://example.com/style.css", type: "stylesheet" },
    ]);
  });

  it("should extract preloaded fonts", () => {
    const html = '<html><head><link rel="preload" as="font" href="/font.woff2"></head><body></body></html>';
    const assets = extractAssetUrls(html, "https://example.com");

    expect(assets).toEqual([
      { url: "https://example.com/font.woff2", type: "font" },
    ]);
  });

  it("should deduplicate URLs", () => {
    const html = `<html><head>
      <script src="/app.js"></script>
      <script src="/app.js"></script>
    </head><body></body></html>`;
    const assets = extractAssetUrls(html, "https://example.com");

    expect(assets).toHaveLength(1);
  });

  it("should return an empty array for HTML with no assets", () => {
    const html = "<html><head></head><body><p>Hello</p></body></html>";
    expect(extractAssetUrls(html, "https://example.com")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// analyzePage
// ---------------------------------------------------------------------------

function makePage(html: string): FetchedPage {
  return {
    url: "https://example.com",
    finalUrl: "https://example.com",
    statusCode: 200,
    html,
    headers: {},
    timing: { totalMs: 100, ttfbMs: 50 },
  };
}

describe("analyzePage", () => {
  it("should detect render-blocking scripts", () => {
    const html = `<html><head>
      <script src="https://example.com/block.js"></script>
      <script src="https://example.com/async.js" async></script>
    </head><body></body></html>`;

    const result = analyzePage(makePage(html), []);

    const blocking = result.resources.scripts.find((s) => s.url.includes("block.js"));
    const async = result.resources.scripts.find((s) => s.url.includes("async.js"));

    expect(blocking?.renderBlocking).toBe(true);
    expect(async?.renderBlocking).toBe(false);
  });

  it("should detect images missing dimensions", () => {
    const html = `<html><body>
      <img src="/a.jpg">
      <img src="/b.jpg" width="100" height="100">
    </body></html>`;

    const result = analyzePage(makePage(html), []);
    const [imgA, imgB] = result.resources.images;

    expect(imgA.hasWidth).toBe(false);
    expect(imgA.hasHeight).toBe(false);
    expect(imgB.hasWidth).toBe(true);
    expect(imgB.hasHeight).toBe(true);
  });

  it("should detect missing charset in head", () => {
    const html = "<html><head><title>Test</title></head><body></body></html>";
    const result = analyzePage(makePage(html), []);

    expect(result.head.issues).toContain("No charset meta tag found in <head>");
  });

  it("should identify third-party scripts", () => {
    const html = `<html><head>
      <script src="https://example.com/first.js"></script>
      <script src="https://tracker.other.com/t.js"></script>
    </head><body></body></html>`;

    const result = analyzePage(makePage(html), []);

    expect(result.thirdPartyScripts).toHaveLength(1);
    expect(result.thirdPartyScripts[0].domain).toBe("tracker.other.com");
  });

  it("should extract meta information", () => {
    const html = `<html><head>
      <title>My Page</title>
      <meta name="description" content="A test page">
      <link rel="canonical" href="https://example.com">
      <meta property="og:title" content="My Page">
    </head><body></body></html>`;

    const result = analyzePage(makePage(html), []);

    expect(result.meta.title).toBe("My Page");
    expect(result.meta.description).toBe("A test page");
    expect(result.meta.hasCanonical).toBe(true);
    expect(result.meta.hasOpenGraph).toBe(true);
  });

  it("should merge fetched asset sizes into script analysis", () => {
    const html = '<html><head><script src="https://example.com/app.js"></script></head><body></body></html>';
    const assets: FetchedAsset[] = [{
      url: "https://example.com/app.js",
      type: "script",
      size: 50000,
      contentType: "application/javascript",
      headers: {},
      status: 200,
    }];

    const result = analyzePage(makePage(html), assets);

    expect(result.resources.scripts[0].size).toBe(50000);
    expect(result.resources.scripts[0].sizeFormatted).toBe("48.8KB");
    expect(result.resources.totalScriptSize).toBe(50000);
  });
});
