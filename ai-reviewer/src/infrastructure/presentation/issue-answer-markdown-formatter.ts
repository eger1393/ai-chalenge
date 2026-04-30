import type { IssueAnswerPublication } from "../../application/ports.js";

export function formatIssueAnswerMarkdown(input: IssueAnswerPublication): string {
  const lines = [
    "## AI ответ по issue",
    "",
    `Model: \`${input.model}\``,
    `Confidence: \`${input.result.confidence}\``,
    ...formatContext("RAG-контекст", input.projectContext),
    ...formatContext("Код-контекст", input.codeContext),
    "",
    input.result.answer.trim(),
    ""
  ];

  if (input.result.sources.length > 0) {
    lines.push("Источники:", ...input.result.sources.map((source) => `- ${source}`));
  }

  return lines.join("\n").trimEnd();
}

function formatContext(title: string, snippets: Array<{ source: string; title: string }>): string[] {
  if (snippets.length === 0) {
    return [`${title}: не найден`];
  }

  return [
    `${title}:`,
    ...snippets.map((snippet) => `- ${snippet.source}: ${snippet.title}`)
  ];
}
