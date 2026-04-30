import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import type { AiIssueAnswerClient } from "../../application/ports.js";
import type { IssueAnswerResult } from "../../domain/issue-answer.js";

export class OpenAiIssueAnswerClient implements AiIssueAnswerClient {
  private readonly client: OpenAI;

  constructor(private readonly options: { apiKey: string; configPath: string }) {
    this.client = new OpenAI({ apiKey: options.apiKey });
  }

  async answer(input: Parameters<AiIssueAnswerClient["answer"]>[0]): Promise<IssueAnswerResult> {
    const prompt = await readFile(this.resolvePromptPath(input.promptPath), "utf8");
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
            issue: {
              number: input.issue.issueNumber,
              title: input.issue.title,
              body: input.issue.body,
              author: input.issue.author,
              labels: input.issue.labels
            },
            rag_context: input.projectContext,
            code_context: input.codeContext,
            required_output: {
              answer: "markdown string in Russian",
              confidence: "low | medium | high",
              sources: ["source ids from rag_context/code_context"]
            }
          })
        }
      ]
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty issue answer response.");
    }

    return normalizeIssueAnswerResult(JSON.parse(content));
  }

  private resolvePromptPath(promptPath: string): string {
    if (promptPath.startsWith(".github/")) {
      return path.resolve(promptPath);
    }

    return path.resolve(path.dirname(path.resolve(this.options.configPath)), promptPath);
  }
}

function normalizeIssueAnswerResult(value: unknown): IssueAnswerResult {
  if (!value || typeof value !== "object") {
    throw new Error("Issue answer response must be a JSON object.");
  }

  const source = value as Record<string, unknown>;
  const confidence = source.confidence === "low" || source.confidence === "medium" || source.confidence === "high"
    ? source.confidence
    : "medium";

  return {
    answer: typeof source.answer === "string" ? source.answer : "Не удалось сформировать ответ по доступному контексту.",
    confidence,
    sources: normalizeStringArray(source.sources)
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}
