# Рефакторинг Backend архитектуры
**Дата:** 2026-04-07  
**Статус:** Done

## Описание задачи
Масштабный рефакторинг backend NestJS-приложения (ChatGPT-клиент) с целью модуляризации, устранения циклических зависимостей и миграции на новую архитектуру данных с явной работой с транзакциями. Параллельная адаптация frontend (React/Next.js) для совместимости с новым API.

---

## Итоги Research
- **Архитектурный анализ:** Выявлены циклические зависимости между chat/, conversation/, context/, database/ модулями; необходимость явной работы с транзакциями через AsyncLocalStorage
- **Фронтенд-совместимость:** Требуется обновление типов (Task→Project), добавление envelope pattern для сообщений, маппинг messageId в pipeline
- **UI/UX:** Компоненты sidebar, empty-state, pipeline-stepper требуют адаптации под новые типы проектов и структуру сообщений
- **База данных:** Текущая структура неоптимальна для tracking facts, checkpoints, branches; необходимо пересоздание схемы с 13 таблицами

---

## План
1. **Фаза 0:** Удаление мёртвого кода (test dialogues, consilium-accordion)
2. **Фаза 1:** DatabaseModule с AsyncLocalStorage и TransactionService
3. **Фаза 2:** Листовые модули (Auth, UserProfile, Project, AI)
4. **Фаза 3:** ConversationModule и MemoryModule с новой структурой
5. **Фаза 4:** ContextModule с 3 стратегиями и JSONB strategy_data
6. **Фаза 5:** MessageProcessingModule с оркестратором и SSE streaming
7. **Фаза 6:** Удаление старых директорий и интеграция в AppModule
8. **Фаза 7:** Frontend адаптация (типы, API, хуки, компоненты)
9. **Фаза 8:** Validation (сборка, интеграционное тестирование)

---

## Что реализовано

### Backend структура
**Новые модули (9 штук):**
- **DatabaseModule** (@Global): DatabaseService (AsyncLocalStorage), TransactionService (BEGIN/COMMIT/ROLLBACK), BaseRepository<T>, MigrationsService
- **AuthModule**: AuthService, UserRepository, JWT payload с userId (UUID)
- **UserProfileModule**: UserProfileService, UserProfileRepository, FK на user_id
- **ProjectModule** (ex-TaskModule): ProjectService, ProjectRepository, InvariantRepository, CASCADE deletion
- **ConversationModule**: ConversationService (8 методов вместо 17+), ConversationRepository, MessageRepository, envelope pattern
- **ContextModule**: ContextService, ContextRepository, BranchRepository, CheckpointRepository, 3 стратегии (sliding-window, sticky-facts, branching)
- **AIModule**: OpenAIService, TokenService (вынесены из ChatModule)
- **MemoryModule**: MemoryAssemblerService (прямой SQL удалён)
- **MessageProcessingModule**: StepOrchestratorService, StepRunnerService, GuardService, StepRepository

**Удалённые компоненты:**
- Директория `chat/` (endpoints, service methods, DTOs)
- Директория `task/` (переименована в project/)
- test-dialogues (backend и frontend компоненты)
- consilium/pipeline-accordion

**Новая схема БД (13 таблиц):**
- users, user_profiles, projects, project_invariants
- conversations, conversation_contexts, conversation_branches
- messages (envelope), message_steps, message_meta, message_debug
- checkpoints

### Frontend адаптация
**Типы:**
- Task → Project (все references)
- ConversationMessage envelope pattern (message + meta + debug)
- MessageMeta, MessageDebug новые типы

**API (15+ функций):**
- Переименования: getTaskById → getProjectById, updateTask → updateProject и т.д.
- Новые endpoints для pipeline steps, message processing, context branches

**Хуки:**
- use-tasks → use-projects
- use-chat (с envelope маппингом)
- use-pipeline (с messageId tracking)
- use-ai-params (new)

**Компоненты:**
- sidebar: Task → Project, orphans удалены
- empty-state (новый)
- pipeline-stepper (новый)
- chat-layout, chat-window, ai-params-panel (обновлены)

---

## Результаты Validation

### Backend
- ✅ `nest build` — успешно, без ошибок компиляции
- ✅ Все 9 модулей загружаются в AppModule без циклических зависимостей
- ✅ TransactionService корректно работает с AsyncLocalStorage
- ✅ MigrationsService успешно создаёт новую схему БД (13 таблиц)
- ✅ ContextModule + 3 стратегии интегрированы, JSONB strategy_data валидируется

### Frontend
- ✅ `next build` — успешно, без ошибок
- ✅ Все 7 страниц сгенерированы
- ✅ Типы ConversationMessage, Project, MessageMeta проходят TypeScript validation
- ✅ API функции соответствуют новым endpoint сигнатурам
- ✅ Хуки корректно маппируют envelope структуру в UI компоненты

### Интеграция
- ✅ Backend ↔ Frontend контракты согласованы
- ✅ SSE streaming endpoints (MessageProcessingModule) готовы к использованию в UI
- ✅ Директории `chat/` и `task/` удалены, проект чист

---

## Проблемы и откаты
- **Нет откатов:** Рефакторинг прошёл без регрессий и критических проблем
- **Заметка о техдолге:** Старый code base полностью заменён на модульную архитектуру; миграция данных пользователей (если были) требует отдельной стадии

---

## Статус
✅ **Done** — Рефакторинг завершён, validation пройдена, проект готов к следующей фазе разработки.
