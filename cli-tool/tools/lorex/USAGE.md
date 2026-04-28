# Lorex Usage Guide

`lorex` — локальная CLI-утилита для RAG-поиска по документации проекта. Она индексирует выбранные папки, строит SQLite/FTS индекс, создаёт OpenAI embeddings и возвращает релевантные фрагменты документации для CLI или OpenCode.

## Установка в Другом Проекте

### Вариант 1: Локальная разработка через npm link

В репозитории, где лежит исходник `lorex`:

```bash
cd tools/lorex
npm install
npm run build
npm link
```

В целевом проекте после этого доступна команда:

```bash
lorex --help
```

### Вариант 2: Запуск без npm link

Можно вызывать CLI напрямую:

```bash
node /path/to/tools/lorex/dist/cli/index.js --help
```

## OpenAI API Key

`lorex` использует OpenAI только для embeddings. Ключ нельзя хранить в `.lorex/config.json`.

Поддерживаются два безопасных способа.

### Через env

```bash
export OPENAI_API_KEY="sk-..."
```

### Через локальный .env

Создайте `.env` в директории, откуда запускаете `lorex`:

```bash
OPENAI_API_KEY=sk-...
```

`lorex` читает только `.env` текущей директории запуска и не ищет файл выше по дереву.

Проверьте доступность ключа:

```bash
lorex auth status
```

## Инициализация Проекта

В целевом проекте:

```bash
cd /path/to/project
lorex init --project-root . --folders docs,swarm-report
```

Если нужно перезаписать существующий config:

```bash
lorex init --project-root . --force --folders docs,swarm-report
```

После init создаётся:

```text
.lorex/config.json
```

Также `lorex` добавляет `.lorex/` в `.gitignore`, если правила ещё нет.

## Конфиг

Пример `.lorex/config.json`:

```json
{
  "folders": ["docs", "swarm-report"],
  "include": ["**/*.md", "**/*.mdx", "**/*.txt"],
  "exclude": [
    "**/.env*",
    "**/*credential*",
    "**/*credentials*",
    "**/*secret*",
    "**/*key*",
    "**/node_modules/**",
    "**/.git/**",
    "**/.lorex/**",
    "**/dist/**",
    "**/build/**"
  ],
  "indexDir": ".lorex",
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

Не используйте `folders: ["."]`: задавайте явные папки с документацией.

## Индексация

```bash
lorex index --project-root .
```

Команда создаёт или обновляет:

```text
.lorex/manifest.json
.lorex/index.sqlite
```

Что происходит при index:

- поиск файлов по `folders`, `include`, `exclude`;
- пропуск binary-like файлов;
- расчёт hash, размера и `mtime`;
- markdown-aware chunking по заголовкам;
- сохранение документов и чанков в SQLite;
- построение FTS5 индекса;
- генерация OpenAI embeddings для новых/изменённых чанков.

Повторный `index` не должен пересчитывать embeddings для неизменённых чанков.

## Поиск

Markdown-вывод:

```bash
lorex query "какие требования были к RAG reranker?" --project-root . --format markdown --max-chunks 8
```

JSON-вывод:

```bash
lorex query "какие требования были к RAG reranker?" --project-root . --format json --max-chunks 8
```

`query` использует hybrid retrieval:

- SQLite FTS/BM25 lexical search;
- OpenAI embedding для пользовательского запроса;
- vector search по сохранённым embeddings;
- weighted ranking через `lexicalWeight` и `vectorWeight`.

Markdown output содержит:

- `Retrieved Documentation Context`;
- source file;
- heading path;
- final score;
- lexical score;
- vector score;
- content.

## OpenCode Интеграция

В целевом проекте можно добавить `.opencode/commands/docs.md`:

````markdown
# /docs

Вызови локальный lorex CLI и используй результат как документационный RAG-контекст.

```bash
lorex query "$ARGUMENTS" --project-root "$PROJECT_ROOT" --format markdown --max-chunks 8
```

Инструкции для ответа:

- Отвечай только на основании `Retrieved Documentation Context`.
- В конце укажи источники из секций `Source`.
- Если контекст пустой или данных недостаточно, скажи это явно.
- Не выполняй полный поиск по проекту без явной просьбы пользователя.
````

Если `$PROJECT_ROOT` недоступен в вашей версии OpenCode, используйте явный путь:

```bash
lorex query "$ARGUMENTS" --project-root /path/to/project --format markdown --max-chunks 8
```

## Security

- Не храните `OPENAI_API_KEY` в `.lorex/config.json`.
- Не коммитьте `.env` и `.lorex/`.
- Не индексируйте весь репозиторий через `folders: ["."]`.
- Проверяйте `exclude`, если документация может содержать секреты, дампы или credentials.
- Помните: индексируемые фрагменты отправляются в OpenAI embeddings API.

Рекомендуемые `.gitignore` правила:

```gitignore
.env
.env*
.lorex/
```

## Troubleshooting

### OPENAI_API_KEY missing

Проверьте:

```bash
lorex auth status
```

Если ключ лежит в `.env`, запускайте `lorex` из директории, где находится этот `.env`.

### Индекс пустой

Проверьте config:

```bash
lorex status --project-root .
```

Убедитесь, что `folders` указывает на существующие папки, а `include/exclude` не отфильтровали все файлы.

### Query не возвращает ожидаемый документ

Перезапустите индекс:

```bash
lorex index --project-root .
```

Проверьте, что документ входит в `.lorex/manifest.json`.

### OpenAI input length error

Обычно это значит, что в индекс попал слишком большой или бинарный файл. Проверьте `include/exclude` и уберите такие файлы из scope.
