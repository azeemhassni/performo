#!/usr/bin/env node

import { createRequire } from "node:module";
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { resolveAuth, getAuthStatus, AUTH_SETUP_MESSAGE } from "./auth.js";
import { fetchPage, fetchAssets } from "./fetcher.js";
import { extractAssetUrls, analyzePage } from "./analyzer.js";
import { analyzeWithAI, createTransport } from "./ai.js";
import type { AIReport } from "./ai.js";
import { printReport, printJsonReport, printHtmlReport } from "./reporter.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CliOptions {
  json?: boolean;
  html?: boolean | string;
  fast?: boolean;
  focus?: string;
  auth?: boolean;
}

const VALID_FOCUS_METRICS = ["lcp", "cls", "fid", "ttfb", "inp", "fcp"];

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

function normalizeUrl(raw: string): string {
  let url = raw;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  try {
    new URL(url);
  } catch {
    console.error(chalk.red(`Invalid URL: "${raw}"`));
    process.exit(1);
  }

  return url;
}

function validateFocusOption(focus: string | undefined): void {
  if (!focus) return;

  if (!VALID_FOCUS_METRICS.includes(focus.toLowerCase())) {
    console.error(chalk.red(`Invalid --focus value: "${focus}"`));
    console.error(chalk.gray(`Valid values: ${VALID_FOCUS_METRICS.join(", ")}`));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Core audit workflow
// ---------------------------------------------------------------------------

async function runAudit(targetUrl: string, options: CliOptions): Promise<AIReport> {
  // TODO: implement full audit pipeline
  throw new Error("Not implemented yet");
}

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("performo")
  .description("Web performance auditor powered by Claude AI")
  .version(version)
  .argument("[url]", "URL to analyze")
  .option("--json", "Output full report as JSON")
  .option("--html [file]", "Output report as HTML (default: performo-report.html)")
  .option("--fast", "Skip asset inspection, AI analysis only from HTML")
  .option("--focus <metric>", "Focus on a specific metric: lcp | cls | fid | ttfb | inp | fcp")
  .option("--auth", "Check and display current auth status")
  .action(async (url: string | undefined, options: CliOptions) => {
    if (options.auth) {
      console.log();
      console.log(chalk.bold.cyan("PERFORMO") + chalk.gray(" - Auth Status"));
      console.log();
      console.log(await getAuthStatus());
      console.log();
      return;
    }

    if (!url) {
      console.error(chalk.red("Error: URL is required."));
      console.error(chalk.gray("Usage: performo <url>"));
      process.exit(1);
    }

    const targetUrl = normalizeUrl(url);
    validateFocusOption(options.focus);

    const report = await runAudit(targetUrl, options);

    if (options.html !== undefined) {
      const filePath = typeof options.html === "string" ? options.html : "performo-report.html";
      printHtmlReport(targetUrl, report, filePath);
      console.log(chalk.green(`\n  HTML report saved to ${filePath}`));
      console.log(chalk.gray(`  Open: open ${filePath}\n`));
    } else if (options.json) {
      printJsonReport(targetUrl, report);
    } else {
      printReport(targetUrl, report);
    }
  });

program.parse();
