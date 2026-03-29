import { describe, it, expect } from "vitest";
import { buildHtmlDocument } from "../src/reporter.js";
import type { AIReport } from "../src/ai.js";

function makeReport(overrides: Partial<AIReport> = {}): AIReport {
  return {
    issues: [
      {
        issue: "Test issue",
        category: "general",
        impact: "high",
        explanation: "This is a test",
        fix: "Fix the thing",
        metric_affected: ["LCP"],
        effort: "quick-win",
        perceived_vs_score: "both",
      },
    ],
    summary: "Test summary",
    ...overrides,
  };
}

describe("buildHtmlDocument", () => {
  it("should produce valid HTML with doctype", () => {
    const html = buildHtmlDocument("https://example.com", makeReport());
    expect(html).toMatch(/^<!DOCTYPE html>/);
  });

  it("should include the target URL in the output", () => {
    const html = buildHtmlDocument("https://example.com", makeReport());
    expect(html).toContain("https://example.com");
  });

  it("should include the issue title", () => {
    const html = buildHtmlDocument("https://example.com", makeReport());
    expect(html).toContain("Test issue");
  });

  it("should include the summary", () => {
    const html = buildHtmlDocument("https://example.com", makeReport());
    expect(html).toContain("Test summary");
  });

  it("should escape HTML entities in issue content", () => {
    const report = makeReport({
      issues: [
        {
          issue: 'Add <link rel="preload">',
          category: "general",
          impact: "medium",
          explanation: "Test with <script>alert(1)</script>",
          fix: 'Use "quotes" & ampersands',
          metric_affected: ["LCP"],
          effort: "quick-win",
          perceived_vs_score: "score",
        },
      ],
    });
    const html = buildHtmlDocument("https://example.com", report);

    expect(html).toContain("&lt;link rel=&quot;preload&quot;&gt;");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&amp; ampersands");
  });

  it("should handle an empty issues array", () => {
    const report = makeReport({ issues: [], summary: "No issues found" });
    const html = buildHtmlDocument("https://example.com", report);

    expect(html).toContain("Issues: <strong>0</strong>");
    expect(html).toContain("No issues found");
  });

  it("should show correct issue counts by impact level", () => {
    const report = makeReport({
      issues: [
        { issue: "A", category: "general", impact: "high", explanation: "", fix: "", metric_affected: [], effort: "quick-win", perceived_vs_score: "both" },
        { issue: "B", category: "general", impact: "high", explanation: "", fix: "", metric_affected: [], effort: "moderate", perceived_vs_score: "both" },
        { issue: "C", category: "general", impact: "medium", explanation: "", fix: "", metric_affected: [], effort: "moderate", perceived_vs_score: "score" },
        { issue: "D", category: "general", impact: "low", explanation: "", fix: "", metric_affected: [], effort: "significant", perceived_vs_score: "perceived" },
      ],
    });
    const html = buildHtmlDocument("https://example.com", report);

    expect(html).toContain("Issues: <strong>4</strong>");
    expect(html).toContain("High: 2");
    expect(html).toContain("Medium: 1");
    expect(html).toContain("Low: 1");
  });
});
