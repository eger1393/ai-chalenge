# Отчёт: rag-query-rewrite-ollama-native-chat

- Дата: `2026-04-22 19:42`
- Статус: `Готово`

## Краткое описание задачи

Устранить падение `RAG query rewrite returned empty response` для провайдера `ollama` и модели `gemma4:31b` без глобального снятия лимитов с системных запросов.

## Что реализовано

- В `OpenAIService` добавлен отдельный вызов нативного `Ollama API` через `/api/chat`.
- Для `RagQueryRewriteService` запрос rewrite при `provider === "ollama"` переведён с `/v1/chat/completions` на нативный `/api/chat`.
- В нативный запрос передаются `think:false`, `format:"json"`, `temperature:0`, `num_predict=128`.
- Сохранён существующий fail-fast для действительно пустого ответа.
- Добавлен явный repair неканоничного JSON-ответа модели для наблюдавшихся форм:
  - альтернативные имена поля запроса (`rewritten_query`, `search_query`, массив `rewritten_queries`)
  - отсутствие/поломка `applied`
  - невалидный `reason`
- Repair не является тихим: он отдельно логируется как `Query rewrite payload repaired`.

## Корневая причина

- `Ollama 0.21.0` для `gemma4:31b` через `/v1/chat/completions` возвращал `message.reasoning` и пустой `message.content`.
- Backend ожидал данные только в `message.content`, поэтому корректно падал на fail-fast проверке.
- Даже на нативном `/api/chat` модель может вернуть JSON не строго по контракту, поэтому одного переключения маршрута недостаточно.

## Результаты проверки

- Выполнено: `npm run build` в `backend/`
- Результат: успешно

## Ограничения и допущения

- Локальная сборка подтверждена, но runtime-проверка полного backend-пайплайна требует запуска обновлённого сервиса с рабочими `OLLAMA_*` env.
- Repair для неканоничного JSON ограничен только rewrite-задачей и не меняет поведение других LLM-вызовов.
