import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ProjectContextProvider } from "../../application/ports.js";
import type { LorexContextConfig, ProjectContextSnippet } from "../../domain/project-context.js";

const execFileAsync = promisify(execFile);

export class LorexProjectContextProvider implements ProjectContextProvider {
  constructor(private readonly config: LorexContextConfig | undefined) {}

  async getContext(input: Parameters<ProjectContextProvider["getContext"]>[0]): Promise<ProjectContextSnippet[]> {
    if (!this.config?.enabled) {
      return [];
    }

    const projectRoot = path.resolve(this.config.project_root);
    const indexReady = await this.hasIndex(projectRoot);

    if (!indexReady) {
      console.warn(`Lorex index is unavailable at ${projectRoot}/.lorex; review will continue without RAG context.`);
      return [];
    }

    try {
      const query = buildLorexQuery(input.diff, input.profileName);
      const { stdout } = await execFileAsync(process.execPath, [
        path.resolve(this.config.cli_path),
        "query",
        query,
        "--project-root",
        projectRoot,
        "--format",
        "markdown",
        "--max-chunks",
        String(this.config.max_chunks)
      ], { maxBuffer: Math.max(this.config.max_bytes * 2, 1024 * 1024) });

      const content = trimUtf8(stdout.trim(), this.config.max_bytes);
      if (!content) {
        return [];
      }

      return [{
        source: "lorex",
        title: "Retrieved Documentation Context",
        content
      }];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Lorex query failed; review will continue without RAG context: ${message}`);
      return [];
    }
  }

  private async hasIndex(projectRoot: string): Promise<boolean> {
    try {
      await Promise.all([
        access(path.join(projectRoot, ".lorex", "config.json")),
        access(path.join(projectRoot, ".lorex", "manifest.json")),
        access(path.join(projectRoot, ".lorex", "index.sqlite"))
      ]);
      return true;
    } catch {
      return false;
    }
  }
}

function buildLorexQuery(diff: string, profileName: string): string {
  const changedFiles = extractChangedFiles(diff).slice(0, 30);
  const backendTouched = changedFiles.some((file) => file.includes("/backend/") || file.startsWith("first-lesson/backend/"));
  const frontendTouched = changedFiles.some((file) => file.includes("/frontend/") || file.startsWith("first-lesson/frontend/"));
  const architectureHints = backendTouched
    ? "слоеная архитектура backend controller service repository DTO module ownership access checks"
    : frontendTouched
      ? "frontend архитектура components hooks API contracts state management"
      : "архитектура проекта module boundaries contracts";

  return [
    `Профиль ревью: ${profileName}.`,
    "Найди релевантную проектную документацию, AGENTS.md, PROJECT_MAP.md, архитектурные правила и контракты для code review.",
    `Изменённые файлы: ${changedFiles.join(", ") || "не определены"}.`,
    `Ключевые темы: ${architectureHints}.`
  ].join("\n");
}

function extractChangedFiles(diff: string): string[] {
  const files = new Set<string>();
  const matcher = /^diff --git a\/(.+?) b\/(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(diff)) !== null) {
    files.add(match[2]);
  }

  return [...files];
}

function trimUtf8(value: string, maxBytes: number): string {
  const buffer = Buffer.from(value, "utf8");
  if (buffer.byteLength <= maxBytes) {
    return value;
  }

  return buffer.subarray(0, maxBytes).toString("utf8");
}
