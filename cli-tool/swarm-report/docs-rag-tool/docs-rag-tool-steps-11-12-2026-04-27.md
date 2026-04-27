# docs-rag: реализация шагов 11-12

Дата: 2026-04-27

## Краткое описание задачи

Подключить OpenCode slash-command `/docs` и выполнить validation flow на реальной документации/примерном датасете в пределах доступного окружения.

## Итоги Research

- OpenCode-команда должна оставаться тонким adapter: вся RAG-логика уже находится в CLI.
- `example/swarm-report` содержит операционные сведения, поэтому он подключается только явно и не должен становиться default scope.
- Полный E2E с OpenAI невозможен без `OPENAI_API_KEY`; validation должна явно фиксировать это ограничение.

## План

1. Создать `.opencode/commands/docs.md`.
2. Сделать команду тонким вызовом `tools/docs-rag/dist/cli/index.js query`.
3. Зафиксировать правила ответа: только retrieved context, источники обязательны, без полного поиска по проекту.
4. Проверить build/help/status и явное подключение `example/swarm-report`.
5. Вернуть default config на `swarm-report` после проверки example dataset.

## Что реализовано

- `.opencode/commands/docs.md` — команда `/docs`, вызывающая CLI:
  - `node dist/cli/index.js query "$ARGUMENTS" --project-root ../.. --format markdown --max-chunks 8`.
- `AGENTS.md` — добавлено правило, что `/docs` должна оставаться тонким CLI-вызовом.
- `src/cli/help.ts` — актуализировано описание `index/query` после реализации FTS/vector/hybrid.

## Результаты Validation

- `npm run build` — успешно.
- `node dist/cli/index.js --help` — успешно, описание команд актуально.
- `node dist/cli/index.js status --project-root ../..` — успешно, config восстановлен на `swarm-report`.
- `node dist/cli/index.js init --project-root ../.. --force --folders example/swarm-report` — успешно, example dataset подключается только явно.
- `node dist/cli/index.js index --project-root ../..` на example dataset без `OPENAI_API_KEY` — ожидаемо завершился понятной ошибкой про env-only key.
- После проверки example dataset выполнен `init --force --folders swarm-report`, default scope восстановлен.
- `git diff --check` по изменённым путям — без замечаний.

## Проблемы и откаты

- Полный `/docs` E2E через OpenCode и OpenAI не выполнялся: нет `OPENAI_API_KEY` и отдельной OpenCode browser/session validation не требуется для CLI-команды.
- Validation на `example/swarm-report` дошла до expected missing-key gate; это подтверждает безопасный env-only boundary, но не проверяет качество retrieved context на OpenAI embeddings.

## Остаточные риски

- Для полноценного шага 12 нужен запуск с реальным `OPENAI_API_KEY`: `init`, `index`, `query`, затем `/docs`.
- Slash-command syntax может требовать адаптации под точные переменные OpenCode runtime, если `$PROJECT_ROOT`/`$ARGUMENTS` отличаются в установленной версии.

## Статус

Частично: команда `/docs` добавлена, local validation выполнена; полный RAG E2E требует `OPENAI_API_KEY`.
