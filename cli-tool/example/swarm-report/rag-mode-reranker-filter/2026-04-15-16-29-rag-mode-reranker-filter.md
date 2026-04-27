# Отчёт по задаче: режимы `filter` и `reranker` для RAG

Статус: Готово

## Что сделано

- В `conversations` добавлено поле `rag_mode` с дефолтом `filter`
- Backend RAG теперь поддерживает два режима:
  - `filter` — эвристический фильтр по similarity, пересечению токенов и лимиту чанков на сообщение
  - `reranker` — отдельный reranker на базе `onnx-community/bge-reranker-v2-m3-ONNX`
- В retrieval-пайплайне разделены:
  - первичный vector search по пулу кандидатов
  - post-processing по выбранному режиму
  - отбор итоговых чанков для system prompt
- Debug RAG расширен полями `mode`, `scoreType`, `candidateCount`, `selectedCount`, `rankingScore`, `tokenOverlapCount`, `rerankerScore`
- На фронте в панели параметров добавлен выбор режима RAG, который появляется только при включённом `RAG`
- `ragMode` протянут через:
  - `AIParams`
  - `createConversation` / `updateConversation`
  - SSE `sendMessage`
  - загрузку active conversation
- При открытии существующего диалога фронт подтягивает из сервера его `ragEnabled` и `ragMode`
- Debug-панель показывает режим, число кандидатов и mode-specific score

## Проверки

- `backend`: `npm run build`
- `frontend`: `npm run build`

Обе сборки завершились успешно

## Ограничения и допущения

- Пороги и эвристика `filter` зафиксированы в коде и пока не настраиваются через интерфейс
- Reranker-модель загружается лениво при первом запросе в режиме `reranker`
- Полные тексты сообщений по-прежнему не сохраняются в debug, а подтягиваются по `chunkId`
