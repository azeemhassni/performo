import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Resolved authentication credentials for the Anthropic API. */
export interface AuthResult {
  method: "claude_cli" | "api_key";
  apiKey?: string;
}

interface ClaudeAuthStatus {
  loggedIn: boolean;
  email?: string;
  subscriptionType?: string;
}

/**
 * Check whether the `claude` CLI is installed and has an active session.
 *
 * Returns the parsed status on success, or null if the CLI is missing or
 * returns unexpected output.
 */
async function getClaudeCLIStatus(): Promise<ClaudeAuthStatus | null> {
  try {
    const { stdout } = await execFileAsync("claude", ["auth", "status"], {
      timeout: 10_000,
    });
    return JSON.parse(stdout) as ClaudeAuthStatus;
  } catch (err: unknown) {
    const isNotFound =
      err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT";
    if (!isNotFound) {
      // CLI exists but returned an error or non-JSON output.
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `Warning: claude CLI returned an unexpected result: ${message}\n`
      );
    }
    return null;
  }
}

/**
 * Resolve authentication by checking available credential sources.
 *
 * Priority order:
 *   1. Claude CLI OAuth (Pro/Max subscription)
 *   2. ANTHROPIC_API_KEY environment variable
 *
 * Returns null when no valid credentials are found.
 */
export async function resolveAuth(): Promise<AuthResult | null> {
  const cliStatus = await getClaudeCLIStatus();
  if (cliStatus?.loggedIn) {
    return { method: "claude_cli" };
  }

  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) {
    return { method: "api_key", apiKey: envKey };
  }

  return null;
}
