# Карта проекта: ChatGPT App

ChatGPT-клиент с аутентификацией, историей диалогов в PostgreSQL и pipeline-обработкой (planning → execution → validation).

## Структура

```
first-lesson/
├── backend/                    # NestJS API
├── frontend/                   # Next.js 14 SPA
├── github-explorer-mcp/        # MCP-сервер GitHub (stdio + supergateway)
├── postgres-mcp/               # MCP-сервер PostgreSQL (stdio + supergateway)
├── docker-compose.yml          # 5 сервисов: postgres, postgres-mcp, github-explorer-mcp, backend, frontend
├── deploy.md                   # Процедура деплоя (SSH, порты, скрипты)
├── swarm-report/               # Отчёты задач
└── PROJECT_MAP.md              # ← этот файл
```

---

## Backend (`backend/`)

**Стек:** NestJS, TypeScript, pg (raw SQL), OpenAI SDK, Passport JWT, bcryptjs, helmet, throttler

### Модули

```
src/
├── main.ts                     # Точка входа: CORS, helmet, prefix /api, ValidationPipe
├── app.module.ts               # Корневой: Config, Throttler, Database, Auth, UserProfile, Project,
│                               #   Conversation, Context, AI, Memory, MessageProcessing
│
├── database/                   # @Global — PostgreSQL + транзакции
│   ├── database.service.ts     # pg.Pool + AsyncLocalStorage (implicit tx context)
│   ├── transaction.service.ts  # TransactionService.run(callback) — BEGIN/COMMIT/ROLLBACK
│   ├── base.repository.ts      # BaseRepository<T> (findById, deleteById)
│   └── migrations.service.ts   # Полная схема БД (13 таблиц)
│
├── auth/                       # Аутентификация
│   ├── auth.controller.ts      # POST /auth/login, /auth/refresh, GET /auth/me
│   ├── auth.service.ts         # JWT (access 15m + refresh 7d), bcrypt, seedAdmin
│   ├── repositories/user.repository.ts
│   ├── strategies/jwt.strategy.ts  # validate → { userId, username }
│   └── guards/jwt-auth.guard.ts
│
├── user-profile/               # Долговременная память (Long-term Memory)
│   ├── user-profile.controller.ts  # GET/PUT /profile
│   ├── user-profile.service.ts
│   └── repositories/user-profile.repository.ts
│
├── project/                    # Проекты (Working Memory)
│   ├── project.controller.ts   # CRUD /projects + /projects/:id/invariants
│   ├── project.service.ts
│   ├── repositories/project.repository.ts
│   └── repositories/invariant.repository.ts
│
├── conversation/               # CRUD диалогов + сообщений
│   ├── conversation.controller.ts  # CRUD /conversations
│   ├── conversation.service.ts     # create (с context в транзакции), findAll, update, remove
│   ├── repositories/conversation.repository.ts
│   └── repositories/message.repository.ts  # envelope CRUD, meta, debug, getForContext, getMetaByMessageId
│
├── context/                    # Стратегии контекста, facts, branches
│   ├── context.controller.ts   # /conversations/:id/context, /facts, /branches, /checkpoints
│   ├── context.service.ts      # prepareContext, facts CRUD (JSONB), branches, checkpoints
│   ├── repositories/context.repository.ts
│   ├── repositories/branch.repository.ts
│   ├── repositories/checkpoint.repository.ts
│   └── strategies/             # sliding-window, sticky-facts, branching
│
├── ai/                         # Инфраструктура OpenAI
│   ├── openai.service.ts       # callOpenAI, callOpenAIStream, callOpenAIStreamWithTools, calculateCost
│   ├── token.service.ts        # countTokens (tiktoken)
│   └── dto/ai-params.dto.ts    # ALLOWED_MODELS, MODEL_PRICING, MODEL_CONTEXT_WINDOWS
│
├── mcp/                        # @Global — Dynamic MCP tool discovery & routing
│   ├── mcp.module.ts           # Global module, exports McpRegistryService, McpToolRouter
│   ├── mcp-connection.ts       # Single MCP server connection (connect, listTools, callTool)
│   ├── mcp-registry.service.ts # Registry of N MCP servers, dynamic tool catalog, prefix namespace
│   └── mcp-tool-router.service.ts # Routes prefixed tool_call (server__tool) to correct MCP server
│
├── memory/                     # Сборка system prompt
│   └── memory-assembler.service.ts  # 4-слойный builder (invariants, long-term, working, short-term)
│
├── message-processing/         # Pipeline обработки сообщений
│   ├── message.controller.ts   # POST /conversations/:id/messages (SSE), pause/resume/cancel, GET /messages/:id/debug
│   ├── services/step-orchestrator.service.ts  # State machine, retry loop, SSE events
│   ├── services/step-runner.service.ts        # Запуск шагов, streaming, system prompts, runStepWithTools (function calling)
│   ├── services/guard.service.ts              # Injection detection, stage integrity
│   └── repositories/step.repository.ts        # message_steps table
│
├── subscription/               # Подписки на GitHub issues
│   ├── subscription.controller.ts  # POST/GET /subscriptions, GET /subscriptions/by-conversation/:id
│   ├── subscription.service.ts
│   ├── subscription-poller.service.ts  # @Cron('*/5 * * * *') polling через MCP, LLM summary
│   └── repositories/subscription.repository.ts
│
└── notification/               # Push-уведомления (SSE)
    ├── notification.controller.ts  # SSE /notifications/stream + REST /notifications
    ├── notification.service.ts
    ├── notification-gateway.service.ts  # SSE hub (Map<userId, Subject>)
    └── repositories/notification.repository.ts
```

### БД — PostgreSQL (raw SQL, Repository pattern)

