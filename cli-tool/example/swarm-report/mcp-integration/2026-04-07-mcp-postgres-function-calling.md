# MCP PostgreSQL + OpenAI Function Calling

**Дата:** 2026-04-07
**Статус:** Done

## Описание задачи

Добавить интеграцию с MCP PostgreSQL сервером через OpenAI function calling. AI в execution step может запрашивать данные из БД через tool calls.

## Что реализовано

### Новые файлы

- `backend/src/mcp/mcp.module.ts` -- @Global NestJS модуль
- `backend/src/mcp/mcp-client.service.ts` -- MCP-клиент (SSE transport, lazy connect, auto-reconnect)

### Изменённые файлы

- `backend/src/ai/openai.service.ts` -- добавлен `callOpenAIStreamWithTools()` (streaming + tool_calls)
- `backend/src/message-processing/services/step-runner.service.ts` -- добавлен `runStepWithTools()` (tool call loop, max 5 итераций)
- `backend/src/message-processing/services/step-orchestrator.service.ts` -- execution step использует `runStepWithTools()`
- `backend/src/app.module.ts` -- импорт McpModule
- `PROJECT_MAP.md` -- обновлена карта проекта

### Архитектура

1. **McpClientService** подключается к MCP серверу по `MCP_POSTGRES_URL` через SSE
2. **OpenAIService.callOpenAIStreamWithTools()** стримит ответ OpenAI и собирает tool_calls
3. **StepRunnerService.runStepWithTools()** реализует tool call loop:
   - Вызывает OpenAI с tools (query_database, list_database_tables)
   - При получении tool_calls -- выполняет через MCP
   - Добавляет результаты в messages и вызывает OpenAI снова
   - Max 5 итераций, max 100 строк в query, только SELECT
4. SSE-события `tool_call` отправляются на фронтенд

### Безопасность

- Только SELECT запросы разрешены (проверка регулярным выражением)
- Автоматический LIMIT 100 если не указан
- Graceful degradation: если MCP недоступен -- execution работает без tools

## Validation

- Backend: tsc --noEmit -- OK
- Frontend: tsc --noEmit -- OK
- Существующий функционал не сломан: runStep() не изменён

## Зависимости

- `@modelcontextprotocol/sdk` добавлен в backend/package.json
- Env: `MCP_POSTGRES_URL` (опционально)
