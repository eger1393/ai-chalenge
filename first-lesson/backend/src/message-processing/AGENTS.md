# Message Processing AGENTS

## OVERVIEW

Здесь живёт state machine обработки сообщений: planning, execution, validation, pause/resume и выбор стратегии обработки между `standard` и `rag`

## WHERE TO LOOK

- `message.controller.ts` — SSE-эндпоинты отправки, паузы, возобновления и debug
- `services/step-orchestrator.service.ts` — retry loop, выбор стратегии на попытку, stage integrity, сохранение meta/debug
- `services/step-runner.service.ts` — общий low-level runner шагов, streaming, tool mode и generic parser валидации
- `services/strategies/` — отдельные стратегии `standard` и `rag`, их prompt-контракты и RAG-специфичная верификация
- `services/guard.service.ts` — инъекции и финальная проверка стадий
- `repositories/step.repository.ts` — `message_steps`

## SOURCE OF TRUTH

- Источник истины для порядка стадий — `StepOrchestratorService`
- Источник истины для выбора стратегии и fallback между ними — `MessageProcessingStrategyResolverService`
- Источник истины для prompt-контрактов — соответствующая стратегия в `services/strategies/`
- Источник истины для общего выполнения шагов и generic validation parser — `StepRunnerService`
- Источник истины для запрета обхода pipeline — `GuardService`

## CONVENTIONS

- Успешная попытка всегда должна иметь завершённые `planning`, `execution` и `validation`
- В `ragEnabled=true` сначала выбирается `rag`-стратегия; если retrieval не выбрал ни одного чанка, попытка сразу переключается на `standard` до planning
- В `rag`-стратегии execution работает без tools; в `standard`-стратегии execution может использовать tools
- Любой новый stage-level контракт нужно отражать и в debug-метаданных, и в UI debug-panel
- `message_debug.strategy_metadata` хранит компактную стратегическую диагностику, а не полный дубль всех payload
- Контекстная стратегия должна быть видна в debug отдельно от pipeline, а retrieval hint разрешён только как средство снятия неоднозначности поиска

## ANTI-PATTERNS

- Не обходи validation даже для “очевидных” ответов
- Не смешивай `rag`-planning и `standard`-execution в одной попытке; если стратегия изменилась после уже завершённого planning, нужно запускать новую попытку
- Не меняй SSE-события локально без проверки потребителей во фронтенде
- Не выдавай факты из истории диалога, памяти или общих знаний за доказанные RAG, если retrieval не дал подтверждений

## COMMANDS

```bash
cd /mnt/c/source/ai-chalenge/first-lesson/backend
npm run build
```
