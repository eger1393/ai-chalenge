# Деплой Hardening Query Rewrite На Stage

## Задача

Раскатить на stage усиленный `query rewrite` для RAG.

## Что задеплоено

- Коммит: `d7b85fc`
- Сообщение коммита: `Harden RAG query rewrite behavior`
- Ветка: `develop`
- Деплой выполнен git-based через:
  - `git push ... develop:develop`
  - `ssh ... 'cd /srv/ai-chalange && bash update.sh first-lesson'`

## Проверка перед деплоем

- `cd backend && npx tsc --noEmit`
- `cd frontend && npx tsc --noEmit`

## Проверка после деплоя

- `docker compose ps`:
  - `backend` — `Up`
  - `frontend` — `Up`
  - `postgres` — `Up (healthy)`
  - `postgres-mcp` — `Up (healthy)`
  - `github-explorer-mcp` — `Up (healthy)`
  - `knowledge-base-mcp` — `Up (healthy)`
- `curl -I http://167.235.226.104:6500/api/auth/me` → `401 Unauthorized`
- `curl -I http://167.235.226.104:6501` → `307 Temporary Redirect`

## Логи backend

- Миграции выполнились успешно
- Приложение успешно поднялось на `3000`
- После рестарта новых RAG-запросов ещё не было, поэтому runtime-путь `query rewrite` на stage не проверялся логами уже после деплоя
- Остались ожидаемые предупреждения:
  - `MCP server "postgres" returned 0 tools`
  - `MCP server "github-explorer" returned 0 tools`
  - `MCP server "knowledge-base" returned 0 tools`
- Также есть ожидаемый smoke-log:
  - `HEAD /api/auth/me → 401: Unauthorized`

## Env и ограничения

- Новые переменные окружения не потребовались
- Локальный `origin` всё ещё настроен на `https://github.com/...`, поэтому push выполнен по SSH без изменения конфигурации репозитория

## Статус

Готово
