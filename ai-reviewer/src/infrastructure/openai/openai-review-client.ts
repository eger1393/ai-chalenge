import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import type { AiReviewClient } from "../../application/ports.js";
import { normalizeSeverity, type ReviewResult } from "../../domain/review.js";

export class OpenAiReviewClient implements AiReviewClient {
  private readonly client: OpenAI;

  constructor(private readonly options: { apiKey: string; configPath: string }) {
    this.client = new OpenAI({ apiKey: options.apiKey });
  }

  async review(input: Parameters<AiReviewClient["review"]>[0]): Promise<ReviewResult> {
    const prompt = await readFile(this.resolvePromptPath(input.profile.prompt), "utf8");
    const completion = await this.client.chat.completions.create({
      model: input.model,
      temperature: input.config.defaults.temperature,
      max_tokens: input.config.defaults.max_tokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: JSON.stringify({
            profile: input.profileName,
            enabled_tools: input.profile.tools,
            project_context: input.projectContext,
            diff: input.diff,
            required_output: {
              summary: "string",
              findings: [{
                file: "string",
                line: "number | optional",
                severity: "low | medium | high | critical",
                title: "string",
                explanation: "string",
                suggested_fix: "string | optional",
                documentation_refs: "string[] | optional"
              }]
            }
          })
        }
      ]
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      throw new Error("OpenAI returned an empty review response.");
    }

    return normalizeReviewResult(JSON.parse(content));
  }

  private resolvePromptPath(promptPath: string): string {
    if (promptPath.startsWith(".github/")) {
      return path.resolve(promptPath);
    }

    return path.resolve(path.dirname(path.resolve(this.options.configPath)), promptPath);
  }
}

function normalizeReviewResult(value: unknown): ReviewResult {
  if (!value || typeof value !== "object") {
    throw new Error("Review response must be a JSON object.");
  }

  const source = value as Record<string, unknown>;
  const rawFindings = Array.isArray(source.findings) ? source.findings : [];

  return {
    summary: typeof source.summary === "string" ? source.summary : "Review completed.",
    findings: rawFindings.map((item) => {
      const finding = item as Record<string, unknown>;
      return {
        file: String(finding.file ?? "unknown"),
        line: typeof finding.line === "number" ? finding.line : undefined,
        severity: normalizeSeverity(finding.severity),
        title: String(finding.title ?? "Untitled finding"),
        explanation: String(finding.explanation ?? "No explanation provided."),
        suggested_fix: typeof finding.suggested_fix === "string" ? finding.suggested_fix : undefined,
        documentation_refs: normalizeStringArray(finding.documentation_refs)
      };
    })
  };
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());

  return items.length > 0 ? items : undefined;
}
