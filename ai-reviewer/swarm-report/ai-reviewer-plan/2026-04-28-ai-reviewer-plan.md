# План CLI AI Reviewer

Дата: 2026-04-28

## Краткое описание

Нужно спроектировать авто-ревью кода через GitHub Actions так, чтобы модель, промпты и подключаемые инструменты выбирались управляемо: через конфиг, labels, команды в PR или ручной запуск workflow.

## Рекомендуемая архитектура

Основная идея: не зашивать логику ревью в GitHub Actions, а сделать собственный тонкий TypeScript CLI `ai-reviewer`, который GitHub Actions только запускает.

```text
GitHub PR
  -> .github/workflows/ai-review.yml
  -> ai-reviewer
  -> .github/ai-review.yml
  -> LLM provider adapter
  -> tools: git diff, repo files, tests, lorex, MCP, GitHub API
  -> PR review comments / check summary
```

## Выбор технологий

- GitHub Actions как orchestration layer.
- TypeScript CLI как основной review engine.
- OpenAI-compatible API как первый provider-интерфейс.
- OpenRouter или LiteLLM для переключения между моделями.
- MCP SDK для подключения инструментов.
- GitHub REST API или `gh` для публикации review-комментариев.
- Локальный `lorex` как optional RAG/search tool по проектной документации.

## Почему так

- В репозитории уже есть Node/TypeScript подпроекты.
- Уже есть MCP-контур и локальная CLI-утилита `lorex`.
- Можно менять модель, промпты и tools кодом/конфигом без переписывания workflow.
- Решение не зависит от black-box GitHub Action.

## Конфигурация

Основной конфиг предлагается хранить в `.github/ai-review.yml`.

```yaml
provider:
  type: openai-compatible
  base_url_env: AI_PROVIDER_BASE_URL
  api_key_env: AI_PROVIDER_API_KEY

defaults:
  model: openrouter/anthropic/claude-3.7-sonnet
  temperature: 0.1
  max_tokens: 12000

profiles:
  default:
    prompt: .github/ai-review/prompts/default.md
    tools:
      - git_diff
      - read_files
      - repo_search

  security:
    prompt: .github/ai-review/prompts/security.md
    tools:
      - git_diff
      - read_files
      - repo_search
      - npm_audit

  architecture:
    prompt: .github/ai-review/prompts/architecture.md
    tools:
      - git_diff
      - read_files
      - lorex

tools:
  git_diff:
    enabled: true

  read_files:
    enabled: true
    max_file_bytes: 80000

  tests:
    enabled: false
    commands:
      - npm run build --prefix first-lesson/backend
      - npm run build --prefix first-lesson/frontend

  lorex:
    enabled: true
    project_root: cli-tool
    command: node tools/lorex/dist/cli/index.js query

review:
  mode: comments
  max_comments: 20
  severity_threshold: medium
```

## Промпты

Промпты лучше хранить версионированно рядом с GitHub Actions:

```text
.github/ai-review/prompts/default.md
.github/ai-review/prompts/security.md
.github/ai-review/prompts/frontend.md
.github/ai-review/prompts/backend.md
.github/ai-review/prompts/architecture.md
```

Промпт должен требовать структурированный результат: `file`, `line`, `severity`, `title`, `explanation`, `suggested_fix`. Если проблем нет, модель должна возвращать пустой список findings.

## Выбор модели

Приоритет выбора модели:

```text
workflow_dispatch input
-> PR comment command
-> PR label
-> .github/ai-review.yml default
```

Примеры команд:

```text
/ai-review model=claude-sonnet profile=security
/ai-review model=gpt-4.1 prompt=strict tools=tests,lorex
```

Примеры labels:

```text
ai-review:model:claude-sonnet
ai-review:profile:security
```

## GitHub Actions triggers

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
  issue_comment:
    types: [created]
  workflow_dispatch:
    inputs:
      model:
      profile:
      prompt:
      tools:
