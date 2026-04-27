# Отчёт по задаче `strict-rag-stage-diagnosis`

## Проблема

На stage strict RAG ответил отказом на запрос `че-каво, какие траблы с клод кодом были?`, хотя debug показывал, что RAG был включён.

## Что проверено

- Сообщение в stage-БД:
  - `message_id`: `3cdafb7d-d669-435e-b984-1373301d2a59`
  - `conversation_id`: `cfa7ce43-5ef5-4459-a2c8-9846cb2ecdba`
  - `created_at`: `2026-04-17 09:15:39.733789+00`
- `message_debug`
- `message_steps`
- backend-логи вокруг времени обработки

## Вывод

- Retrieval сработал корректно:
  - query rewrite переписал запрос в `какие проблемы были с Claude Code`
  - vector search нашёл `12` кандидатов
  - reranker отобрал `4` чанка
- В `rag_context` сохранено:
  - `candidateCount = 12`
  - `selectedCount = 4`
  - режим `reranker`
- В selected chunks были реальные релевантные источники:
  - `6848` — пост с конкретными проблемами Claude Code: ложноположительный статус правок, скрытое сжатие контекста, слепая зона на 2000 строк, усечение tool results, отсутствие AST
  - `6893` — пост про рост расхода токенов, 1M контекст и удаление опции очистки контекста
  - `6535` — пост про деградацию ценности подписки
  - `6042` — короткий чанк про Max в Claude Code
- Ошибка произошла на стадии planning:
  - planning выдал `RAG_VERDICT: INSUFFICIENT`
  - `CHUNKS_USED: NONE`
  - `MISSING_INFO: Нет достаточно информации о конкретных проблемах с Claude Code`
- Execution просто выполнил этот план и вернул отказ
- Validation это пропустил, потому что проверял согласованность `plan -> execution`, а не корректность самого `RAG_VERDICT` относительно реальных чанков

## Дополнительное наблюдение

- В planning output есть дефект формата: `RESPONSE_MODE: RESPONSE_MODE: REFUSE`
- Текущий parser это проглотил, потому что regex всё равно извлёк `REFUSE`

## Корневая причина

Не retrieval и не query rewrite.

Корневая причина — ложный `INSUFFICIENT` на стадии strict RAG planning и недостаточно строгая validation, которая не умеет заваливать такие false negative случаи.

## Статус

Диагностировано
