# План: инструмент RAG-документации для OpenCode

Дата: 2026-04-27

## Краткое описание задачи

Нужно реализовать инструмент/плагин для OpenCode, который анализирует настраиваемый список папок с документацией проекта и по запросу пользователя возвращает релевантные фрагменты документации как RAG-контекст.

Основной кейс: в проекте есть отчёты по фичам в `swarm-reports`, пользователь пишет запрос вида `/docs какие требования были к фиче фильтров?`, а OpenCode получает только релевантные куски документации без полного поиска по проекту.

## Принятые решения

- MVP-формат: локальная CLI-утилита + OpenCode-команда `/docs`.
- Поиск: hybrid retrieval, то есть lexical/BM25 + embeddings.
- Embeddings backend: OpenAI API.
- Папки для индексации: настраиваемый список через конфиг.
- Индекс: локально в `.docs-rag` внутри проекта.
- `.docs-rag` должен быть добавлен в `.gitignore`.
- Язык реализации: TypeScript.
- Остальные библиотеки и инфраструктурные детали выбираются по ходу реализации исходя из качества, поддержки и совместимости с проектом.
- Код должен быть читаемым, поддерживаемым и разделённым на слои.
- Нельзя смешивать CLI, бизнес-логику, storage, retrieval и интеграции с внешними API в одном модуле.

## Итоги Research

Лучше не встраивать RAG-логику напрямую в prompt/instructions OpenCode. Поддерживаемее сделать отдельную CLI-утилиту, которая отвечает за индексацию, чанкинг, хранение индекса, embeddings и retrieval. OpenCode при этом остаётся тонким клиентом: slash-команда `/docs` вызывает CLI и передаёт найденный контекст модели.

Такой подход даёт:

- переиспользование вне OpenCode через обычный терминал;
- управляемое обновление индекса;
- возможность постепенно улучшать retrieval без изменения UX;
- простую отладку выдачи и источников;
- будущую совместимость с MCP-сервером, если потребуется более глубокая интеграция.

## Целевая архитектура

```text
project/
  swarm-reports/
  docs/
  .opencode/
    commands/
      docs.md
  .docs-rag/
    config.json
    index.sqlite
    manifest.json
```

Поток выполнения:

```text
Пользователь:
/docs какие требования были к фиче фильтров?

OpenCode command:
1. вызывает docs-rag query "какие требования были к фиче фильтров?";
2. CLI ищет релевантные чанки в настроенных папках;
3. CLI возвращает markdown-контекст с источниками;
4. OpenCode отвечает пользователю только на основании полученного контекста.
```

## CLI

Предлагаемое имя: `docs-rag`.

Минимальные команды:

```bash
docs-rag init
docs-rag index
docs-rag query "какие требования были к фиче фильтров?"
docs-rag query "..." --format markdown --max-chunks 8
```

Дополнительные полезные команды:

```bash
docs-rag status
docs-rag reindex
docs-rag query "..." --format json
docs-rag query "..." --explain
```

## Конфиг

Пример `.docs-rag/config.json`:

```json
{
  "folders": ["swarm-reports"],
  "include": ["**/*.md", "**/*.mdx", "**/*.txt"],
  "exclude": ["**/node_modules/**", "**/.git/**", "**/.docs-rag/**"],
  "indexDir": ".docs-rag",
  "chunking": {
    "strategy": "markdown-headings",
    "maxTokens": 700,
    "overlapTokens": 100
  },
  "retrieval": {
    "mode": "hybrid",
    "topK": 8,
    "lexicalWeight": 0.45,
    "vectorWeight": 0.55
  },
  "embeddings": {
    "provider": "openai",
    "model": "text-embedding-3-small"
  }
}
```

`OPENAI_API_KEY` должен передаваться через переменную окружения, а не храниться в конфиге.

## Индексация

Pipeline:

```text
files -> markdown parser -> chunks -> metadata -> FTS index -> embeddings -> vector index
```

Для каждого чанка хранить:

- `id`;
- `file_path`;
- `heading_path`;
- `content`;
- `content_hash`;
- `file_mtime`;
- `token_count`;
- `embedding_model`;
- `embedding` или ссылку на vector storage.

Чанкинг для Markdown лучше строить по заголовкам `#`, `##`, `###`, а не по фиксированному количеству символов. Для больших секций использовать ограничение `maxTokens` и overlap.

## Retrieval

Для запроса:

```text
1. получить lexical results через SQLite FTS/BM25;
2. получить vector results через embedding запроса;
3. нормализовать scores;
4. объединить результаты;
5. удалить дубли;
6. вернуть top-k чанков.
```

Базовая формула ранжирования:

```text
final_score = lexical_score * lexicalWeight + vector_score * vectorWeight
```

Для MVP достаточно хранить vectors в SQLite, если объём документации небольшой. Если индекс вырастет, можно вынести vectors в LanceDB, Chroma, Qdrant или другой vector storage.

