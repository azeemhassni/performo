import { writeFileSync } from "node:fs";
import chalk from "chalk";
import type { AIReport, PerformanceIssue } from "./ai.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function categorizeIssues(report: AIReport) {
  return {
    high: report.issues.filter((i) => i.impact === "high"),
    medium: report.issues.filter((i) => i.impact === "medium"),
    low: report.issues.filter((i) => i.impact === "low"),
    quickWins: report.issues.filter((i) => i.effort === "quick-win"),
  };
}

function describeImpactType(issue: PerformanceIssue): string {
  if (issue.perceived_vs_score === "both") return "perceived + score";
  if (issue.perceived_vs_score === "perceived") return "perceived performance";
  return "PageSpeed score";
}

// ---------------------------------------------------------------------------
// Terminal output
// ---------------------------------------------------------------------------

function terminalDivider(width = 50): string {
  return chalk.gray("\u2500".repeat(width));
}

function terminalImpactBadge(impact: string): string {
  const badges: Record<string, string> = {
    high: chalk.red("HIGH IMPACT"),
    medium: chalk.yellow("MEDIUM IMPACT"),
    low: chalk.green("LOW IMPACT"),
  };
  return badges[impact] || impact;
}

function terminalEffortTag(effort: string): string {
  const tags: Record<string, string> = {
    "quick-win": chalk.green("[Quick Win]"),
    moderate: chalk.yellow("[Moderate Effort]"),
    significant: chalk.red("[Significant Effort]"),
  };
  return tags[effort] || `[${effort}]`;
}

function formatTerminalIssue(issue: PerformanceIssue): string {
  const lines = [
    chalk.white("\u250C\u2500 ") + chalk.bold.white(issue.issue) + "  " + terminalEffortTag(issue.effort),
    chalk.white("\u2502  ") + chalk.gray(issue.explanation),
    chalk.white("\u2502  ") + chalk.bold("Fix: ") + chalk.white(issue.fix),
    chalk.white("\u2502  ") +
      chalk.bold("Affects: ") +
      chalk.cyan(issue.metric_affected.join(", ")) +
      chalk.gray(` (${describeImpactType(issue)})`),
    "",
  ];
  return lines.join("\n");
}

/** Print a color-formatted performance report to stdout. */
export function printReport(url: string, report: AIReport): void {
  const { high, medium, low, quickWins } = categorizeIssues(report);

  console.log();
  console.log(chalk.bold.cyan("PERFORMO") + chalk.gray(" - ") + chalk.white(url));
  console.log(terminalDivider());
  console.log();

  for (const [label, issues] of [["high", high], ["medium", medium], ["low", low]] as const) {
    if (issues.length === 0) continue;
    console.log(terminalImpactBadge(label));
    console.log();
    for (const issue of issues) {
      console.log(formatTerminalIssue(issue));
    }
  }

  if (quickWins.length > 0) {
    console.log(chalk.bold.green("QUICK WINS") + chalk.gray(" (low effort, real gains)"));
    console.log();
    for (const issue of quickWins) {
      const suffix = issue.impact === "high" ? chalk.red(" <- high impact!") : "";
      console.log(
        chalk.white("  * ") +
          chalk.white(issue.issue) +
          chalk.gray(` - ${issue.explanation}`) +
          suffix
      );
    }
    console.log();
  }

  console.log(terminalDivider());
  console.log(chalk.bold("SUMMARY"));
  console.log(
    chalk.white(
      `  Issues found: ${report.issues.length}` +
        `  |  High: ${high.length}` +
        `  |  Medium: ${medium.length}` +
        `  |  Low: ${low.length}`
    )
  );
  if (report.summary) {
    console.log(chalk.gray(`  ${report.summary}`));
  }
  console.log(chalk.gray("  Run with --json to export full report."));
  console.log();
}

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

