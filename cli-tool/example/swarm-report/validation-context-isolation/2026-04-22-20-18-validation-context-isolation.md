# Отчёт: validation-context-isolation

- Дата: `2026-04-22 20:18`
- Статус: `Исправлен`

## Описание проблемы

На шаг `validation` продолжали попадать лишние данные: assembled memory, история диалога и исходный пользовательский turn как часть chat-контекста. Из-за этого валидатор отвечал по существу запроса или пересказывал входные данные вместо формата `VERDICT/SCORE/REASON/ISSUES`.

## Корневая причина

- `buildValidationMessages()` в `standard` и `rag` стратегиях использовал общий `buildStageMessages()`, который автоматически добавляет:
  - assembled system prompt
  - инварианты-блок
  - историю диалога
  - последний `userMessage`
- Такой контекст был уместен для planning/execution, но вредил validation.

## Что исправлено

- Validation в `standard` и `rag` больше не использует общий stage-builder.
- Теперь validation получает только минимальный набор сообщений:
  - system prompt валидатора
  - встроенные данные проверки (`user request`, `plan`, `execution result`)
  - для RAG отдельно `ragEvidencePrompt`
  - короткий технический user prompt с требованием вернуть только `VERDICT/SCORE/REASON/ISSUES`
- Из validation полностью убраны:
  - assembled memory / personalization
  - история диалога
  - исходный пользовательский turn как обычное chat-сообщение
- Дополнительно усилен prompt: первая строка должна начинаться с `VERDICT:`, запрещены markdown/code fences и пересказ входных данных.
- По пути исправлен регресс в planning prompt wiring, чтобы planning снова получал исходный `userContent`.

## Результаты проверки

- Выполнено: `npm run build` в `backend/`
- Результат: успешно

## Ограничения

- Validation всё ещё получает `user request`, `plan` и `execution result` внутри system prompt, потому что без них он не сможет проверять соответствие ответа запросу и плану.
- Если требуется предельно жёсткий режим с проверкой только `execution result`, это можно сделать отдельно, но качество проверки соответствия исходной задаче снизится.
