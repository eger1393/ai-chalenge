# Карта проекта: ChatGPT App

ChatGPT-клиент с аутентификацией, историей диалогов в PostgreSQL и режимом "консилиума" (несколько AI-экспертов + синтез).

## Структура

```
first-lesson/
├── backend/                    # NestJS API
├── frontend/                   # Next.js 14 SPA
├── docker-compose.yml          # postgres + backend + frontend
├── deploy.md                   # Процедура деплоя (SSH, порты, скрипты)
├── api-specification.md        # REST-спецификация API
├── swarm-report/               # Отчёты задач (Research, E2E, Deploy)
└── PROJECT_MAP.md              # ← этот файл
```

---

## Backend (`backend/`)

**Стек:** NestJS, TypeScript, pg (raw SQL), OpenAI SDK, Passport JWT, bcryptjs, helmet, throttler

### Модули

```
src/
├── main.ts                     # Точка входа: CORS, helmet, prefix /api, ValidationPipe
├── app.module.ts               # Корневой: ConfigModule, ThrottlerModule, Database, Auth, Chat, Conversation
│
├── database/                   # @Global модуль — PostgreSQL
│   ├── database.module.ts
│   └── database.service.ts     # pg.Pool + inline-миграции. Таблицы: conversations, messages, expert_opinions
│
├── auth/                       # Аутентификация (1 хардкод-пользователь)
│   ├── auth.controller.ts      # POST /auth/login (5/min), POST /auth/refresh, GET /auth/me
│   ├── auth.service.ts         # bcrypt compare, JWT sign (access 15m + refresh 7d)
│   ├── strategies/jwt.strategy.ts  # Passport JWT, validate → { userId, username }
│   ├── guards/jwt-auth.guard.ts
│   └── dto/                    # login.dto, refresh.dto
│
├── chat/                       # Основная логика OpenAI
│   ├── chat.controller.ts      # POST /chat/message, /pipeline (SSE), /test-dialogue (SSE)
│   │                           #   + CRUD facts, branches, pipeline pause/resume/cancel
│   ├── chat.service.ts         # sendMessage, generateTestDialogue
│   ├── services/
│   │   ├── pipeline-guard.service.ts  # PipelineGuardService: injection detection, sanitizer, stage integrity
│   │   ├── pipeline.service.ts # PipelineService: state machine planning→execution→validation→done
│   │   ├── token.service.ts    # TokenService: countTokens, encoding cache
│   │   ├── openai.service.ts   # OpenAIService: callOpenAI, callOpenAIStream, calculateCost
│   │   ├── context-strategy.service.ts  # Фабрика/диспетчер стратегий контекста
│   │   ├── facts.service.ts    # FactsService: CRUD facts + AI extraction (gpt-4.1-nano)
│   │   ├── branch.service.ts   # BranchService: ветки, checkpoints, ensureMainBranch
│   │   └── memory-assembler.service.ts  # MemoryAssemblerService: сборка 3-уровневого системного промпта
│   ├── strategies/
│   │   ├── context-strategy.interface.ts  # IContextStrategy, ContextStrategyType
│   │   ├── sliding-window.strategy.ts     # SlidingWindowStrategy (truncation + summary)
│   │   ├── sticky-facts.strategy.ts       # StickyFactsStrategy (facts block + last N)
│   │   └── branching.strategy.ts          # BranchingStrategy (branch messages + truncation)
│   ├── dto/
│   │   ├── ai-params.dto.ts    # ALLOWED_MODELS, MODEL_PRICING, MODEL_CONTEXT_WINDOWS, DEFAULT_MODEL
│   │   ├── message.dto.ts      # message, conversationId?, branchId?, params?
│   │   ├── pipeline.dto.ts     # PipelineMessageDto: message, conversationId, params?
│   │   └── test-dialogue.dto.ts # topic, pairsCount, params?, simulatorModel?
│
├── conversation/               # CRUD диалогов
│   ├── conversation.controller.ts  # POST/GET /conversations, GET/PATCH/DELETE /conversations/:id
│   │                               #   + PATCH /conversations/:id/task (привязка к задаче)
│   ├── conversation.service.ts     # create (isTest, taskId?), findAll, findOne (+debug), addMessage,
│   │                               #   saveDebugData, getDebugDataForConversation, setTaskId
│   └── dto/                    # create-conversation.dto, update-conversation.dto
│
├── task/                       # Рабочая память (Working Memory)
│   ├── task.controller.ts      # POST/GET /tasks, GET/PATCH/DELETE /tasks/:id, GET /tasks/:id/conversations
│   ├── task.service.ts         # CRUD задач + findById для MemoryAssembler
│   └── dto/                    # create-task.dto, update-task.dto
│
└── user-profile/               # Долговременная память (Long-term Memory)
    ├── user-profile.controller.ts  # GET/PUT /profile
    ├── user-profile.service.ts     # getProfile, upsertProfile (UPSERT ON CONFLICT)
    └── dto/                    # update-profile.dto
```

