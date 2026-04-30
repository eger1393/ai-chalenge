import { readFile } from "node:fs/promises";
import type { IssueAnswerContext } from "../../domain/issue-answer.js";
import type { IssueAnswerContextInput, IssueAnswerContextResolver } from "../../application/ports.js";

export class GitHubIssueContextResolver implements IssueAnswerContextResolver {
  async resolve(input: IssueAnswerContextInput): Promise<IssueAnswerContext> {
    const event = input.eventPath ? JSON.parse(await readFile(input.eventPath, "utf8")) as Record<string, unknown> : {};
    const eventName = process.env.GITHUB_EVENT_NAME ?? "manual";
    const repo = input.repo ?? process.env.GITHUB_REPOSITORY ?? getNestedString(event, ["repository", "full_name"]);

    if (!repo || !repo.includes("/")) {
      throw new Error("Repository is required. Pass --repo owner/name or set GITHUB_REPOSITORY.");
    }

    const issue = getNestedObject(event, ["issue"]);
    if (!issue) {
      throw new Error("GitHub issue payload is required for answer-issue command.");
    }

    const issueNumber = getNestedNumber(issue, ["number"]);
    if (!issueNumber) {
      throw new Error("Issue number is missing from GitHub event payload.");
    }

    const [owner, name] = repo.split("/", 2);
    const labels = extractLabels(issue);

    return {
      repo,
      owner,
      name,
      eventName,
      issueNumber,
      title: getNestedString(issue, ["title"]) ?? "",
      body: getNestedString(issue, ["body"]) ?? "",
      author: getNestedString(issue, ["user", "login"]),
      labels,
      requestedModel: input.model ?? process.env.AI_ISSUE_ANSWER_MODEL ?? findLabelValue(labels, "ai-review:model:"),
      isPullRequest: Boolean(getNestedObject(issue, ["pull_request"]))
    };
  }
}

function extractLabels(issue: Record<string, unknown>): string[] {
  return (getNestedArray(issue, ["labels"]) ?? [])
    .map((label) => getNestedString(label, ["name"]))
    .filter((label): label is string => Boolean(label));
}

function findLabelValue(labels: string[], prefix: string): string | undefined {
  return labels.find((label) => label.startsWith(prefix))?.slice(prefix.length);
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
