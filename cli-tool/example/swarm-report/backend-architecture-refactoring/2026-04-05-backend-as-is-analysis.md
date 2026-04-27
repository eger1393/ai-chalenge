# Backend & DB: Анализ текущего состояния (as-is)

**Дата:** 2026-04-05

---

## 1. Сущности БД — полная схема

### 1.1 `users`
| Колонка | Тип | Ограничения |
|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| username | VARCHAR(100) | NOT NULL, UNIQUE |
| password_hash | VARCHAR(255) | NOT NULL |
| role | VARCHAR(20) | NOT NULL, DEFAULT 'user' |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

**Индексы:** `idx_users_username` (username)

---

### 1.2 `user_profiles`
| Колонка | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| username | VARCHAR(100) | NOT NULL, UNIQUE |
| response_language | VARCHAR(10) | NOT NULL, DEFAULT 'auto' |
| dialogue_style | VARCHAR(30) | NOT NULL, DEFAULT 'friendly' |
| response_brevity | VARCHAR(20) | NOT NULL, DEFAULT 'unset' |
| custom_prompt | TEXT | NOT NULL, DEFAULT '' |
| preferences | JSONB | NOT NULL, DEFAULT '{}' |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

**FK в БД:** нет связи с `users` — связь только через совпадение `username` в коде.

---

### 1.3 `tasks`
| Колонка | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| username | VARCHAR(100) | NOT NULL |
| title | VARCHAR(200) | NOT NULL |
| description | TEXT | nullable |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'active' |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

**Индексы:** `idx_tasks_username`, `idx_tasks_status` (username, status)
**FK в БД:** нет связи с `users`.

---

### 1.4 `task_invariants`
| Колонка | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| task_id | UUID | NOT NULL, FK → tasks(id) ON DELETE CASCADE |
| content | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

**Индексы:** `idx_task_invariants_task`

---

### 1.5 `conversations`
| Колонка | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| username | VARCHAR(100) | NOT NULL |
| title | VARCHAR(200) | NOT NULL, DEFAULT 'New dialog' |
| model | VARCHAR(50) | NOT NULL, DEFAULT 'gpt-4o-mini' |
| system_prompt | TEXT | nullable |
| context_strategy | VARCHAR(30) | NOT NULL, DEFAULT 'sliding_window' |
| active_branch_id | UUID | nullable, **нет FK** |
| summary | TEXT | nullable |
| summary_up_to_index | INTEGER | DEFAULT 0 |
| is_test | BOOLEAN | NOT NULL, DEFAULT FALSE |
| test_topic | TEXT | nullable |
| test_pairs_target | INTEGER | DEFAULT 0 |
| task_id | UUID | nullable, FK → tasks(id) ON DELETE SET NULL |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

**Индексы:** `idx_conversations_updated`, `idx_conversations_username`, `idx_conversations_is_test`, `idx_conversations_task_id`

---

### 1.6 `messages`
| Колонка | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| conversation_id | UUID | NOT NULL, FK → conversations(id) ON DELETE CASCADE |
| role | VARCHAR(20) | NOT NULL, CHECK ('user', 'assistant') |
| content | TEXT | NOT NULL |
| model | VARCHAR(50) | nullable |
| token_count | INTEGER | DEFAULT 0 |
| prompt_tokens | INTEGER | DEFAULT 0 |
| completion_tokens | INTEGER | DEFAULT 0 |
| cost | DOUBLE PRECISION | DEFAULT 0 |
| is_consilium | BOOLEAN | NOT NULL, DEFAULT FALSE |
| duration_ms | INTEGER | DEFAULT 0 |
| current_message_tokens | INTEGER | DEFAULT 0 |
| history_tokens | INTEGER | DEFAULT 0 |
| applied_model | VARCHAR(50) | nullable |
| applied_temperature | DOUBLE PRECISION | nullable |
| applied_max_tokens | INTEGER | nullable |
| context_used_tokens | INTEGER | DEFAULT 0 |
| context_max_tokens | INTEGER | DEFAULT 0 |
| truncated_messages | INTEGER | DEFAULT 0 |
| truncated_tokens | INTEGER | DEFAULT 0 |
| branch_id | UUID | nullable, **нет FK** |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

