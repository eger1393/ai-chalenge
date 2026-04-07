# Research: Консилиум рефакторинга backend

**Дата:** 2026-04-06

---

## Сводка консилиума

### Архитектор

**Порядок работ (6 фаз):**
1. **Фаза 0**: Выпилить test dialogues + consilium (уменьшение объема)
2. **Фаза 1**: DatabaseModule — AsyncLocalStorage + TransactionService + BaseRepository + новая схема БД
3. **Фаза 2**: Листовые модули (AuthModule, UserProfileModule, ProjectModule, AIModule) — параллельно
4. **Фаза 3**: ConversationModule + MemoryModule
5. **Фаза 4**: ContextModule (стратегии, facts JSONB, branches)
6. **Фаза 5**: MessageProcessingModule (StepOrchestrator + StepRunner + Guard)
7. **Фаза 6**: Frontend + SSE адаптация

**Критические риски:**
- Circular FK: conversation_contexts.active_branch_id <-> conversation_branches.context_id — создать таблицы без FK, потом ALTER TABLE
- PipelineService (500+ строк) с дублированием run/resume — вычленить общий retry loop перед разбиением
- Facts в JSONB: read-modify-write — нужна транзакция для защиты от lost update
- SSE-контракт: onEvent callback пробрасывается через 3 уровня
- BaseRepository: не делать generic create(Partial<T>), а типизированные методы

### Фронтенд-эксперт

**Объем изменений:**
- Типы: Task→Project, ConversationMessage→envelope, новые MessageMeta/MessageDebug
- API: 15+ функций переименовать/изменить, 1 удалить (startTestDialogue)
- Хуки: use-tasks→use-projects, use-chat (envelope маппинг), use-ai-params (server SoT), use-pipeline (messageId)
- Компоненты: chat-layout (убрать test mode), sidebar (Task→Project, убрать orphans), ai-params-panel (server params)
- Удалить: test-setup-form, test-progress-bar, use-test-dialogue, pipeline-accordion

**Критический риск #1**: Envelope формат — рекомендация: разворачивать на уровне хука use-chat.ts (Вариант A), UI не трогать
**Критический риск #2**: Обязательный projectId — ломает "быстрый старт"
**Критический риск #3**: AI params source of truth на сервере — race condition при pipeline

### UI-дизайнер

**Ключевые UX-изменения:**
- Sidebar: убрать orphans, убрать "Новый диалог" без проекта, auto-expand если 1 проект
- EmptyState: "Создайте проект, чтобы начать"
- Message display: envelope — серверная абстракция, пользователь не должен её видеть
- AI params panel: два режима (defaults / conversation params)
- Pipeline controls: привязка к messageId

**UX-риски:**
- Обязательность проекта = friction. Решение: если проект один, автопривязка
- Orphan-диалоги: нужна миграция (ЗБТ — можно дропнуть данные)
- AI params desync: loading state в панели при смене conversation
