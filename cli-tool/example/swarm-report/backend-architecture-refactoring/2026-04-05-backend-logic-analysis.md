# Backend: Анализ бизнес-логики (as-is)

**Дата:** 2026-04-05

---

## 1. Граф модулей

```
AppModule
  ├── ConfigModule (global)
  ├── ThrottlerModule (20 req/60s default)
  ├── DatabaseModule (@Global — pg.Pool + inline миграции)
  ├── AuthModule (imports DatabaseModule; exports AuthService)
  ├── ConversationModule (exports ConversationService)
  ├── TaskModule (exports TaskService)
  ├── UserProfileModule (exports UserProfileService)
  └── ChatModule
        imports: ConversationModule, forwardRef(TaskModule), forwardRef(UserProfileModule)
        providers (11): ChatService, TokenService, OpenAIService, ContextStrategyService,
          FactsService, BranchService, MemoryAssemblerService, PipelineService,
          PipelineGuardService, SlidingWindowStrategy, StickyFactsStrategy, BranchingStrategy
```

`forwardRef` — превентивный, реальных циклов нет.

---

## 2. Поток аутентификации

```
Request → JwtAuthGuard → JwtStrategy.validate() → req.user = { userId, username }
                                                         ↓
Controller извлекает req.user.username и передаёт как параметр в сервисы
                                                         ↓
Сервисы скоупят все запросы WHERE username = $1
```

- Refresh токены отклоняются в JwtStrategy (не допускаются как access)
- Регистрация защищена ApiKeyGuard (x-api-key header, constant-time compare)
- Admin seedится из env при старте (ON CONFLICT DO NOTHING)

---

## 3. Потоки бизнес-логики

### 3.1 Pipeline flow (основной — POST /chat/pipeline)

```
ChatController.runPipeline(dto, username)
  │
  ├── PipelineService.runPipeline(dto, username, onEvent)
  │     │
  │     ├── 1. Нормализация параметров
  │     │     planning/validation: gpt-4.1-nano (дешёвый)
  │     │     execution: модель пользователя
  │     │
  │     ├── 2. Сохранение user message → ConversationService.addMessage()
  │     │
  │     ├── 3. Injection guard → PipelineGuardService.checkMessage()
  │     │     ~20 regex паттернов (рус + англ)
  │     │     Если blocked → refusal message, return
  │     │
  │     ├── 4. CREATE pipeline_runs (status='running')
  │     │
  │     ├── 5. Memory assembly → MemoryAssemblerService.assembleMemory()
  │     │     (см. секцию 4 ниже)
  │     │
  │     ├── 6. Загрузка инвариантов задачи
  │     │     → TaskService.getInvariantsByTaskId()
  │     │     → PipelineGuardService.filterInvariants() (убирает injection в инвариантах)
  │     │
  │     └── 7. Retry loop (до 3 попыток):
  │           │
  │           ├── PLANNING: gpt-4.1-nano
  │           │   system = invariants + memory + PLANNING_PROMPT + SECURITY_BLOCK
  │           │   (на retry: + причина провала прошлой валидации)
  │           │   → runStep() → SSE: step_start, step_delta, step_complete
  │           │
  │           ├── EXECUTION: user model
  │           │   system = invariants + memory + EXECUTION_PROMPT + security + plan + user msg
  │           │   → runStep() → SSE: step_start, step_delta, step_complete
  │           │
  │           ├── VALIDATION: gpt-4.1-nano
  │           │   system = invariants + VALIDATION_PROMPT + injection rules + security
  │           │   + plan + execution result + per-invariant checks
  │           │   → runStep() → SSE: step_start, step_delta, step_complete
  │           │
  │           ├── parseValidation() → VERDICT: PASS|FAIL|INJECTION, SCORE, REASON
  │           │
  │           ├── if INJECTION → fail immediately
  │           ├── if PASS → verifyStageIntegrity() → save assistant message → DONE
  │           └── if FAIL → store reason, increment attempt, loop
  │
  └── SSE: pipeline_started ... step events ... done/failed
```

### 3.2 Memory Assembly (MemoryAssemblerService)

```
assembleMemory({ username, conversationId, userSystemPrompt, model })
  │
  ├── Layer 1: INVARIANTS (if conversation → task → invariants)
  │   "FOLLOWING RULES CANNOT BE BROKEN UNDER ANY CIRCUMSTANCES..."
  │
  ├── Layer 2: LONG-TERM MEMORY (UserProfile)
  │   getProfile(username) → map to natural language:
  │   - responseLanguage: 'ru' → "Always respond in Russian"
  │   - dialogueStyle: 'formal' → formal tone
  │   - responseBrevity: 'brief' → concise
  │   - customPrompt: raw append
  │
  ├── Layer 3: WORKING MEMORY (Task title + description)
  │   "[WORKING MEMORY — Current Task]"
  │
  └── Layer 4: SHORT-TERM (user system prompt from DTO)
  │
  → Join all layers with "\n\n---\n\n"
  → Return { systemPrompt, layers[] }
```

### 3.3 Context Strategy Dispatch

