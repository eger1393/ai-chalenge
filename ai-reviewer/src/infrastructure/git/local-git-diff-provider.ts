import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ReviewContext } from "../../domain/review-context.js";
import type { DiffProvider } from "../../application/ports.js";

const execFileAsync = promisify(execFile);

export class LocalGitDiffProvider implements DiffProvider {
  async getDiff(context: ReviewContext): Promise<string | undefined> {
    if (!context.baseSha || !context.headSha) {
      return undefined;
    }

    try {
      const { stdout } = await execFileAsync("git", [
        "diff",
        "--unified=80",
        "--diff-filter=ACMRT",
        `${context.baseSha}...${context.headSha}`
      ], { maxBuffer: 40 * 1024 * 1024 });

      return stdout.trim().length > 0 ? stdout : undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`git diff failed, trying next diff provider: ${message}`);
      return undefined;
    }
  }
}
