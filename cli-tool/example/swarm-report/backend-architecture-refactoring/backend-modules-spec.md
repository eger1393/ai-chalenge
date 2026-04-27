# Спецификация: Модульная архитектура Backend

**Дата:** 2026-04-05
**Статус:** Утверждена (по результатам интервью)
**Зависит от:** backend-architecture-refactoring-spec.md (новая схема БД)

---

## 1. Ключевые решения

| Решение | Выбор |
|---|---|
| Transaction helper | AsyncLocalStorage (implicit context). DatabaseService.query() автоматически берёт client из транзакции или из пула |
| Параллелизм в транзакциях | Запрещён. Promise.all внутри transaction.run() = ошибка. Документируем ограничение |
| Facts CRUD | Через ContextModule (read-modify-write strategy_data JSONB). Отдельного FactsService нет |
| MessageProcessing внутри | 3 сервиса: StepRunnerService, StepOrchestratorService, GuardService |
| Дополнительные модули | AIModule (OpenAI + Token), MemoryModule (assembler), ProjectModule (ex-Task) |
| Обновление AI-параметров | ConversationModule. MessageProcessing вызывает ConversationService.updateParams() |
| Контроллеры | По одному на модуль: MessageController, ContextController, ConversationController, ProjectController |
| ConversationService | Разделить на ConversationRepository + MessageRepository |
| Data access pattern | Repository pattern. Каждая таблица = repository с типизированными методами. SQL инкапсулирован в repository. Сервисы не пишут SQL |
| Dependencies MessageProcessing | Нормально — он оркестратор, ему положено зависеть от многих. Главное — обратных зависимостей нет |
| Удаление ветки → сообщений | FK CASCADE. messages.branch_id ON DELETE SET NULL. BranchService не трогает messages |

---

## 2. Целевая модульная структура

```
AppModule
  ├── ConfigModule (global)
  ├── ThrottlerModule
  │
  ├── DatabaseModule (@Global)
  │     ├── DatabaseService (pg.Pool + query с AsyncLocalStorage)
  │     └── TransactionService (transaction.run(callback))
  │
  ├── AuthModule
  │     ├── AuthService
  │     ├── AuthController (/auth)
  │     ├── JwtStrategy, JwtAuthGuard, ApiKeyGuard
  │     └── UserRepository (users table)
  │
  ├── UserProfileModule
  │     ├── UserProfileService
  │     ├── UserProfileController (/profile)
  │     └── UserProfileRepository (user_profiles table)
  │
  ├── ProjectModule (ex-TaskModule)
  │     ├── ProjectService
  │     ├── ProjectController (/projects, /projects/:id/invariants)
  │     ├── ProjectRepository (projects table)
  │     └── InvariantRepository (project_invariants table)
  │
  ├── ConversationModule
  │     ├── ConversationService
  │     ├── ConversationController (/conversations)
  │     ├── ConversationRepository (conversations table)
  │     └── MessageRepository (messages table + message_meta + message_debug)
  │
  ├── ContextModule (НОВЫЙ)
  │     ├── ContextService (CRUD context, facts через JSONB, стратегии)
  │     ├── ContextController (/conversations/:id/context, .../facts, .../branches)
  │     ├── ContextRepository (conversation_contexts table)
  │     ├── BranchRepository (conversation_branches table)
  │     ├── CheckpointRepository (checkpoints table)
  │     ├── SlidingWindowStrategy
  │     ├── StickyFactsStrategy
  │     └── BranchingStrategy
  │
  ├── AIModule (НОВЫЙ)
  │     ├── OpenAIService (callOpenAI, callOpenAIStream, calculateCost)
  │     └── TokenService (countTokens, countTokensBreakdown)
  │
  ├── MemoryModule (НОВЫЙ)
  │     └── MemoryAssemblerService (4-слойный system prompt builder)
  │
  └── MessageProcessingModule (НОВЫЙ)
        ├── MessageController (/messages, .../pause, .../resume, .../cancel)
        ├── StepOrchestratorService (state machine, retry loop, ordering)
        ├── StepRunnerService (запуск шагов, streaming, persistence)
        ├── GuardService (injection detection, stage integrity, invariant filtering)
        └── StepRepository (message_steps table)
```

