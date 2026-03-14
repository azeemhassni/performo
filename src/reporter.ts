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

// TODO: add JSON and HTML output formats
