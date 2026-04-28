# lorex

Локальная TypeScript CLI-утилита для будущего RAG-поиска по проектной документации.

## Быстрый старт

```bash
cd tools/lorex
npm install
npm run build
node dist/cli/index.js --help
node dist/cli/index.js init --project-root ../..
node dist/cli/index.js index --project-root ../..
```

По умолчанию `init` создаёт `../../.lorex/config.json`, если в корне проекта есть `swarm-report`. Примерный датасет из `example/swarm-report` не включается автоматически; его можно подключить явно:

```bash
node dist/cli/index.js init --project-root ../.. --force --folders example/swarm-report
```

`OPENAI_API_KEY` должен передаваться через окружение или локальный `.env` в директории запуска CLI. Ключ не должен храниться в `.lorex/config.json`.

Проверить, видит ли CLI ключ:

```bash
node dist/cli/index.js auth status
```

Настроить ключ на текущую shell-сессию:

```bash
export OPENAI_API_KEY="sk-..."
```

Для постоянной настройки добавьте такой `export` в `~/.bashrc` или `~/.zshrc`. Не сохраняйте ключ в `.lorex/config.json`.

Альтернатива: создайте `.env` в директории, откуда запускаете CLI:

```bash
OPENAI_API_KEY=sk-...
```

CLI читает только `.env` из текущей директории запуска и не ищет файл выше по дереву.

Команда `index` создаёт `.lorex/manifest.json` и `.lorex/index.sqlite`. В SQLite сохраняются документы, чанки, FTS5-индекс для lexical/BM25 поиска и embeddings для чанков.

Для embeddings нужен ключ:

```bash
OPENAI_API_KEY=... node dist/cli/index.js index --project-root ../..
```

Без `OPENAI_API_KEY` команда завершится понятной ошибкой и не будет записывать ключ в config.

`query` возвращает markdown или json:

```bash
OPENAI_API_KEY=... node dist/cli/index.js query "какие требования к RAG?" --project-root ../.. --format markdown --max-chunks 8
OPENAI_API_KEY=... node dist/cli/index.js query "какие требования к RAG?" --project-root ../.. --format json --max-chunks 8
```

Markdown-вывод содержит `Retrieved Documentation Context`, источники, общий score, lexical score и vector score.
