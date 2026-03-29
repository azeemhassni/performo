# performo

A CLI tool that fetches a web page, analyzes its assets and structure using Claude AI, and outputs a prioritized performance report with concrete fixes.

Reports cover both perceived performance (how fast the page feels) and PageSpeed / Core Web Vitals scores.

## Requirements

- Node.js 18 or later
- A Claude Pro/Max subscription or an Anthropic API key

## Install

```bash
npm install -g performo
```

## Authentication

performo needs access to the Anthropic API. Pick one of the two options below.

### Option 1: Claude Pro/Max (recommended)

If you have [Claude Code](https://claude.ai/code) installed:

```bash
claude login
```

performo will use your existing Claude subscription automatically.

### Option 2: API key

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Get a key at [console.anthropic.com](https://console.anthropic.com/settings/keys).

Verify your setup:

```bash
performo --auth
```

## Usage

```bash
# Full analysis
performo https://example.com

# JSON output for piping or saving
performo https://example.com --json

# Self-contained HTML report
performo https://example.com --html
performo https://example.com --html report.html

# Fast mode: skip asset inspection, analyze HTML only
performo https://example.com --fast

# Focus on a specific metric
performo https://example.com --focus lcp
performo https://example.com --focus cls

# Check auth status
performo --auth

# Version
performo --version
```

Valid `--focus` values: `lcp`, `cls`, `fid`, `ttfb`, `inp`, `fcp`.

## How it works

1. Fetches the target page, following redirects, and records timing.
2. Sends HEAD requests to linked scripts, stylesheets, and fonts to collect sizes and headers.
3. Parses the HTML to extract performance signals: render-blocking resources, image attributes, font loading strategy, `<head>` tag order, third-party scripts, and caching headers.
4. Sends the structured analysis (not raw HTML) to Claude, which identifies issues and generates copy-pasteable fixes.
5. Outputs a prioritized report grouped by impact level.

The AI distinguishes between perceived performance improvements, PageSpeed score improvements, and quick wins vs larger changes.

## Development

```bash
git clone https://github.com/user/performo.git
cd performo
npm install
npm run build
node dist/index.js https://example.com
```

Run tests:

```bash
npm test
```

Watch mode during development:

```bash
npm run dev
```

## License

MIT
