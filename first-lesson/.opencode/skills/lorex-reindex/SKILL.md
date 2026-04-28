---
name: lorex-reindex
description: Полностью пересобирает lorex-индекс проекта и заново рассчитывает embeddings для документации
compatibility: opencode
metadata:
  audience: maintainers
  workflow: docs-rag
---
## What I do

- Использую companion script `.opencode/skills/lorex-reindex/reindex.sh` как единственную точку исполнения.
- Если `.lorex/config.json` ещё нет, инициализирую `lorex` с папками `docs`, `swarm-report`, `frontend/src/components/chat/pipeline`.
- Удаляю локальные индексные файлы `.lorex/index.sqlite` и `.lorex/manifest.json`, затем запускаю новый `lorex index`.

## When to use me

Используй этот skill, когда нужно полностью переиндексировать документацию проекта и заново пересчитать embeddings, а не только обновить изменившиеся чанки.

## Source Of Truth

- Команда для запросов к документации: `.opencode/commands/docs.md`
- Query skill: `.opencode/skills/lorex-docs/SKILL.md`
- Конфигурация `lorex` создаётся локально в `.lorex/config.json`

## Workflow

1. Для полного reindex вызови:

```bash
bash ".opencode/skills/lorex-reindex/reindex.sh"
```

2. Скрипт сам проверит:

- доступность `lorex` в `PATH`;
- наличие `OPENAI_API_KEY` через `lorex auth status`;
- наличие локального config и, если его нет, создаст его с проектными папками документации.

3. После этого скрипт пересоберёт индекс с нуля.

## Expected Result

- Существуют актуальные `.lorex/index.sqlite` и `.lorex/manifest.json`.
- Embeddings для документации пересчитаны заново на основе текущего состояния файлов.

## Guardrails

- Не храни `OPENAI_API_KEY` в `.lorex/config.json`.
- Не меняй существующий `.lorex/config.json`, если пользователь уже настроил свой scope документов.
- Не индексируй корень репозитория через `folders: ["."]`.
