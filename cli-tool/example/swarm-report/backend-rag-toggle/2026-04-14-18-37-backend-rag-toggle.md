# Отчёт по задаче: backend-RAG и флаг `RAG` на фронте

## Статус

Готово

## Краткое описание задачи

Реализован отдельный backend-контур RAG без использования MCP:

- векторы и проиндексированные сообщения хранятся в основном backend/PostgreSQL
- на фронте добавлен флаг `RAG`
- при включённом флаге backend подмешивает релевантные чанки в system prompt
- перенос старых данных не выполнялся, предусмотрена повторная переиндексация `result.json`

## Что реализовано

- Добавлен модуль `backend/src/rag/`
  - `rag.service.ts` — retrieval и сборка RAG-блока
  - `rag.repository.ts` — поиск релевантных чанков через `pgvector`
  - `rag-embedding.service.ts` — embeddings `bge-m3`
  - `import-telegram-dump.ts` — CLI-переиндексация Telegram JSON в `chatdb`
- В backend-модели и миграции добавлены:
  - `conversations.rag_enabled`
  - `rag_documents`
  - `rag_chunks`
  - `CREATE EXTENSION IF NOT EXISTS vector`
- В `StepOrchestratorService`:
  - при `ragEnabled=true` выполняется retrieval по текущему сообщению
  - найденные чанки добавляются в `assembledSystemPrompt`
  - сведения о матчах сохраняются в debug metadata
- Во frontend:
  - в `AIParams` добавлен `ragEnabled`
  - в панели параметров добавлен переключатель `RAG`
  - флаг отправляется в backend вместе с параметрами сообщения

## Важное техническое решение

Для runtime embeddings используется `Xenova/bge-m3` как совместимый ONNX-порт модели `BAAI/bge-m3`.

В коде это разделено явно:

- source model: `BAAI/bge-m3`
- runtime model: `Xenova/bge-m3`

## Проверки

- `backend`: `npm run build` — успешно
- `frontend`: `npm run build` — успешно
- smoke-test `Transformers.js` в backend:
  - embedding построен успешно
  - размерность `1024`
- `node dist/rag/import-telegram-dump.js` без аргументов:
  - корректно возвращает диагностическую ошибку CLI

## Ограничения и допущения

- Автоматическая переиндексация `result.json` в рамках этой задачи не запускалась
- Порог релевантности и размер RAG-блока управляются через env:
  - `RAG_TOP_K`
  - `RAG_MIN_SIMILARITY`
  - `RAG_MAX_CONTEXT_CHARS`
- Текущий retrieval работает по глобальному корпусу RAG-документов без отдельной фильтрации по проектам или пользователям

