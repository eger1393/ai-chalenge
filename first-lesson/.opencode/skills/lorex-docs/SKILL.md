---
name: lorex-docs
description: Достаёт релевантные фрагменты проектной документации через lorex и возвращает markdown-контекст для ответа
compatibility: opencode
metadata:
  audience: maintainers
  workflow: docs-rag
---
## What I do

- Использую companion script `.opencode/skills/lorex-docs/query.sh` как единственную точку исполнения.
- Если `.lorex/config.json` отсутствует, инициализирую `lorex` с папками `docs`, `swarm-report`, `frontend/src/components/chat/pipeline`.
- Если локальный индекс ещё не собран, запускаю `lorex index --project-root <project>` перед первым query.

## When to use me

Используй этот skill, когда нужно ответить на вопрос по проектной документации на основе локального RAG-контекста, а не полного поиска по репозиторию.

## Source Of Truth

- Slash-команда: `.opencode/commands/docs.md`
- Полный reindex: `.opencode/skills/lorex-reindex/SKILL.md`

## Workflow

1. Для получения документационного контекста вызови:

```bash
bash ".opencode/skills/lorex-docs/query.sh" "<вопрос пользователя>"
```

2. Скрипт сам проверит `lorex`, `OPENAI_API_KEY`, локальный config и наличие индекса.

3. Используй в ответе только данные из `Retrieved Documentation Context`.

## Expected Result

- Возвращён markdown-результат `lorex query` с релевантными чанками документации.
- В ответе можно сослаться на `Source` и `heading path` из retrieval-контекста.

## Guardrails

- Если контекст пустой или недостаточный, скажи это явно.
- Не добавляй факты, которых нет в `Retrieved Documentation Context`.
- Не запускай полный поиск по коду вместо `lorex`, если пользователь явно не просил.
