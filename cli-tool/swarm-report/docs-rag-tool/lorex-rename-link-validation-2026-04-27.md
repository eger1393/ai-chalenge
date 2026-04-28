# lorex: rename и глобальная команда

Дата: 2026-04-27

## Краткое описание задачи

Переименовать локальную CLI-утилиту из `docs-rag` в `lorex` и сделать её доступной как обычную shell-команду.

## Что реализовано

- Папка инструмента переименована в `tools/lorex`.
- `package.json` package/bin переименованы в `lorex`.
- Runtime-каталог переименован с `.docs-rag` на `.lorex`.
- Обновлены help, README, OpenCode-команда `/docs`, `AGENTS.md` и `.gitignore`.
- Выполнен `npm link`, теперь доступна команда `lorex`.

## Validation

- `npm run build` в `tools/lorex` — успешно.
- `npm link` — успешно.
- `lorex --help` — успешно, показывает новое имя и `.lorex`.
- `lorex auth status` из `cli-tool` — успешно, ключ найден из `.env`, значение не выводится.
- `lorex init --project-root . --force --folders example/swarm-report` — успешно.
- `lorex status --project-root .` — успешно, config указывает на `.lorex` и `example/swarm-report`.
- `lorex index --project-root .` — успешно:
  - Documents: 124;
  - Chunks: 1169;
  - Embeddings generated: 1169.
- `lorex query "что делали для rag reranker" --project-root . --format json --max-chunks 1` — успешно, вернул релевантный источник.

## Статус

Done.
