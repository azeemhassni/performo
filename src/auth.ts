import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Resolved authentication credentials for the Anthropic API. */
export interface AuthResult {
  method: "claude_cli" | "api_key";
  apiKey?: string;
}

/**
 * Resolve authentication by checking available credential sources.
 *
 * Returns null when no valid credentials are found.
 */
export async function resolveAuth(): Promise<AuthResult | null> {
  // TODO: add Claude CLI detection

  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) {
    return { method: "api_key", apiKey: envKey };
  }

  return null;
}
