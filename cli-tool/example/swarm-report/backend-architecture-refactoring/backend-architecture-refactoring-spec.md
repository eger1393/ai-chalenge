# Спецификация: Рефакторинг архитектуры Backend & DB

**Дата:** 2026-04-05
**Статус:** Утверждена (по результатам интервью)
**Scope:** БД-схема + адаптация сервисов + SSE-контракт + фронтенд. Модульная структура NestJS НЕ меняется.

---

## 1. Высокоуровневые решения

| Решение | Выбор | Обоснование |
|---|---|---|
| Task -> Project | Переименование + обязательный контейнер | Все диалоги строго внутри проекта |
| Создание проекта | Явное (пользователь всегда создаёт сам) | Никакой автомагии, осознанный выбор |
| Message модель | Envelope (контейнер с дочерними записями) | user_input + steps[] + final_response внутри |
| Pipeline runs | Переезжает в message (status, attempt, max_attempts) | pipeline_runs как отдельная таблица исчезает |
| Steps config | Registry pattern в коде | VARCHAR step_type без CHECK, новые шаги = новый класс |
| Branching | Сохраняется, привязка к Context + FK | active_branch_id в Context, branch_id в Message — с FK |
| Facts | Переезжают в JSONB (strategy_data в Context) | conversation_facts как таблица исчезает |
| Test dialogues | Выпиливаются полностью | is_test, test_topic, test_pairs_target, endpoint, UI |
| User links | user_id UUID FK вместо username | Нормализация, referential integrity |
| AI params SoT | Conversation (фронт читает + передаёт при изменении) | При изменении обновляем conversation |
| Cascade | ON DELETE CASCADE на уровне БД | Никаких ручных каскадов в коде |
| Context init | Одновременно с conversation | В одной транзакции, гарантированно существует |
| Pipeline step data | Полный input_context хранится | Для debug/воспроизведения |
| Metadata | 2 таблицы: message_meta + message_debug | Разделение по назначению |
| Guard service | Оставить как есть | Доменная логика рефакторится отдельно |
| SSE контракт | Полный рефакторинг | Адаптация под новые сущности |

---

## 2. Новая схема сущностей

### 2.1 `users` (без изменений)

```
users
  id          UUID PK DEFAULT gen_random_uuid()
  username    VARCHAR(100) NOT NULL UNIQUE
  password_hash VARCHAR(255) NOT NULL
  role        VARCHAR(20) NOT NULL DEFAULT 'user'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Индексы:** `idx_users_username` (username)

---

### 2.2 `user_profiles` (добавляется FK на users)

```
user_profiles
  id                UUID PK DEFAULT gen_random_uuid()
  user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
  response_language VARCHAR(10) NOT NULL DEFAULT 'auto'
  dialogue_style    VARCHAR(30) NOT NULL DEFAULT 'friendly'
  response_brevity  VARCHAR(20) NOT NULL DEFAULT 'unset'
  custom_prompt     TEXT NOT NULL DEFAULT ''
  preferences       JSONB NOT NULL DEFAULT '{}'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Изменения:** `username` -> `user_id` UUID FK.

---

### 2.3 `projects` (бывший `tasks`)

```
projects
  id          UUID PK DEFAULT gen_random_uuid()
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
  title       VARCHAR(200) NOT NULL
  description TEXT
  status      VARCHAR(20) NOT NULL DEFAULT 'active'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Индексы:** `idx_projects_user_id`, `idx_projects_status` (user_id, status)
**Изменения:** `tasks` -> `projects`, `username` -> `user_id` FK.

---

### 2.4 `project_invariants` (бывший `task_invariants`)

```
project_invariants
  id          UUID PK DEFAULT gen_random_uuid()
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE
  content     TEXT NOT NULL
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Индексы:** `idx_project_invariants_project` (project_id)

---

### 2.5 `conversations`

```
conversations
  id                  UUID PK DEFAULT gen_random_uuid()
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
  title               VARCHAR(200) NOT NULL DEFAULT 'New dialog'
  model               VARCHAR(50) NOT NULL DEFAULT 'gpt-4o-mini'
  system_prompt       TEXT
  temperature         DOUBLE PRECISION NOT NULL DEFAULT 1.0
  max_tokens          INTEGER NOT NULL DEFAULT 16384
  repetition_penalty  DOUBLE PRECISION NOT NULL DEFAULT 0
  context_limit       INTEGER DEFAULT 0
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Индексы:** `idx_conversations_project` (project_id), `idx_conversations_user` (user_id), `idx_conversations_updated` (updated_at DESC)

**Изменения:**
- `username` -> `user_id` FK
- `task_id` -> `project_id` NOT NULL FK (обязательная привязка к проекту)
- Добавлены: `temperature`, `max_tokens`, `repetition_penalty`, `context_limit` (AI params source of truth)
- Удалены: `context_strategy`, `active_branch_id`, `summary`, `summary_up_to_index`, `is_test`, `test_topic`, `test_pairs_target` (переехали в Context или удалены)

---

### 2.6 `conversation_contexts` (НОВАЯ)

```
conversation_contexts
  id                    UUID PK DEFAULT gen_random_uuid()
  conversation_id       UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE
  strategy_type         VARCHAR(30) NOT NULL DEFAULT 'sliding_window'
  strategy_data         JSONB NOT NULL DEFAULT '{}'
  summary               TEXT
  summary_up_to_index   INTEGER DEFAULT 0
  active_branch_id      UUID REFERENCES conversation_branches(id) ON DELETE SET NULL
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Индексы:** `idx_contexts_conversation` (conversation_id)

