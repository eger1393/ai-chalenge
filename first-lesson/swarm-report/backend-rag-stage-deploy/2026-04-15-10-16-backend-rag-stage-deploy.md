# Отчёт по задаче: деплой backend RAG на stage

## Статус

Готово

## Краткое описание задачи

Развернуть текущее состояние backend/frontend с backend-RAG на stage и проверить, что ранее проиндексированные данные Telegram-дампа остались доступны в основном `chatdb`.

## Что выполнено

- Синхронизированы актуальные файлы `backend`, `frontend`, `docker-compose.yml`, `PROJECT_MAP.md`, `result.json` и отчёты
- Выполнена пересборка и перезапуск через `docker compose up -d --build backend frontend`
- В ходе compose-команды были также пересозданы MCP-сервисы, так как они входят в зависимый build-граф текущего `docker-compose.yml`

## Проверки

- `docker compose ps`:
  - `backend` — `Up`, порт `6500`
  - `frontend` — `Up`, порт `6501`
  - `postgres` — `healthy`, порт `6502`
  - `postgres-mcp`, `github-explorer-mcp`, `knowledge-base-mcp` — `healthy`
- Backend:
  - приложение стартовало
  - миграции выполнились успешно
  - `RagModule` инициализирован
  - `GET /api/auth/me` без токена возвращает ожидаемый `401 Unauthorized`
- Frontend:
  - `http://167.235.226.104:6501` отвечает `307 Temporary Redirect`
- RAG-индекс:
  - `rag_documents = 6579`
  - `rag_chunks = 5539`
  - размерность embedding = `1024`

## Ограничения и допущения

- Локальное рабочее дерево остаётся грязным из-за текущих незакоммиченных изменений и старых несвязанных правок пользователя
- В деплой не включались несвязанные изменения `AGENTS.md` и удаление `CODEX_*`
