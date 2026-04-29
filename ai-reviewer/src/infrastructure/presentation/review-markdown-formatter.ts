import type { ReviewFinding } from "../../domain/review.js";
import type { ReviewPublication } from "../../application/ports.js";

export function formatReviewMarkdown(input: ReviewPublication): string {
  const contextLines = formatProjectContext(input);
  const lines = [
    "## AI code review",
    "",
    `Model: \`${input.model}\``,
    `Profile: \`${input.profileName}\``,
    input.diff.truncated ? "Diff was truncated before review because it exceeded configured limit." : undefined,
    ...contextLines,
    "",
    input.result.summary || "Review completed.",
    ""
  ].filter((line): line is string => line !== undefined);

  if (input.result.findings.length === 0) {
    lines.push("No actionable findings above the configured threshold.");
    return lines.join("\n");
  }

  lines.push(`Findings: ${input.result.findings.length}`, "");

  for (const finding of input.result.findings) {
    lines.push(formatFinding(finding), "");
  }

  return lines.join("\n").trimEnd();
}

function formatFinding(finding: ReviewFinding): string {
  const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
  const documentationRefs = finding.documentation_refs?.length
    ? ["", "Документация:", ...finding.documentation_refs.map((ref) => `- ${ref}`)]
    : [];

  return [
    `### ${finding.severity.toUpperCase()}: ${finding.title}`,
    "",
    `Location: \`${location}\``,
    "",
    finding.explanation,
    finding.suggested_fix ? "" : undefined,
    finding.suggested_fix ? `Предложенное исправление: ${finding.suggested_fix}` : undefined,
    ...documentationRefs
  ].filter((line): line is string => line !== undefined).join("\n");
}

function formatProjectContext(input: ReviewPublication): string[] {
  if (input.projectContext.length === 0) {
    return ["RAG-контекст: не подключён"];
  }

  return [
    "RAG-контекст:",
    ...input.projectContext.map((snippet) => `- ${snippet.source}: ${snippet.title}`)
  ];
}
