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

/** Transport that pipes a prompt through the `claude` CLI via stdin. */
export class CLITransport implements AITransport {
  async send(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn("claude", [
        "-p", "-",
        "--output-format", "text",
        "--model", MODEL,
      ], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`claude CLI exited with code ${code}: ${stderr || "(no output)"}`));
        }
      });

      child.on("error", (err) => {
        reject(new Error(`Failed to spawn claude CLI: ${err.message}`));
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }
}

/** Transport that calls the Anthropic SDK directly with an API key. */
export class SDKTransport implements AITransport {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async send(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Anthropic API returned no text content");
    }

    return textBlock.text;
  }
}

/**
 * Create the appropriate transport for the given auth method.
 *
 * Throws if API key auth is selected but no key is provided.
 */
export function createTransport(auth: AuthResult): AITransport {
  if (auth.method === "claude_cli") {
    return new CLITransport();
  }

  if (!auth.apiKey) {
    throw new Error("API key authentication selected but no key was provided");
  }

  return new SDKTransport(auth.apiKey);
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

// TODO: add response parsing and analyzeWithAI