---

## 3. Граф зависимостей модулей

```
DatabaseModule (@Global — доступен всем)
     │
     ├── AuthModule
     ├── UserProfileModule
     ├── ProjectModule
     ├── ConversationModule
     ├── ContextModule ──→ ConversationModule (для conversation_id lookup)
     ├── AIModule (standalone, без зависимостей кроме Database)
     │
     ├── MemoryModule ──→ UserProfileModule
     │                ──→ ProjectModule
     │                ──→ AIModule (TokenService для подсчёта)
     │
     └── MessageProcessingModule ──→ ConversationModule
                                 ──→ ContextModule
                                 ──→ MemoryModule
                                 ──→ AIModule
```

**Направление зависимостей (строго DAG, без циклов):**
- MessageProcessingModule → всё (оркестратор)
- MemoryModule → UserProfile, Project, AI (сборка промпта)
- ContextModule → Conversation (lookup)
- Все остальные → только DatabaseModule

---

## 4. DatabaseModule — Transaction Helper

### AsyncLocalStorage pattern

```typescript
// DatabaseService
import { AsyncLocalStorage } from 'async_hooks';

class DatabaseService {
  private readonly asyncLocalStorage = new AsyncLocalStorage<pg.PoolClient>();

  async query<T>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const txClient = this.asyncLocalStorage.getStore();
    if (txClient) {
      return txClient.query(sql, params);  // внутри транзакции
    }
    return this.pool.query(sql, params);   // вне транзакции — из пула
  }
}

// TransactionService
class TransactionService {
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.databaseService.asyncLocalStorage.run(client, fn);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
```

**Ограничение:** Внутри `transaction.run()` все запросы строго последовательные. Promise.all на query — запрещён (pg client не поддерживает параллельные запросы). Документируем это.

**Использование:**

```typescript
// В сервисе
await this.transactionService.run(async () => {
  await this.conversationRepository.updateParams(convId, params);
  await this.messageRepository.create(convId, message);
  await this.contextRepository.updateStrategyData(convId, data);
});
// Если вызван без transaction.run() — каждый query идёт через pool
```

---

## 5. Repository Pattern

### BaseRepository<T>

```typescript
abstract class BaseRepository<T> {
  constructor(
    protected readonly db: DatabaseService,
    protected readonly tableName: string,
  ) {}

  async findById(id: string): Promise<T | null> { ... }
  async create(data: Partial<T>): Promise<T> { ... }
  async update(id: string, data: Partial<T>): Promise<T> { ... }
  async delete(id: string): Promise<boolean> { ... }
}
```

Каждый repository наследует BaseRepository и добавляет специфичные методы:

| Repository | Таблица | Специфичные методы |
|---|---|---|
| UserRepository | users | findByUsername() |
| UserProfileRepository | user_profiles | findByUserId(), upsert() |
| ProjectRepository | projects | findByUserId(status?) |
| InvariantRepository | project_invariants | findByProjectId(), getContentByProjectId() |
| ConversationRepository | conversations | findByProjectId(), updateParams(), findByUserId() |
| MessageRepository | messages + meta + debug | findByConversationId(), createEnvelope(), updateStatus(), saveMeta(), saveDebug(), getForContext(), getTotals() |
| ContextRepository | conversation_contexts | findByConversationId(), updateStrategyData(), updateSummary() |
| BranchRepository | conversation_branches | findByContextId(), findActive(), activate() |
| CheckpointRepository | checkpoints | findByConversationId() |
| StepRepository | message_steps | findByMessageId(), createStep(), updateStep() |

---

## 6. Зоны ответственности сервисов

### AuthModule
- **AuthService:** login, register, refresh, seedAdmin
- Не меняется концептуально, только username → user_id в queries

### UserProfileModule
- **UserProfileService:** getProfile, upsertProfile
- Переход на user_id FK

