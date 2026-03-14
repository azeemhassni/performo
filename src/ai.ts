import { spawn } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import type { AuthResult } from "./auth.js";
import type { PageAnalysis } from "./analyzer.js";

const MODEL = "claude-sonnet-4-20250514";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single performance issue identified by the AI analysis. */
export interface PerformanceIssue {
  issue: string;
  category:
    | "render-blocking"
    | "images"
    | "fonts"
    | "scripts"
    | "caching"
    | "compression"
    | "head-order"
    | "third-party"
    | "general";
  impact: "high" | "medium" | "low";
  explanation: string;
  fix: string;
  metric_affected: string[];
  effort: "quick-win" | "moderate" | "significant";
  perceived_vs_score: "perceived" | "score" | "both";
}

/** The complete AI-generated performance report. */
export interface AIReport {
  issues: PerformanceIssue[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Transport interface
// ---------------------------------------------------------------------------

/** Sends a prompt to the AI model and returns the raw text response. */
export interface AITransport {
  send(prompt: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildPrompt(analysis: PageAnalysis, focus?: string): string {
  const focusInstruction = focus
    ? `\nFOCUS: The user specifically wants recommendations related to "${focus.toUpperCase()}". Prioritize issues related to this metric, but still mention other critical findings.\n`
    : "";

  return `You are a web performance expert. Analyze the following page data and provide a prioritized list of performance issues with actionable fixes.

${focusInstruction}
PAGE DATA:
${JSON.stringify(analysis, null, 2)}

INSTRUCTIONS:
1. Identify all performance issues based on the data provided.
2. For each issue, provide:
   - A clear, concise title
   - Category (render-blocking, images, fonts, scripts, caching, compression, head-order, third-party, general)
   - Impact level (high, medium, low). Be honest, do not inflate.
   - A brief explanation of why this matters
   - A concrete, copy-pasteable fix (actual code or config, not just advice)
   - Which Core Web Vitals metrics are affected (LCP, CLS, FID, INP, TTFB, FCP)
   - Effort level (quick-win, moderate, significant)
   - Whether this primarily improves perceived performance, PageSpeed score, or both
3. Prioritize perceived performance wins separately from raw score wins.
4. Keep recommendations surgical: targeted fixes, not full rewrites.
5. Be specific: reference actual URLs, sizes, and elements from the data.

Respond with ONLY valid JSON in this exact format:
{
  "issues": [
    {
      "issue": "string - concise title",
      "category": "string - one of the categories listed",
      "impact": "high|medium|low",
      "explanation": "string - why this matters",
      "fix": "string - concrete fix with code/config",
      "metric_affected": ["LCP", "CLS", etc],
      "effort": "quick-win|moderate|significant",
      "perceived_vs_score": "perceived|score|both"
    }
  ],
  "summary": "string - 1-2 sentence overall assessment"
}`;
}
