# Отчёт: ollama-v1-reasoning-empty-content

- Дата: `2026-04-22 19:37`
- Статус: `Частично`

## Описание проблемы

Локальный backend продолжает падать на шаге `RAG query rewrite` с ошибкой `RAG query rewrite returned empty response` при использовании провайдера `ollama` и модели `gemma4:31b`.

## Шаги воспроизведения

1. Подключение к SSH-хосту `superlook-gpu-dev`.
2. Проверка `ollama.service` через `journalctl`.
3. Повторный вызов `POST /v1/chat/completions` на `127.0.0.1:11434` с JSON-режимом и `max_tokens=128`.
4. Повторный вызов `POST /api/chat` на том же хосте с `think:false` и `format:"json"`.

## Что найдено

- `ollama.service` активен, модель загружается штатно, transport-level ошибок и падения процесса нет.
- Во время пользовательской ошибки сервис вернул `200` на `/v1/chat/completions`.
- Для короткого тестового JSON-запроса через `/v1/chat/completions` сервер вернул:
  - `finish_reason: "length"`
  - `message.content: ""`
  - `message.reasoning: <непустой reasoning>`
- Передача `think:false` в `/v1/chat/completions` не изменила поведение.
- Нативный `POST /api/chat` с `think:false` и `format:"json"` возвращает непустой `message.content` и не уходит в `thinking`.

## Корневая причина

- Проблема не в падении `Ollama` и не в GPU-сервере.
- Проблема в OpenAI-совместимом `/v1`-слое `Ollama 0.21.0` для `gemma4:31b`: модель расходует лимит completion на `message.reasoning` и не заполняет `message.content`.
- Текущий backend читает только `choices[0].message.content`, поэтому корректно считает ответ пустым и падает по fail-fast.
- Использование `response_format: { type: "json_object" }` оказалось недостаточным: `/v1` всё равно может вернуть пустой `content`.

## Результаты проверки

- `ssh superlook-gpu-dev` работает.
- `systemctl is-active ollama` -> `active`.
- `journalctl -u ollama` показал успешный `200` на `/v1/chat/completions` в момент ошибки.
- Ручной reproduce на `/v1/chat/completions` подтвердил пустой `content` и непустой `reasoning`.
- Ручной reproduce на `/api/chat` подтвердил, что нативный маршрут лучше подходит для strict JSON-задач.

## Что исправлено

- Код на этом этапе не менялся.
- Диагностика показала, что следующий правильный фикс — не снимать лимиты, а обходить проблемный `/v1`-маршрут для strict JSON-задач на `ollama` и использовать нативный `/api/chat` с `think:false`.
