# Фича: Динамическое обнаружение MCP-инструментов

**Дата:** 2026-04-07

## Описание задачи

AI в приложении должна динамически получать список доступных тулов от всех MCP серверов через `client.listTools()` и использовать их через OpenAI function calling. Раньше тулы были захардкожены (query_database, list_database_tables). Сейчас система поддерживает N серверов с prefix-based namespace.

## Итоги Research

Консилиум из 3 агентов (Архитектор, Фронтенд-эксперт, UI-дизайнер):

- Разделение на 3 слоя: McpConnection → McpRegistry → McpToolRouter
- Prefix-based namespace (`serverPrefix__toolName`)
- Фронтенд уже generic, нужны минимальные доработки
- Конфиг через JSON файл `mcp-servers.json`

## План

11 шагов: конфиг → McpConnection → McpRegistry → McpToolRouter → обновление модуля → обновление StepRunnerService → типы фронтенда → хук → компонент

## Что реализовано

### Backend

| Файл | Действие |
|------|---------|
| `backend/mcp-servers.json` | Создан — конфиг MCP серверов с подстановкой env |
| `backend/src/mcp/mcp-connection.ts` | Создан — класс одного MCP подключения (из бывшего McpClientService), Promise-based lock |
| `backend/src/mcp/mcp-registry.service.ts` | Создан — реестр подключений, listTools(), кэш каталога, конвертация MCP→OpenAI format |
| `backend/src/mcp/mcp-tool-router.service.ts` | Создан — роутинг по prefix, executeTool(), getServerMetaForTool() |
| `backend/src/mcp/mcp.module.ts` | Обновлён — экспортирует McpRegistryService + McpToolRouter |
| `backend/src/message-processing/services/step-runner.service.ts` | Обновлён — удалён хардкод DB_TOOLS, динамические тулы из registry, universal router |
| `backend/src/mcp/mcp-client.service.ts` | Удалён — заменён на mcp-connection.ts |

### Frontend

| Файл | Действие |
|------|---------|
| `frontend/src/types/pipeline.ts` | Обновлён — ToolCallData + server, displayName |
| `frontend/src/hooks/use-pipeline.ts` | Обновлён — прокидывание server/displayName из SSE |
| `frontend/src/components/chat/pipeline-message-bubble.tsx` | Обновлён — динамические иконки/цвета/лейблы по серверу |

## Результаты Validation

- Backend: `tsc --noEmit` — 0 ошибок
- Frontend: `next build` — Compiled successfully, все 7 страниц сгенерированы

## Проблемы и откаты

Нет.

## Статус: Done
