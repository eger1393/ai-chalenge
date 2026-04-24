# Отчёт: rag-query-rewrite-ollama-json-mode

- Дата: `2026-04-22 19:35`
- Статус: `Готово`

## Краткое описание задачи

Исправить падение backend-RAG на шаге `query rewrite` при работе через локальный `Ollama`/`gemma4:31b`, не снимая глобально лимиты с системных запросов.

## Что реализовано

- Откатил временную попытку снять лимиты с внутренних one-shot запросов backend.
- В `OpenAIService` добавил точечную поддержку `response_format` для non-streaming chat completion.
- В `RagQueryRewriteService` оставил существующий лимит `RAG_QUERY_REWRITE_MAX_TOKENS = 128`, но включил явный JSON mode через `response_format: { type: "json_object" }`.
- Остальные внутренние вызовы `callOpenAI` оставлены без изменений.

## Корневая причина

- Шаг `query rewrite` требовал JSON только текстовой инструкцией в промпте.
- Для `Ollama`/`gemma4:31b` через `/v1/chat/completions` этого оказалось недостаточно: модель могла завершать запрос с `finish=length` и не отдавать пригодный `message.content`.
- Из-за fail-fast-проверки backend корректно падал с `RAG query rewrite returned empty response`.

## Результаты проверки

- Выполнено: `npm run build` в `backend/`
- Результат: успешно

## Ограничения и допущения

- Исправление таргетировано на `query rewrite`; другие системные JSON-задачи не переводились на `response_format` в рамках этой задачи.
- Для полной валидации поведения именно с `Ollama` полезен отдельный runtime smoke-test на живом запросе rewrite.
