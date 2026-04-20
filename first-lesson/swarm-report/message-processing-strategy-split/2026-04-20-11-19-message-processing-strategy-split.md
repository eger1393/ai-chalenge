# Отчёт по задаче: разделение pipeline на `rag` и `standard`

## Задача

Разделить backend-pipeline обработки сообщений на две отдельные стратегии:

- `rag`
- `standard`

Если в `rag`-стратегии retrieval не выбрал ни одного чанка, backend должен до planning переключаться на `standard`, не смешивая две стратегии внутри одной попытки и не превращая реализацию в цепочку перекрёстных ветвлений внутри одного runner-а.

## Что реализовано

- Добавлен отдельный контур стратегий в `backend/src/message-processing/services/strategies/`
- Введён общий контракт `MessageProcessingStrategy`
- Добавлен `MessageProcessingStrategyResolverService`
- Добавлены стратегии:
  - `StandardMessageProcessingStrategy`
  - `RagMessageProcessingStrategy`
- `StepOrchestratorService` переписан под resolver и стратегию на попытку:
  - стратегия выбирается заново на каждую попытку
  - при `ragEnabled=true` и `selectedCount === 0` попытка сразу уходит в `standard`
  - при resume, если уже завершённый planning был сделан в другой стратегии, текущая попытка не продолжается смешанно, а запускается новая
- `StepRunnerService` сужен до общего low-level runner-а:
  - streaming
  - tool-aware execution
  - generic builder сообщений стадии
  - generic parser результата validation
- RAG-специфичные prompt-контракты, policy repair, structured parsing, verification и финальный renderer вынесены в `RagMessageProcessingStrategy`
- В debug-метаданные добавлены:
  - `requestedStrategy`
  - `effectiveStrategy`
  - `fallbackReason`
  - `ragCandidateCount`
  - `ragSelectedCount`
- Документация обновлена:
  - `PROJECT_MAP.md`
  - `backend/src/message-processing/AGENTS.md`

## Проверка

- `backend ./node_modules/.bin/tsc -p tsconfig.build.json --pretty false`
- `git diff --check`

Обе проверки прошли успешно.

## Ограничения и замечания

- Живой прогон через реальный OpenAI/RAG-контур в этом проходе не выполнялся; проверка ограничена статической сборкой и согласованностью кода
- В рабочем дереве уже были посторонние изменения в `message-processing` и соседних файлах; они не откатывались и не включались в этот рефактор намеренно

## Статус

Готово
