# Баг: MCP вызовы не отображаются в debug panel

**Дата:** 2026-04-08
**Статус:** Fixed

## Описание проблемы

В debug панели не отображаются MCP tool calls, которые были сделаны во время обработки сообщения. При этом во время стриминга эти вызовы видны на фронте (pipeline-message-bubble).

## Диагноз (root cause)

Tool calls были **транзиентными данными** — они существовали только как SSE-события во время стриминга и нигде не сохранялись в БД.

Цепочка:
1. `step-runner.service.ts:runStepWithTools` отправлял `tool_call` SSE-события во время обработки
2. `use-pipeline.ts` собирал их в `pipelineState.toolCalls` для отображения во время стриминга
3. При завершении шага `outputResult` сохранялся как `{ text: fullText }` — без tool calls
4. `GET /messages/:id/debug` строил данные из `message_steps` — tool calls отсутствовали

## Что исправлено

### Backend
- **step-runner.service.ts**: Добавлен сбор tool calls в массив `collectedToolCalls` во время `runStepWithTools`. При сохранении `outputResult` теперь включает `{ text, toolCalls }` если были вызовы.
- **message.controller.ts**: Эндпоинт `GET /messages/:id/debug` теперь извлекает `toolCalls` из `outputResult` и включает в ответ для каждого pipeline step.

### Frontend
- **types/conversation.ts**: Добавлено поле `toolCalls` в тип `MessageDebugData.pipelineData.steps`
- **debug-panel.tsx**: Добавлена коллапсируемая секция "Tool Calls" в `PipelineStepCard` с отображением имени инструмента, сервера, аргументов и результата. Цветовая схема: teal/cyan.

## Результаты Validation

- Backend: `tsc --noEmit` — без ошибок
- Frontend: `next build` — Compiled successfully, все страницы сгенерированы

## Проблемы и откаты

Нет.
