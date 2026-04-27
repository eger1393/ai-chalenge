# Query Rewrite В RAG

## Задача

Добавить в настройки диалога включаемый `query rewrite` для RAG и внедрить его как отдельный шаг перед retrieval.

## Что реализовано

- В `conversations` добавлен новый флаг `rag_query_rewrite_enabled` с default `false`
- Флаг протянут через backend DTO, conversation repository/service, SSE `sendMessage` и frontend API/types
- В `backend/src/rag/rag-query-rewrite.service.ts` добавлен LLM-based rewrite на `gpt-4.1-nano`
- `RagService` теперь при включённом флаге переписывает запрос перед embeddings/vector search/reranker
- Ошибки rewrite не глотаются: при сбое шаг завершает запрос явной ошибкой
- В debug RAG сохраняются:
  - состояние rewrite
  - исходный запрос
  - переписанный запрос
  - модель rewrite
- На фронте в секции `RAG` добавлен тумблер `Query rewrite`
- В debug-панели RAG добавлен отдельный блок с исходным и поисковым запросом
- `PROJECT_MAP.md` обновлён под новый контур

## Проверка

- `cd backend && npm run build`
- `cd frontend && npm run build`

## Допущения и ограничения

- В первой версии используется только один режим rewrite: одиночное LLM-переписывание без `multi-query`
- Rewrite влияет только на retrieval-ветку RAG и не меняет исходный пользовательский вопрос для генерации ответа
- Деплой не выполнялся

## Статус

Готово
