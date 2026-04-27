---
name: stage-db-tunnel
description: Поднимает или переиспользует SSH-туннель к stage PostgreSQL GOODS и проверяет доступность БД на localhost:15432
compatibility: opencode
metadata:
  audience: maintainers
  workflow: stage-db
---
## What I do

- Использую companion script `.opencode/skills/stage-db-tunnel/tunnel.sh` как единственную точку исполнения.
- Скрипт умеет `status`, `up` и `down`.
- Скрипт сам проверяет конфликт порта, переиспользует существующий туннель и валидирует PostgreSQL через `pg_isready`.

## When to use me

Используй этот skill, когда нужен доступ к stage базе `goods` из локального окружения проекта через SSH-туннель.

## Source Of Truth

- Основная проектная инструкция: `.claude/commands/stage-db.md`
- Локальная строка подключения для MCP: `.mcp.json`

## Workflow

1. Чтобы проверить текущее состояние туннеля, вызови:

```bash
bash ".opencode/skills/stage-db-tunnel/tunnel.sh" status
```

2. Чтобы гарантированно поднять туннель или переиспользовать уже живой, вызови:

```bash
bash ".opencode/skills/stage-db-tunnel/tunnel.sh" up
```

3. Если пользователь явно попросил закрыть туннель, вызови:

```bash
bash ".opencode/skills/stage-db-tunnel/tunnel.sh" down
```

4. Если `status` или `up` вернули `status: conflict`, остановись и сообщи пользователю о конфликте порта `15432`.

## Expected Result

- Доступен локальный endpoint `127.0.0.1:15432`.
- `pg_isready` возвращает `accepting connections`.

## Guardrails

- Не обходи companion script прямыми ad-hoc командами `ssh`, если нет отдельной причины.
- Не поднимай дублирующий туннель: для этого всегда используй `tunnel.sh up`.
- Если `tunnel.sh` сообщает `status: conflict`, остановись и сообщи пользователю о конфликте порта.
- Не вызывай `down`, если пользователь не просил закрыть туннель явно.
- Не меняй `.mcp.json`, если об этом не просили отдельно.
