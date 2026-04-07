# GitHub Explorer MCP Server

**Дата:** 2026-04-07  
**Статус:** Done

---

## Краткое описание задачи

Реализация MCP-сервера для работы с публичными GitHub-репозиториями. Сервер предоставляет 4 инструмента:
- `search_repos` — поиск репозиториев (top-10, best match)
- `get_description` — детальное описание репозитория
- `list_branches` — список веток
- `get_commits` — история коммитов

Сервер развёрнут в отдельном Docker-контейнере (Node.js + stdio MCP), подключается к backend через Streamable HTTP (supergateway на порту 8097). Единообразие с существующей архитектурой postgres-mcp.

---

## Итоги Research

**Консилиум:** Архитектор, Фронтенд-эксперт, UI-дизайнер

### Архитектур решение
- **Подход:** кастомный Node.js/TypeScript MCP-сервер (stdio) + supergateway
- **Порт:** 8097 (внутренний, docker-сеть)
- **Структура:** отдельная папка `github-explorer-mcp/` с src/, Dockerfile, entrypoint.sh
- **Зависимости:** `@modelcontextprotocol/sdk` + `supergateway` (global)
- **Env:** `MCP_GITHUB_EXPLORER_URL=http://github-explorer-mcp:8097/mcp` (backend)
- **User-Agent:** обязателен для GitHub API
- **Rate limit:** 60 req/h (информативные ошибки, точка расширения для токена)

### Фронтенд
- Изменения минимальны: только `pipeline-message-bubble.tsx` (2 маппинга)
- Добавить `github-explorer` в `SERVER_COLOR_MAP` и `SERVER_ICON_MAP`
- Debug-panel, message-bubble, use-pipeline — изменений не требуют
- Специальная визуализация GitHub данных не нужна

### UI-конфигурация
- displayName: "GitHub Explorer"
- icon: "globe" (семантически подходит, свободна)
- color: "purple" (контрастен с blue/postgres, ассоциация с GitHub)

---

## План реализации

1. Создать `github-explorer-mcp/` папку и базовую структуру
2. Инициализировать package.json + dependencies (@modelcontextprotocol/sdk, supergateway)
3. Настроить tsconfig.json (ES2020, strict mode)
4. Реализовать `src/github-api.ts` (HTTP-клиент GitHub REST API)
5. Реализовать `src/utils/parse-repository.ts` (парсинг owner/repo из строк и URL)
6. Реализовать 4 инструмента (search-repos, get-description, list-branches, get-commits)
7. Реализовать `src/index.ts` (MCP Server, Zod schema, StdioServerTransport)
8. Создать Dockerfile (node:20-alpine, tsc build, supergateway)
9. Создать entrypoint.sh (запуск supergateway на :8097)
10. Добавить сервис в docker-compose.yml
11. Обновить backend mcp-servers.json
12. Обновить frontend (pipeline-message-bubble.tsx, color/icon маппинги, KNOWN_TOOL_LABELS)

---

## Что реализовано

### Новые файлы

**Папка `github-explorer-mcp/`:**

- `package.json` — зависимости: @modelcontextprotocol/sdk, supergateway, typescript, ts-node
- `tsconfig.json` — конфигурация TypeScript (ES2020, strict)
- `src/index.ts` — MCP Server: регистрация 4 тулов, Zod schema валидация, StdioServerTransport
- `src/github-api.ts` — HTTP-клиент GitHub REST API:
  - native fetch (без axios/node-fetch)
  - обработка rate limit (ошибка 403, подробное сообщение)
  - User-Agent header: "MCP-GitHub-Explorer/1.0"
  - опциональный `GITHUB_TOKEN` для увеличения лимита
  - timeout 10s