/** Print the full report as structured JSON to stdout. */
export function printJsonReport(url: string, report: AIReport): void {
  const { high, medium, low } = categorizeIssues(report);

  const output = {
    url,
    timestamp: new Date().toISOString(),
    issues: report.issues,
    summary: report.summary,
    counts: {
      total: report.issues.length,
      high: high.length,
      medium: medium.length,
      low: low.length,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

// ---------------------------------------------------------------------------
// HTML output
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlEffortTag(effort: string): string {
  const config: Record<string, { color: string; label: string }> = {
    "quick-win": { color: "#22c55e", label: "Quick Win" },
    moderate: { color: "#eab308", label: "Moderate Effort" },
    significant: { color: "#ef4444", label: "Significant Effort" },
  };
  const { color, label } = config[effort] || { color: "#888", label: effort };
  return `<span class="effort" style="color:${color}">[${label}]</span>`;
}

function htmlImpactHeading(impact: string): string {
  const config: Record<string, { color: string; label: string }> = {
    high: { color: "#ef4444", label: "HIGH IMPACT" },
    medium: { color: "#eab308", label: "MEDIUM IMPACT" },
    low: { color: "#22c55e", label: "LOW IMPACT" },
  };
  const { color, label } = config[impact] || { color: "#888", label: impact.toUpperCase() };
  return `<span style="color:${color}">${label}</span>`;
}

function htmlIssueCard(issue: PerformanceIssue): string {
  return `
    <div class="issue-card">
      <div class="issue-header">
        <strong>${escapeHtml(issue.issue)}</strong>
        ${htmlEffortTag(issue.effort)}
      </div>
      <p class="explanation">${escapeHtml(issue.explanation)}</p>
      <div class="fix"><strong>Fix:</strong> <code>${escapeHtml(issue.fix)}</code></div>
      <div class="metrics">
        <strong>Affects:</strong>
        ${issue.metric_affected.map((m) => `<span class="metric-tag">${escapeHtml(m)}</span>`).join(" ")}
        <span class="impact-type">(${escapeHtml(describeImpactType(issue))})</span>
      </div>
    </div>`;
}

const HTML_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 820px; margin: 0 auto; padding: 2rem 1.5rem;
    background: #0a0a0a; color: #e5e5e5; line-height: 1.6;
  }
  h1 { color: #22d3ee; font-size: 1.5rem; margin-bottom: 0.25rem; }
  .url { color: #a1a1aa; font-size: 0.9rem; margin-bottom: 2rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; margin-bottom: 0.75rem;
       border-bottom: 1px solid #222; padding-bottom: 0.4rem; }
  .issue-card {
    background: #141414; border: 1px solid #262626;
    border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 0.75rem;
  }
  .issue-card:hover { border-color: #333; }
  .issue-header { display: flex; justify-content: space-between;
                  align-items: center; flex-wrap: wrap; gap: 0.5rem; }
  .issue-header strong { font-size: 0.95rem; }
  .effort { font-size: 0.8rem; white-space: nowrap; }
  .explanation { color: #a1a1aa; font-size: 0.85rem; margin: 0.5rem 0; }
  .fix { margin: 0.5rem 0; font-size: 0.85rem; }
  .fix code {
    background: #1e1e2e; padding: 0.15rem 0.4rem; border-radius: 4px;
    font-size: 0.82rem; color: #c4b5fd; word-break: break-word;
  }
  .metrics { font-size: 0.82rem; color: #a1a1aa; }
  .metric-tag {
    display: inline-block; background: #164e63; color: #22d3ee;
    padding: 0.1rem 0.45rem; border-radius: 4px;
    font-size: 0.75rem; font-weight: 600; margin-right: 0.25rem;
  }
  .impact-type { color: #666; }
  .quick-wins { background: #052e16; border-color: #14532d; }
  .quick-wins li { margin-bottom: 0.35rem; font-size: 0.88rem; }
  .quick-wins strong { color: #4ade80; }
  .summary-box {
    background: #141414; border: 1px solid #262626;
    border-radius: 8px; padding: 1rem 1.25rem; margin-top: 2rem;
  }
  .summary-box h2 { margin-top: 0; border: none; padding: 0; }
  .counts { font-size: 0.9rem; margin-bottom: 0.5rem; }
  .counts span { margin-right: 1rem; }
  .counts .high { color: #ef4444; }
  .counts .medium { color: #eab308; }
  .counts .low { color: #22c55e; }
  .summary-text { color: #a1a1aa; font-size: 0.85rem; }
  footer { margin-top: 2.5rem; color: #444; font-size: 0.75rem; text-align: center; }
`;

/**
 * Build a self-contained HTML document from the report data.
 *
 * Separated from file I/O so the HTML generation can be tested independently.
 */
export function buildHtmlDocument(url: string, report: AIReport): string {
  const { high, medium, low, quickWins } = categorizeIssues(report);
  const timestamp = new Date().toISOString();

  const sections: string[] = [];

  for (const [impact, issues] of [["high", high], ["medium", medium], ["low", low]] as const) {
    if (issues.length === 0) continue;
    sections.push(`<h2>${htmlImpactHeading(impact)}</h2>`);
    sections.push(issues.map(htmlIssueCard).join("\n"));
  }

  if (quickWins.length > 0) {
    sections.push(`
      <h2>QUICK WINS <span style="color:#666;font-weight:normal;font-size:0.85rem">(low effort, real gains)</span></h2>
      <div class="issue-card quick-wins">
        <ul>
          ${quickWins.map((i) => `<li><strong>${escapeHtml(i.issue)}</strong> - ${escapeHtml(i.explanation)}</li>`).join("\n          ")}
        </ul>
      </div>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Performo Report - ${escapeHtml(url)}</title>
<style>${HTML_STYLES}</style>
</head>
<body>
<h1>PERFORMO</h1>
<div class="url">${escapeHtml(url)} | ${escapeHtml(timestamp)}</div>

${sections.join("\n")}

<div class="summary-box">
  <h2>Summary</h2>
  <div class="counts">
    <span>Issues: <strong>${report.issues.length}</strong></span>
    <span class="high">High: ${high.length}</span>
    <span class="medium">Medium: ${medium.length}</span>
    <span class="low">Low: ${low.length}</span>
  </div>
  ${report.summary ? `<div class="summary-text">${escapeHtml(report.summary)}</div>` : ""}
</div>

<footer>Generated by performo</footer>
</body>
</html>`;
}

/**
 * Write the performance report as a self-contained HTML file.
 *
 * Throws if the file cannot be written (e.g. permission denied, invalid path).
 */
export function printHtmlReport(url: string, report: AIReport, filePath: string): void {
  const html = buildHtmlDocument(url, report);

  try {
    writeFileSync(filePath, html, "utf-8");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to write HTML report to "${filePath}": ${message}`);
  }
}
