# Отчёт по задаче `strict-rag-source-normalization`

## Проблема

В strict RAG-режиме итоговый ответ мог проходить pipeline без полноценного блока подтверждений: пользователю не гарантировались цитаты и стабильные ссылки на источник по каждому использованному чанку.

## Корневая причина

- strict RAG проверял наличие `chunk_id` и цитат только на уровне сырых данных execution-ответа
- итоговый пользовательский ответ сохранялся как есть, без нормализации в стабильный формат источников
- pipeline не требовал явную непустую секцию `Краткий ответ`, поэтому модель могла вернуть слабую или неполную структуру

## Что исправлено

- В [backend/src/message-processing/services/step-runner.service.ts](/mnt/c/source/ai-chalenge/first-lesson/backend/src/message-processing/services/step-runner.service.ts):
  - добавлена обязательная проверка секции `Краткий ответ`
  - сохранён audit strict RAG с кратким ответом
  - добавлен нормализатор финального strict RAG-ответа
- В [backend/src/message-processing/services/step-orchestrator.service.ts](/mnt/c/source/ai-chalenge/first-lesson/backend/src/message-processing/services/step-orchestrator.service.ts):
  - после успешной strict RAG-проверки execution-результат преобразуется в единый формат ответа
- Итоговый ответ теперь содержит раздел `Источники и цитаты`, где для каждого доказательства выводятся:
  - `chunk_id`
  - `source_ref`
  - `source`
  - `message_id`
  - `published_at`
  - дословная цитата
  - пояснение связи с ответом
- Обновлён [PROJECT_MAP.md](/mnt/c/source/ai-chalenge/first-lesson/PROJECT_MAP.md) с фиксацией нового контракта strict RAG

## Проверка

- `cd backend && npm run build`
- `git diff --check`

## Ограничения

- `source_ref` — это стабильная внутренняя ссылка на источник вида `sourceType:sourceKey/message:externalId#chunk:chunkIndex`
- Публичный URL вида `https://t.me/...` не гарантируется, потому что текущий Telegram-дамп может не содержать `username` или `link`

## Статус

Исправлен