## Формат ответа CLI для OpenCode

CLI должна уметь возвращать markdown-контекст:

```markdown
# Retrieved Documentation Context

Query: какие требования были к фиче фильтров?

## Source 1
File: swarm-reports/filters-feature-2026-04-12.md
Heading: Requirements > Filters
Score: 0.86

Content:
...

## Source 2
File: swarm-reports/catalog-filters-validation-2026-04-13.md
Heading: Validation
Score: 0.74

Content:
...

# User Question
какие требования были к фиче фильтров?
```

## OpenCode-команда `/docs`

Команда должна выполнять примерно такую инструкцию:

```text
Вызови docs-rag query "$ARGUMENTS" --format markdown --max-chunks 8.
Используй полученный контекст как документационный RAG-контекст.
Отвечай только на основании найденных источников.
Если информации недостаточно, явно скажи это.
В конце укажи источники.
Не выполняй полный поиск по проекту, если пользователь явно не попросил.
```

## Security

- Не хранить `OPENAI_API_KEY` в `.docs-rag/config.json`.
- Добавить `.docs-rag` в `.gitignore`.
- Перед отправкой в OpenAI учитывать, что фрагменты документации уходят во внешний API.
- Добавить exclude patterns для секретов, окружений и приватных файлов.
- Не индексировать `.env`, credentials, keys, dumps, build artifacts.

Пример exclude:

```json
[
  "**/.env*",
  "**/*credential*",
  "**/*secret*",
  "**/*key*",
  "**/node_modules/**",
  "**/.git/**",
  "**/.docs-rag/**"
]
```

## Технологический стек

Основной язык реализации: TypeScript.

Предварительный стек:

- CLI: `commander` или `cac`;
- SQLite: `better-sqlite3`;
- FTS: SQLite FTS5;
- OpenAI: официальный `openai` npm package;
- Markdown parsing: `unified/remark` или `markdown-it`;
- token estimate: `tiktoken` или упрощённая оценка для MVP.

Финальный выбор конкретных библиотек остаётся на усмотрение реализации, но должен учитывать поддерживаемость, качество типов, активность пакетов и совместимость с архитектурой проекта.

## Требования к архитектуре кода

Код должен быть читаемым, поддерживаемым и разделённым на слои:

- CLI layer: парсинг команд, аргументов, форматирование ошибок и кодов выхода.
- Application layer: сценарии `init`, `index`, `query`, orchestration и transaction boundaries.
- Domain layer: модели `Document`, `Chunk`, `SearchResult`, правила чанкинга, скоринга и ранжирования.
- Infrastructure layer: filesystem, SQLite, OpenAI embeddings, чтение env/config.
- Presentation layer: markdown/json output для OpenCode и CLI-пользователя.

Ограничения:

- CLI не должен напрямую работать с SQLite или OpenAI.
- Application layer должен зависеть от интерфейсов, а не от конкретных инфраструктурных реализаций.
- Infrastructure layer не должен содержать бизнес-правила ранжирования и чанкинга.
- Форматирование ответа для OpenCode не должно быть смешано с retrieval-логикой.
- Модули должны быть небольшими и иметь явные ответственности.

## План реализации

1. Исследовать текущую структуру проекта и OpenCode config.
2. Выбрать место для CLI: отдельный package внутри репозитория или отдельный repository.
3. Реализовать `docs-rag init`.
4. Реализовать config loading и валидацию.
5. Реализовать обход папок по `include`/`exclude`.
6. Реализовать markdown-aware chunking.
7. Реализовать SQLite schema и FTS index.
8. Реализовать OpenAI embeddings.
9. Реализовать vector similarity.
10. Реализовать hybrid ranker.
11. Реализовать `docs-rag query` с `markdown` и `json` форматами.
12. Добавить OpenCode `/docs` command.
13. Проверить на `swarm-reports` вопросом про требования к фиче.
14. Добавить документацию по установке и использованию.

## Validation

Минимальная проверка для MVP:

- `docs-rag init` создаёт `.docs-rag/config.json`;
- `docs-rag index` индексирует markdown-файлы из настроенных папок;
- повторный `docs-rag index` не пересчитывает неизменённые файлы;
- `docs-rag query "..." --format markdown` возвращает top-k источников;
- `/docs ...` в OpenCode использует найденный контекст и указывает источники;
- секреты и `.env` не попадают в индекс.

## Риски

- Hybrid search сложнее простого FTS: нужны embeddings, нормализация score и обработка rate limits.
- OpenAI API получает фрагменты документации, поэтому нельзя индексировать секреты и приватные данные без фильтрации.
- `.docs-rag` нельзя коммитить, иначе в репозитории окажутся локальные индексы и потенциально чувствительные фрагменты документации.
- Без источников RAG-ответы сложно проверять, поэтому источники обязательны.

## Статус

Частично: подготовлен архитектурный план. Реализация CLI и OpenCode-команды ещё не выполнялась.
