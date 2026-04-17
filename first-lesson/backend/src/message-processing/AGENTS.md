# Message Processing AGENTS

## OVERVIEW

Здесь живёт state machine обработки сообщений: planning, execution, validation, pause/resume и строгий RAG-режим

## WHERE TO LOOK

- `message.controller.ts` — SSE-эндпоинты отправки, паузы, возобновления и debug
- `services/step-orchestrator.service.ts` — retry loop, stage integrity, сохранение meta/debug
- `services/step-runner.service.ts` — prompt builders, streaming, tool mode, строгий RAG parser
- `services/guard.service.ts` — инъекции и финальная проверка стадий
- `repositories/step.repository.ts` — `message_steps`

## SOURCE OF TRUTH

- Источник истины для порядка стадий — `StepOrchestratorService`
- Источник истины для prompt-контрактов и разборов planning/validation — `StepRunnerService`
- Источник истины для запрета обхода pipeline — `GuardService`

## CONVENTIONS

- Успешная попытка всегда должна иметь завершённые `planning`, `execution` и `validation`
- В `ragEnabled=true` execution работает без tools и отвечает только по RAG-доказательствам
- Любой новый stage-level контракт нужно отражать и в debug-метаданных, и в UI debug-panel
- `message_debug.strategy_metadata` хранит компактную стратегическую диагностику, а не полный дубль всех payload

## ANTI-PATTERNS

- Не обходи validation даже для “очевидных” ответов
- Не добавляй silent fallback из строгого RAG-режима в обычный execution
- Не меняй SSE-события локально без проверки потребителей во фронтенде
- Не отвечай по существу из истории диалога или общих знаний, если strict RAG требует отказ

## COMMANDS

```bash
cd /mnt/c/source/ai-chalenge/first-lesson/backend
npm run build
```
