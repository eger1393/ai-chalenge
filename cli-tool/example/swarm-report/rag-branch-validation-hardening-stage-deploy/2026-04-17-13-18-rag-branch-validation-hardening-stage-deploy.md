# Деплой strict RAG hardening на stage

## Задача

Раскатить на stage изменения по усилению strict RAG-ветки:

- структурированные JSON-контракты для planning и execution
- code-side repair для ложного `INSUFFICIENT`
- расширенный debug с источником плана и причиной repair

## Что задеплоено

- коммит: `08c0859`
- сообщение коммита: `Harden strict RAG planning and execution contracts`

В коммит вошли только релевантные файлы:

- `PROJECT_MAP.md`
- `backend/src/message-processing/services/step-orchestrator.service.ts`
- `backend/src/message-processing/services/step-runner.service.ts`
- `frontend/src/components/chat/debug-panel.tsx`

Посторонние локальные изменения, локальный `.env`, AGENTS-иерархия и локальные отчёты в деплой не включались.

## Проверки перед деплоем

- `git status --short`
- `cd backend && npx tsc --noEmit`
- `cd frontend && npx tsc --noEmit`
- `git diff --cached --check`

## Ход деплоя

1. Создан коммит `08c0859`
2. Обычный `git push origin develop` не прошёл из-за `https`-remote без интерактивной авторизации
3. Push выполнен по SSH через `ssh.github.com:443`
4. На сервере выполнен `bash /srv/ai-chalange/update.sh first-lesson`

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

### HTTP smoke

- `http://167.235.226.104:6500/api/auth/me` -> `401 Unauthorized`
- `http://167.235.226.104:6501` -> `307 Temporary Redirect`

## Env

Новые переменные окружения не потребовались. Серверный `.env` не изменялся.

## Статус

Готово
