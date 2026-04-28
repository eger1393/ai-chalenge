export type Severity = "low" | "medium" | "high" | "critical";

export interface ReviewFinding {
  file: string;
  line?: number;
  severity: Severity;
  title: string;
  explanation: string;
  suggested_fix?: string;
}

export interface ReviewResult {
  summary: string;
  findings: ReviewFinding[];
}

export interface DiffResult {
  diff: string;
  truncated: boolean;
}

export interface ReviewPolicy {
  max_diff_bytes: number;
  max_comments: number;
  severity_threshold: Severity;
  post_pr_comment: boolean;
}

const severities: Severity[] = ["low", "medium", "high", "critical"];

export function severityRank(severity: Severity): number {
  return severities.indexOf(severity);
}

export function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && severities.includes(value as Severity);
}

export function normalizeSeverity(value: unknown): Severity {
  return isSeverity(value) ? value : "medium";
}

export function filterFindings(result: ReviewResult, policy: ReviewPolicy): ReviewResult {
  const threshold = severityRank(policy.severity_threshold);
  const findings = result.findings
    .filter((finding) => severityRank(finding.severity) >= threshold)
    .slice(0, policy.max_comments);

  return { ...result, findings };
}

export function truncateDiff(diff: string, maxBytes: number): DiffResult {
  const buffer = Buffer.from(diff, "utf8");

  if (buffer.byteLength <= maxBytes) {
    return { diff, truncated: false };
  }

  return {
    diff: buffer.subarray(0, maxBytes).toString("utf8"),
    truncated: true
  };
}