### Ключевые модели

| Модель | Контекст | Цена (in/out per 1M) |
|--------|----------|---------------------|
| gpt-4o-mini (default) | 128K | $0.15 / $0.60 |
| gpt-4o | 128K | $2.50 / $10.00 |
| gpt-4.1-nano | 1M | $0.10 / $0.40 |
| gpt-4.1-mini | 1M | $0.40 / $1.60 |
| gpt-4.1 | 1M | $2.00 / $8.00 |
| gpt-5.4 | — | $2.50 / $15.00 |
| gpt-5.4-mini | — | $0.75 / $4.50 |

### БД — PostgreSQL (raw SQL, без ORM)

```sql
conversations (id UUID PK, username, title, model, system_prompt, context_strategy, active_branch_id, summary, summary_up_to_index, task_id FK→tasks, created_at, updated_at)
messages (id UUID PK, conversation_id FK, role, content, model, token_count, ..., branch_id FK→branches, created_at)
expert_opinions (id UUID PK, message_id FK→messages, expert_name, content, is_error)
conversation_facts (id UUID PK, conversation_id FK, fact_key, fact_value, source_message_id, UNIQUE(conv+key))
conversation_branches (id UUID PK, conversation_id FK, name, parent_branch_id, checkpoint_message_id, created_at)
message_debug_data (id UUID PK, message_id FK UNIQUE, strategy_type, token_breakdown JSONB, facts_snapshot JSONB, strategy_metadata JSONB, memory_layers JSONB)
tasks (id UUID PK, username, title, description TEXT, status, created_at, updated_at)               -- рабочая память
task_invariants (id UUID PK, task_id FK→tasks ON DELETE CASCADE, content TEXT, created_at)          -- инварианты задачи
user_profiles (id UUID PK, username UNIQUE, response_language, dialogue_style, response_brevity, custom_prompt, preferences JSONB, created_at, updated_at)  -- долговременная память
pipeline_runs (id UUID PK, conversation_id FK, user_message_id FK, status, current_step, attempt_number, max_attempts, paused_at_step, error_message, total_cost, total_tokens, created_at, updated_at)
pipeline_steps (id UUID PK, pipeline_run_id FK, step_type, attempt_number, status, input_context JSONB, output_result JSONB, model, prompt/completion_tokens, cost, duration_ms, validation_passed, validation_reason, created_at, completed_at)
```

---

## Frontend (`frontend/`)

**Стек:** React 18, Next.js 14 (standalone output), TypeScript, Tailwind CSS, lucide-react

### Структура

