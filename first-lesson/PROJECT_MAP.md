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
│   ├── chat.controller.ts      # POST /chat/message, GET /chat/roles, POST /chat/consilium
│   │                           #   + CRUD /chat/conversations/:id/facts
│   │                           #   + CRUD /chat/conversations/:id/branches
│   ├── chat.service.ts         # sendMessage (делегирует стратегиям), sendConsilium
│   ├── services/
│   │   ├── token.service.ts    # TokenService: countTokens, encoding cache
│   │   ├── openai.service.ts   # OpenAIService: callOpenAI, calculateCost
│   │   ├── context-strategy.service.ts  # Фабрика/диспетчер стратегий контекста
│   │   ├── facts.service.ts    # FactsService: CRUD facts + AI extraction (gpt-4.1-nano)
│   │   └── branch.service.ts   # BranchService: ветки, checkpoints, ensureMainBranch
│   ├── strategies/
│   │   ├── context-strategy.interface.ts  # IContextStrategy, ContextStrategyType
│   │   ├── sliding-window.strategy.ts     # SlidingWindowStrategy (truncation + summary)
│   │   ├── sticky-facts.strategy.ts       # StickyFactsStrategy (facts block + last N)
│   │   └── branching.strategy.ts          # BranchingStrategy (branch messages + truncation)
│   ├── dto/
│   │   ├── ai-params.dto.ts    # ALLOWED_MODELS, MODEL_PRICING, MODEL_CONTEXT_WINDOWS, DEFAULT_MODEL
│   │   ├── message.dto.ts      # message, conversationId?, branchId?, params?
│   │   └── consilium.dto.ts    # message, experts[2-3], conversationId?, model?, temperature?
│   └── constants/
│       └── expert-roles.ts     # 15 предустановленных ролей экспертов
│
└── conversation/               # CRUD диалогов
    ├── conversation.controller.ts  # POST/GET /conversations, GET/PATCH/DELETE /conversations/:id
    ├── conversation.service.ts     # create, findAll, findOne (+messages+opinions), update, remove,
    │                               #   addMessage, addExpertOpinions, getMessagesForContext, updateTitle
    └── dto/                    # create-conversation.dto, update-conversation.dto
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
conversations (id UUID PK, username, title, model, system_prompt, context_strategy, active_branch_id, summary, summary_up_to_index, created_at, updated_at)
messages (id UUID PK, conversation_id FK, role, content, model, token_count, ..., branch_id FK→branches, created_at)
expert_opinions (id UUID PK, message_id FK→messages, expert_name, content, is_error)
conversation_facts (id UUID PK, conversation_id FK, fact_key, fact_value, source_message_id, UNIQUE(conv+key))
conversation_branches (id UUID PK, conversation_id FK, name, parent_branch_id, checkpoint_message_id, created_at)
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
│       ├── chat-input.tsx      # Ввод: Enter=отправить, Shift+Enter=перенос, тоггл параметров
│       ├── message-bubble.tsx  # Пузырь: user/assistant, consilium accordion, cost, params
│       ├── conversation-sidebar.tsx  # Левый sidebar: история диалогов, new/delete
│       ├── ai-params-panel.tsx      # Правый drawer: модель, temperature, tokens, systemPrompt
│       ├── consilium-panel.tsx      # Настройка экспертов (2-3, role/custom)
│       ├── context-indicator.tsx    # Полоска % контекста (green→yellow→red)
│       ├── applied-params-display.tsx  # Мета-строка под ответом
│       ├── typing-indicator.tsx
│       └── empty-state.tsx
│
├── hooks/
│   ├── use-chat.ts             # messages, send(), loadConversation(), startNew(), contextWindow
│   ├── use-conversations.ts    # conversations[], create, select, remove, rename, refresh
│   ├── use-ai-params.ts        # AIParams в localStorage (contextStrategy, slidingWindowKeepLast, factsKeepLast)
│   ├── use-consilium.ts        # ConsiliumParams в localStorage + fetch roles
│   ├── use-facts.ts            # Facts CRUD для sticky_facts стратегии
│   ├── use-branches.ts         # Branches CRUD для branching стратегии
│   └── use-auto-scroll.ts
│
├── lib/
│   ├── api.ts                  # apiRequest (auto-refresh JWT), все API-функции
│   ├── tokens.ts               # localStorage: access/refresh tokens
│   └── format-date.ts          # Относительные даты (русский)
│
├── types/
│   ├── ai-params.ts            # AIParams, Expert, Role, ConsiliumParams, Usage, AVAILABLE_MODELS
│   └── conversation.ts         # Conversation, ConversationMessage, ConversationDetail, ContextWindow
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

### Консилиум
```
1. Для каждого эксперта (2-3, последовательно с delay 500ms):
   callOpenAI([expert.systemPrompt, ...history, userMessage])

2. Синтез:
   callOpenAI([moderatorPrompt, ...history, userMessage, expertOpinions, "сформируй ответ"])

3. Сохранение: user msg + consilium msg (is_consilium=true) + expert_opinions
```
