export interface CliArgs {
  command: string;
  eventPath?: string;
  configPath: string;
  repo?: string;
  model?: string;
  profile?: string;
  prNumber?: number;
  dryRun: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: argv[2] ?? "help",
    configPath: ".github/ai-review.yml",
    dryRun: false
  };

  for (let index = 3; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--event" && next) {
      args.eventPath = next;
      index += 1;
    } else if (arg === "--config" && next) {
      args.configPath = next;
      index += 1;
    } else if (arg === "--repo" && next) {
      args.repo = next;
      index += 1;
    } else if (arg === "--model" && next) {
      args.model = next;
      index += 1;
    } else if (arg === "--profile" && next) {
      args.profile = next;
      index += 1;
    } else if (arg === "--pr" && next) {
      args.prNumber = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

export function printHelp(): void {
  console.log(`Usage:
  ai-reviewer review --event <GITHUB_EVENT_PATH> --repo <owner/repo>
  ai-reviewer answer-issue --event <GITHUB_EVENT_PATH> --repo <owner/repo>

Options:
  --config <path>    Path to YAML config, default .github/ai-review.yml
  --model <name>     Override model
  --profile <name>   Override review profile
  --pr <number>      Override PR number for workflow_dispatch
  --dry-run          Do not post GitHub comment
`);
}
