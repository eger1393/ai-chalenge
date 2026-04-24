# Отчёт: add-gemma4-26b-model-option

- Дата: `2026-04-24 13:09`
- Статус: `Готово`

## Краткое описание задачи

Добавить `gemma4:26b` как доступную модель провайдера `ollama` в backend и
frontend, не меняя существующий provider contract и не делая её новым дефолтом.

## Что реализовано

- В backend обновлён whitelist моделей провайдера `ollama`:
  - `backend/src/ai/dto/ai-params.dto.ts`
  - добавлена модель `gemma4:26b` в `PROVIDER_MODELS`
  - добавлен zero-cost pricing для локальной модели
  - добавлен practical context window `32768`
- Во frontend обновлён каталог моделей:
  - `frontend/src/types/ai-params.ts`
  - добавлена модель `gemma4:26b` в `MODELS_BY_PROVIDER`
  - добавлен UI label `Gemma 4 26B — local`
  - добавлен `MODEL_CONTEXT_SIZES['gemma4:26b'] = 32768`
- Заодно синхронизирован frontend context size и для уже существующей
  `gemma4:31b`, чтобы UI больше не падал на fallback `128000` для локальных
  `Ollama`-моделей.

## Результаты проверки

- `backend`: `npm run build` — успешно
- `frontend`: `npm run build` — успешно

## Ограничения и допущения

- В рамках этой задачи модель только добавлена в product whitelist и UI.
- Default порядок для `ollama` не менялся: первой моделью остаётся
  `gemma4:31b`, чтобы не менять поведение существующих пресетов и сохранённых
  сценариев без отдельного решения.
- Runtime-оценка новой модели уже была выполнена отдельной задачей и сохранена в
  `swarm-report/ollama-gemma-gpu-fit-check/2026-04-24-13-02-ollama-gemma-gpu-fit-check.md`.
