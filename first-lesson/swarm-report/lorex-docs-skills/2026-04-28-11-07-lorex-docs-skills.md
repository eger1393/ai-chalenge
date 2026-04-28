# lorex-docs-skills

- Дата: 2026-04-28 11:07
- Задача: добавить в проект skills и команду для работы с документацией через `lorex`, при этом `swarm-report` должен входить в индексируемые папки.
- Статус: Готово

## Что реализовано

- Добавлен skill `.opencode/skills/lorex-reindex/SKILL.md` для полного пересоздания индекса `lorex`.
- Добавлен companion script `.opencode/skills/lorex-reindex/reindex.sh`, который:
  - проверяет наличие `lorex`;
  - проверяет `OPENAI_API_KEY` через `lorex auth status`;
  - при отсутствии config делает `lorex init` с папками `docs,swarm-report,frontend/src/components/chat/pipeline`;
  - удаляет `.lorex/index.sqlite` и `.lorex/manifest.json`;
  - запускает полный `lorex index --project-root`.
- Добавлен skill `.opencode/skills/lorex-docs/SKILL.md` для документационных запросов.
- Добавлен companion script `.opencode/skills/lorex-docs/query.sh`, который:
  - инициализирует `lorex`, если config ещё нет;
  - при отсутствии индекса запускает `lorex index`;
  - выполняет `lorex query ... --format markdown --max-chunks 8`.
- Добавлена slash-команда `.opencode/commands/docs.md` для вызова query-скрипта из OpenCode.
- В `.gitignore` добавлено правило `.lorex/`.
- В `PROJECT_MAP.md` добавлены `.opencode/commands/` и `.opencode/skills/` как устойчивые проектные сущности.

## Выбранные папки документации

- `docs`
- `swarm-report`
- `frontend/src/components/chat/pipeline`

## Проверка

- `bash -n .opencode/skills/lorex-reindex/reindex.sh`
- `bash -n .opencode/skills/lorex-docs/query.sh`
- `command -v lorex` → найден: `/home/unix/.nvs/default/bin/lorex`
- `lorex auth status` → `OPENAI_API_KEY: configured`
- Новые markdown-файлы перечитаны вручную после создания.

## Ограничения и допущения

- Полный `lorex index` и реальный `lorex query` специально не запускались, чтобы не создавать локальный индекс и не тратить embeddings API без отдельного явного запроса.
- Root-level markdown-файлы вроде `PROJECT_MAP.md` и `RAG_CONTROL_QUESTIONS.md` не включены в initial scope, потому что `lorex` должен индексировать явные папки, а не корень репозитория.
- Если позже потребуется включить дополнительные документы, это лучше делать через явное расширение `folders` в локальном `.lorex/config.json`.