**Примечание:** Создаётся в одной транзакции с conversation.

**strategy_data JSONB — структура по стратегиям:**

```typescript
// sliding_window
{ keepLast: number }

// sticky_facts
{ keepLast: number, facts: Array<{ key: string, value: string, sourceMessageId?: string, updatedAt: string }> }

// branching
{ keepLast: number }
```

---

### 2.7 `conversation_branches` (без существенных изменений)

```
conversation_branches
  id                    UUID PK DEFAULT gen_random_uuid()
  context_id            UUID NOT NULL REFERENCES conversation_contexts(id) ON DELETE CASCADE
  name                  VARCHAR(200) NOT NULL DEFAULT 'main'
  parent_branch_id      UUID REFERENCES conversation_branches(id) ON DELETE SET NULL
  checkpoint_message_id UUID REFERENCES messages(id) ON DELETE SET NULL
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Индексы:** `idx_branches_context` (context_id)

**Изменения:** `conversation_id` -> `context_id` FK (привязка к Context вместо Conversation).

---

### 2.8 `checkpoints` (без существенных изменений)

```
checkpoints
  id              UUID PK DEFAULT gen_random_uuid()
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
  message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE
  label           VARCHAR(200)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Индексы:** `idx_checkpoints_conv` (conversation_id)

---

### 2.9 `messages` (ПЕРЕРАБОТАНА — envelope)

```
messages
  id                UUID PK DEFAULT gen_random_uuid()
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
  branch_id         UUID REFERENCES conversation_branches(id) ON DELETE SET NULL
  user_content      TEXT NOT NULL
  assistant_content TEXT
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
  current_step      VARCHAR(50)
  attempt_number    INTEGER NOT NULL DEFAULT 1
  max_attempts      INTEGER NOT NULL DEFAULT 3
  error_message     TEXT
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Индексы:** `idx_messages_conversation` (conversation_id, created_at), `idx_messages_branch` (branch_id), `idx_messages_status` (status)

**Принцип:** Message = envelope/контейнер. Одна строка = один цикл "запрос пользователя -> ответ AI".
- `user_content` — всегда заполнен при создании
- `assistant_content` — заполняется после финального ответа (nullable пока pipeline работает)
- `status`: pending -> processing -> done | failed | cancelled
- `current_step`: текущий шаг pipeline (VARCHAR, не CHECK — расширяемо)
- `attempt_number` / `max_attempts`: retry логика из бывшего pipeline_runs

**Удалены:** `role` (больше не нужен — user и assistant в одной строке), `model`, `token_count`, `prompt_tokens`, `completion_tokens`, `cost`, `duration_ms`, `applied_*`, `context_*`, `truncated_*`, `is_consilium` (переехали в message_meta/message_debug/message_steps)

---

### 2.10 `message_steps` (бывший `pipeline_steps`, привязан к message)

```
message_steps
  id                UUID PK DEFAULT gen_random_uuid()
  message_id        UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE
  step_type         VARCHAR(50) NOT NULL
  attempt_number    INTEGER NOT NULL DEFAULT 1
  status            VARCHAR(20) NOT NULL DEFAULT 'running'
  input_context     JSONB
  output_result     JSONB
  model             VARCHAR(50)
  prompt_tokens     INTEGER DEFAULT 0
  completion_tokens INTEGER DEFAULT 0
  cost              DOUBLE PRECISION DEFAULT 0
  duration_ms       INTEGER DEFAULT 0
  validation_passed BOOLEAN
  validation_reason TEXT
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  completed_at      TIMESTAMPTZ
```

**Индексы:** `idx_message_steps_message` (message_id, created_at)

**Изменения:**
- `pipeline_run_id` -> `message_id` FK (шаги привязаны к message напрямую)
- `step_type` VARCHAR(50) без CHECK constraint (расширяемо через registry pattern)
- `input_context` JSONB хранит полный контекст (решение: полная прозрачность для debug)

---

### 2.11 `message_meta` (НОВАЯ — снапшот настроек + расходы + контекст)

```
message_meta
  id                UUID PK DEFAULT gen_random_uuid()
  message_id        UUID NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE
  applied_model     VARCHAR(50)
  applied_temperature DOUBLE PRECISION
  applied_max_tokens  INTEGER
  applied_repetition_penalty DOUBLE PRECISION
  prompt_tokens     INTEGER DEFAULT 0
  completion_tokens INTEGER DEFAULT 0
  total_tokens      INTEGER DEFAULT 0
  cost              DOUBLE PRECISION DEFAULT 0
  duration_ms       INTEGER DEFAULT 0
  context_used_tokens   INTEGER DEFAULT 0
  context_max_tokens    INTEGER DEFAULT 0
  truncated_messages    INTEGER DEFAULT 0
  truncated_tokens      INTEGER DEFAULT 0
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Индексы:** `idx_message_meta_message` (message_id)

