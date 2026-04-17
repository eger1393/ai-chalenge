# Backend AGENTS

## OVERVIEW

NestJS-бекенд с raw PostgreSQL, pipeline-обработкой сообщений, встроенным RAG и MCP-интеграциями

## WHERE TO LOOK

- `src/main.ts` — точка входа, глобальные middleware и `/api`
- `src/database/` — схема БД, транзакции и базовые репозитории
- `src/conversation/` — диалоги, сообщения, meta/debug
- `src/message-processing/` — planning → execution → validation
- `src/rag/` — retrieval, query rewrite, reranker и импорт Telegram-дампа
- `src/mcp/` — каталог MCP-инструментов и маршрутизация вызовов
- `src/context/` — стратегии контекста и факты

## SOURCE OF TRUTH

- Источник истины для схемы БД — `src/database/migrations.service.ts`
- Источник истины для HTTP-контрактов — controller + DTO соответствующего модуля
- Источник истины для pipeline-логики — `src/message-processing/`
- Источник истины для backend-RAG — `src/rag/`, а не `knowledge-base-mcp`

## CONVENTIONS

- Работай через repository/service-слой; ad-hoc SQL допустим только для явно обоснованных инфраструктурных обходов
- При изменении сохранённого контракта обновляй вместе схему, repository, DTO, controller и клиентский API-контур
- Новые RAG- или pipeline-изменения должны сохранять fail-fast-поведение, а не маскировать деградацию
- Для диагностических данных храни компактные ссылки и метаданные; тяжёлые payload хранить только если без этого ломается контракт

## ANTI-PATTERNS

- Не возвращай silent fallback вместо явной ошибки для критичных зависимостей
- Не смешивай backend-RAG с MCP-базой знаний как с источником фактов
- Не редактируй схему БД мимо `migrations.service.ts`
- Не добавляй новый API-контракт только на одной стороне без синхронизации frontend/backend

## COMMANDS

```bash
npm run build
npm run start:dev
npm run rag:import:telegram
```
