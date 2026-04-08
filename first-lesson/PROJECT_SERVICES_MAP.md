# Карта модулей и сервисов проекта

> Детальное описание каждого модуля, его сервисов и зон ответственности.

---

## Архитектура верхнего уровня

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Frontend    │────>│   Backend    │────>│   PostgreSQL     │
│  Next.js 14  │ SSE │  NestJS API  │ SQL │  16-alpine       │
│  :6501       │<────│  :6500       │<────│  :5432           │
└─────────────┘     └──────┬───────┘     └──────────────────┘
                           │
                    ┌──────┴───────┐
                    │  MCP серверы  │
              ┌─────┴─────┐  ┌─────┴──────┐
              │postgres-mcp│  │github-mcp  │
              │  :8096     │  │  :8097     │
              └────────────┘  └────────────┘
```

---

## Backend — Модули и сервисы

### 1. DatabaseModule (`@Global`)

**Путь:** `backend/src/database/`
**Назначение:** Единая точка доступа к PostgreSQL. Управление пулом соединений, транзакциями и миграциями.

| Сервис | Зона ответственности |
|--------|---------------------|
| **DatabaseService** | Управление `pg.Pool`, выполнение SQL-запросов. Использует `AsyncLocalStorage` для прозрачной передачи транзакционного клиента — любой `query()` внутри транзакции автоматически использует тот же клиент. |
| **TransactionService** | Обёртка `BEGIN/COMMIT/ROLLBACK`. Метод `run(fn)` — оборачивает колбэк в транзакцию, при ошибке откатывает. Работает через `AsyncLocalStorage` DatabaseService. |
| **MigrationsService** | Содержит полную DDL-схему (13 таблиц). Выполняет `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` при старте приложения. Идемпотентная in-process миграция. |
| **BaseRepository\<T\>** | Абстрактный класс. Предоставляет `findById(id)`, `deleteById(id)`. Все репозитории наследуются от него. |

---

### 2. AuthModule

**Путь:** `backend/src/auth/`
**Назначение:** Аутентификация и авторизация пользователей. JWT-токены (access + refresh), seed администратора.

| Сервис / Компонент | Зона ответственности |
|---------------------|---------------------|
| **AuthService** | Логин (bcrypt-сравнение), регистрация, обновление токенов. Генерация пары JWT: access (15 мин) + refresh (7 дней). При старте — `seedAdminUser()` из env-переменных. |
| **AuthController** | `POST /auth/login` (throttle 5 req/60s), `POST /auth/register` (защищён ApiKeyGuard), `POST /auth/refresh`, `GET /auth/me`. |
| **JwtAuthGuard** | Passport Guard — проверяет Bearer-токен в заголовке Authorization. Используется на всех защищённых роутах. |
| **ApiKeyGuard** | Проверяет заголовок `X-Api-Key` через timing-safe сравнение с `REGISTRATION_API_KEY`. Защищает эндпоинт регистрации. |
| **JwtStrategy** | Passport Strategy — извлекает и валидирует JWT, отклоняет refresh-токены, возвращает `{ userId, username }`. |
| **UserRepository** | SQL-запросы к таблице `users`: `findByUsername`, `create`, `createIfNotExists`. |

---

### 3. UserProfileModule

**Путь:** `backend/src/user-profile/`
**Назначение:** Долговременная память пользователя (Long-term Memory). Хранит предпочтения по стилю и языку ответов ИИ.

| Сервис | Зона ответственности |
|--------|---------------------|
| **UserProfileService** | `getProfile(userId)` — возвращает профиль с дефолтами если записи нет. `upsertProfile(userId, dto)` — создаёт или обновляет профиль. |
| **UserProfileController** | `GET /profile`, `PUT /profile` — оба под `JwtAuthGuard`. |
| **UserProfileRepository** | SQL-запросы к `user_profiles`: `findByUserId`, `upsert`. |

**Поля профиля:** `responseLanguage` (auto/ru/en), `dialogueStyle` (formal/friendly/technical/creative/yoda), `responseBrevity` (brief/detailed/unset), `customPrompt`.

---

### 4. ProjectModule

**Путь:** `backend/src/project/`
**Назначение:** Управление проектами (Working Memory). Проект — контейнер для диалогов и инвариантов (фиксированных правил для ИИ).

| Сервис | Зона ответственности |
|--------|---------------------|
| **ProjectService** | CRUD проектов + управление инвариантами: `getInvariants`, `addInvariant`, `removeInvariant`. Валидация принадлежности проекта пользователю. |
| **ProjectController** | `CRUD /projects` + `GET/POST /projects/:id/invariants`, `DELETE /projects/:id/invariants/:iid`. |
| **ProjectRepository** | SQL к `projects`: `create`, `findByUserId`, `findByIdAndUserId`, `update`. |
| **InvariantRepository** | SQL к `project_invariants`: `create`, `findByProjectId`, `deleteByIdAndProjectId`, `getContentByProjectId`. |

**Инварианты** — текстовые правила, которые всегда включаются в system prompt ИИ с наивысшим приоритетом.

---

### 5. ConversationModule

**Путь:** `backend/src/conversation/`
**Назначение:** CRUD диалогов и сообщений. Диалог привязан к проекту и пользователю.

| Сервис | Зона ответственности |
|--------|---------------------|
| **ConversationService** | Создание диалога (в транзакции вместе с `conversation_contexts`), обновление параметров модели, получение диалога с историей и статистикой. |
| **ConversationController** | `CRUD /conversations`, `GET /conversations/:id` — возвращает диалог + сообщения + агрегаты (токены, стоимость). |
| **ConversationRepository** | SQL к `conversations`: `create`, `findByProjectId`, `findByUserId`, `findByIdAndUserId`, `update`. |
| **MessageRepository** | SQL к `messages` + `message_meta` + `message_debug`: создание envelope (пустое сообщение с user_content), обновление статуса/ассистент-контента, получение сообщений для контекста, сохранение метаданных и отладочной информации, подсчёт агрегатов. |

---

### 6. ContextModule

**Путь:** `backend/src/context/`
**Назначение:** Управление контекстным окном ИИ. Стратегии формирования контекста, факты (sticky memory), ветвление диалогов, чекпоинты.

| Сервис | Зона ответственности |
|--------|---------------------|
| **ContextService** | Оркестратор контекста. Диспетчеризация на нужную стратегию (`prepareContext`). CRUD фактов (JSONB в `strategy_data`). CRUD веток и чекпоинтов. Извлечение фактов из текста через GPT-4.1-nano (`extractAndApplyFacts`). Обновление summary. |
| **ContextController** | `GET/PUT /conversations/:id/context`, `GET/POST/DELETE` для facts, branches, checkpoints. |
| **SlidingWindowStrategy** | Стратегия скользящего окна: первые 2 сообщения + последние N в пределах 80% бюджета контекстного окна. |
| **StickyFactsStrategy** | Препендит блок фактов из JSONB, оставшееся место заполняет недавними сообщениями. Факты сохраняются между сообщениями. |
| **BranchingStrategy** | Аналог SlidingWindow, но фильтрует сообщения по активной ветке. Поддерживает разветвление диалога. |
| **ContextRepository** | SQL к `conversation_contexts`: find/create/update стратегии, summary, active branch. |
| **BranchRepository** | SQL к `conversation_branches`: CRUD веток. |
| **CheckpointRepository** | SQL к `checkpoints`: создание и получение чекпоинтов. |

**Типы стратегий:** `sliding_window`, `sticky_facts`, `branching`.

---

### 7. AIModule

**Путь:** `backend/src/ai/`
**Назначение:** Инфраструктура взаимодействия с OpenAI API. Стриминг, подсчёт токенов, расчёт стоимости.

| Сервис | Зона ответственности |
|--------|---------------------|
| **OpenAIService** | Вызовы OpenAI: `callOpenAI` (non-streaming), `callOpenAIStream` (async generator текстовых дельт + usage), `callOpenAIStreamWithTools` (стриминг с аккумуляцией tool_calls). Расчёт стоимости по модели (`calculateCost`). Построение параметров completion. |
| **TokenService** | Подсчёт токенов через `js-tiktoken` с кешированием энкодера по модели. `countTokens(text, model)`, `countTokensBreakdown(history, current, system, model)`. |
| **AIParamsDto** | Константы: `ALLOWED_MODELS`, `DEFAULT_MODEL`, `MODEL_PRICING`, `MODEL_CONTEXT_WINDOWS`. Валидированный DTO параметров. |

**Модели:** gpt-4o-mini, gpt-4o, gpt-4.1-nano, gpt-4.1-mini, gpt-4.1, gpt-5.4, gpt-5.4-mini.

---

### 8. McpModule (`@Global`)

**Путь:** `backend/src/mcp/`
**Назначение:** Динамическое обнаружение и маршрутизация MCP-инструментов. Позволяет ИИ использовать внешние инструменты (БД, GitHub) через function calling.

| Сервис | Зона ответственности |
|--------|---------------------|
| **McpRegistryService** | При старте читает `mcp-servers.json`, подключается к каждому серверу через `McpConnection`. Строит единый каталог инструментов с префиксами (`server__tool`). Генерирует блок capabilities (русский текст) для system prompt. Мониторинг статусов серверов. |
| **McpToolRouter** | Маршрутизация вызовов: по префиксированному имени определяет сервер и вызывает `callTool`. Возвращает результат для вставки в контекст ИИ. |
| **McpConnection** | Подключение к одному MCP-серверу через `StreamableHTTPClientTransport`. `listTools()`, `callTool(name, args)`. Авто-реконнект при сбое. |

**Серверы:** `postgres` (:8096) — SQL-запросы к БД, `github-explorer` (:8097) — поиск и анализ GitHub-репозиториев.

---

### 9. MemoryModule

**Путь:** `backend/src/memory/`
**Назначение:** Сборка многослойного system prompt для ИИ.

| Сервис | Зона ответственности |
|--------|---------------------|
| **MemoryAssemblerService** | `assembleMemory(params)` — собирает system prompt из 4 слоёв: **invariants** (правила проекта, высший приоритет), **long_term** (профиль пользователя: язык, стиль, краткость, custom prompt), **working** (название и описание проекта), **short_term** (пользовательский system prompt диалога). Возвращает итоговый prompt + массив `MemoryLayer[]` для отладки. |

---

### 10. MessageProcessingModule

**Путь:** `backend/src/message-processing/`
**Назначение:** Ядро обработки сообщений. Pipeline из 3 шагов (planning → execution → validation) с retry, SSE-стримингом и защитой от инъекций.

| Сервис | Зона ответственности |
|--------|---------------------|
| **StepOrchestratorService** | Главный оркестратор pipeline. `processMessage` — полный цикл обработки с SSE-событиями. Retry loop (до `maxAttempts`, дефолт 3): planning → execution → validation. Управление паузой/возобновлением/отменой сообщений. |
| **StepRunnerService** | Запуск отдельных шагов. `runStep` — стриминг текста, `runStepWithTools` — стриминг с MCP function calling (до 5 итераций). Формирование system prompt для каждого шага (planning/execution/validation). Парсинг результата валидации (`VERDICT: PASS/FAIL/INJECTION`). |
| **GuardService** | Защита от prompt injection: regex-паттерны (русский + английский). Фильтрация подозрительных инвариантов. Проверка целостности этапов (`verifyStageIntegrity`). |
| **StepRepository** | SQL к `message_steps`: создание/обновление шагов, получение по message_id. |
| **MessageController** | `POST /conversations/:id/messages` (SSE-стрим), `POST /messages/:id/pause`, `POST /messages/:id/resume` (SSE), `POST /messages/:id/cancel`, `GET /messages/:id/debug`, `GET /messages/:id`. |

**Pipeline обработки сообщения:**
```
1. Guard check (injection detection)
2. Assemble memory (4-слойный system prompt)
3. Load invariants
4. Prepare context (стратегия контекстного окна)
5. Retry loop (до maxAttempts):
   ├── Planning  (gpt-4.1-nano) — план ответа
   ├── Execution (модель пользователя + MCP tools) — генерация ответа
   └── Validation (gpt-4.1-nano) — проверка качества
       ├── PASS → done
       ├── INJECTION → fail
       └── FAIL → retry с причиной
