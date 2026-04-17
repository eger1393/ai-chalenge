# RAG AGENTS

## OVERVIEW

Этот каталог отвечает за retrieval, векторизацию, query rewrite, reranker и сборку RAG-evidence блока для основного backend

## WHERE TO LOOK

- `rag.service.ts` — retrieval pipeline, лимиты, фильтр/reranker и evidence block
- `rag.repository.ts` — pgvector-поиск и debug-загрузка чанков
- `rag-embedding.service.ts` — embeddings для запроса
- `rag-query-rewrite.service.ts` — переписывание retrieval-запроса
- `rag-reranker.service.ts` — cross-encoder reranker
- `import-telegram-dump.ts` — переиндексация Telegram JSON в `chatdb`
- `constants.ts` — модели, пороги и лимиты

## SOURCE OF TRUTH

- Источник истины для хранилища RAG — таблицы `rag_documents` и `rag_chunks` в основном `chatdb`
- Источник истины для режима retrieval — `conversations.rag_enabled`, `rag_query_rewrite_enabled`, `rag_mode`
- Источник истины для формата evidence block — `rag.service.ts`

## CONVENTIONS

- `query rewrite` меняет только retrieval-запрос, но не исходное сообщение пользователя
- `reranker` и `query rewrite` работают в fail-fast-режиме: неуспех должен быть явным
- Evidence block должен оставаться chunk-oriented: `chunk_id`, источник, дата и `content`
- Переиндексация дампа должна сохранять совместимость с текущими таблицами и размерностью embedding

## ANTI-PATTERNS

- Не добавляй тихий fallback `reranker -> filter`
- Не прячь в debug полный текст, если достаточно `chunk_id` и компактных метаданных
- Не переноси backend-RAG обратно в MCP-контур
- Не меняй пороги и лимиты без фиксации в `constants.ts` и `PROJECT_MAP.md`

## COMMANDS

```bash
cd /mnt/c/source/ai-chalenge/first-lesson/backend
npm run build
npm run rag:import:telegram
```