```

## Tools

Read-only tools:

- `git_diff`.
- `read_file`.
- `repo_search`.
- `lorex_query`.
- `github_pr_metadata`.
- `list_changed_files`.

Controlled execution tools:

- `npm run build`.
- `npm test`.
- `npm audit`.
- `tsc`.
- `eslint`, если появится.

MCP tools:

- `github-explorer-mcp`.
- `knowledge-base-mcp`.
- будущие MCP-сервера.

Важно: в CI нельзя давать модели произвольный shell. Все команды должны идти через allowlist из конфига.

## Публикация результата

Стартовый вариант:

- summary в GitHub Check.
- inline comments только для `medium` и `high` findings.
- один общий PR comment с итогом.

Технически использовать `GITHUB_TOKEN`, GitHub REST API `pulls.createReview`, fallback через `gh pr comment`.

## Безопасность

- Не запускать AI review с секретами на PR из fork без отдельного approval.
- Предпочитать `pull_request`, не `pull_request_target`.
- Минимальные permissions: `contents: read`, `pull-requests: write`, `checks: write`.
- Не передавать `.env`, credentials и private runtime indexes.
- Не давать модели произвольный shell.
- Все tools только через allowlist.
- Все findings валидировать схемой перед публикацией.
- Дедуплицировать findings, чтобы action не спамил PR.

## MVP

1. Добавить `.github/workflows/ai-review.yml`.
2. Создать TypeScript CLI `ai-reviewer`.
3. Добавить `.github/ai-review.yml`.
4. Реализовать provider только через OpenAI-compatible API.
5. Реализовать tools: `git diff`, чтение изменённых файлов, repo search, optional build commands.
6. Публиковать GitHub Check summary и PR review comments.
7. Позже добавить `/ai-review ...`, MCP tools, `lorex`, дедупликацию, лимиты стоимости и multi-profile review.

## Итоговое решение

Не брать готовый black-box AI-review action как основу. Для этого репозитория лучше сделать управляемый TypeScript `ai-reviewer` в корне репозитория, а GitHub Actions использовать как запускалку. Базовый стек: GitHub Actions, TypeScript CLI, OpenAI-compatible API, OpenRouter или LiteLLM, MCP SDK, GitHub REST API, `lorex`, YAML-конфиг и Markdown-промпты.

## Реализация MVP

Добавлен корневой TypeScript CLI `ai-reviewer` с прямым OpenAI provider через `OPENAI_API_KEY`.

Реализовано:

- загрузка `.github/ai-review.yml`;
- выбор модели через `workflow_dispatch`, `/ai-review`, labels или default-конфиг;
- выбор review profile;
- сбор diff через локальный `git diff` с fallback на GitHub Pull Request Files API;
- вызов OpenAI Chat Completions;
- строгий JSON-формат review result;
- фильтрация findings по severity threshold;
- публикация результата в GitHub Step Summary и PR comment;
- GitHub Actions workflow `.github/workflows/ai-review.yml`;
- prompt-профили `default` и `security`.

Код CLI структурирован по слоям:

```text
src/domain/          чистые типы и правила ревью
src/application/     use case ревью и ports
src/infrastructure/  адаптеры OpenAI, GitHub, git, YAML, env и markdown formatting
src/cli/             парсинг CLI-аргументов
src/index.ts         composition root
```

Правило зависимостей: `domain` не зависит от внешних слоёв, `application` зависит только от `domain` и собственных ports, а конкретные OpenAI/GitHub/YAML детали живут в `infrastructure`.

OpenRouter/LiteLLM в MVP не используются: provider намеренно зафиксирован на OpenAI/ChatGPT, потому что для репозитория будет использоваться существующий OpenAI API key.

## Статус

MVP реализован. Требуется валидация сборкой и настройка repository secret `OPENAI_API_KEY` в GitHub.