```
src/
├── app/
│   ├── layout.tsx              # AuthProvider, шрифт Inter
│   ├── page.tsx                # Редирект → /login
│   ├── login/page.tsx          # Рендерит LoginForm
│   └── chat/page.tsx           # Защищённая страница → ChatLayout
│
├── components/
│   ├── login/login-form.tsx
│   └── chat/
│       ├── chat-layout.tsx     # Главный оркестратор: sidebar + chat + params + facts/branches
│       ├── chat-window.tsx     # Область сообщений (header + messages + input)
│       ├── strategy-selector.tsx    # Сегментированный переключатель стратегий контекста
│       ├── facts-panel.tsx          # Панель фактов (inline CRUD для sticky_facts)
│       ├── branch-selector.tsx      # Навигатор веток (для branching)
│       ├── test-setup-form.tsx      # Форма запуска тестового диалога (тема + длина)
│       ├── test-progress-bar.tsx    # Прогресс генерации тестового диалога
│       ├── debug-panel.tsx          # Collapsible debug-панель: токены, стратегия, слои памяти
│       ├── chat-input.tsx      # Ввод: Enter=отправить, Shift+Enter=перенос, тоггл параметров
│       ├── message-bubble.tsx  # Пузырь: user/assistant, consilium accordion, cost, params
│       ├── conversation-sidebar.tsx  # Левый sidebar: задачи (accordion) + диалоги, new task/dialog
│       ├── ai-params-panel.tsx      # Правый drawer: вкладки Параметры / Персонализация
│       ├── personalization-panel.tsx  # Вкладка персонализации: язык, стиль, краткость, кастомный промпт
│       ├── pipeline-stepper.tsx      # Горизонтальный stepper: planning→execution→validation→done
│       ├── pipeline-accordion.tsx   # Accordion с результатами каждого этапа pipeline
│       ├── pipeline-controls.tsx    # Кнопки Pause/Resume/Cancel для pipeline
│       ├── pipeline-message-bubble.tsx # Композитный bubble для pipeline-сообщений
│       ├── context-indicator.tsx    # Полоска % контекста (green→yellow→red)
│       ├── applied-params-display.tsx  # Мета-строка под ответом
│       ├── typing-indicator.tsx
│       └── empty-state.tsx
│
├── hooks/
│   ├── use-chat.ts             # messages, send(), loadConversation(), startNew(), contextWindow
│   ├── use-conversations.ts    # conversations[], create, select, remove, rename, refresh
│   ├── use-ai-params.ts        # AIParams в localStorage (contextStrategy, slidingWindowKeepLast, factsKeepLast)
│   ├── use-pipeline.ts         # Pipeline SSE state machine: start, pause, resume, cancel
│   ├── use-invariants.ts       # Инварианты задачи: load, add, remove
│   ├── use-facts.ts            # Facts CRUD для sticky_facts стратегии
│   ├── use-branches.ts         # Branches CRUD для branching стратегии
│   ├── use-test-dialogue.ts    # SSE-стриминг тестового диалога (progress, abort)
│   ├── use-tasks.ts            # Tasks CRUD (рабочая память): load, addTask, removeTask, archiveTask
│   ├── use-personalization.ts  # UserProfile (долговременная память): load, updateField (debounced PUT)
│   └── use-auto-scroll.ts
│
├── lib/
│   ├── api.ts                  # apiRequest (auto-refresh JWT), все API-функции
│   ├── tokens.ts               # localStorage: access/refresh tokens
│   └── format-date.ts          # Относительные даты (русский)
│
├── types/
│   ├── ai-params.ts            # AIParams (+pipelineMode), Usage, AVAILABLE_MODELS
│   ├── pipeline.ts             # PipelineStepType, PipelineStatus, PipelineRunState, PipelineSSEEvent
│   ├── conversation.ts         # Conversation (+ taskId?), ConversationMessage, MessageDebugData (+ memoryLayers), ContextWindow
│   ├── task.ts                 # Task (рабочая память)
│   └── personalization.ts      # UserProfile, ResponseLanguage, DialogueStyle, ResponseBrevity, лейблы
│
└── context/
    └── auth-context.tsx        # AuthProvider + useAuth(): user, login, logout, isAuthenticated
```

