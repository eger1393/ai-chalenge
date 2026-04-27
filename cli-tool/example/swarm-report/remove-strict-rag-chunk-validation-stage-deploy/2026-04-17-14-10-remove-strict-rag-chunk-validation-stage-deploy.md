# Деплой снятия strict RAG chunk-validation на stage

## Задача

Раскатить на stage изменение, которое убирает stage-level проверку корректности `chunk_id` и цитат в strict RAG validation.

## Что задеплоено

- коммит: `c1aadba`
- сообщение коммита: `Remove strict RAG chunk validation checks`

В деплой вошли:

- `PROJECT_MAP.md`
- `backend/src/message-processing/services/step-orchestrator.service.ts`
- `backend/src/message-processing/services/step-runner.service.ts`

Локальные отчёты в git не включались.

## Проверки перед деплоем

- `git status --short`
- `cd backend && npx tsc --noEmit`
- `cd frontend && npx tsc --noEmit`
- `git diff --cached --check`

## Ход деплоя

1. Создан коммит `c1aadba`
2. `develop` отправлен в GitHub по SSH через `ssh.github.com:443`
3. На сервере выполнен `bash /srv/ai-chalange/update.sh first-lesson`

## Проверка после деплоя

### Контейнеры

Все контейнеры поднялись:

- `backend` — `Up`
- `frontend` — `Up`
- `postgres` — `Up (healthy)`
- `postgres-mcp` — `Up (healthy)`
- `github-explorer-mcp` — `Up (healthy)`
- `knowledge-base-mcp` — `Up (healthy)`

### Логи backend

Критичных ошибок старта нет:

- PostgreSQL подключён
- миграции завершились успешно
- `Nest application successfully started`
- `Backend running on port 3000`

Наблюдаемые предупреждения:

- `MCP server "postgres" returned 0 tools`
- `MCP server "github-explorer" returned 0 tools`
- `MCP server "knowledge-base" returned 0 tools`
- `HEAD /api/auth/me -> 401: Unauthorized`

### HTTP smoke

- `http://167.235.226.104:6500/api/auth/me` -> `401 Unauthorized`
- `http://167.235.226.104:6501` -> `307 Temporary Redirect`

## Env

Новые переменные окружения не потребовались. Серверный `.env` не изменялся.

## Статус

Готово
