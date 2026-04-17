# GitHub Explorer MCP AGENTS

## OVERVIEW

Отдельный MCP-сервер GitHub Explorer с инструментами поиска репозиториев, чтения метаданных и подписок на issue через poller

## WHERE TO LOOK

- `src/index.ts` — регистрация MCP tools и запуск сервера
- `src/tools/` — контракты конкретных инструментов
- `src/poller.ts` — периодическая проверка новых issue
- `src/db.ts` — инициализация и доступ к БД подписок
- `src/utils/parse-repository.ts` — нормализация `owner/repo`

## SOURCE OF TRUTH

- Источник истины для имён MCP tools — `src/index.ts`
- Источник истины для контракта подписки — инструменты `subscribe_to_issues`, `list_subscriptions`, `check_new_issues`
- Источник истины для хранения состояния poller — `src/db.ts`

## CONVENTIONS

- Ошибки MCP-инструментов должны возвращаться как structured JSON в text content через `handleError`
- Перед запуском poller БД должна быть инициализирована
- Изменение имени или схемы tool-аргументов требует синхронизации с backend MCP router и subscription flow

## ANTI-PATTERNS

- Не меняй имена tools без явной миграции потребителей
- Не запускай poller до `initDb()`
- Не добавляй ad-hoc формат ошибок вне `handleError`

## COMMANDS

```bash
npm run build
npm run start
```