**Назначение:** Всё, что нужно для отображения в UI: какие параметры применились, сколько стоило, сколько контекста использовано.

---

### 2.12 `message_debug` (НОВАЯ — debug-панель)

```
message_debug
  id                    UUID PK DEFAULT gen_random_uuid()
  message_id            UUID NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE
  strategy_type         VARCHAR(30)
  context_messages_count          INTEGER DEFAULT 0
  context_messages_after_truncation INTEGER DEFAULT 0
  token_breakdown       JSONB
  facts_snapshot        JSONB
  branch_info           JSONB
  summary_info          JSONB
  strategy_metadata     JSONB
  memory_layers         JSONB
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Индексы:** `idx_message_debug_message` (message_id)

**Назначение:** Всё, что нужно только для debug-панели. Не загружается при обычном отображении сообщений.

---

## 3. Удаляемые таблицы

| Таблица | Причина |
|---|---|
| `tasks` | Переименована в `projects` |
| `task_invariants` | Переименована в `project_invariants` |
| `pipeline_runs` | Метаданные перенесены в `messages` |
| `pipeline_steps` | Переименована в `message_steps`, привязка к message |
| `conversation_facts` | Факты переехали в `conversation_contexts.strategy_data` JSONB |
| `expert_opinions` | Consilium удалён |
| `message_debug_data` | Заменена на `message_debug` (чистая структура) |

---

## 4. Граф связей (новая схема)

```
users
  ├── user_profiles              (1:1, ON DELETE CASCADE)
  ├── projects                   (1:N, ON DELETE CASCADE)
  │     ├── project_invariants   (1:N, ON DELETE CASCADE)
  │     └── conversations        (1:N, ON DELETE CASCADE)
  │           ├── conversation_contexts  (1:1, ON DELETE CASCADE)
  │           │     ├── conversation_branches  (1:N, ON DELETE CASCADE)
  │           │     └── active_branch_id FK -> conversation_branches (ON DELETE SET NULL)
  │           ├── checkpoints            (1:N, ON DELETE CASCADE)
  │           └── messages               (1:N, ON DELETE CASCADE)
  │                 ├── message_steps    (1:N, ON DELETE CASCADE)
  │                 ├── message_meta     (1:1, ON DELETE CASCADE)
  │                 ├── message_debug    (1:1, ON DELETE CASCADE)
  │                 └── branch_id FK -> conversation_branches (ON DELETE SET NULL)
  └── conversations (user_id FK) (1:N, ON DELETE CASCADE)
```

Полная цепочка CASCADE:
`DELETE users` -> projects -> conversations -> contexts -> branches + messages -> steps + meta + debug

---

## 5. Выпиливаемые фичи

| Фича | Что удаляется |
|---|---|
| Consilium | Таблица `expert_opinions`, поле `is_consilium`, вся логика consilium |
| Test dialogues | `is_test`, `test_topic`, `test_pairs_target` в conversations, `POST /chat/test-dialogue` endpoint, `generateTestDialogue` в ChatService, UI-компоненты test-setup-form, test-progress-bar |
| Non-pipeline message flow | `POST /chat/message` endpoint (уже удалён), `sendMessage` API function на фронте (уже удалена) |
| Pipeline toggle | `pipelineMode` в AIParams (уже удалён) |

---

## 6. Scope итерации

### В scope:
1. Новая схема БД (drop all + create new — ЗБТ, миграция данных не нужна)
2. Адаптация всех SQL-запросов в существующих сервисах
3. Адаптация SSE-контракта под новые сущности
4. Адаптация фронтенда под новый контракт
5. Выпиливание test dialogues

### НЕ в scope:
1. Разбиение ChatModule на подмодули (отдельная итерация)
2. Рефакторинг доменной логики (PipelineGuardService и т.д.)
3. Новые фичи

---

## 7. Риски и компромиссы

| Риск | Митигация |
|---|---|
| Message envelope + nullable `assistant_content` — нужна аккуратная обработка состояний на фронте | Status field чётко отражает состояние; фронт показывает loader/stepper пока status != done |
| Facts в JSONB — нет отдельного CRUD на уровне SQL | CRUD через чтение-модификация-запись strategy_data; конкурентность низкая (один пользователь) |
| Полный input_context в message_steps — может занимать много места | Допустимо для ЗБТ; можно добавить TTL/очистку позже |
| Conversation_branches привязаны к context, а checkpoints к conversation — два уровня | Логически корректно: branches = стратегия контекста, checkpoints = точки на timeline сообщений |
| active_branch_id FK ссылается на conversation_branches которая зависит от conversation_contexts — circular dependency через SET NULL | SET NULL безопасно при удалении; создание в правильном порядке |