### ProjectModule (ex-TaskModule)
- **ProjectService:** CRUD projects + invariants, findByUserId
- Больше НЕ удаляет conversations (FK CASCADE сделает это)

### ConversationModule
- **ConversationService:** CRUD conversations, updateParams
- **MessageRepository:** create envelope, update status, get for context, totals, save meta/debug
- НЕ знает о стратегиях, pipeline, memory

### ContextModule
- **ContextService:** 
  - CRUD context (создаётся вместе с conversation)
  - Управление стратегиями: getStrategy(), prepareContext()
  - Facts CRUD через read-modify-write strategy_data JSONB
  - Branches + Checkpoints management
- **Стратегии:** SlidingWindow, StickyFacts, Branching (как сейчас, но внутри ContextModule)

### AIModule
- **OpenAIService:** callOpenAI (non-stream), callOpenAIStream, calculateCost
- **TokenService:** countTokens, countTokensBreakdown
- Чистый инфраструктурный модуль, без бизнес-логики

### MemoryModule
- **MemoryAssemblerService:** assembleMemory (4 слоя)
  - Зависит от: UserProfileService, ProjectService, TokenService
  - Больше НЕ делает прямых SQL-запросов (через ConversationRepository)

### MessageProcessingModule
- **StepOrchestratorService:**
  - Entry point: processMessage(messageId, conversationId, username, params)
  - State machine: pending → processing → done/failed/cancelled
  - Retry loop (до max_attempts)
  - Pause/resume/cancel
  - SSE event emission
- **StepRunnerService:**
  - runStep(messageId, stepType, systemMessages, model, onEvent)
  - Streaming через OpenAIService.callOpenAIStream
  - Persistence: create/update StepRepository
  - Prompt building для каждого шага (planning/execution/validation prompts)
- **GuardService:**
  - checkMessage (regex injection detection)
  - filterInvariants (удаление injection из инвариантов)
  - verifyStageIntegrity (все шаги completed)

---

## 7. Flow обработки сообщения (новый)

```
MessageController.send(dto, req.user)
  │
  ├── ConversationService.updateParams(convId, dto.params) — если изменились
  │
  ├── MessageRepository.createEnvelope(convId, userContent) — status: pending
  │
  └── StepOrchestratorService.processMessage(messageId, convId, userId, params)
        │
        ├── MessageRepository.updateStatus(messageId, 'processing')
        │
        ├── MemoryAssemblerService.assembleMemory(userId, convId, systemPrompt, model)
        │
        ├── ContextService.prepareContext(convId, strategyType, params)
        │
        ├── GuardService.checkMessage(userContent)
        │
        ├── Retry loop:
        │     ├── StepRunnerService.runStep('planning', ...) → SSE events
        │     ├── StepRunnerService.runStep('execution', ...) → SSE events  
        │     ├── StepRunnerService.runStep('validation', ...) → SSE events
        │     ├── Parse validation → PASS/FAIL/INJECTION
        │     └── GuardService.verifyStageIntegrity(messageId, attempt)
        │
        ├── MessageRepository.updateStatus(messageId, 'done')
        ├── MessageRepository.update(messageId, { assistantContent })
        ├── MessageRepository.saveMeta(messageId, metaData)
        ├── MessageRepository.saveDebug(messageId, debugData)
        │
        └── If sticky_facts: ContextService.extractAndApplyFacts(convId, userContent, reply)
```

---

## 8. API Endpoints (новые контроллеры)

### ProjectController — `/projects`
| Method | Path | Описание |
|---|---|---|
| POST | /projects | Создать проект |
| GET | /projects | Список проектов пользователя |
| GET | /projects/:id | Детали проекта |
| PATCH | /projects/:id | Обновить проект |
| DELETE | /projects/:id | Удалить проект (CASCADE) |
| GET | /projects/:id/invariants | Инварианты проекта |
| POST | /projects/:id/invariants | Добавить инвариант |
| DELETE | /projects/:id/invariants/:iid | Удалить инвариант |