**Индексы:** `idx_messages_conversation_id`, `idx_messages_conversation_created`, `idx_messages_branch`

---

### 1.7 `expert_opinions`
| Колонка | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| message_id | UUID | NOT NULL, FK → messages(id) ON DELETE CASCADE |
| expert_name | VARCHAR(100) | NOT NULL |
| content | TEXT | NOT NULL |
| is_error | BOOLEAN | NOT NULL, DEFAULT FALSE |

---

### 1.8 `conversation_facts`
| Колонка | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| conversation_id | UUID | NOT NULL, FK → conversations(id) ON DELETE CASCADE |
| fact_key | VARCHAR(200) | NOT NULL |
| fact_value | TEXT | NOT NULL |
| source_message_id | UUID | nullable, FK → messages(id) ON DELETE SET NULL |
| created_at, updated_at | TIMESTAMPTZ | |
| | | UNIQUE(conversation_id, fact_key) |

---

### 1.9 `conversation_branches`
| Колонка | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| conversation_id | UUID | NOT NULL, FK → conversations(id) ON DELETE CASCADE |
| name | VARCHAR(200) | NOT NULL, DEFAULT 'main' |
| parent_branch_id | UUID | nullable, FK → self ON DELETE SET NULL |
| checkpoint_message_id | UUID | nullable, FK → messages(id) ON DELETE SET NULL |
| created_at | TIMESTAMPTZ | |

---

### 1.10 `checkpoints`
| Колонка | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| conversation_id | UUID | NOT NULL, FK → conversations(id) ON DELETE CASCADE |
| message_id | UUID | NOT NULL, FK → messages(id) ON DELETE CASCADE |
| label | VARCHAR(200) | nullable |
| created_at | TIMESTAMPTZ | |

---

### 1.11 `message_debug_data`
| Колонка | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| message_id | UUID | NOT NULL, FK → messages(id) ON DELETE CASCADE, UNIQUE |
| strategy_type | VARCHAR(30) | nullable |
| context_messages_count | INTEGER | DEFAULT 0 |
| context_messages_after_truncation | INTEGER | DEFAULT 0 |
| facts_snapshot | JSONB | nullable |
| branch_info | JSONB | nullable |
| summary_info | JSONB | nullable |
| token_breakdown | JSONB | nullable |
| strategy_metadata | JSONB | nullable |
| memory_layers | JSONB | nullable |
| created_at | TIMESTAMPTZ | |

---

### 1.12 `pipeline_runs`
| Колонка | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| conversation_id | UUID | NOT NULL, FK → conversations(id) ON DELETE CASCADE |
| user_message_id | UUID | nullable, FK → messages(id) ON DELETE SET NULL |
| status | VARCHAR(20) | NOT NULL, CHECK ('running','paused','completed','failed','cancelled') |
| current_step | VARCHAR(20) | NOT NULL, CHECK ('planning','execution','validation','done') |
| attempt_number | INTEGER | NOT NULL, DEFAULT 1 |
| max_attempts | INTEGER | NOT NULL, DEFAULT 3 |
| paused_at_step | VARCHAR(20) | nullable |
| error_message | TEXT | nullable |
| total_cost | DOUBLE PRECISION | DEFAULT 0 |
| total_tokens | INTEGER | DEFAULT 0 |
| created_at, updated_at | TIMESTAMPTZ | |

---

