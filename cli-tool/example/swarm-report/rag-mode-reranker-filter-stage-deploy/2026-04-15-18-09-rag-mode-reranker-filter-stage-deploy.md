# Отчёт по задаче: деплой `rag_mode` на stage

Статус: Готово

## Что сделано

- Изменения `backend` и `frontend` синхронизированы на stage в `/srv/ai-chalange/first-lesson`
- `backend` и `frontend` пересобраны и пересозданы через `docker compose up -d --build --force-recreate --no-deps backend frontend`
- Backend при старте выполнил миграции БД
- Новая схема `conversations.rag_mode` применена в `chatdb`
- Новый frontend-бандл со строками `ragMode` и `Reranker` собран и поднят

## Проверки

- `docker compose ps backend frontend`
  - `backend` создан заново и слушает `6500`
  - `frontend` создан заново и слушает `6501`
- Backend startup logs:
  - `Running migrations — ensuring schema exists...`
  - `Migrations completed successfully`
- SQL-проверка в `chatdb`:
  - есть колонки `rag_enabled` и `rag_mode`
  - `rag_mode` имеет default `filter`
  - текущие записи в `conversations` имеют `rag_mode = filter`
- HTTP smoke:
  - `GET /api/auth/me` -> `401 Unauthorized`
  - `GET /` на `6501` -> `307 Temporary Redirect`

## Ограничения и наблюдения

- После рестарта backend на stage `McpRegistryService` по-прежнему видит `0 tool(s)` от всех MCP-серверов
- Это не блокирует текущий RAG-деплой, но означает, что stage сейчас работает без MCP-инструментов
- Признак проблемы зафиксирован в backend-логах:
  - `MCP server "postgres" returned 0 tools`
  - `MCP server "github-explorer" returned 0 tools`
  - `MCP server "knowledge-base" returned 0 tools`
  - `Tool catalog refreshed: 0 tool(s) from 3 server(s)`
