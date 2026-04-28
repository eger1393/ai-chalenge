import { readFile } from "node:fs/promises";
import type { ReviewContext } from "../../domain/review-context.js";
import type { ReviewContextInput, ReviewContextResolver } from "../../application/ports.js";

interface ParsedCommand {
  model?: string;
  profile?: string;
  tools?: string[];
}

export class GitHubEventContextResolver implements ReviewContextResolver {
  async resolve(input: ReviewContextInput): Promise<ReviewContext> {
    const event = input.eventPath ? JSON.parse(await readFile(input.eventPath, "utf8")) as Record<string, unknown> : {};
    const eventName = process.env.GITHUB_EVENT_NAME ?? "manual";
    const repo = input.repo ?? process.env.GITHUB_REPOSITORY ?? getNestedString(event, ["repository", "full_name"]);

    if (!repo || !repo.includes("/")) {
      throw new Error("Repository is required. Pass --repo owner/name or set GITHUB_REPOSITORY.");
    }

    const [owner, name] = repo.split("/", 2);
    const pullRequest = getNestedObject(event, ["pull_request"]);
    const workflowInputs = getNestedObject(event, ["inputs"]);
    const command = parseCommand(getNestedString(event, ["comment", "body"]));
    const labels = extractLabels(event);

    return {
      repo,
      owner,
      name,
      eventName,
      prNumber: input.prNumber
        ?? parseOptionalInt(getNestedString(workflowInputs, ["pr_number"]))
        ?? getNestedNumber(pullRequest, ["number"])
        ?? getNestedNumber(event, ["issue", "number"]),
      baseSha: getNestedString(pullRequest, ["base", "sha"]),
      headSha: getNestedString(pullRequest, ["head", "sha"]),
      requestedModel: input.model
        ?? process.env.AI_REVIEW_MODEL
        ?? getNestedString(workflowInputs, ["model"])
        ?? command.model
        ?? findLabelValue(labels, "ai-review:model:"),
      requestedProfile: input.profile
        ?? process.env.AI_REVIEW_PROFILE
        ?? getNestedString(workflowInputs, ["profile"])
        ?? command.profile
        ?? findLabelValue(labels, "ai-review:profile:"),
      requestedTools: command.tools,
      labels
    };
  }
}

function parseCommand(body?: string): ParsedCommand {
  if (!body?.trim().startsWith("/ai-review")) {
    return {};
  }

  const result: ParsedCommand = {};

  for (const part of body.trim().split(/\s+/).slice(1)) {
    const [key, value] = part.split("=", 2);

    if (!key || !value) {
      continue;
    }

    if (key === "model") {
      result.model = value;
    } else if (key === "profile") {
      result.profile = value;
    } else if (key === "tools") {
      result.tools = value.split(",").map((tool) => tool.trim()).filter(Boolean);
    }
  }

  return result;
}

function extractLabels(event: Record<string, unknown>): string[] {
  const labels = getNestedArray(getNestedObject(event, ["pull_request"]), ["labels"])
    ?? getNestedArray(getNestedObject(event, ["issue"]), ["labels"])
    ?? [];

  return labels
    .map((label) => getNestedString(label, ["name"]))
    .filter((label): label is string => Boolean(label));
}

function findLabelValue(labels: string[], prefix: string): string | undefined {
  return labels.find((label) => label.startsWith(prefix))?.slice(prefix.length);
}

function parseOptionalInt(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getNestedObject(source: unknown, path: string[]): Record<string, unknown> | undefined {
  const value = getNestedValue(source, path);
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function getNestedArray(source: unknown, path: string[]): unknown[] | undefined {
  const value = getNestedValue(source, path);
  return Array.isArray(value) ? value : undefined;
}

function getNestedString(source: unknown, path: string[]): string | undefined {
  const value = getNestedValue(source, path);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getNestedNumber(source: unknown, path: string[]): number | undefined {
  const value = getNestedValue(source, path);
  return typeof value === "number" ? value : undefined;
}

function getNestedValue(source: unknown, path: string[]): unknown {
  let current = source;

  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}
