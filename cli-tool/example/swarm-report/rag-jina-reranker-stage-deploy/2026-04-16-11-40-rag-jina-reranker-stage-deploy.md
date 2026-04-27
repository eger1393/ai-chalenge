# Отчёт: git-based деплой Jina reranker на stage

## Задача

Задеплоить на stage изменения с многоязычным Jina reranker через канонический
git-based процесс проекта.

## Что выполнено

- Для репозитория локально настроены `git user.name` и `git user.email`, чтобы
  можно было создать коммит
- Создан коммит `ed6fd57` с текущим состоянием RAG-изменений
- Коммит отправлен в `develop` через GitHub SSH:
  `git push git@github.com:eger1393/ai-chalenge.git develop:develop`
- На сервере выполнен канонический деплой:
  `cd /srv/ai-chalange && bash update.sh first-lesson`

## Проверка

- `docker compose ps` на stage:
  - `backend` — `Up`
  - `frontend` — `Up`
  - `postgres` — `Up (healthy)`
  - `postgres-mcp` — `Up (healthy)`
  - `github-explorer-mcp` — `Up (healthy)`
  - `knowledge-base-mcp` — `Up (healthy)`
- HTTP smoke:
  - `GET http://167.235.226.104:6500/api/auth/me` → ожидаемый `401 Unauthorized`
  - `GET http://167.235.226.104:6501` → `307 Temporary Redirect`
- Runtime-проверка новой модели внутри stage-контейнера:
  - модель `jinaai/jina-reranker-v2-base-multilingual` успешно загружается
  - тестовая русская пара дала `score ≈ 0.4564`

## Наблюдения

- В логах backend сохраняется старая отдельная проблема MCP:
  `MCP server "postgres" returned 0 tools`
  `MCP server "github-explorer" returned 0 tools`
  `MCP server "knowledge-base" returned 0 tools`
- Эти предупреждения не заблокировали текущий деплой reranker

## Статус

Готово
