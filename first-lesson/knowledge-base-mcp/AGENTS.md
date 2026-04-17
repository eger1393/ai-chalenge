# Knowledge Base MCP AGENTS

## OVERVIEW

Отдельный MCP-сервер базы знаний с CRUD по тегам и собственным Telegram-импортом; backend-RAG напрямую на этот контур не опирается

## WHERE TO LOOK

- `src/index.ts` — MCP surface и tool registration
- `src/tools/` — CRUD по записям и тегам
- `src/db.ts` — схема, индексы и knowledge-base таблицы
- `src/import-telegram-dump.ts` — импорт Telegram JSON в knowledge-base таблицы
- `src/types.ts` — типы контента

## SOURCE OF TRUTH

- Источник истины для tool-имен и аргументов — `src/index.ts`
- Источник истины для tag semantics — `src/tools/` и ограничения БД
- Источник истины для knowledge-base схемы — `src/db.ts`

## CONVENTIONS

- Теги глобально уникальны и адресуют ровно одну запись
- Tool errors возвращаются через единый `handleError`
- Telegram-import здесь независим от backend-RAG и не должен подменять `rag_documents` / `rag_chunks`

## ANTI-PATTERNS

- Не связывай backend strict RAG с knowledge-base таблицами как с источником истины
- Не размывай правило глобальной уникальности тегов
- Не меняй MCP-контракт без синхронизации с backend `exposeTools`/routing-поведением

## COMMANDS

```bash
npm run build
npm run import:telegram
```
