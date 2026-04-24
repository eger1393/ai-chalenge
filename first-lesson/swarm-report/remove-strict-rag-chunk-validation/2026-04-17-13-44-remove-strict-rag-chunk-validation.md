# Удаление stage-level проверки chunk_id и цитат в strict RAG validation

## Задача

Убрать в strict RAG-пайплайне проверку на этапе validation, которая валит ответ из-за некорректного `chunk_id` или неточного совпадения цитаты с чанком.

## Что изменено

- В `StepRunnerService.verifyRagExecutionOutput(...)` убрана кодовая проверка:
  - `chunk_id` входит в `CHUNKS_USED`
  - `chunk_id` существует в текущем RAG-блоке
  - цитата дословно содержится в `content`
- В `verifyStructuredRagExecution(...)` убрана та же проверка для JSON-формата
- В strict RAG validation prompt убрано требование заваливать ответ из-за неточного оформления `chunk_id` или цитаты
- В `renderStrictRagResponse(...)` убран `throw`, если `chunk_id` не найден в текущем RAG-блоке
  - теперь используется fallback `unknown` для `source_ref`, `source`, `message_id`, `published_at`
- Обновлён `PROJECT_MAP.md`

## Что осталось

- Проверка формата planning/execution
- Проверка `ANSWER`/`REFUSE`
- Проверка наличия `summary`
- Проверка наличия ссылок на чанки
- Проверка непустого `explanation`
- Проверка JSON-only контракта для structured strict RAG

## Проверка

- `cd backend && npm run build`
- `git diff --check`

## Риск

Теперь strict RAG validation больше не защищает от неправильной привязки ответа к чанку. Неверный `chunk_id` или неточная цитата могут пройти validation и дойти до пользователя.

## Статус

Готово
