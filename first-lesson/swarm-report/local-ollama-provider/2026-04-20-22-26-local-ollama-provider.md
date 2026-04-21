# Отчёт: local-ollama-provider

## Задача

Добавить к текущему ChatGPT/OpenAI локальный провайдер через Ollama-compatible `/v1`, вывести локальную модель на фронте и сохранить работоспособность существующего чата, pipeline, debug и сохранённых диалогов.

## Что реализовано

- В backend добавлен явный контракт `provider + model` вместо неявного выбора только по `model`.
- В `OpenAIService` добавлена маршрутизация между:
  - `openai` через `OPENAI_API_KEY`
  - `ollama` через `OLLAMA_BASE_URL`, `OLLAMA_API_KEY` и обязательный заголовок `X-GPU-Service: ollama`
- В mixed-режиме пользовательский execution может идти через локальный провайдер, а внутренние служебные шаги (`planning`, `validation`, query rewrite, sticky-facts extraction и GitHub issue summary) остаются на OpenAI.
- В persistence добавлены и протянуты поля провайдера:
  - `conversations.provider`
  - `message_steps.provider`
  - `message_meta.applied_provider`
- Во frontend добавлен выбор провайдера и локальной модели `gemma4:31b`.
- Локальные параметры теперь гидрируются из активного диалога целиком, чтобы сохранённый `provider/model` не перетирался локальным preset-ом при повторном открытии диалога.
- В sidebar/debug/meta отображается не только модель, но и провайдер.
- Обновлены `PROJECT_MAP.md`, `.env.example` и metadata фронтенда.

## Проверки

- `backend`: `npm run build` — успешно
- `frontend`: `npm run build` — успешно

## Ограничения и допущения

- Реализован согласованный mixed-режим, а не полный перенос всех внутренних LLM-шагов на локальную модель.
- Стоимость для локального провайдера считается как `0`, поэтому UI не показывает API-cost для `ollama`.
- Для локальной модели в каталоге контекстов зафиксирован практический лимит `32768`, а не теоретический максимум модели.
- Поддержка локального провайдера завязана на OpenAI-compatible слой `/v1`, а не на нативный Ollama `/api/chat`.

## Статус

Готово
