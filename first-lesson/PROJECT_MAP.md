# Карта проекта: ChatGPT App

ChatGPT-клиент с аутентификацией, историей диалогов в PostgreSQL и pipeline-обработкой (planning → execution → validation).

## Структура

```
first-lesson/
├── backend/                    # NestJS API
├── frontend/                   # Next.js 14 SPA
├── github-explorer-mcp/        # MCP-сервер GitHub (stdio + supergateway)
├── knowledge-base-mcp/         # MCP-сервер базы знаний + импорт Telegram-дампов с embeddings
├── postgres-mcp/               # MCP-сервер PostgreSQL (stdio + supergateway)
├── docker-compose.yml          # 6 сервисов: postgres, postgres-mcp, github-explorer-mcp,
│                               #   knowledge-base-mcp, backend, frontend
├── deploy.md                   # Процедура деплоя (SSH, порты, скрипты)
├── RAG_CONTROL_QUESTIONS.md    # Контрольный набор вопросов для проверки RAG по Telegram-дампу
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
├── rag/                        # Обычный backend-контур RAG без MCP
│   ├── rag.module.ts           # Модуль RAG
│   ├── rag.service.ts          # Retrieval и сборка RAG-блока для system prompt
│   ├── rag.repository.ts       # Поиск релевантных чанков в PostgreSQL через pgvector
│   ├── rag-embedding.service.ts # Embeddings `bge-m3` через Transformers.js
│   ├── constants.ts            # Модели и лимиты RAG
│   └── import-telegram-dump.ts # CLI-переиндексация Telegram JSON в chatdb
│
├── mcp/                        # @Global — Dynamic MCP tool discovery & routing
│   ├── mcp.module.ts           # Global module, exports McpRegistryService, McpToolRouter
│   ├── mcp-connection.ts       # Single MCP server connection (connect, listTools, callTool)
│   ├── mcp-registry.service.ts # Registry of N MCP servers (postgres, github-explorer,
│   │                           #   knowledge-base), dynamic tool catalog, prefix namespace
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
├── subscription/               # Подписки на GitHub issues (данные в MCP)
│   ├── subscription.controller.ts  # GET /subscriptions(?conversationId), GET /conversations/:id/subscriptions
│   ├── subscription.service.ts     # Проксирует CRUD через McpToolRouter → github-explorer MCP
│   ├── subscription-callback.controller.ts  # POST /internal/subscription-callback (MCP → backend)
│   └── dto/subscription-callback.dto.ts
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
conversations (id, project_id FK→projects, user_id FK→users, title, model, system_prompt, temperature, max_tokens, repetition_penalty, context_limit, rag_enabled, created_at, updated_at)
conversation_contexts (id, conversation_id UNIQUE FK, strategy_type, strategy_data JSONB, summary, summary_up_to_index, active_branch_id FK→branches)
conversation_branches (id, context_id FK→contexts, name, parent_branch_id, checkpoint_message_id)
messages (id, conversation_id FK, branch_id FK, user_content, assistant_content, status, current_step, attempt_number, max_attempts, error_message)
message_steps (id, message_id FK, step_type, attempt_number, status, input_context JSONB, output_result JSONB, model, tokens, cost, duration_ms, validation_passed/reason)
message_meta (id, message_id UNIQUE FK, applied_model/temperature/max_tokens, tokens, cost, duration_ms, context stats)
message_debug (id, message_id UNIQUE FK, strategy_type, token_breakdown JSONB, facts_snapshot JSONB, strategy_metadata JSONB, rag_context JSONB, memory_layers JSONB)
checkpoints (id, conversation_id FK, message_id FK, label)
issue_subscriptions (DEPRECATED — подписки теперь в MCP: mcp_issue_subscriptions)
issue_notifications (id UUID PK, subscription_id UUID nullable, conversation_id FK→conversations, issue_number, issue_title, issue_url, issue_author, summary, is_read, created_at)
-- MCP таблица: mcp_issue_subscriptions (id UUID PK, repository, conversation_id, user_id, callback_url, last_checked_at, last_issue_number, ttl_minutes, expires_at, is_active, created_at)
-- Backend RAG: rag_documents (source_type, source_key, external_id, published_at, full_text, metadata JSONB)
-- Backend RAG: rag_chunks (document_id FK→rag_documents, chunk_index, content, embedding vector(1024), metadata JSONB)
-- Knowledge Base DB: knowledge_base_entries (id UUID PK, content_type, text_content, json_content, created_at, updated_at)
-- Knowledge Base DB: knowledge_base_tags (id UUID PK, entry_id FK→knowledge_base_entries, tag UNIQUE, created_at)
-- Knowledge Base DB: telegram_channel_messages (PK: channel_id + message_id, full_text, metadata JSONB)
-- Knowledge Base DB: telegram_message_chunks (UUID PK, FK→telegram_channel_messages, chunk_index, content, embedding vector(1024), metadata JSONB)
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

## Backend RAG

- RAG работает напрямую внутри `backend`, без MCP
- Векторы и проиндексированные документы хранятся в основном `chatdb`
- Флаг `rag_enabled` живёт в `conversations`
- При включённом флаге backend ищет релевантные чанки и подмешивает их в system prompt
- Debug-данные RAG хранятся отдельно в `message_debug.rag_context` как компактные ссылки на найденные чанки
- `GET /api/messages/:id/debug` обогащает RAG-ссылки текстом чанка и полным текстом сообщения из `rag_chunks` / `rag_documents`
- Переиндексация Telegram-дампа выполняется через `backend/src/rag/import-telegram-dump.ts`

---

## MCP Tool Exposure

- Источник истины для MCP-серверов backend — `backend/mcp-servers.json`
- `knowledge-base` остаётся включённым MCP-сервисом, но его инструменты скрыты от модели через `exposeTools: false`
- Скрытые через `exposeTools: false` инструменты не попадают в OpenAI tool catalog и не перечисляются в блоке доступных инструментов

---

## Knowledge Base MCP (`knowledge-base-mcp/`)

**Стек:** TypeScript, MCP SDK, PostgreSQL, `pgvector`, `Transformers.js`

### Структура

```
src/
├── index.ts                    # MCP-сервер базы знаний: CRUD-инструменты по тегам
├── db.ts                       # Инициализация БД, pgcrypto/vector, таблицы KB и Telegram
├── import-telegram-dump.ts     # CLI-импорт Telegram JSON → сообщения, чанки и embeddings
├── tools/                      # CRUD-инструменты по knowledge_base_entries / tags
└── types.ts                    # Типы контента базы знаний
```

### Контур Telegram-импорта

- Полный текст каждого сообщения сохраняется в `telegram_channel_messages`
- Текстовые сообщения режутся на чанки и сохраняются в `telegram_message_chunks`
- Каждый чанк получает embedding размерности `1024`
- Для Node-рантайма используется `Xenova/bge-m3` как совместимый ONNX-порт модели `BAAI/bge-m3`
- Этот контур не используется backend-RAG напрямую

---

## Инфраструктура

### Docker Compose (6 сервисов)

| Сервис | Образ | Порты (local/server) | Назначение |
|--------|-------|---------------------|-----------|
| postgres | pgvector/pgvector:pg16 | internal 5432 | БД с поддержкой `pgvector` |
| postgres-mcp | ./postgres-mcp/Dockerfile | internal 8096 | MCP-сервер PostgreSQL (read-only, SSE) |
| github-explorer-mcp | ./github-explorer-mcp/Dockerfile | internal 8097 | MCP-сервер GitHub Explorer (Streamable HTTP) |
| knowledge-base-mcp | ./knowledge-base-mcp/Dockerfile | internal 8098 | MCP-сервер базы знаний и CLI-импорт Telegram-чанков в `knowledge_base` |
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
| `MCP_KNOWLEDGE_BASE_URL` | backend | URL MCP Knowledge Base (Streamable HTTP) |
| `GITHUB_TOKEN` | github-explorer-mcp | Токен GitHub API (scope: public_repo) |
| `DATABASE_URL` | github-explorer-mcp | PostgreSQL для хранения подписок |
| `HF_HOME` | backend | Опциональный каталог кэша модели `bge-m3` для RAG |
| `RAG_TOP_K` | backend | Максимальное число чанков для retrieval |
| `RAG_MIN_SIMILARITY` | backend | Минимальный порог релевантности чанка |
| `RAG_MAX_CONTEXT_CHARS` | backend | Верхний предел размера RAG-блока в system prompt |
| `DATABASE_URL` | knowledge-base-mcp | PostgreSQL для отдельной БД `knowledge_base` |
| `HF_HOME` | knowledge-base-mcp | Опциональный каталог кэша модели `bge-m3` |
| `BACKEND_CALLBACK_URL` | github-explorer-mcp | URL callback endpoint бэкенда |
| `MCP_CALLBACK_SECRET` | github-explorer-mcp, backend | Shared secret для авторизации callback'ов |
| `FRONTEND_URL` | backend | CORS origin |
| `NEXT_PUBLIC_API_URL` | frontend | URL бэкенда |

### Сервер

- IP: `167.235.226.104`, SSH порт `2222`, user `root`
- Проект: `/srv/ai-chalange/first-lesson`
- Деплой: `bash /srv/ai-chalange/update.sh first-lesson`