### ConversationController — `/conversations`
| Method | Path | Описание |
|---|---|---|
| POST | /conversations | Создать диалог (project_id обязателен) |
| GET | /conversations?projectId=X | Список диалогов |
| GET | /conversations/:id | Детали диалога + сообщения |
| PATCH | /conversations/:id | Обновить (title, AI params) |
| DELETE | /conversations/:id | Удалить (CASCADE) |

### MessageController — `/messages`
| Method | Path | Описание |
|---|---|---|
| POST | /conversations/:id/messages | Отправить сообщение (SSE pipeline) |
| POST | /messages/:id/pause | Пауза обработки |
| POST | /messages/:id/resume | Возобновление (SSE) |
| POST | /messages/:id/cancel | Отмена обработки |
| GET | /messages/:id | Детали сообщения + steps |

### ContextController — `/conversations/:id/context`
| Method | Path | Описание |
|---|---|---|
| GET | /conversations/:id/context | Текущий контекст |
| PATCH | /conversations/:id/context | Обновить стратегию |
| GET | /conversations/:id/facts | Получить факты |
| PUT | /conversations/:id/facts | Установить факт |
| DELETE | /conversations/:id/facts/:key | Удалить факт |
| GET | /conversations/:id/branches | Список веток |
| POST | /conversations/:id/branches | Создать ветку |
| POST | /conversations/:id/branches/:bid/activate | Активировать ветку |
| DELETE | /conversations/:id/branches/:bid | Удалить ветку |
| POST | /conversations/:id/checkpoints | Создать checkpoint |
| GET | /conversations/:id/checkpoints | Список checkpoints |

### AuthController, UserProfileController — без изменений

---

## 9. Файловая структура (target)

```
backend/src/
├── main.ts
├── app.module.ts
│
├── database/
│   ├── database.module.ts
│   ├── database.service.ts          # pg.Pool + AsyncLocalStorage query
│   ├── transaction.service.ts       # transaction.run(callback)
│   ├── base.repository.ts           # BaseRepository<T>
│   └── migrations.service.ts        # inline migrations (выносим из database.service)
│
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── repositories/
│   │   └── user.repository.ts
│   ├── strategies/jwt.strategy.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── api-key.guard.ts
│   └── dto/
│
├── user-profile/
│   ├── user-profile.module.ts
│   ├── user-profile.controller.ts
│   ├── user-profile.service.ts
│   ├── repositories/
│   │   └── user-profile.repository.ts
│   └── dto/
│
├── project/
│   ├── project.module.ts
│   ├── project.controller.ts
│   ├── project.service.ts
│   ├── repositories/
│   │   ├── project.repository.ts
│   │   └── invariant.repository.ts
│   └── dto/
│
├── conversation/
│   ├── conversation.module.ts
│   ├── conversation.controller.ts
│   ├── conversation.service.ts
│   ├── repositories/
│   │   ├── conversation.repository.ts
│   │   └── message.repository.ts
│   └── dto/
│
├── context/
│   ├── context.module.ts
│   ├── context.controller.ts
│   ├── context.service.ts
│   ├── repositories/
│   │   ├── context.repository.ts
│   │   ├── branch.repository.ts
│   │   └── checkpoint.repository.ts
│   ├── strategies/
│   │   ├── context-strategy.interface.ts
│   │   ├── sliding-window.strategy.ts
│   │   ├── sticky-facts.strategy.ts
│   │   └── branching.strategy.ts
│   └── dto/
│
├── ai/
│   ├── ai.module.ts
│   ├── openai.service.ts
│   ├── token.service.ts
│   └── dto/
│       └── ai-params.dto.ts        # ALLOWED_MODELS, MODEL_PRICING, etc.
│
├── memory/
│   ├── memory.module.ts
│   └── memory-assembler.service.ts
│
└── message-processing/
    ├── message-processing.module.ts
    ├── message.controller.ts
    ├── services/
    │   ├── step-orchestrator.service.ts
    │   ├── step-runner.service.ts
    │   └── guard.service.ts
    ├── repositories/
    │   └── step.repository.ts
    └── dto/
```
