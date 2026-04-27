# Отчёт: ollama-fast-profiles

- Дата: `2026-04-23 14:15`
- Статус: `Готово`

## Краткое описание задачи

Ускорить локальную модель `ollama/gemma4:31b` в backend за счёт task-specific runtime-профилей и использования нативного `Ollama API` там, где это даёт практический выигрыш.

## Что реализовано

### 1. Нативный fast-path для non-tool стадий pipeline

В `OpenAIService` добавлен `callOllamaNativeChatStream()` для `POST /api/chat` со streaming.

Это позволило использовать для `ollama` в non-tool стадиях:

- `keep_alive`
- `num_ctx`
- `num_predict`
- `think:false`

### 2. Stage-specific профили в `StepRunnerService`

Для `provider === "ollama"` и `runStep()` теперь применяются профили:

- `planning`
  - `keep_alive = 10m`
  - `num_ctx = 8192`
  - `num_predict = min(maxTokens, 1200)`
  - `think = false`
- `validation`
  - `keep_alive = 10m`
  - `num_ctx = 4096`
  - `num_predict = min(maxTokens, 160)`
  - `think = false`
- `execution`
  - `keep_alive = 10m`
  - `num_ctx = 16384`
  - `num_predict = maxTokens`
  - `think = false`

### 3. Быстрый профиль для `RAG query rewrite`

`RagQueryRewriteService` уже использовал нативный `/api/chat`; ему дополнительно выставлены:

- `keep_alive = 10m`
- `num_ctx = 4096`
- `num_predict = 128`
- `think = false`
- `format = "json"`

## Что это должно улучшить

- Уменьшить cold-start penalty за счёт удержания модели в памяти
- Снизить latency planning/validation за счёт меньшего `num_ctx`
- Уменьшить лишнюю генерацию на внутренних стадиях через ограниченный `num_predict`
- Убрать ненужные рассуждения на stage-задачах через `think:false`
- Снизить overhead OpenAI-compatible `/v1` для non-tool стадий за счёт перехода на нативный `/api/chat`

## Что не менялось

- `runStepWithTools()` оставлен на OpenAI-compatible потоке, потому что tool-calling контур уже завязан на этот формат.
- Пользовательский tool-aware execution для `standard`-стратегии не переводился на нативный `/api/chat` в рамках этой задачи.

## Результаты проверки

- Выполнено: `npm run build` в `backend/`
- Результат: успешно

## Ограничения

- Реальный выигрыш по latency нужно подтвердить runtime-замером на живых запросах.
- Самый заметный прирост ожидается на `planning`, `validation` и `rewrite`; tool-aware execution ускорен меньше, потому что остаётся на `/v1`.
