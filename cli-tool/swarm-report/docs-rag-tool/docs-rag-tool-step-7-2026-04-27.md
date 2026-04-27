# docs-rag: реализация шага 7

Дата: 2026-04-27

## Краткое описание задачи

Добавить OpenAI embeddings для чанков и подготовить хранение embedding model/vector в локальном SQLite-индексе.

## Итоги Research

- `OPENAI_API_KEY` остаётся только runtime env-переменной и не попадает в config, manifest или SQLite schema как secret.
- Embeddings должны сохраняться для чанков и не пересчитываться для неизменённых chunks.
- Vector search и hybrid ranking относятся к следующим шагам; на этом шаге достаточно provider adapter, сохранения vectors и контролируемых ошибок OpenAI.

## План

1. Добавить OpenAI SDK.
2. Ввести application interface для embedding provider.
3. Сохранять `embedding_model` и serialized vector в SQLite chunks.
4. Не пересчитывать embeddings для чанков, у которых уже есть vector для текущей модели.
5. Дать понятную ошибку при отсутствии `OPENAI_API_KEY`.

## Что реализовано

- `src/application/embed-chunks.ts` — use-case генерации недостающих embeddings пачками.
- `src/infrastructure/openai-embedding-provider.ts` — OpenAI adapter, env-only key, контролируемые ошибки.
- `src/infrastructure/sqlite-chunk-storage.ts` — поля `embedding_model`, `embedding_json`, выборка chunks без embeddings, сохранение vectors.
- `src/application/index-documents.ts` — index pipeline теперь после SQLite upsert генерирует недостающие embeddings.
- `README.md` — добавлена инструкция запуска `index` с `OPENAI_API_KEY`.
- `package.json/package-lock.json` — добавлен пакет `openai`.

## Результаты Validation

- `npm run build` — успешно.
- `node dist/cli/index.js index --project-root ../..` без `OPENAI_API_KEY` — завершился понятной ошибкой:
  - `OPENAI_API_KEY не задан. Передайте ключ через переменную окружения, не через config.json.`
- Проверено, что lexical `query` продолжает читать уже построенный FTS index.
- `git diff --check` по изменённым путям — без замечаний.

## Проблемы и откаты

- Реальный OpenAI-вызов не запускался, потому что в окружении не задан `OPENAI_API_KEY`.
- SQLite storage изменён с полной очистки chunks на upsert/delete-absent flow, чтобы не терять embeddings неизменённых chunks.

## Остаточные риски

- Нужно провести интеграционную проверку с реальным `OPENAI_API_KEY`.
- Vector search ещё не реализован; сохранённые vectors будут использоваться на шаге 8.
- `embedding_json` хранит vector в SQLite как JSON; для MVP это приемлемо, но для большого индекса может потребоваться более эффективное хранение.

## Статус

Частично: код шага 7 реализован, но реальный OpenAI integration test не выполнен без API key.
