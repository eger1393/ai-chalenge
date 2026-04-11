# Knowledge Base MCP

Дата: 2026-04-11 18:55
Статус: Done

## Краткое описание задачи

Добавлен новый standalone MCP-сервис `knowledge-base-mcp` с CRUD-операциями по тегам, отдельной БД `knowledge_base`, подключением к backend через `mcp-servers.json` и деплоем в docker-compose.

## Итоги Research

- Текущий backend уже использует общий `McpRegistryService`, поэтому новую функциональность нужно было добавлять как отдельный MCP-сервис, а не как Nest-модуль.
- Для того чтобы backend стабильно видел новый сервер в tool catalog, пришлось не только добавить его в `mcp-servers.json`, но и сделать запуск backend зависимым от healthy-state MCP-контейнеров.
- На сервере `update.sh` уже использует `docker compose up -d --build`, поэтому реальный блокер деплоя нужно было ловить через локальный `docker compose build`.

## План

- Реализовать новый сервис `knowledge-base-mcp` с инструментами `create_entry`, `get_by_tag`, `replace_by_tag`, `delete_by_tag`, `list_tags`.
- Подключить сервис в `docker-compose.yml` и `backend/mcp-servers.json`.
- Обновить `PROJECT_MAP.md`.
- Проверить локальную docker-сборку, затем задеплоить на сервер и подтвердить регистрацию MCP в backend.

## Что реализовано

- Добавлен каталог `knowledge-base-mcp/`:
  - TypeScript MCP server
  - bootstrap отдельной БД `knowledge_base`
  - таблицы `knowledge_base_entries`, `knowledge_base_tags`
  - CRUD-инструменты по точному тегу
- Обновлён `docker-compose.yml`:
  - добавлен сервис `knowledge-base-mcp`
  - добавлены healthcheck'и для MCP-сервисов
  - backend теперь ждёт healthy-state MCP-контейнеров
- Обновлён `backend/mcp-servers.json`:
  - зарегистрирован сервер `knowledge-base`
- Обновлён `PROJECT_MAP.md`
- Обновлён серверный `.env`:
  - добавлен `MCP_KNOWLEDGE_BASE_URL=http://knowledge-base-mcp:8098/mcp`

## Validation

- Локально:
  - `backend`: `npx tsc --noEmit` — OK
  - `frontend`: `npx tsc --noEmit` — OK
  - `docker compose build knowledge-base-mcp` — OK после фикса типов
  - `docker compose build` — OK
- Сервер:
  - `git push origin develop` — OK
  - `bash /srv/ai-chalange/update.sh first-lesson` — OK
  - `docker compose ps` — все 6 контейнеров подняты, `knowledge-base-mcp` healthy
  - `docker compose logs --tail=80 backend` — backend подключился к `knowledge-base` и увидел 5 tool'ов

## Проблемы и откаты

- Первый деплой был прерван пользователем в момент выполнения `update.sh`, из-за чего стек успел опуститься и остался временно без контейнеров.
- Локальная `docker compose build` сначала падала не из-за Dockerfile, а из-за TypeScript-ошибки в `knowledge-base-mcp`: слишком широкий тип `json_content`.
- После исправления типизации контейнер `knowledge-base-mcp` и полный compose начали собираться стабильно.

## Задеплоенные коммиты

- `506dde2` — `chore: update codex workflow and add knowledge base mcp`
- `cce541f` — `fix: correct knowledge base json typing`