```
ContextStrategyService.prepareContext(strategyType, params)
  │
  ├── 'sliding_window' → SlidingWindowStrategy
  │     Budget: 80% of context window
  │     Алгоритм: keep first 2 msgs + fill from newest → oldest
  │     Если total ≤ 85% — возвращает всё без truncation
  │
  ├── 'sticky_facts' → StickyFactsStrategy
  │     1. Load facts → build "[Известные факты]" block
  │     2. Budget = 80% - systemPrompt - factsBlock - currentMsg
  │     3. Fill remaining with recent history
  │     4. Inject facts as fake "user" message at start
  │     * Fact extraction: ОТДЕЛЬНЫЙ вызов gpt-4.1-nano ПОСЛЕ reply
  │       → extractFactsFromMessage() → JSON diff → applyFactsDiff()
  │
  └── 'branching' → BranchingStrategy
        1. Get active branch → load branch messages
           (shared pre-checkpoint + branch-specific)
        2. Apply same sliding-window truncation
        * Fallback: if no active branch → use flat history
```

### 3.4 ChatService.sendMessage (private, используется test-dialogue)

```
sendMessage(dto, username)
  │
  ├── Нормализация параметров (model, temp, maxTokens, repetitionPenalty → frequencyPenalty)
  ├── Resolve conversation + context strategy
  ├── assembleMemory()
  ├── prepareContext() → truncated messages
  ├── callOpenAI() (non-streaming!)
  ├── Save user msg + assistant msg
  ├── If sticky_facts → extract facts (separate LLM call)
  ├── Save debug data
  ├── Auto-title on first 2 messages
  └── Return rich response
```

---

## 4. Зоны ответственности сервисов

### DatabaseService
- Пул соединений pg.Pool
- Inline-миграции (18 штук)
- Единственный метод: `query(sql, params)`
- **Проблема:** 0 транзакций во всей кодовой базе

### AuthService
- login (bcrypt compare → JWT pair)
- register (bcrypt hash → insert)
- refresh (verify refresh → new pair)
- getMe (fetch role)
- seedAdmin (idempotent на startup)

### ConversationService (центральный data hub)
- CRUD conversations (username-scoped)
- addMessage (20 полей метаданных)
- getMessagesForContext (role+content для стратегий)
- saveDebugData (upsert 1:1)
- Summary management (get/update)
- Strategy update (first message override)
- Totals aggregation
- **Проблема:** 17+ публичных методов, god-service

### TaskService
- CRUD tasks (username-scoped)
- CRUD invariants
- getConversations (linked to task)
- findById (без username — для MemoryAssembler)
- remove → ручной каскад DELETE conversations
- **Проблема:** лезет в чужой домен (conversations)

### UserProfileService
- getProfile (defaults если нет строки)
- upsertProfile (ON CONFLICT DO UPDATE)
- Чистый, минимальный

### ChatService
- sendMessage (private) — полный цикл non-stream chat
- generateTestDialogue — SSE-генерация тестовых диалогов
- **Проблема:** sendMessage = 300 строк оркестрации

### OpenAIService
- callOpenAI (non-streaming, 1 retry on RateLimitError)
- callOpenAIStream (AsyncGenerator)
- calculateCost (по таблице MODEL_PRICING)
- buildCompletionParams (gpt-5.x → max_completion_tokens)

### TokenService
- countTokens (tiktoken, cached encoding)
- countTokensBreakdown (system + history + current)

### ContextStrategyService
- Диспетчер: string → IContextStrategy instance
- prepareContext → delegate to strategy

### FactsService
- CRUD facts (conversation_facts table)
- extractFactsFromMessage (LLM call → JSON diff)
- applyFactsDiff (batch upsert/delete)

### BranchService
- CRUD branches + checkpoints
- getMessagesForBranch (shared + branch-specific)
- Ручной каскад: delete messages → delete branch → switch to main
- **Проблема:** модифицирует messages и conversations напрямую

### MemoryAssemblerService
- assembleMemory (4 слоя)
- Тянет: UserProfileService, TaskService, TokenService, DatabaseService
- **Проблема:** прямой SQL-запрос для taskId (обход ConversationService)

### PipelineService (~500 строк)
- runPipeline (state machine + retry + SSE)
- pause/resume/cancel
- runStep (streaming + step persistence)
- buildMessages (planning/execution/validation)
- parseValidation (VERDICT/SCORE/REASON)
- **Проблема:** работает с 5 таблицами напрямую, мини-модуль в модуле

### PipelineGuardService
- checkMessage (~20 regex patterns)
- filterInvariants (убирает injection из инвариантов)
- verifyStageIntegrity (все 3 стадии completed)

---

## 5. Критические наблюдения

1. **0 транзакций** — все multi-table операции sequential. Partial failure = orphaned data.
2. **ConversationService = central data hub** — через него проходит всё, но он не разделён по ответственности.
3. **PipelineService работает с 5 таблицами напрямую** (pipeline_runs, pipeline_steps, conversations, messages, task_invariants) — обход сервисов.
4. **MemoryAssemblerService делает прямой SQL** для получения taskId вместо использования ConversationService.
5. **BranchService модифицирует messages и conversations** — нарушение границ домена.
6. **Streaming vs non-streaming**: Pipeline использует streaming (callOpenAIStream), а sendMessage — non-streaming (callOpenAI). Разные контракты.
7. **Fact extraction — отдельный LLM call** после основного ответа. Добавляет латенсию, но не блокирует ответ пользователю.