```sql
users (id UUID PK, username, password_hash, role, created_at)
user_profiles (id, user_id FK→users, response_language, dialogue_style, response_brevity, custom_prompt, preferences JSONB)
projects (id, user_id FK→users, title, description, status, created_at, updated_at)
project_invariants (id, project_id FK→projects ON DELETE CASCADE, content)
conversations (id, project_id FK→projects, user_id FK→users, title, model, system_prompt, temperature, max_tokens, repetition_penalty, context_limit, created_at, updated_at)
conversation_contexts (id, conversation_id UNIQUE FK, strategy_type, strategy_data JSONB, summary, summary_up_to_index, active_branch_id FK→branches)
conversation_branches (id, context_id FK→contexts, name, parent_branch_id, checkpoint_message_id)
messages (id, conversation_id FK, branch_id FK, user_content, assistant_content, status, current_step, attempt_number, max_attempts, error_message)
message_steps (id, message_id FK, step_type, attempt_number, status, input_context JSONB, output_result JSONB, model, tokens, cost, duration_ms, validation_passed/reason)
message_meta (id, message_id UNIQUE FK, applied_model/temperature/max_tokens, tokens, cost, duration_ms, context stats)
message_debug (id, message_id UNIQUE FK, strategy_type, token_breakdown JSONB, facts_snapshot JSONB, memory_layers JSONB)
checkpoints (id, conversation_id FK, message_id FK, label)
issue_subscriptions (id UUID PK, conversation_id FK→conversations, user_id FK→users, repository, last_checked_at, last_issue_number, expires_at, is_active, created_at)
issue_notifications (id UUID PK, subscription_id FK→issue_subscriptions, conversation_id FK→conversations, issue_number, issue_title, issue_url, issue_author, summary, is_read, created_at)
```

---

## Frontend (`frontend/`)

**Стек:** React 18, Next.js 14 (standalone output), TypeScript, Tailwind CSS, lucide-react

### Структура

```
src/
├── app/
│   ├── layout.tsx, page.tsx, login/page.tsx, chat/page.tsx
│
├── components/chat/
│   ├── chat-layout.tsx         # Главный оркестратор: sidebar + chat + params
│   ├── conversation-sidebar.tsx # Проекты (accordion) + диалоги
│   ├── chat-window.tsx, chat-input.tsx, message-bubble.tsx
│   ├── ai-params-panel.tsx     # Правый drawer: параметры AI
│   ├── pipeline-message-bubble.tsx, pipeline-stepper.tsx, pipeline-controls.tsx
│   ├── context-indicator.tsx, applied-params-display.tsx, debug-panel.tsx
│   ├── strategy-selector.tsx, facts-panel.tsx, branch-selector.tsx
│   ├── personalization-panel.tsx, empty-state.tsx, typing-indicator.tsx
│   ├── notification-bubble.tsx   # Inline уведомление (teal, react-markdown)
│   └── subscription-indicator.tsx # Панель подписок с TTL progress bar
│
├── hooks/
│   ├── use-chat.ts             # messages (envelope→UI маппинг), send, loadConversation
│   ├── use-conversations.ts    # conversations[], create(projectId), select, remove
│   ├── use-tasks.ts            # projects[], addProject, removeProject
│   ├── use-ai-params.ts        # AI params (server SoT + localStorage defaults)
│   ├── use-pipeline.ts         # Pipeline SSE: start, pause, resume, cancel (messageId)
│   ├── use-invariants.ts, use-facts.ts, use-branches.ts, use-personalization.ts
│   ├── use-notification-stream.ts  # Persistent SSE для push-уведомлений
│   ├── use-subscriptions.ts        # Управление подписками
│   └── use-notifications.ts        # Коллекция уведомлений
│
├── lib/api.ts                  # API: projects, conversations, messages, context, facts, branches
├── types/                      # Project, Conversation, ConversationMessage (envelope), Pipeline, AIParams
└── context/auth-context.tsx    # AuthProvider + useAuth()
```

---

## Инфраструктура

### Docker Compose (5 сервисов)

| Сервис | Образ | Порты (local/server) | Назначение |
|--------|-------|---------------------|-----------|
| postgres | postgres:16-alpine | internal 5432 | БД (healthcheck, init: chatreader user) |
| postgres-mcp | ./postgres-mcp/Dockerfile | internal 8096 | MCP-сервер PostgreSQL (read-only, SSE) |
| github-explorer-mcp | ./github-explorer-mcp/Dockerfile | internal 8097 | MCP-сервер GitHub Explorer (Streamable HTTP) |
| backend | ./backend/Dockerfile | 3000/6500 | NestJS API |
| frontend | ./frontend/Dockerfile | 3001/6501 | Next.js SPA |

### Env-переменные

| Переменная | Где | Назначение |
|---|---|---|
| `OPENAI_API_KEY` | backend | Ключ OpenAI |
| `DATABASE_URL` | backend | PostgreSQL connection string |
| `JWT_SECRET` | backend | Секрет JWT |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` | backend | Единственный пользователь |
| `OPENAI_MAX_TOKENS` | backend | Лимит токенов (default 16384) |
| `MCP_POSTGRES_URL` | backend | URL MCP PostgreSQL сервера (SSE, опционально) |
| `MCP_GITHUB_EXPLORER_URL` | backend | URL MCP GitHub Explorer (Streamable HTTP) |
| `GITHUB_TOKEN` | github-explorer-mcp | Токен GitHub API (scope: public_repo) |
| `FRONTEND_URL` | backend | CORS origin |
| `NEXT_PUBLIC_API_URL` | frontend | URL бэкенда |

### Сервер

- IP: `167.235.226.104`, SSH порт `2222`, user `root`
- Проект: `/srv/ai-chalange/first-lesson`
- Деплой: `bash /srv/ai-chalange/update.sh first-lesson`
