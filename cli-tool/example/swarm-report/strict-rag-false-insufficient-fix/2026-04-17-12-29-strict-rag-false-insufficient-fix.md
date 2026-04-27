# Отчёт по задаче `strict-rag-false-insufficient-fix`

## Проблема

Strict RAG на stage ложно выбирал `RAG_VERDICT: INSUFFICIENT` даже в случаях, когда retrieval уже отобрал прямые релевантные чанки с ответом по теме запроса.

## Что исправлено

- В [backend/src/message-processing/services/step-runner.service.ts](/mnt/c/source/ai-chalenge/first-lesson/backend/src/message-processing/services/step-runner.service.ts):
  - усилен planning prompt для strict RAG
  - добавлены явные правила и пример для запроса про проблемы `Claude Code`
  - ужесточён parser planning-формата:
    - поля теперь читаются как одиночные строгие строки
    - дубли и кривые значения вроде `RESPONSE_MODE: RESPONSE_MODE: REFUSE` больше не принимаются
- В [backend/src/message-processing/services/step-orchestrator.service.ts](/mnt/c/source/ai-chalenge/first-lesson/backend/src/message-processing/services/step-orchestrator.service.ts):
  - добавлен code-side guard против ложного `INSUFFICIENT`
  - если planning пытается отказаться на обобщающем вопросе при уже выбранных сильных прямых чанках, такой план отклоняется до execution и уходит на повторную попытку
- В [PROJECT_MAP.md](/mnt/c/source/ai-chalenge/first-lesson/PROJECT_MAP.md) зафиксирован новый контракт false-negative guard для strict RAG

## Как работает guard

- Проверяется вопрос после `query rewrite`
- Для обобщающих вопросов вроде `какие проблемы`, `что не так`, `что писал`, `что известно`
- Если в `ragResult.matches` есть сильные чанки:
  - достаточно длинные
  - с сильным similarity / reranker score
  - с сигналами проблем / ограничений для problem-style запросов
- Тогда planning не имеет права выбирать `REFUSE`

## Проверка

- `cd backend && npm run build`
- `git diff --check`

## Ограничения

- Guard эвристический и нацелен на уменьшение ложных отказов для обобщающих вопросов
- Он не подменяет retrieval и не гарантирует полноту ответа для сложных многосоставных запросов

## Статус

Исправлен
