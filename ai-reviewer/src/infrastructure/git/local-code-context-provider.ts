import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { CodeContextProvider } from "../../application/ports.js";
import type { ProjectContextSnippet } from "../../domain/project-context.js";

const execFileAsync = promisify(execFile);
const supportedExtensions = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml", ".sql", ".prisma", ".css", ".scss"
]);
const ignoredPathParts = ["/dist/", "/node_modules/", "/.lorex/", "/coverage/", "package-lock.json"];

export class LocalCodeContextProvider implements CodeContextProvider {
  async getContext(input: Parameters<CodeContextProvider["getContext"]>[0]): Promise<ProjectContextSnippet[]> {
    const query = `${input.issue.title}\n${input.issue.body}`;
    const tokens = expandTokens(extractTokens(query));
    if (tokens.length === 0) {
      return [];
    }

    const files = await listTrackedFiles();
    const candidates = files.filter(isSupportedFile);
    const scored: Array<{ path: string; score: number; content: string }> = [];

    for (const filePath of candidates) {
      const pathScore = scoreText(filePath, tokens) * 6;
      const content = await safeReadText(filePath);
      if (!content) {
        continue;
      }

      const score = pathScore + scoreText(content.slice(0, 120_000), tokens);
      if (score > 0) {
        scored.push({ path: filePath, score, content });
      }
    }

    const perFileBytes = Math.max(1000, Math.floor(input.maxBytes / input.maxFiles));
    return scored
      .sort((left, right) => right.score - left.score)
      .slice(0, input.maxFiles)
      .map((item) => ({
        source: `code:${item.path}`,
        title: item.path,
        content: buildExcerpt(item.content, tokens, perFileBytes)
      }));
  }
}

async function listTrackedFiles(): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["ls-files"], { maxBuffer: 10 * 1024 * 1024 });
  return stdout.split(/\r?\n/).filter(Boolean);
}

async function safeReadText(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

function isSupportedFile(filePath: string): boolean {
  const normalized = `/${filePath.replaceAll("\\", "/")}`;
  if (ignoredPathParts.some((part) => normalized.includes(part))) {
    return false;
  }

  const extension = normalized.includes(".") ? normalized.slice(normalized.lastIndexOf(".")) : "";
  return supportedExtensions.has(extension);
}

function extractTokens(value: string): string[] {
  const stopWords = new Set(["the", "and", "for", "with", "как", "что", "это", "или", "для", "при", "где", "why", "how"]);
  const matches = value.toLowerCase().match(/[a-zа-яё0-9_-]{3,}/giu) ?? [];
  return [...new Set(matches.filter((token) => !stopWords.has(token)))];
}

function expandTokens(tokens: string[]): string[] {
  const expanded = new Set(tokens);
  const joined = tokens.join(" ");

  if (/авторизац|аутентифик|логин|вход|auth|login|jwt|token/.test(joined)) {
    ["auth", "authentication", "authorization", "login", "jwt", "token", "passport", "guard", "user", "session"].forEach((token) => expanded.add(token));
  }
  if (/rag|ретрив|поиск|документ|knowledge|embedding/.test(joined)) {
    ["rag", "retrieval", "embedding", "knowledge", "document", "chunk"].forEach((token) => expanded.add(token));
  }

  return [...expanded];
}

function scoreText(value: string, tokens: string[]): number {
  const text = value.toLowerCase();
  return tokens.reduce((score, token) => score + countOccurrences(text, token.toLowerCase()), 0);
}

function countOccurrences(value: string, token: string): number {
  let count = 0;
  let fromIndex = 0;

  while (fromIndex < value.length) {
    const index = value.indexOf(token, fromIndex);
    if (index === -1) {
      return count;
    }
    count += 1;
    fromIndex = index + token.length;
  }

  return count;
}

function buildExcerpt(content: string, tokens: string[], maxBytes: number): string {
  const lines = content.split(/\r?\n/);
  const firstMatch = lines.findIndex((line) => tokens.some((token) => line.toLowerCase().includes(token.toLowerCase())));
  const start = Math.max(0, (firstMatch === -1 ? 0 : firstMatch) - 20);
  const excerpt = lines
    .slice(start, start + 80)
    .map((line, index) => `${start + index + 1}: ${line}`)
    .join("\n");

  return trimUtf8(excerpt, maxBytes);
}

function trimUtf8(value: string, maxBytes: number): string {
  const buffer = Buffer.from(value, "utf8");
  if (buffer.byteLength <= maxBytes) {
    return value;
  }

  return buffer.subarray(0, maxBytes).toString("utf8");
}
