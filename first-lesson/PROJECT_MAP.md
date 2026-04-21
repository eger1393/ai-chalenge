# Карта проекта: ChatGPT App

ChatGPT-клиент с аутентификацией, историей диалогов в PostgreSQL и pipeline-обработкой (planning → execution → validation).

## Структура

```
first-lesson/
├── GLOBAL_AGENTS_CONTEXT.md    # Снимок глобального AGENTS из /home/unix/.codex/AGENTS.md
├── AGENTS.md                   # Корневые правила проекта + карта вложенных AGENTS.md
├── backend/                    # NestJS API
├── docs/                       # Эксплуатационная и интеграционная документация
├── frontend/                   # Next.js 14 SPA
├── github-explorer-mcp/        # MCP-сервер GitHub (stdio + supergateway)
├── knowledge-base-mcp/         # MCP-сервер базы знаний + импорт Telegram-дампов с embeddings
├── postgres-mcp/               # MCP-сервер PostgreSQL (stdio + supergateway)
├── docker-compose.yml          # 6 сервисов: postgres, postgres-mcp, github-explorer-mcp,
│                               #   knowledge-base-mcp, backend, frontend
├── deploy.md                   # Процедура деплоя (SSH, порты, скрипты)
├── docs/ollama-dev-gpu-server-gemma4-api.md
│                               # Публичный контракт `Ollama API` для `dev-gpu-server.superlook.ai`
│                               # и текущей модели `gemma4:31b`
├── RAG_CONTROL_QUESTIONS.md    # Контрольный набор вопросов для проверки RAG по Telegram-дампу
├── swarm-report/               # Отчёты задач
└── PROJECT_MAP.md              # ← этот файл
```

---

## Иерархия AGENTS.md

- `AGENTS.md` — общие правила репозитория
- `backend/AGENTS.md` — backend-модуль целиком
- `backend/src/message-processing/AGENTS.md` — pipeline и строгий RAG-режим
- `backend/src/rag/AGENTS.md` — retrieval, rewrite, reranker и импорт
- `frontend/AGENTS.md` — SPA и клиентские контракты
- `frontend/src/components/chat/AGENTS.md` — чатовый интерфейс, pipeline UI и debug
- `github-explorer-mcp/AGENTS.md` — MCP GitHub Explorer
- `knowledge-base-mcp/AGENTS.md` — MCP базы знаний и её Telegram-import

---

## Backend (`backend/`)