### 1.13 `pipeline_steps`
| Колонка | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| pipeline_run_id | UUID | NOT NULL, FK → pipeline_runs(id) ON DELETE CASCADE |
| step_type | VARCHAR(20) | NOT NULL, CHECK ('planning','execution','validation') |
| attempt_number | INTEGER | NOT NULL, DEFAULT 1 |
| status | VARCHAR(20) | NOT NULL, CHECK ('running','completed','failed') |
| input_context | JSONB | nullable |
| output_result | JSONB | nullable |
| model | VARCHAR(50) | nullable |
| prompt_tokens, completion_tokens | INTEGER | DEFAULT 0 |
| cost | DOUBLE PRECISION | DEFAULT 0 |
| duration_ms | INTEGER | DEFAULT 0 |
| validation_passed | BOOLEAN | nullable |
| validation_reason | TEXT | nullable |
| created_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | nullable |

---

## 2. Связи между сущностями

### 2.1 Связи в БД (FK constraints)

```
users  (нет FK ни от кого — изолирован)

user_profiles  (нет FK ни от кого — изолирован)

tasks ←── task_invariants          (ON DELETE CASCADE)
  │
  └──→ conversations.task_id       (ON DELETE SET NULL)

conversations ←── messages              (ON DELETE CASCADE)
      │           ├── expert_opinions    (ON DELETE CASCADE от messages)
      │           ├── message_debug_data (ON DELETE CASCADE от messages)
      │           └── conversation_facts.source_message_id (ON DELETE SET NULL)
      │
      ├── conversation_facts             (ON DELETE CASCADE)
      ├── conversation_branches          (ON DELETE CASCADE)
      ├── checkpoints                    (ON DELETE CASCADE)
      ├── pipeline_runs                  (ON DELETE CASCADE)
      │       └── pipeline_steps         (ON DELETE CASCADE)
      │
      └── active_branch_id              ⚠ НЕТ FK (dangling UUID при удалении ветки)

messages
  └── branch_id                         ⚠ НЕТ FK (dangling UUID)
```

### 2.2 Связи в коде (без FK в БД)

| Связь | Где поддерживается | Риск |
|---|---|---|
| `users.username` → `conversations.username`, `tasks.username`, `user_profiles.username` | JWT guard передаёт `username`, код фильтрует WHERE username = $1 | Удаление пользователя оставит все его данные orphaned |
| `conversations.active_branch_id` → `conversation_branches.id` | `BranchService` валидирует и обновляет вручную | Dangling UUID если ветка удалена не через BranchService |
| `messages.branch_id` → `conversation_branches.id` | `BranchService.deleteBranch` вручную удаляет messages перед удалением branch | Dangling UUID при удалении ветки другим путём |
| `TaskService.remove` удаляет conversations вручную | Вместо использования DB `ON DELETE SET NULL` — делает hard delete | Расхождение с декларированным поведением FK |

---

## 3. Модули кода — зоны ответственности

### 3.1 `DatabaseModule` (Global)
**Ответственность:** пул соединений PostgreSQL + inline-миграции.
**Проблема:** 17 миграций inline в одном файле. Модуль выполняет две роли — connection management + schema management.

### 3.2 `AuthModule`
**Ответственность:** аутентификация — login, register, refresh токенов, seed admin.
**Границы чёткие.** Не залезает в другие домены.

### 3.3 `ConversationModule`
**Ответственность:** CRUD диалогов + сообщений + debug-данных + summary + strategy update.
**Проблема:** ConversationService = **god service**. 17+ публичных методов. Помимо CRUD диалогов, управляет:
- Сообщениями (addMessage, getMessagesForContext, getAllMessages, getMessageCount)
- Debug-данными (saveDebugData, getDebugDataForConversation)
- Summary (getSummary, updateSummary)
- Strategy (updateStrategy)
- Task-linking (setTaskId)
- Totals/stats (getConversationTotals)

### 3.4 `TaskModule`
**Ответственность:** CRUD задач + инварианты + ручной каскад удаления conversations.
**Проблема:** `TaskService.remove` напрямую удаляет из таблицы `conversations` — лезет в чужой домен.

### 3.5 `UserProfileModule`
**Ответственность:** профиль пользователя (настройки AI-ответов).
**Границы чёткие.** 2 метода, минимальный scope.

### 3.6 `ChatModule` (мега-модуль)
**Ответственность:** вся логика общения с AI.

