# Фича: MCP PostgreSQL — доступ к БД из чата
Дата: 2026-04-07

## Описание задачи
Добавить Docker-контейнер с MCP-сервером для read-only доступа к PostgreSQL. AI-ассистент в чате может запрашивать данные из БД через OpenAI function calling. Пользователь пишет вопрос → AI решает нужна ли БД → вызывает tool → получает данные → формирует ответ.

## Итоги Research
- Docker: 3 сервиса в app-network, PostgreSQL без healthcheck
- Фронтенд не затрагивается инфраструктурной частью
- Pipeline: planning → execution → validation, без function calling
- Нужен MCP-сервер, OpenAI tools, UI для tool calls

## План
1. Docker: read-only PG user + postgres-mcp контейнер + healthcheck
2. Backend: MCP-клиент модуль + OpenAI function calling в execution step
3. Frontend: отображение tool calls в pipeline UI
4. Validation: сборка backend + frontend

## Что реализовано

### Docker-инфраструктура
- `postgres/init/01-readonly-user.sql` — init-скрипт: пользователь chatreader с правами SELECT
- `postgres-mcp/Dockerfile` — node:20-alpine + @modelcontextprotocol/server-postgres + supergateway
- `postgres-mcp/entrypoint.sh` — запуск supergateway с DATABASE_URL
- `docker-compose.yml` — healthcheck для postgres, новый сервис postgres-mcp, env MCP_POSTGRES_URL для backend

### Backend (NestJS)
- `src/mcp/mcp.module.ts` — @Global модуль
- `src/mcp/mcp-client.service.ts` — MCP-клиент (SSE transport, lazy connection, auto-reconnect, listTables(), query())
- `src/ai/openai.service.ts` — новый метод callOpenAIStreamWithTools() с поддержкой function calling
- `src/message-processing/services/step-runner.service.ts` — runStepWithTools() с tool call loop (max 5 итераций, SELECT only, LIMIT 100)
- `src/message-processing/services/step-orchestrator.service.ts` — execution step использует runStepWithTools()
- `src/app.module.ts` — импорт McpModule
- NPM: @modelcontextprotocol/sdk

### Frontend (React/Next.js)
- `src/types/pipeline.ts` — ToolCallData, tool_call event type
- `src/hooks/use-pipeline.ts` — обработка tool_call SSE-событий
- `src/components/chat/pipeline-message-bubble.tsx` — ToolCallCard с отображением SQL/результатов

## Результаты Validation
- Backend: TypeScript compilation — OK (0 errors)
- Frontend: Next.js build — OK (compiled successfully)

## Безопасность
- Read-only PG user (chatreader) — только SELECT
- SQL validation: только SELECT разрешён
- Auto LIMIT 100 если не указан
- Max 5 tool call итераций
- Graceful fallback: если MCP недоступен — tools не добавляются

## Проблемы и откаты
Нет

## Статус: Done
