# docs-rag: реализация шагов 4-6

Дата: 2026-04-27

## Краткое описание задачи

Продолжить реализацию `docs-rag` после CLI/init: добавить file discovery, manifest, markdown-aware chunking, SQLite storage и FTS lexical search.

## Итоги Research

- Для поиска файлов выбран `fast-glob`: он поддерживает include/exclude, dotfiles и отключение symlink-following.
- Runtime-артефакты остаются в `.docs-rag`: `manifest.json` и `index.sqlite`.
- Чанкинг реализован без внешнего markdown-parser, но с учётом заголовков и fenced code blocks; это достаточно для MVP и не мешает позже заменить реализацию.
- Для SQLite выбран `better-sqlite3`; storage слой изолирован от CLI и presentation.

## План

1. Реализовать discovery документов по `folders/include/exclude`.
2. Считать `mtime`, размер и `sha256` content hash.
3. Сохранять `.docs-rag/manifest.json` и рассчитывать added/changed/unchanged/removed.
4. Добавить domain-модели документов и чанков.
5. Реализовать markdown-aware chunking по heading path, maxTokens и overlap.
6. Сохранять документы/чанки в SQLite и строить FTS5 index.
7. Подключить `query` к lexical search и markdown/json presentation.

## Что реализовано

- `src/domain/manifest.ts` — manifest model и diff.
- `src/application/index-documents.ts` — index orchestration.
- `src/infrastructure/fast-glob-document-discovery.ts` — обход файлов и hashing.
- `src/infrastructure/fs-manifest-repository.ts` — чтение/запись manifest.
- `src/domain/document.ts` — `SourceDocument` и `Chunk`.
- `src/domain/markdown-chunker.ts` — markdown-aware chunking, heading path, overlap.
- `src/infrastructure/fs-document-reader.ts` — чтение исходных документов.
- `src/infrastructure/sqlite-chunk-storage.ts` — SQLite schema, chunks table, FTS5, BM25 lexical search.
- `src/application/query-documents.ts` — application use-case query.
- `src/presentation/format-results.ts` — markdown/json output.
- `package.json/package-lock.json` — добавлены `fast-glob`, `better-sqlite3`, `@types/better-sqlite3`.

## Результаты Validation

- `npm install fast-glob` — успешно.
- `npm install better-sqlite3 && npm install --save-dev @types/better-sqlite3` — успешно.
- `npm run build` — успешно.
- `node dist/cli/index.js index --project-root ../..` — успешно:
  - manifest создан;
  - SQLite index создан;
  - найдено 3 документа и 45 чанков;
  - повторный запуск показывает unchanged без дублей.
- `node dist/cli/index.js query "RAG OpenAI" --project-root ../.. --format json --max-chunks 2` — успешно, возвращает релевантные источники.
- `git diff --check` по изменённым путям — без замечаний.

## Проблемы и откаты

- Первичная версия markdown parser ошибочно воспринимала markdown-заголовки внутри fenced code blocks как реальные headings; исправлено через отслеживание code fences.
- Первичная нормализация BM25 делала score неинтуитивным; скоринг скорректирован так, чтобы более релевантные FTS-результаты имели больший score.

## Остаточные риски

- SQLite storage на шаге 6 пересобирает таблицы целиком; для малых локальных docs это допустимо, но на шаге 7 перед embeddings нужно перейти к сохранению embeddings для неизменённых chunks.
- Markdown chunker использует приближённую токенизацию по whitespace; точный tokenizer можно добавить позже.
- Vector/hybrid search ещё не реализован — текущий `query` использует только FTS/BM25.

## Статус

Done для шагов 4-6.