6. Extract facts (если sticky_facts стратегия)
7. Auto-title (первое сообщение)
```

**SSE-события:** `message_started`, `step_start`, `step_delta`, `step_complete`, `tool_call`, `done`, `failed`, `error`.

---

### 11. Common

**Путь:** `backend/src/common/`

| Компонент | Зона ответственности |
|-----------|---------------------|
| **GlobalExceptionFilter** | Перехват всех необработанных исключений. Пропускает если headers уже отправлены (SSE). Возвращает JSON: `{ statusCode, timestamp, path, message }`. |

---

## Frontend — Модули и компоненты

### Страницы (App Router)

| Маршрут | Файл | Назначение |
|---------|------|-----------|
| `/` | `app/page.tsx` | Корневая страница (редирект) |
| `/login` | `app/login/page.tsx` | Форма входа |
| `/chat` | `app/chat/page.tsx` | Основной интерфейс чата (auth-guarded) |
| `/personalization` | `app/personalization/page.tsx` | Настройки персонализации |

---

### Хуки (бизнес-логика)

| Хук | Зона ответственности |
|-----|---------------------|
| **useChat** | Управление сообщениями текущего диалога. Маппинг envelope → UI message. Загрузка истории, создание нового чата. |
| **usePipeline** | SSE-соединение для обработки сообщений. `start` → подписка на поток событий pipeline. Управление: `pause`, `resume`, `cancel`. Аккумуляция шагов, tool_calls, статуса. |
| **useConversations** | CRUD диалогов. Список диалогов, создание, выбор, удаление, переименование. Загрузка по проекту. |
| **useTasks** | Управление проектами (Projects). Добавление, удаление, архивация. |
| **useAIParams** | Параметры ИИ: модель, температура, max_tokens и др. Персистенция в `localStorage`. Детект изменений от дефолтов. |
| **useFacts** | CRUD фактов диалога. Оптимистичные обновления при добавлении/удалении. |
| **useBranches** | Управление ветками и чекпоинтами. Создание/переключение/удаление веток. |
| **useInvariants** | CRUD инвариантов проекта. |
| **usePersonalization** | Профиль пользователя с debounced auto-save (800ms). |
| **useAutoScroll** | Автоматическая прокрутка чата к последнему сообщению. |

---

### Компоненты (chat/)

| Компонент | Зона ответственности |
|-----------|---------------------|
| **ChatLayout** | Главный оркестратор: sidebar + окно чата + панель параметров. Координирует все хуки. |
| **ConversationSidebar** | Левая панель: проекты (accordion) + список диалогов в каждом проекте. |
| **ChatWindow** | Отображение сообщений. Рендерит `MessageBubble` или `PipelineMessageBubble`. |
| **ChatInput** | Поле ввода сообщения с отправкой. |
| **MessageBubble** | Одно сообщение (user/assistant). Markdown-рендеринг. |
| **PipelineMessageBubble** | Сообщение в процессе обработки pipeline. Показывает шаги, прогресс, tool calls. |
| **PipelineStepper** | Визуализация этапов pipeline (planning → execution → validation). |
| **PipelineControls** | Кнопки управления: пауза, возобновление, отмена. |
| **AIParamsPanel** | Правый drawer: выбор модели, температура, max_tokens и другие параметры. |
| **AppliedParamsDisplay** | Показывает какие параметры были применены к конкретному сообщению. |
| **StrategySelector** | Выбор стратегии контекста (sliding window / sticky facts / branching). |
| **FactsPanel** | Панель управления фактами диалога (sticky facts). |
| **BranchSelector** | Переключение между ветками диалога + создание чекпоинтов. |
| **ContextIndicator** | Индикатор заполненности контекстного окна. |
| **DebugPanel** | Отладочная информация: слои памяти, токены, стратегия, факты. |
| **PersonalizationPanel** | Настройки стиля/языка ответов. |
| **EmptyState** | Заглушка при отсутствии выбранного диалога. |
| **TypingIndicator** | Индикатор "ИИ печатает". |

---

### API-клиент (`lib/api.ts`)

Единый `apiRequest<T>` с автоматическим refresh токена (401 → refresh → retry → redirect `/login`).

**Группы API:**
- **Auth:** login, getMe, logout
- **Projects:** CRUD проектов
- **Invariants:** CRUD инвариантов проекта
- **Conversations:** CRUD диалогов
- **Messages (SSE):** `startMessages` → `AbortController`, pause/resume/cancel, getDetails, getDebug
- **Facts:** CRUD фактов диалога
- **Branches:** CRUD веток + активация
- **Checkpoints:** создание и получение
- **Context:** получение контекста диалога
- **Profile:** получение и обновление профиля

---

## MCP-серверы

### postgres-mcp (:8096)

**Путь:** `postgres-mcp/`
**Назначение:** Даёт ИИ возможность выполнять SQL-запросы к базе данных через function calling.

- Обёртка над `@modelcontextprotocol/server-postgres`
- Доступ через read-only пользователя `chatreader`
- Транспорт: `supergateway` → Streamable HTTP
- Инструменты определяются пакетом (query, list tables и т.д.)

### github-explorer-mcp (:8097)

**Путь:** `github-explorer-mcp/`
**Назначение:** Даёт ИИ возможность искать и анализировать GitHub-репозитории через function calling.

- Кастомный TypeScript MCP-сервер
- Транспорт: `supergateway` → Streamable HTTP

| Инструмент | Назначение |
|------------|-----------|
| `search_repos(query)` | Поиск репозиториев на GitHub |
| `get_description(repository)` | Метаданные репозитория (описание, звёзды, язык) |
| `list_branches(repository)` | Список веток репозитория |
| `get_commits(repository, branch?, limit?)` | Последние коммиты |

Использует `GITHUB_TOKEN` (опционально) для повышения rate limit.

---

## Схема БД (13 таблиц)

```
users ──< user_profiles
  │
  ├──< projects ──< project_invariants
  │       │
  │       └──< conversations ──< messages ──< message_steps
  │               │                │
  │               │                ├── message_meta (1:1)
  │               │                └── message_debug (1:1)
  │               │
  │               └── conversation_contexts (1:1)
  │                       │
  │                       └──< conversation_branches
  │
  └──< checkpoints (conversation + message)
```
