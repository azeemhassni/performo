import { describe, it, expect } from "vitest";
import { parseAIResponse } from "../src/ai.js";

describe("parseAIResponse", () => {
  const validReport = {
    issues: [
      {
        issue: "Render-blocking CSS",
        category: "render-blocking",
        impact: "high",
        explanation: "CSS blocks rendering",
        fix: "Inline critical CSS",
        metric_affected: ["LCP", "FCP"],
        effort: "moderate",
        perceived_vs_score: "both",
      },
    ],
    summary: "One issue found.",
  };

  it("should parse valid JSON", () => {
    const result = parseAIResponse(JSON.stringify(validReport));

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].issue).toBe("Render-blocking CSS");
    expect(result.summary).toBe("One issue found.");
  });

  it("should handle JSON wrapped in markdown code fences", () => {
    const wrapped = "```json\n" + JSON.stringify(validReport) + "\n```";
    const result = parseAIResponse(wrapped);

    expect(result.issues).toHaveLength(1);
  });

  it("should handle code fences without language tag", () => {
    const wrapped = "```\n" + JSON.stringify(validReport) + "\n```";
    const result = parseAIResponse(wrapped);

    expect(result.issues).toHaveLength(1);
  });

  it("should throw a descriptive error for invalid JSON", () => {
    expect(() => parseAIResponse("not json at all")).toThrow(
      /Failed to parse AI response as JSON/
    );
  });

  it("should include a response preview in parse errors", () => {
    expect(() => parseAIResponse("this is not json")).toThrow(/Response preview:/);
  });

  it("should throw when issues is not an array", () => {
    const bad = JSON.stringify({ issues: "not an array", summary: "" });
    expect(() => parseAIResponse(bad)).toThrow(/expected an 'issues' array/);
  });

  it("should handle extra whitespace around the response", () => {
    const padded = "\n\n  " + JSON.stringify(validReport) + "  \n\n";
    const result = parseAIResponse(padded);

    expect(result.issues).toHaveLength(1);
  });
});