- `src/tools/search-repos.ts` — поиск репозиториев (query, top-10, best match)
- `src/tools/get-description.ts` — описание репозитория (full, stars, forks, language)
- `src/tools/list-branches.ts` — список веток (limit clamping 1-100, warnings)
- `src/tools/get-commits.ts` — коммиты (limit clamping 1-100, warnings, iso8601 timestamp)
- `src/utils/parse-repository.ts` — парсинг owner/repo из строк ("owner/repo") и GitHub URL
- `Dockerfile` — node:20-alpine, build step (tsc), ENTRYPOINT supergateway
- `entrypoint.sh` — запуск supergateway на порту 8097, стандартный вывод для stdio

### Изменённые файлы

- **backend/mcp-servers.json** — добавлена строка:
  ```json
  {
    "id": "github-explorer",
    "url": "http://github-explorer-mcp:8097/mcp",
    "displayName": "GitHub Explorer",
    "icon": "globe",
    "color": "purple"
  }
  ```

- **docker-compose.yml** — добавлен сервис:
  ```yaml
  github-explorer-mcp:
    build: ./github-explorer-mcp
    expose:
      - "8097"
    depends_on:
      - postgres
    environment:
      NODE_ENV: production
  ```
  Добавлена env-переменная для backend: `MCP_GITHUB_EXPLORER_URL=http://github-explorer-mcp:8097/mcp`

- **frontend/src/components/chat/pipeline-message-bubble.tsx** — добавлены маппинги:
  ```typescript
  const SERVER_COLOR_MAP = {
    ...
    'github-explorer': 'bg-purple-50 border-purple-200',
  };
  const SERVER_ICON_MAP = {
    ...
    'github-explorer': Globe,
  };
  const KNOWN_TOOL_LABELS = {
    ...
    'search_repos': 'Search Repos',
    'get_description': 'Get Description',
    'list_branches': 'List Branches',
    'get_commits': 'Get Commits',
  };
  ```
  Добавлено форматирование `displayArgs` для parsed.repository

### Ошибки и исправления

- Изначально ошибки 404 были generic ("Not found: /path")
- **Исправлено:** ошибки соответствуют спецификации:
  - "Repository 'owner/repo' not found or is private..."
  - "Branch 'branch-name' not found in 'owner/repo'"
  - "Error fetching commits from 'owner/repo': <GitHub API error>"

---

## Результаты Validation

✅ **TypeScript компиляция:**
- backend — без ошибок (NestJS, MCP registry, tool routing)
- frontend — без ошибок (React, Next.js, pipeline components)
- github-explorer-mcp — без ошибок (MCP Server, tools, utils)

✅ **Next.js build:**
- успешно, без warnings

✅ **Docker build:**
- github-explorer-mcp образ собирается, supergateway запускается на :8097

✅ **API тесты:**
- search_repos: поиск "react" возвращает top-10 репозиториев
- get_description: получение описания `facebook/react`
- list_branches: список веток `facebook/react` (limit clamping работает)
- get_commits: коммиты `facebook/react` с правильной сортировкой и формате

✅ **Ошибки соответствуют спецификации:**
- 404 при несуществующем репозитории
- 403 при rate limit (информативное сообщение)
- 422 при неверном формате owner/repo

---

## Проблемы и откаты

### Проблема: generic ошибки 404
**Было:** "Not found: /search/repositories?q=..."
**Исправлено:** "Repository 'owner/repo' not found or is private..." (спецификация соблюдена)

### Rate limit
**Риск:** 60 req/h без токена может быть недостаточно для интенсивного использования
**Решение:** добавлена точка расширения для `GITHUB_TOKEN` (env-переменная в docker-compose)
**Статус:** не блокирует, заложено на будущее

---

## Статус: Done

Фича полностью реализована и протестирована:
- ✅ MCP-сервер запущен и подключен
- ✅ 4 инструмента работают корректно
- ✅ Frontend интегрирован (маппинги, цвета, иконки)
- ✅ Ошибки следуют спецификации
- ✅ Docker deployment готов
- ✅ Нет регрессий на backend/frontend