**Стек:** NestJS, TypeScript, pg (raw SQL), OpenAI SDK (OpenAI + Ollama-compatible `/v1`), Passport JWT, bcryptjs, helmet, throttler

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
├── context/                    # Стратегии контекста и facts
│   ├── context.controller.ts   # /conversations/:id/context, /facts
│   ├── context.service.ts      # prepareContext, facts CRUD (JSONB), retrieval hint для RAG
│   ├── repositories/context.repository.ts
│   └── strategies/             # sliding-window, sticky-facts
│
├── ai/                         # LLM-инфраструктура OpenAI + локальный Ollama-провайдер
│   ├── openai.service.ts       # Router поверх OpenAI SDK: OpenAI API + Ollama-compatible `/v1`
│   ├── token.service.ts        # countTokens (tiktoken)
│   └── dto/ai-params.dto.ts    # providers/models catalog, pricing, context windows
│
├── rag/                        # Обычный backend-контур RAG без MCP
│   ├── rag.module.ts           # Модуль RAG
│   ├── rag.service.ts          # Retrieval и сборка RAG-блока для system prompt
│   ├── rag.repository.ts       # Поиск релевантных чанков в PostgreSQL через pgvector
│   ├── rag-embedding.service.ts # Embeddings `bge-m3` через Transformers.js
│   ├── rag-query-rewrite.service.ts # LLM-переписывание поискового запроса перед retrieval
│   ├── rag-reranker.service.ts # Cross-encoder reranker для режима `reranker`
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
│   └── memory-assembler.service.ts  # builder memory-слоёв; инварианты остаются только в debug-слое, а не в system prompt
│
├── message-processing/         # Pipeline обработки сообщений
│   ├── message.controller.ts   # POST /conversations/:id/messages (SSE), pause/resume/cancel, GET /messages/:id/debug
│   ├── services/step-orchestrator.service.ts  # State machine, retry loop, выбор стратегии на попытку, SSE events
│   ├── services/step-runner.service.ts        # Общий low-level runner шагов, streaming, tool mode, generic validation parser
│   ├── services/strategies/                   # Standard/RAG стратегии и resolver между ними
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
conversations (id, project_id FK→projects, user_id FK→users, title, provider, model, system_prompt, temperature, max_tokens, repetition_penalty, context_limit, rag_enabled, rag_query_rewrite_enabled, rag_mode, created_at, updated_at)
conversation_contexts (id, conversation_id UNIQUE FK, strategy_type, strategy_data JSONB, summary, summary_up_to_index, active_branch_id FK→branches; активная продуктовая стратегия — `sliding_window` или `sticky_facts`)
conversation_branches (id, context_id FK→contexts, name, parent_branch_id, checkpoint_message_id) -- legacy schema, больше не используется публичным контуром
messages (id, conversation_id FK, branch_id FK, user_content, assistant_content, status, current_step, attempt_number, max_attempts, error_message)
message_steps (id, message_id FK, step_type, attempt_number, status, input_context JSONB, output_result JSONB, provider, model, tokens, cost, duration_ms, validation_passed/reason)
message_meta (id, message_id UNIQUE FK, applied_provider/applied_model/temperature/max_tokens, tokens, cost, duration_ms, context stats)
message_debug (id, message_id UNIQUE FK, strategy_type, token_breakdown JSONB, facts_snapshot JSONB, strategy_metadata JSONB, rag_context JSONB, memory_layers JSONB)
checkpoints (id, conversation_id FK, message_id FK, label) -- legacy schema, больше не используется публичным контуром
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
│   ├── ai-params-panel.tsx     # Правый drawer: выбор провайдера, модели и параметров AI
│   ├── pipeline-message-bubble.tsx, pipeline-stepper.tsx, pipeline-controls.tsx
│   ├── context-indicator.tsx, applied-params-display.tsx, debug-panel.tsx
│   ├── strategy-selector.tsx, facts-panel.tsx
│   ├── personalization-panel.tsx, empty-state.tsx, typing-indicator.tsx
│   ├── notification-bubble.tsx   # Inline уведомление (teal, react-markdown)
│   └── subscription-indicator.tsx # Панель подписок с TTL progress bar
│
├── hooks/
│   ├── use-chat.ts             # messages (envelope→UI маппинг), send, loadConversation
│   ├── use-conversations.ts    # conversations[], create(projectId), select, remove
│   ├── use-tasks.ts            # projects[], addProject, removeProject
│   ├── use-ai-params.ts        # AI params (local defaults + гидрация параметров active conversation)
│   ├── use-pipeline.ts         # Pipeline SSE: start, pause, resume, cancel (messageId)
│   ├── use-invariants.ts, use-facts.ts, use-personalization.ts
│   ├── use-notification-stream.ts  # Persistent SSE для push-уведомлений
│   ├── use-subscriptions.ts        # Управление подписками
│   └── use-notifications.ts        # Коллекция уведомлений
│
├── lib/api.ts                  # API: projects, conversations, messages, context, facts
├── types/                      # Project, Conversation, ConversationMessage (envelope), Pipeline, AIParams
└── context/auth-context.tsx    # AuthProvider + useAuth()
```

---

## Backend RAG

- RAG работает напрямую внутри `backend`, без MCP
- Векторы и проиндексированные документы хранятся в основном `chatdb`
- Флаги `rag_enabled`, `rag_query_rewrite_enabled` и `rag_mode` живут в `conversations`
- `rag_mode` поддерживает режимы `filter` и `reranker`
- `filter` использует кодовый эвристический фильтр поверх vector search
- `reranker` использует отдельную модель `jinaai/jina-reranker-v2-base-multilingual`
- `query rewrite` использует отдельный шаг на `gpt-4.1-nano` и переписывает только поисковый запрос для retrieval
- Если reranker недоступен в режиме `reranker`, backend завершает запрос явной ошибкой
- Если `query rewrite` включён и шаг rewrite завершается ошибкой или возвращает невалидный JSON, backend завершает запрос явной ошибкой
- При включённом флаге backend сначала резолвит стратегию обработки сообщения: `rag` или `standard`
- Если у `rag`-стратегии retrieval не выбрал ни одного чанка, попытка до planning сразу переключается на `standard`; пользователь получает обычный non-RAG ответ без RAG-разделов, а fallback фиксируется только в debug
- При `rag`-стратегии backend собирает отдельный `RAG evidence` system message, а не вклеивает RAG в общий memory prompt
- Каждый RAG-чанк в evidence-блоке содержит `chunk_id`, `message_id`, `document_id`, источник, дату и `content`
- В `rag`-стратегии planning и execution работают по структурированному JSON-контракту, а backend парсит и валидирует его кодом
- В `rag`-стратегии planning сначала решает, хватает ли данных в RAG, и выставляет `ragVerdict` / `responseMode` / `chunkIds`
- Backend дополнительно отклоняет ложный `INSUFFICIENT`, если planning пытается отказаться при уже выбранных сильных прямых чанках для обобщающего вопроса
- Если planning нарушил формат или ошибочно выбрал `REFUSE`, backend может применить явный `policy_repair` и синтезировать канонический RAG-план; это отражается в логах и debug-метаданных
- Если planning считает данные недостаточными, execution всё равно отвечает по существу на основе знаний модели, а неполное покрытие RAG или отсутствие данных в RAG показывает отдельным предупреждением
- Если planning считает данные достаточными, execution опирается на RAG как на основной источник доказательств и обязан возвращать `chunk_id`, цитаты и пояснения в структурированном виде
- В `rag`-стратегии цитата считается корректной только если это короткий непрерывный дословный фрагмент `content` без `...`, склейки удалённых частей и перефразирования
- При повторной попытке execution получает причину предыдущего validation-fail и должен исправлять ответ с учётом этой обратной связи
- После успешной проверки backend нормализует итоговый RAG-ответ в единый формат с разделами `Предупреждение` (при `PARTIAL` / `ABSENT`), `Краткий ответ`, `Статус RAG` и `Источники из RAG`, где для каждого доказательства выводятся `chunk_id`, `source_ref`, `source`, `message_id`, `published_at` и дословная цитата
- В `rag`-стратегии execution запускается без tools и не использует MCP как источник фактов
- В `standard`-стратегии execution использует обычный tool-aware runner
- Если во время resume уже существует завершённый planning текущей попытки, а заново резолвленная стратегия не совпала с ним, backend не смешивает стратегии в одной попытке, а начинает новую попытку с нуля
- Backend больше не валит RAG-ответ на этапе validation из-за неточного `chunk_id` или цитаты; stage-level проверка оставляет только структурный контракт ответа
- Debug-данные RAG хранятся отдельно в `message_debug.rag_context` как компактные ссылки на найденные чанки
- В `message_debug.rag_context` дополнительно фиксируются режим, число кандидатов, исходный и переписанный запрос, retrieval hint от стратегии контекста, причина `rewrite`/`no-op`, а также mode-specific score
- В `message_debug.strategy_metadata` отдельно сохраняются `requestedStrategy`, `effectiveStrategy`, `fallbackReason`, `ragCandidateCount`, `ragSelectedCount` и при `rag`-стратегии `ragPipeline` с planning verdict, response mode, выбранными `chunk_id`, источником плана (`model` или `policy_repair`), статусом покрытия RAG и числом цитат из финального ответа
- `contextStrategy` теперь проходит через создание диалога, загрузку диалога и отправку сообщений; стратегия `sticky_facts` может влиять на RAG retrieval через retrieval hint
- В продукте больше нет branch/checkpoint API и стратегии `branching`; legacy-поля схемы пока сохранены только для безопасной миграции
- Все operations над project/conversation/message/context/debug валидируют ownership и на чужие идентификаторы отвечают `404 Not Found`
- `MemoryAssemblerService` больше не дублирует инварианты в итоговом system prompt; текст инвариантов инжектируется только на уровне pipeline prompt builder
- Контекстные стратегии подготавливают только предшествующий контекст; текущий пользовательский запрос добавляется в planning/execution/validation ровно один раз
- Режим `reranker` использует sequence-classification модель и валидирует форму logits до применения порогов
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
| `OLLAMA_BASE_URL` | backend | OpenAI-compatible `/v1` URL локального Ollama-шлюза |
| `OLLAMA_API_KEY` | backend | Ключ доступа к локальному Ollama-шлюзу |
| `OLLAMA_TIMEOUT` | backend | Таймаут запросов к локальному Ollama-провайдеру |
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
