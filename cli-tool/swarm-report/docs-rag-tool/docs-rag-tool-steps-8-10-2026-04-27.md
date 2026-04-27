# docs-rag: реализация шагов 8-10

Дата: 2026-04-27

## Краткое описание задачи

Продолжить `docs-rag`: добавить vector search по сохранённым embeddings, объединить lexical/vector выдачу hybrid ranker и доработать markdown/json presentation.

## Итоги Research

- Для MVP vectors можно хранить в SQLite как JSON и искать полным перебором по cosine similarity; это приемлемо для локальной документации малого объёма.
- Hybrid ranker должен объединять результаты по `chunkId`, нормализованные scores хранить отдельно и возвращать `finalScore`.
- Query теперь требует query embedding, поэтому без `OPENAI_API_KEY` должен завершаться понятной ошибкой, а не молча переходить в lexical-only режим.

## План

1. Добавить vector search repository поверх SQLite chunks с `embedding_json`.
2. Реализовать cosine similarity и top-k vector results.
3. Добавить hybrid ranker в domain layer.
4. Обновить `queryDocuments`: lexical search + query embedding + vector search + ranker.
5. Доработать markdown/json output: final score, lexical score, vector score, источники.

## Что реализовано

- `src/infrastructure/sqlite-chunk-storage.ts`:
  - `searchVector(projectRoot, queryVector, model, limit)`;
  - parsing `embedding_json`;
  - cosine similarity;
  - top-k vector results.
- `src/domain/search.ts`:
  - `lexicalScore?`, `vectorScore?`;
  - `rankHybridResults(...)`.
- `src/application/query-documents.ts`:
  - query embedding через `EmbeddingProvider`;
  - lexical candidates + vector candidates;
  - merge по `chunkId` и weighted score.
- `src/presentation/format-results.ts`:
  - markdown выводит `Retrieved Documentation Context`, source path, heading, final/lexical/vector scores;
  - json возвращает results со score-полями.
- `src/cli/help.ts`, `README.md` — уточнено, что query использует hybrid retrieval и требует `OPENAI_API_KEY`.

## Результаты Validation

- `npm run build` — успешно.
- Vector search проверен с synthetic embeddings через storage API — успешно.
- Hybrid query проверен с fake embedding provider — успешно.
- Presentation markdown/json проверены на наличие final/lexical/vector scores — успешно.
- CLI `query` без `OPENAI_API_KEY` — понятная ошибка и exit code 2.
- `git diff --check` по изменённым путям — без замечаний.

## Проблемы и откаты

- Реальный OpenAI query embedding не проверялся из-за отсутствия `OPENAI_API_KEY` в окружении.
- Для validation использовались synthetic vectors и fake provider, чтобы проверить deterministic vector/hybrid logic без сетевых вызовов.

## Остаточные риски

- Vector search сейчас выполняет полный перебор vectors из SQLite; для большого индекса понадобится специализированное vector storage или ANN.
- Query без API key больше не может выполнить даже lexical fallback; это осознанно, чтобы не маскировать отсутствие hybrid retrieval.
- Synthetic test не заменяет интеграционную проверку с реальным OpenAI API.

## Статус

Частично: шаги 8-10 реализованы, но OpenAI integration test требует `OPENAI_API_KEY`.
