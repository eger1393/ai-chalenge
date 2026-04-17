# Отчёт по задаче: строгий RAG-pipeline

## Краткое описание задачи

Переориентировать pipeline обработки сообщений на строгий RAG-режим:

- RAG должен подмешиваться отдельным системным сообщением
- planning должен проверять достаточность данных в RAG
- при недостатке данных ответ должен быть явным отказом
- при достатке данных ответ должен ссылаться на `chunk_id` и содержать цитаты

## Что реализовано

- В `backend/src/rag/rag.service.ts` изменён формат RAG-evidence блока:
  - каждый выбранный чанк теперь содержит `chunk_id`, `message_id`, `document_id`, источник, дату и `content`
  - блок оформлен как отдельный evidence-контур, ориентированный на цитирование и ссылку по `chunk_id`
- В `backend/src/message-processing/services/step-orchestrator.service.ts`:
  - memory prompt и RAG evidence больше не склеиваются в один `system prompt`
  - в `prepareContext` они передаются как отдельные системные сообщения
  - planning/execution/validation получают историю без дублирования системных сообщений
  - при `ragEnabled=true` execution запускается без tools
  - результат strict RAG planning и execution сохраняется в `message_debug.strategy_metadata.ragPipeline`
- В `backend/src/message-processing/services/step-runner.service.ts`:
  - добавлены отдельные prompt’ы для строгого RAG-режима
  - planning теперь обязан вернуть машиночитаемый verdict: `RAG_VERDICT`, `RESPONSE_MODE`, `CHUNKS_USED`, `MISSING_INFO`, `PLAN`
  - execution теперь обязан либо вернуть отказ по шаблону, либо ответ по шаблону с `chunk_id` и явными цитатами
  - validation в строгом RAG-режиме проверяет именно RAG-обоснованность ответа
  - добавлен кодовый парсер planning verdict
  - добавлена кодовая верификация execution-ответа:
    - `chunk_id` должны входить в `CHUNKS_USED`
    - `chunk_id` должны существовать в текущем RAG-блоке
    - цитаты должны реально содержаться в `content` соответствующего чанка
  - добавлен явный placeholder-evidence prompt для случая, когда retrieval не выбрал ни одного чанка
- Во `frontend/src/components/chat/debug-panel.tsx`:
  - в pipeline debug добавлен блок про строгий RAG-режим
  - отображаются verdict planning, режим ответа, выбранные `chunk_id`, используемые `chunk_id`, число цитат и `MISSING_INFO`
- В `PROJECT_MAP.md` зафиксированы новые устойчивые контракты strict RAG pipeline

## Результаты проверки

- `cd backend && npm run build` — успешно
- `cd frontend && npm run build` — успешно
- `git diff --check` — успешно

## Ограничения и допущения

- Строгий RAG-режим автоматически активируется при `ragEnabled=true`
- История диалога и memory prompt по-прежнему присутствуют в pipeline, но prompt’ами и кодовой верификацией закреплено, что факты для ответа берутся только из RAG evidence
- Проверка цитат сделана по нормализованному совпадению текста с `content` чанка
- Деплой на stage в рамках этой задачи не выполнялся

## Статус

Готово
