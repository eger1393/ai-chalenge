# ai-reviewer

TypeScript CLI for GitHub Actions AI code review using OpenAI ChatGPT models.

## Provider

The reviewer uses the OpenAI API directly. Configure the repository secret:

```text
OPENAI_API_KEY=sk-...
```

The default model is configured in `.github/ai-review.yml` as `gpt-4.1`.

## Usage in GitHub Actions

The workflow lives in `.github/workflows/ai-review.yml` and runs on:

- pull request open/synchronize/reopen;
- PR comment starting with `/ai-review`;
- manual `workflow_dispatch`.

Model/profile selection priority:

```text
workflow_dispatch input
-> /ai-review comment arguments
-> PR labels
-> .github/ai-review.yml defaults
```

Examples:

```text
/ai-review model=gpt-4.1 profile=default
/ai-review model=gpt-4.1-mini profile=security
```

Labels:

```text
ai-review:model:gpt-4.1-mini
ai-review:profile:security
```

## Local Build

```bash
npm install
npm run build
```

Local review requires a GitHub event payload and `OPENAI_API_KEY`.

## Lorex Reindex Workflow

Project documentation RAG index is rebuilt by a separate manual workflow:

```text
.github/workflows/lorex-reindex.yml
```

Run it from GitHub Actions with `workflow_dispatch`. It builds `cli-tool/tools/lorex`, recreates `first-lesson/.lorex`, uploads the index as an artifact, and saves a cache entry with this prefix:

```text
lorex-<runner-os>-first-lesson-
```

The review workflow restores this cache and runs only `lorex query`, avoiding full documentation embedding recalculation on every PR review. If the cache is unavailable, `ai-reviewer` logs a warning and continues without RAG context.

## Source Layout

```text
src/domain/          pure review types and rules
src/application/     review use case and ports
src/infrastructure/  OpenAI, GitHub, git, YAML, env, formatting adapters
src/cli/             CLI argument parsing
src/index.ts         composition root
```

Layering rules:

- `domain` must not import `application` or `infrastructure`.
- `application` must depend only on `domain` and its own ports.
- `infrastructure` implements application ports and may use external SDKs.
- `index.ts` wires concrete adapters together.
