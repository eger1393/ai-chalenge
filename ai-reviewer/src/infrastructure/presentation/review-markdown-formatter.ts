import type { ReviewFinding } from "../../domain/review.js";
import type { ReviewPublication } from "../../application/ports.js";

export function formatReviewMarkdown(input: ReviewPublication): string {
  const lines = [
    "## AI code review",
    "",
    `Model: \`${input.model}\``,
    `Profile: \`${input.profileName}\``,
    input.diff.truncated ? "Diff was truncated before review because it exceeded configured limit." : undefined,
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

  return [
    `### ${finding.severity.toUpperCase()}: ${finding.title}`,
    "",
    `Location: \`${location}\``,
    "",
    finding.explanation,
    finding.suggested_fix ? "" : undefined,
    finding.suggested_fix ? `Suggested fix: ${finding.suggested_fix}` : undefined
  ].filter((line): line is string => line !== undefined).join("\n");
}
