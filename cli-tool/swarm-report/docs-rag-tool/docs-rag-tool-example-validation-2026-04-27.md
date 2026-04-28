# docs-rag: validation на example/swarm-report

Дата: 2026-04-27

## Краткое описание задачи

Проверить локальный запуск `docs-rag` из каталога `cli-tool`, чтение `OPENAI_API_KEY` из локального `.env`, индексацию `example/swarm-report`, создание SQLite БД и наличие реальных embeddings.

## Тест-план

1. Собрать CLI через `npm run build`.
2. Запустить `auth status` из текущего каталога `cli-tool` и убедиться, что ключ найден из `.env`.
3. Выполнить `init --project-root . --force --folders example/swarm-report`.
4. Выполнить `index --project-root .`.
5. Проверить `.docs-rag/manifest.json` и `.docs-rag/index.sqlite`.
6. Проверить SQLite: количество chunks, количество embeddings, модель, размерность vector.
7. Выполнить `query` в `json` и `markdown` форматах.

## Что реализовано по ходу проверки

- Добавлена загрузка `OPENAI_API_KEY` из `.env` текущей директории запуска CLI.
- Добавлена фильтрация binary-like файлов при discovery: два `.txt` файла в example dataset оказались бинарными и ломали OpenAI embeddings limit.

## Результаты Validation

- `npm run build` — успешно.
- `node tools/docs-rag/dist/cli/index.js auth status` из `cli-tool` — ключ найден из `/mnt/c/Source/ai-chalenge/cli-tool/.env`, значение не выводится.
- `init --project-root . --force --folders example/swarm-report` — успешно, config указывает на `example/swarm-report`.
- Первый `index` выявил проблему: OpenAI API вернул `maximum input length is 8192 tokens` на бинарном `.txt` файле.
- После binary filtering повторный `index` — успешно:
  - Documents: 124;
  - Chunks: 1169;
  - Embeddings generated: 1169;
  - Removed: 2 binary-like `.txt` файла.
- SQLite проверка:
  - `.docs-rag/index.sqlite` существует;
  - chunks: 1169;
  - embedded: 1169;
  - model: `text-embedding-3-small`;
  - vector dimensions: 1536;
  - vector non-zero: true.
- Smoke query `что делали для rag reranker` вернул релевантные источники из `example/swarm-report` с lexical/vector/final scores.
- Markdown output содержит `Retrieved Documentation Context`, источники и score-поля.

## Проблемы и откаты

- Бинарные `.txt` файлы `acl-agents-before.txt` и `acl-first-lesson-local-before.txt` попадали в discovery из-за include `**/*.txt`; теперь binary-like файлы пропускаются.
- `.docs-rag` не коммитится и остаётся runtime-артефактом.

## Статус

Done.
