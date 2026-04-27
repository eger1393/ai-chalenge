# Отчёт по задаче `strict-rag-false-insufficient-stage-deploy`

## Задача

Раскатить на stage исправление strict RAG, которое должно уменьшить ложные `INSUFFICIENT` на обобщающих вопросах при уже найденных прямых релевантных чанках.

## Что задеплоено

- Коммит: `977bced` — `Fix strict RAG false insufficient planning`
- В коммит вошли:
  - `backend/src/message-processing/services/step-runner.service.ts`
  - `backend/src/message-processing/services/step-orchestrator.service.ts`

## Локальные проверки

- `cd backend && npx tsc --noEmit`
- `cd frontend && npx tsc --noEmit`

## Push

- Push выполнен по SSH:
  - `git@github.com:eger1393/ai-chalenge.git`
- Удалённая ветка `develop` обновлена с `7296f17` до `977bced`

## Удалённый деплой

- Выполнен штатный сценарий:
  - `ssh root@167.235.226.104 -p 2222`
  - `cd /srv/ai-chalange`
  - `bash update.sh first-lesson`

## Проверка после деплоя

- `docker compose ps`:
  - `backend` — `Up`
  - `frontend` — `Up`
  - `postgres` — `Up (healthy)`
  - `postgres-mcp` — `Up (healthy)`
  - `github-explorer-mcp` — `Up (healthy)`
  - `knowledge-base-mcp` — `Up (healthy)`
- HTTP smoke:
  - `http://167.235.226.104:6500/api/auth/me` → `401 Unauthorized`
  - `http://167.235.226.104:6501` → `307 Temporary Redirect`
- В backend-логах критичных ошибок старта нет

## Замечания

- Предупреждения `MCP server "... returned 0 tools"` остаются ожидаемыми для текущего тестового режима
- Новых env-переменных не потребовалось

## Статус

Готово