### UI-тема
- Светлая: `bg-white`, `border-gray-200`, `text-gray-900`
- Accent: `indigo-600`
- Иконки: `lucide-react`

---

## Инфраструктура

### Docker Compose (3 сервиса)

| Сервис | Образ | Порты (local/server) | Зависит от |
|--------|-------|---------------------|------------|
| postgres | postgres:16-alpine | internal 5432 | — |
| backend | ./backend/Dockerfile | 3000/6500 | postgres |
| frontend | ./frontend/Dockerfile | 3001/6501 | backend |

Volume: `pgdata` — данные PostgreSQL (персистентный).

### Env-переменные

| Переменная | Где | Назначение |
|---|---|---|
| `OPENAI_API_KEY` | backend | Ключ OpenAI |
| `DATABASE_URL` | backend | PostgreSQL connection string |
| `JWT_SECRET` | backend | Секрет JWT |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` | backend | Единственный пользователь |
| `OPENAI_MAX_TOKENS` | backend | Лимит токенов (default 16384) |
| `OPENAI_TIMEOUT` | backend | Таймаут OpenAI (default 600000ms) |
| `FRONTEND_URL` | backend | CORS origin |
| `NEXT_PUBLIC_API_URL` | frontend | URL бэкенда для fetch |

### Сервер

- IP: `167.235.226.104`, SSH порт `2222`, user `root`
- Проект: `/srv/ai-chalange/first-lesson`
- Деплой: `bash /srv/ai-chalange/update.sh first-lesson`
- Подробности: `deploy.md`

---

## Потоки данных

### Отправка сообщения (persistent mode)
```
Frontend                        Backend                          PostgreSQL    OpenAI
   │ POST /chat/message           │                                │            │
   │ {message, conversationId} ──→│ getMessagesForContext(id) ────→│            │
   │                              │ ←── history[] ────────────────│            │
   │                              │ truncateMessages(85% window)   │            │
   │                              │ callOpenAI(messages) ─────────────────────→│
   │                              │ ←── reply, usage ─────────────────────────│
   │                              │ addMessage(user) ─────────────→│            │
   │                              │ addMessage(assistant) ─────────→│            │
   │ ←── {reply, cost, contextWindow} │                            │            │
```

### Pipeline (поэтапная обработка)
```
Frontend                        Backend                          PostgreSQL    OpenAI
   │ POST /chat/pipeline (SSE)    │                                │            │
   │ {message, conversationId} ──→│ INSERT pipeline_runs ──────────→│            │
   │                              │ addMessage(user) ──────────────→│            │
   │ ←── pipeline_started         │                                │            │
   │                              │ [PLANNING: gpt-4.1-nano]       │            │
   │ ←── step_start(planning)     │ callOpenAIStream ──────────────────────────→│
   │ ←── step_delta (streaming)   │ ←── chunks ───────────────────────────────│
   │ ←── step_complete(planning)  │ INSERT pipeline_steps ─────────→│            │
   │                              │ [EXECUTION: user model]         │            │
   │ ←── step_start(execution)    │ callOpenAIStream ──────────────────────────→│
   │ ←── step_delta (streaming)   │ ←── chunks ───────────────────────────────│
   │ ←── step_complete(execution) │ INSERT pipeline_steps ─────────→│            │
   │                              │ [VALIDATION: gpt-4.1-nano]      │            │
   │ ←── step_start(validation)   │ callOpenAIStream ──────────────────────────→│
   │ ←── step_complete(validation)│ INSERT pipeline_steps ─────────→│            │
   │                              │ PASS → addMessage(assistant) ──→│            │
   │ ←── done                     │ UPDATE pipeline_runs(completed) →│           │
   │                              │ FAIL → increment attempt, loop  │            │
```