Содержит **11 провайдеров**, каждый со своей зоной:

| Сервис | Зона ответственности |
|---|---|
| `ChatService` | Оркестрация отправки сообщения: memory → context strategy → OpenAI → save |
| `OpenAIService` | Транспорт к OpenAI API (stream/non-stream), расчёт стоимости |
| `TokenService` | Подсчёт токенов через tiktoken |
| `ContextStrategyService` | Фабрика/диспетчер стратегий контекста |
| `SlidingWindowStrategy` | Стратегия: скользящее окно |
| `StickyFactsStrategy` | Стратегия: факты + последние N сообщений |
| `BranchingStrategy` | Стратегия: ветки диалога |
| `FactsService` | CRUD фактов + AI-извлечение из сообщений |
| `BranchService` | CRUD веток + чекпоинты + ручной каскад в messages |
| `MemoryAssemblerService` | Сборка 4-слойного системного промпта |
| `PipelineService` | State-machine поэтапной обработки (planning→execution→validation) |
| `PipelineGuardService` | Injection detection + stage integrity проверки |

**Проблемы:**
1. **ChatController — 20+ эндпоинтов** в одном контроллере, покрывает facts, branches, checkpoints, pipeline, messages
2. **PipelineService** (~500 строк) напрямую работает с 5 таблицами БД — это мини-модуль внутри модуля
3. **BranchService** напрямую модифицирует `messages` и `conversations` — выходит за границы своего домена
4. **MemoryAssemblerService** тянет зависимости из 3 модулей (UserProfile, Task, Database)

---

## 4. Кросс-модульные зависимости

```
                    ┌───────────────────────────────────────┐
                    │              ChatModule                │
                    │                                       │
                    │  ChatService                          │
                    │    ├── ConversationService ◄───────────┼── ConversationModule
                    │    ├── OpenAIService                   │
                    │    ├── TokenService                    │
                    │    ├── ContextStrategyService          │
                    │    ├── FactsService                    │
                    │    ├── BranchService                   │
                    │    └── MemoryAssemblerService          │
                    │         ├── UserProfileService ◄──────┼── UserProfileModule (forwardRef)
                    │         ├── TaskService ◄─────────────┼── TaskModule (forwardRef)
                    │         ├── TokenService               │
                    │         └── DatabaseService ◄─────────┼── DatabaseModule (global)
                    │                                       │
                    │  PipelineService                      │
                    │    ├── ConversationService ◄──────────┼── ConversationModule
                    │    ├── ContextStrategyService          │
                    │    ├── MemoryAssemblerService          │
                    │    ├── PipelineGuardService            │
                    │    ├── OpenAIService                   │
                    │    └── TokenService                    │
                    └───────────────────────────────────────┘

TaskModule
  └── напрямую DELETE FROM conversations (обход ConversationService)
```

---

## 5. Сводка проблемных мест

| # | Проблема | Где | Severity |
|---|---|---|---|
| 1 | `users` не связан FK ни с одной таблицей — orphaned data при удалении | БД | Medium |
| 2 | `active_branch_id`, `messages.branch_id` — нет FK constraints | БД | High |
| 3 | `TaskService.remove` обходит `ConversationService`, удаляет напрямую | Код | High |
| 4 | `ConversationService` — god service (17+ методов, 5+ зон ответственности) | Код | High |
| 5 | `ChatController` — 20+ эндпоинтов в одном контроллере | Код | Medium |
| 6 | `ChatModule` — 11 провайдеров, фактически 3–4 подмодуля в одном | Код | High |
| 7 | `BranchService` напрямую модифицирует `messages` и `conversations` | Код | Medium |
| 8 | `PipelineService` работает с 5 таблицами напрямую — модуль-в-модуле | Код | Medium |
| 9 | `expert_opinions` — используется ли ещё? (consilium mode) | Код/БД | ? |
| 10 | `summary`/`summary_up_to_index` в conversations — используется? | Код/БД | ? |
| 11 | 17 inline-миграций в database.service.ts | Код | Low |
