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
  // Authenticate
  const auth = await resolveAuth();
  if (!auth) {
    console.error(chalk.red("Authentication required."));
    console.error(AUTH_SETUP_MESSAGE);
    process.exit(1);
  }

  // Fetch page
  const fetchSpinner = ora("Fetching page...").start();
  let page;
  try {
    page = await fetchPage(targetUrl);
    fetchSpinner.succeed(
      `Fetched ${targetUrl} (${page.statusCode}, ${page.timing.ttfbMs}ms TTFB)`
    );
  } catch (err: unknown) {
    fetchSpinner.fail("Failed to fetch page");
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }

  // Inspect linked assets
  let fetchedAssets: Awaited<ReturnType<typeof fetchAssets>> = [];
  if (options.fast) {
    console.log(chalk.gray("  Skipping asset inspection (--fast mode)"));
  } else {
    const assetUrls = extractAssetUrls(page.html, targetUrl);
    if (assetUrls.length > 0) {
      const assetSpinner = ora(`Inspecting ${assetUrls.length} assets...`).start();
      try {
        fetchedAssets = await fetchAssets(assetUrls);
        assetSpinner.succeed(`Inspected ${fetchedAssets.length} assets`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        assetSpinner.warn(`Some assets could not be inspected: ${message}`);
      }
    }
  }

  // Analyze page structure
  const analyzeSpinner = ora("Analyzing page structure...").start();
  const analysis = analyzePage(page, fetchedAssets);
  analyzeSpinner.succeed("Page structure analyzed");

  // AI analysis
  const aiSpinner = ora("Claude is analyzing performance...").start();
  try {
    const transport = createTransport(auth);
    const report = await analyzeWithAI(analysis, transport, {
      focus: options.focus,
    });
    aiSpinner.succeed(`Found ${report.issues.length} performance issues`);
    return report;
  } catch (err: unknown) {
    aiSpinner.fail("AI analysis failed");
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
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
